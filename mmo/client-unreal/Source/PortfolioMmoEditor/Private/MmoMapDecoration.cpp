#include "MmoMapDecoration.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Async/ParallelFor.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Engine/CollisionProfile.h"
#include "Game/MmoFieldLayout.h"
#include "Game/MmoTerrain.h"
#include "MmoMeshBuilder.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Engine/Texture2D.h"
#include "EngineUtils.h"
#include "HAL/FileManager.h"
#include "Materials/MaterialInstanceConstant.h"
#include "Misc/PackageName.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"

DEFINE_LOG_CATEGORY_STATIC(LogMmoMapDecoration, Log, All);

namespace MmoMapDecoration
{
	namespace
	{
		/** 마스크의 한 변 픽셀 수(필드 600 m면 칸마다 1.7 픽셀). */
		constexpr int32 MaskResolution = 1024;
		const FName FoliageTag(TEXT("MmoFoliage"));

		// ZoneKind의 값.
		constexpr int32 Town = 1;
		constexpr int32 Gathering = 3;
		constexpr int32 Boss = 4;

		double Hash01(int32 X, int32 Z, uint32 Salt)
		{
			return (Hash(X, Z, Salt) & 0xFFFFFF) / 16777216.0;
		}

		double SmoothStep(double A, double B, double X)
		{
			const double T = FMath::Clamp((X - A) / (B - A), 0.0, 1.0);
			return T * T * (3.0 - 2.0 * T);
		}

		/** 칸의 해시를 부드럽게 이은 0–1의 값 노이즈. */
		double Noise(double X, double Z, uint32 Salt)
		{
			const int32 IX = FMath::FloorToInt32(X);
			const int32 IZ = FMath::FloorToInt32(Z);
			const double SX = SmoothStep(0.0, 1.0, X - IX);
			const double SZ = SmoothStep(0.0, 1.0, Z - IZ);
			const double A = FMath::Lerp(Hash01(IX, IZ, Salt), Hash01(IX + 1, IZ, Salt), SX);
			const double B = FMath::Lerp(Hash01(IX, IZ + 1, Salt), Hash01(IX + 1, IZ + 1, Salt), SX);
			return FMath::Lerp(A, B, SZ);
		}

		/** 세 옥타브의 0–1 노이즈. 무늬 하나가 Scale m쯤이다. */
		double Fbm(double X, double Z, double Scale, uint32 Salt)
		{
			return 0.55 * Noise(X / Scale, Z / Scale, Salt) + 0.3 * Noise(X / Scale * 2.03, Z / Scale * 2.03, Salt + 1)
				+ 0.15 * Noise(X / Scale * 4.1, Z / Scale * 4.1, Salt + 2);
		}

		FVector2D Middle(const FIntRect& Rect)
		{
			return FVector2D((Rect.Min.X + Rect.Max.X) * 0.5, (Rect.Min.Y + Rect.Max.Y) * 0.5);
		}

		/** 땅의 무게(0–1). 아무것도 아니면 풀밭이다. */
		struct FWeights
		{
			double Dirt = 0.0;
			double Cobble = 0.0;
			double Scorched = 0.0;
			double Forest = 0.0;
		};

		class FGround
		{
		public:
			FGround(const FMmoFieldLayout& InLayout, const TArray<FTreeSpot>& Trees)
				: Layout(InLayout)
			{
				for (const FMmoFieldLayout::FZone& Zone : Layout.Zones)
				{
					if (Zone.Kind == Town)
					{
						TownRect = Zone.Rect;
						break;
					}
				}
				for (const FMmoFieldLayout::FZone& Zone : Layout.Zones)
				{
					if (Zone.Kind != Town)
					{
						Roads.Add({ Middle(TownRect), Middle(Zone.Rect) });
					}
				}

				// 나무마다 반지름 7 m의 가우스를 더한 칸마다의 밀도.
				Density.SetNumZeroed(Layout.Size * Layout.Size);
				for (const FTreeSpot& Tree : Trees)
				{
					for (int32 DZ = -7; DZ <= 7; ++DZ)
					{
						for (int32 DX = -7; DX <= 7; ++DX)
						{
							const int32 Column = FMath::FloorToInt32(Tree.X) + DX - Layout.Min;
							const int32 Row = FMath::FloorToInt32(Tree.Z) + DZ - Layout.Min;
							if (Column < 0 || Row < 0 || Column >= Layout.Size || Row >= Layout.Size)
							{
								continue;
							}
							const double Distance = FVector2D::Distance(FVector2D(Column + Layout.Min + 0.5, Row + Layout.Min + 0.5), FVector2D(Tree.X, Tree.Z));
							Density[Row * Layout.Size + Column] += FMath::Exp(-Distance * Distance / 18.0);
						}
					}
				}
			}

			FWeights At(double X, double Z) const
			{
				FWeights Weights;
				const int32 Kind = Layout.KindAt(FMath::FloorToInt32(X), FMath::FloorToInt32(Z));
				// 자리를 노이즈로 흔들어 길과 광장의 가장자리가 굽게 보인다.
				const FVector2D Bent(X + (Noise(X / 23.0, Z / 23.0, 11) - 0.5) * 5.0, Z + (Noise(X / 23.0, Z / 23.0, 12) - 0.5) * 5.0);
				double Road = 0.0;
				for (const TPair<FVector2D, FVector2D>& Line : Roads)
				{
					const FVector2D Along = Line.Value - Line.Key;
					const double T = FMath::Clamp(FVector2D::DotProduct(Bent - Line.Key, Along) / Along.SizeSquared(), 0.0, 1.0);
					const double Distance = FVector2D::Distance(Bent, Line.Key + Along * T);
					// 너비 4–5 m. 구역의 가운데에 가까워지면 흐려진다.
					Road = FMath::Max(Road, (1.0 - SmoothStep(1.8, 3.0, Distance)) * (1.0 - SmoothStep(0.55, 0.95, T)));
				}

				if (Kind == Town)
				{
					const double Radius = FMath::Min(TownRect.Width(), TownRect.Height()) * 0.21;
					const double Plaza = 1.0 - SmoothStep(Radius - 2.0, Radius + 1.0, FVector2D::Distance(Bent, Middle(TownRect)));
					Weights.Cobble = FMath::Max(Road, Plaza);
					Weights.Dirt = SmoothStep(0.5, 0.75, Fbm(X, Z, 9.0, 21)) * 0.6;
				}
				else
				{
					Weights.Dirt = FMath::Max(Road, SmoothStep(0.62, 0.74, Fbm(X, Z, 16.0, 31)) * 0.75);
					Weights.Forest = SmoothStep(0.5, 1.6, DensityAt(X, Z) + (Fbm(X, Z, 11.0, 51) - 0.5) * 0.8);
				}

				for (const FMmoFieldLayout::FZone& Zone : Layout.Zones)
				{
					if (Zone.Kind == Boss)
					{
						const double Inside = FMath::Min(FMath::Min(X - Zone.Rect.Min.X, Zone.Rect.Max.X - X), FMath::Min(Z - Zone.Rect.Min.Y, Zone.Rect.Max.Y - Z));
						Weights.Scorched = FMath::Max(Weights.Scorched, SmoothStep(-6.0, 8.0, Inside + (Fbm(X, Z, 7.0, 41) - 0.5) * 10.0));
					}
				}
				return Weights;
			}

		private:
			double DensityAt(double X, double Z) const
			{
				const int32 Column = FMath::FloorToInt32(X) - Layout.Min;
				const int32 Row = FMath::FloorToInt32(Z) - Layout.Min;
				return Column >= 0 && Row >= 0 && Column < Layout.Size && Row < Layout.Size ? Density[Row * Layout.Size + Column] : 0.0;
			}

			const FMmoFieldLayout& Layout;
			FIntRect TownRect;
			TArray<TPair<FVector2D, FVector2D>> Roads;
			TArray<double> Density;
		};

		/** N×N 격자를 반지름 Radius 칸의 상자로 흐린다(가로, 세로를 차례로. 밖은 가장자리 값). */
		TArray<double> Blur(const TArray<double>& Values, int32 N, int32 Radius)
		{
			TArray<double> Across;
			Across.SetNumUninitialized(N * N);
			TArray<double> Out;
			Out.SetNumUninitialized(N * N);
			for (int32 Pass = 0; Pass < 2; ++Pass)
			{
				const TArray<double>& From = Pass == 0 ? Values : Across;
				TArray<double>& To = Pass == 0 ? Across : Out;
				ParallelFor(N, [&](int32 Line)
				{
					for (int32 Index = 0; Index < N; ++Index)
					{
						double Sum = 0.0;
						for (int32 Offset = -Radius; Offset <= Radius; ++Offset)
						{
							const int32 Other = FMath::Clamp(Index + Offset, 0, N - 1);
							Sum += Pass == 0 ? From[Line * N + Other] : From[Other * N + Line];
						}
						(Pass == 0 ? To[Line * N + Index] : To[Index * N + Line]) = Sum / (Radius * 2 + 1);
					}
				});
			}
			return Out;
		}

		/** N×N 격자(칸의 가운데가 정수 + 0.5)의 값을 (U, V)(칸)에서 이어 읽는다. */
		double Bilinear(const TArray<double>& Values, int32 N, double U, double V)
		{
			const double X = FMath::Clamp(U - 0.5, 0.0, N - 1.0);
			const double Y = FMath::Clamp(V - 0.5, 0.0, N - 1.0);
			const int32 X0 = FMath::Min(FMath::FloorToInt32(X), N - 2);
			const int32 Y0 = FMath::Min(FMath::FloorToInt32(Y), N - 2);
			const double A = X - X0;
			const double B = Y - Y0;
			return FMath::Lerp(FMath::Lerp(Values[Y0 * N + X0], Values[Y0 * N + X0 + 1], A), FMath::Lerp(Values[(Y0 + 1) * N + X0], Values[(Y0 + 1) * N + X0 + 1], A), B);
		}

		/** 패키지를 새로 만든다(디스크의 옛 파일은 지움). */
		UPackage* NewPackage(const FString& Name, FString& Filename)
		{
			Filename = FPackageName::LongPackageNameToFilename(Name, FPackageName::GetAssetPackageExtension());
			IFileManager::Get().Delete(*Filename, false, true, true);
			return CreatePackage(*Name);
		}

		bool Save(UPackage* Package, UObject* Asset, const FString& Filename)
		{
			FAssetRegistryModule::AssetCreated(Asset);
			FSavePackageArgs Args;
			Args.TopLevelFlags = RF_Public | RF_Standalone;
			if (!UPackage::SavePackage(Package, Asset, *Filename, Args))
			{
				UE_LOG(LogMmoMapDecoration, Error, TEXT("Could not save %s."), *Filename);
				return false;
			}
			return true;
		}

		/** 마스크를 굽는다: R 흙, G 돌길, B 그을린 땅, A 숲 바닥. 행이 z, 열이 x이고 텍스처 좌표 (0, 0)이 필드의 작은 모서리다. */
		UTexture2D* BakeMask(const FGround& Ground, const FMmoFieldLayout& Layout)
		{
			TArray<uint8> Pixels;
			Pixels.SetNumUninitialized(MaskResolution * MaskResolution * 4);
			const double Step = static_cast<double>(Layout.Size) / MaskResolution;
			ParallelFor(MaskResolution, [&](int32 Row)
			{
				for (int32 Column = 0; Column < MaskResolution; ++Column)
				{
					const FWeights Weights = Ground.At(Layout.Min + (Column + 0.5) * Step, Layout.Min + (Row + 0.5) * Step);
					uint8* Pixel = &Pixels[(Row * MaskResolution + Column) * 4];
					// TSF_BGRA8의 바이트 차례.
					Pixel[0] = static_cast<uint8>(FMath::RoundToInt32(Weights.Scorched * 255.0));
					Pixel[1] = static_cast<uint8>(FMath::RoundToInt32(Weights.Cobble * 255.0));
					Pixel[2] = static_cast<uint8>(FMath::RoundToInt32(Weights.Dirt * 255.0));
					Pixel[3] = static_cast<uint8>(FMath::RoundToInt32(Weights.Forest * 255.0));
				}
			});

			FString Filename;
			UPackage* Package = NewPackage(TEXT("/Game/Environment/T_GroundMask"), Filename);
			UTexture2D* Texture = NewObject<UTexture2D>(Package, TEXT("T_GroundMask"), RF_Public | RF_Standalone);
			Texture->Source.Init(MaskResolution, MaskResolution, 1, 1, TSF_BGRA8, Pixels.GetData());
			Texture->SRGB = false;
			Texture->CompressionSettings = TC_Default;
			Texture->AddressX = TA_Clamp;
			Texture->AddressY = TA_Clamp;
			Texture->LODGroup = TEXTUREGROUP_World;
			Texture->PostEditChange();
			return Save(Package, Texture, Filename) ? Texture : nullptr;
		}

		/** 땅 머티리얼(M_Ground. Scripts/create_content.py)의 인스턴스에 마스크와 필드의 범위를 끼운다. */
		UMaterialInstanceConstant* GroundInstance(UTexture2D* Mask, const FMmoFieldLayout& Layout)
		{
			UMaterialInterface* Parent = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Materials/M_Ground.M_Ground"));
			if (!Parent)
			{
				UE_LOG(LogMmoMapDecoration, Error, TEXT("/Game/Materials/M_Ground is missing. Run Scripts/create_content.py first."));
				return nullptr;
			}
			FString Filename;
			UPackage* Package = NewPackage(TEXT("/Game/Environment/MI_Ground"), Filename);
			UMaterialInstanceConstant* Instance = NewObject<UMaterialInstanceConstant>(Package, TEXT("MI_Ground"), RF_Public | RF_Standalone);
			Instance->SetParentEditorOnly(Parent);
			Instance->SetTextureParameterValueEditorOnly(FMaterialParameterInfo(TEXT("GroundMask")), Mask);
			Instance->SetScalarParameterValueEditorOnly(FMaterialParameterInfo(TEXT("FieldMin")), Layout.Min);
			Instance->SetScalarParameterValueEditorOnly(FMaterialParameterInfo(TEXT("FieldSize")), Layout.Size);
			Instance->PostEditChange();
			return Save(Package, Instance, Filename) ? Instance : nullptr;
		}

		/** 흩는 메시. 크기는 가져온 크기(Scripts/import_props.py)에 곱한다. Cull은 그리지 않는 거리(cm). */
		struct FScatterMesh
		{
			const TCHAR* Name;
			double MinScale;
			double MaxScale;
			bool bShadow;
			float Cull;
			/** 둘레 3×3 칸이 모두 열려야 놓는다(큰 것). */
			bool bWide;
		};

		const FScatterMesh ScatterMeshes[] = {
			{ TEXT("grass"), 0.8, 1.3, false, 5000.0f, false },
			{ TEXT("grass_2"), 0.8, 1.2, false, 5000.0f, false },
			{ TEXT("grass_3"), 0.9, 1.5, false, 5000.0f, false },
			{ TEXT("flower"), 0.8, 1.2, false, 5000.0f, false },
			{ TEXT("flower_2"), 0.8, 1.2, false, 5000.0f, false },
			{ TEXT("Foliage/plant_1"), 0.8, 1.2, false, 6000.0f, false },
			{ TEXT("Foliage/plant_3"), 0.8, 1.2, false, 6000.0f, false },
			{ TEXT("Foliage/plant_4"), 0.8, 1.2, false, 6000.0f, false },
			{ TEXT("Foliage/bush_1"), 0.8, 1.25, true, 8000.0f, true },
			{ TEXT("Foliage/bush_2"), 0.8, 1.25, true, 8000.0f, true },
			{ TEXT("Foliage/berries"), 0.8, 1.2, true, 8000.0f, true },
			{ TEXT("Foliage/stump"), 0.8, 1.2, true, 8000.0f, true },
			{ TEXT("Foliage/log"), 0.9, 1.1, true, 8000.0f, true },
			{ TEXT("Foliage/pebble"), 0.6, 1.5, false, 6000.0f, false },
			{ TEXT("Foliage/twig"), 0.8, 1.3, false, 6000.0f, false },
			{ TEXT("Foliage/wheat"), 0.8, 1.2, false, 5000.0f, false },
		};

		/** 구역의 종류마다 칸에 하나를 놓을 확률(뭉침을 곱하기 전)과 메시(ScatterMeshes의 번호)의 무게. */
		struct FScatterMix
		{
			double Density;
			TArray<TPair<int32, double>> Weights;
		};

		const FScatterMix& MixOf(int32 ZoneKind)
		{
			static const FScatterMix Wild = { 0.09, { { 0, 40 }, { 1, 12 }, { 2, 12 }, { 3, 4 }, { 4, 2 }, { 5, 5 }, { 6, 4 }, { 7, 3 }, { 8, 5 }, { 9, 4 }, { 10, 1 }, { 11, 1.5 }, { 12, 0.8 }, { 13, 4 } } };
			static const FScatterMix TownMix = { 0.012, { { 2, 30 }, { 3, 30 }, { 4, 15 }, { 9, 15 }, { 13, 10 } } };
			static const FScatterMix GatheringMix = { 0.15, { { 0, 30 }, { 1, 10 }, { 2, 10 }, { 3, 14 }, { 4, 8 }, { 5, 4 }, { 6, 4 }, { 8, 3 }, { 10, 4 }, { 13, 2 }, { 15, 8 } } };
			static const FScatterMix BossMix = { 0.04, { { 14, 45 }, { 13, 40 }, { 2, 15 } } };
			return ZoneKind == Town ? TownMix : ZoneKind == Gathering ? GatheringMix : ZoneKind == Boss ? BossMix : Wild;
		}

		int32 Pick(const FScatterMix& Mix, double Roll)
		{
			double Total = 0.0;
			for (const TPair<int32, double>& Weight : Mix.Weights)
			{
				Total += Weight.Value;
			}
			Roll *= Total;
			for (const TPair<int32, double>& Weight : Mix.Weights)
			{
				if ((Roll -= Weight.Value) < 0.0)
				{
					return Weight.Key;
				}
			}
			return Mix.Weights.Last().Key;
		}

		/** 풀과 덤불의 액터를 다시 만든다. 메시마다 인스턴스 메시 하나이고 충돌이 없다. 땅의 높이에 놓는다(106). */
		bool Scatter(UWorld& World, const FGround& Ground, const FMmoFieldLayout& Layout, const AMmoTerrain& Terrain)
		{
			TArray<TArray<FTransform>> Instances;
			Instances.SetNum(UE_ARRAY_COUNT(ScatterMeshes));
			for (int32 Z = Layout.Min; Z < Layout.Min + Layout.Size; ++Z)
			{
				for (int32 X = Layout.Min; X < Layout.Min + Layout.Size; ++X)
				{
					if (!Layout.IsOpen(X, Z))
					{
						continue;
					}
					const FWeights Weights = Ground.At(X + 0.5, Z + 0.5);
					const FScatterMix& Mix = MixOf(Layout.KindAt(X, Z));
					// 뭉치게: 노이즈가 낮은 곳은 드물고 높은 곳은 빽빽하다. 길과 흙에는 덜, 돌길에는 놓지 않는다.
					const double Chance = Mix.Density * (0.2 + 1.8 * SmoothStep(0.3, 0.8, Fbm(X, Z, 13.0, 61))) * (1.0 - Weights.Dirt * 0.85) * (1.0 - Weights.Cobble);
					if (Weights.Cobble > 0.4 || Hash01(X, Z, 71) >= Chance)
					{
						continue;
					}
					bool bNearNpc = false;
					for (const FIntPoint& Npc : Layout.Npcs)
					{
						bNearNpc |= FMath::Abs(Npc.X - X) <= 2 && FMath::Abs(Npc.Y - Z) <= 2;
					}
					const int32 Mesh = Pick(Mix, Hash01(X, Z, 72));
					bool bRoom = !bNearNpc;
					for (int32 DZ = -1; bRoom && ScatterMeshes[Mesh].bWide && DZ <= 1; ++DZ)
					{
						for (int32 DX = -1; DX <= 1; ++DX)
						{
							bRoom &= Layout.IsOpen(X + DX, Z + DZ);
						}
					}
					if (!bRoom)
					{
						continue;
					}
					const double PX = X + 0.15 + 0.7 * Hash01(X, Z, 73);
					const double PZ = Z + 0.15 + 0.7 * Hash01(X, Z, 74);
					const double Scale = FMath::Lerp(ScatterMeshes[Mesh].MinScale, ScatterMeshes[Mesh].MaxScale, Hash01(X, Z, 75));
					// 패킷의 z(앞)가 Unreal의 X, x(오른쪽)가 Y다(MmoCoordinates).
					Instances[Mesh].Add(FTransform(FRotator(0.0, Hash01(X, Z, 76) * 360.0, 0.0), FVector(PZ * 100.0, PX * 100.0, Terrain.HeightAt(PZ * 100.0, PX * 100.0) - 3.0), FVector(Scale)));
				}
			}

			for (TActorIterator<AActor> It(&World); It; ++It)
			{
				if (It->Tags.Contains(FoliageTag))
				{
					World.EditorDestroyActor(*It, true);
				}
			}
			AActor* Foliage = World.SpawnActor<AActor>();
			USceneComponent* Root = NewObject<USceneComponent>(Foliage, TEXT("Root"));
			Root->SetMobility(EComponentMobility::Static);
			Foliage->SetRootComponent(Root);
			Foliage->AddInstanceComponent(Root);
			Root->RegisterComponent();
			Foliage->Tags.Add(FoliageTag);
			Foliage->SetActorLabel(TEXT("Foliage"));
			Foliage->SetFolderPath(TEXT("Map"));

			int32 Total = 0;
			for (int32 Index = 0; Index < UE_ARRAY_COUNT(ScatterMeshes); ++Index)
			{
				if (Instances[Index].IsEmpty())
				{
					continue;
				}
				const FString Name = ScatterMeshes[Index].Name;
				const FString Leaf = FPaths::GetCleanFilename(Name);
				UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/Environment/%s.%s"), *Name, *Leaf));
				if (!Mesh)
				{
					UE_LOG(LogMmoMapDecoration, Error, TEXT("/Game/Environment/%s is missing. Run Scripts/import_props.py first."), *Name);
					return false;
				}
				UHierarchicalInstancedStaticMeshComponent* Component = NewObject<UHierarchicalInstancedStaticMeshComponent>(Foliage, *FString::Printf(TEXT("Foliage_%s"), *Leaf));
				Component->SetStaticMesh(Mesh);
				Component->SetMobility(EComponentMobility::Static);
				Component->SetupAttachment(Root);
				Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
				Component->SetCastShadow(ScatterMeshes[Index].bShadow);
				Component->SetCullDistances(ScatterMeshes[Index].Cull * 0.8f, ScatterMeshes[Index].Cull);
				Foliage->AddInstanceComponent(Component);
				Component->RegisterComponent();
				Component->AddInstances(Instances[Index], false, true);
				Total += Instances[Index].Num();
				UE_LOG(LogMmoMapDecoration, Display, TEXT("Foliage %s: %d"), *Leaf, Instances[Index].Num());
			}
			UE_LOG(LogMmoMapDecoration, Display, TEXT("Scattered %d foliage instances."), Total);
			return true;
		}

		struct FVariantSet
		{
			const TCHAR* Key;
			/** 그 구역의 종류에서만 쓴다. -1이면 나머지 모든 곳. */
			int32 ZoneKind;
			TArray<const TCHAR*> Meshes;
		};

		const TArray<FVariantSet>& VariantSets()
		{
			static const TArray<FVariantSet> Sets = {
				{ TEXT("tree"), Boss, { TEXT("tree_dead_1"), TEXT("tree_dead_2"), TEXT("tree_dead_3") } },
				{ TEXT("tree"), -1, { TEXT("tree"), TEXT("tree_2"), TEXT("tree_3"), TEXT("tree_4"), TEXT("tree_5"), TEXT("tree_pine_1"), TEXT("tree_pine_2"),
					TEXT("tree_pine_3"), TEXT("tree_birch_1"), TEXT("tree_birch_2") } },
				{ TEXT("rock"), -1, { TEXT("rock"), TEXT("rock_2"), TEXT("rock_3"), TEXT("rock_4"), TEXT("rock_5") } },
				{ TEXT("rock_large"), -1, { TEXT("rock_large"), TEXT("rock_large_2"), TEXT("rock_large_3"), TEXT("rock_large_4") } },
				{ TEXT("mountain"), -1, { TEXT("mountain"), TEXT("mountain_2"), TEXT("mountain_3") } },
				{ TEXT("grass"), -1, { TEXT("grass"), TEXT("grass_2"), TEXT("grass_3") } },
				{ TEXT("flower"), -1, { TEXT("flower"), TEXT("flower_2") } },
			};
			return Sets;
		}
	}

	uint32 Hash(int32 X, int32 Z, uint32 Salt)
	{
		uint32 Value = static_cast<uint32>(X) * 0x8DA6B343u ^ static_cast<uint32>(Z) * 0xD8163841u ^ Salt * 0xCB1AB31Fu;
		Value ^= Value >> 13;
		Value *= 0x5BD1E995u;
		Value ^= Value >> 15;
		return Value;
	}

	bool Jitters(const FString& MeshKey)
	{
		return VariantSets().ContainsByPredicate([&MeshKey](const FVariantSet& Set) { return MeshKey == Set.Key; });
	}

	UStaticMesh* VariantOf(const FString& MeshKey, int32 ZoneKind, uint32 Value)
	{
		const FVariantSet* Found = nullptr;
		for (const FVariantSet& Set : VariantSets())
		{
			if (MeshKey == Set.Key && (Set.ZoneKind == ZoneKind || (Set.ZoneKind == -1 && !Found)))
			{
				Found = &Set;
			}
		}
		const FString Name = Found ? FString(Found->Meshes[Value % Found->Meshes.Num()]) : MeshKey;
		UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/Environment/%s.%s"), *Name, *Name), nullptr, LOAD_NoWarn | LOAD_Quiet);
		// 변형을 아직 가져오지 않았으면 키의 메시로.
		return Mesh || Name == MeshKey ? Mesh : LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Game/Environment/%s.%s"), *MeshKey, *MeshKey), nullptr, LOAD_NoWarn | LOAD_Quiet);
	}

	AMmoTerrain* BuildTerrain(UWorld& World, const FMmoFieldLayout& Layout, const TArray<bool>& Natural)
	{
		constexpr int32 Margin = 90;
		constexpr int32 Spacing = 3;
		constexpr int32 ChunksPerSide = 4;
		const int32 N = Layout.Size + Margin * 2;
		const int32 ExtMin = Layout.Min - Margin;
		const auto Inside = [&](int32 Column, int32 Row)
		{
			return Column >= Margin && Row >= Margin && Column < Margin + Layout.Size && Row < Margin + Layout.Size;
		};

		// 낮은 땅: 필드 안에서 걸을 수 있거나 사람이 지은 것(집, 울타리, 소품)이 놓인 칸. 나머지(자연의 막는 것, 필드 밖)는 낮은 땅에서의
		// 거리(m)만큼 솟는다(두 번 훑는 근사 거리: 곧게 1, 비스듬히 √2).
		TArray<double> Distance;
		Distance.SetNumUninitialized(N * N);
		for (int32 Row = 0; Row < N; ++Row)
		{
			for (int32 Column = 0; Column < N; ++Column)
			{
				const int32 X = ExtMin + Column;
				const int32 Z = ExtMin + Row;
				const bool bLow = Inside(Column, Row) && (Layout.IsOpen(X, Z) || !Natural[(Row - Margin) * Layout.Size + Column - Margin]);
				Distance[Row * N + Column] = bLow ? 0.0 : 1.0e9;
			}
		}
		const auto Relax = [&](int32 Column, int32 Row, int32 DX, int32 DZ, double Step)
		{
			const int32 C = Column + DX;
			const int32 R = Row + DZ;
			if (C >= 0 && R >= 0 && C < N && R < N)
			{
				Distance[Row * N + Column] = FMath::Min(Distance[Row * N + Column], Distance[R * N + C] + Step);
			}
		};
		for (int32 Row = 0; Row < N; ++Row)
		{
			for (int32 Column = 0; Column < N; ++Column)
			{
				Relax(Column, Row, -1, 0, 1.0);
				Relax(Column, Row, 0, -1, 1.0);
				Relax(Column, Row, -1, -1, UE_SQRT_2);
				Relax(Column, Row, 1, -1, UE_SQRT_2);
			}
		}
		for (int32 Row = N - 1; Row >= 0; --Row)
		{
			for (int32 Column = N - 1; Column >= 0; --Column)
			{
				Relax(Column, Row, 1, 0, 1.0);
				Relax(Column, Row, 0, 1, 1.0);
				Relax(Column, Row, 1, 1, UE_SQRT_2);
				Relax(Column, Row, -1, 1, UE_SQRT_2);
			}
		}

		// 칸마다: 오르내림의 높이(구역의 종류. 마을은 마을의 사각형에서 15 m 밖까지 평평)와 솟음(m).
		FIntRect TownRect;
		for (const FMmoFieldLayout::FZone& Zone : Layout.Zones)
		{
			if (Zone.Kind == Town)
			{
				TownRect = Zone.Rect;
			}
		}
		TArray<double> Amplitude;
		TArray<double> Raise;
		Amplitude.SetNumUninitialized(N * N);
		Raise.SetNumUninitialized(N * N);
		ParallelFor(N, [&](int32 Row)
		{
			for (int32 Column = 0; Column < N; ++Column)
			{
				const int32 X = ExtMin + Column;
				const int32 Z = ExtMin + Row;
				const int32 Kind = Layout.KindAt(X, Z);
				Amplitude[Row * N + Column] = Kind == Gathering ? 2.4 : Kind == Boss ? 1.6 : 3.2;
				const double D = Distance[Row * N + Column];
				const double Outside = FMath::Max(FMath::Max(Layout.Min - (X + 0.5), (X + 0.5) - (Layout.Min + Layout.Size)),
					FMath::Max(Layout.Min - (Z + 0.5), (Z + 0.5) - (Layout.Min + Layout.Size)));
				const double Fade = 1.0 - SmoothStep(Margin - 35.0, Margin - 5.0, Outside);
				Raise[Row * N + Column] = D <= 1.5 ? 0.0 : 9.0 * (1.0 - FMath::Exp(-(D - 1.5) / 6.0)) * (0.6 + 0.8 * Fbm(X, Z, 30.0, 91)) * Fade;
			}
		});
		Amplitude = Blur(Amplitude, N, 8);
		Raise = Blur(Raise, N, 2);

		const int32 Count = N / Spacing + 1;
		TArray<float> Heights;
		Heights.SetNumUninitialized(Count * Count);
		ParallelFor(Count, [&](int32 I)
		{
			for (int32 J = 0; J < Count; ++J)
			{
				// I가 Unreal의 X(패킷의 z), J가 Y(패킷의 x)다.
				const double Z = ExtMin + I * Spacing;
				const double X = ExtMin + J * Spacing;
				const double Dx = FMath::Max(FMath::Max(TownRect.Min.X - X, X - TownRect.Max.X), 0.0);
				const double Dz = FMath::Max(FMath::Max(TownRect.Min.Y - Z, Z - TownRect.Max.Y), 0.0);
				const double Flat = SmoothStep(0.0, 15.0, FMath::Sqrt(Dx * Dx + Dz * Dz));
				const double Rolling = Bilinear(Amplitude, N, X - ExtMin, Z - ExtMin) * Flat * Fbm(X, Z, 36.0, 81);
				Heights[I * Count + J] = static_cast<float>((Rolling + Bilinear(Raise, N, X - ExtMin, Z - ExtMin)) * 100.0);
			}
		});

		// 걸을 수 있는 칸의 가장 가파른 비탈(캐릭터 이동 컴포넌트는 44°까지 오름. 서버는 높이를 모르므로 클라이언트가 못 오르면 어긋남).
		double Steepest = 0.0;
		for (int32 I = 0; I + 1 < Count; ++I)
		{
			for (int32 J = 0; J + 1 < Count; ++J)
			{
				if (Layout.IsOpen(ExtMin + J * Spacing, ExtMin + I * Spacing))
				{
					const double Rise = FMath::Max(FMath::Abs(Heights[(I + 1) * Count + J] - Heights[I * Count + J]), FMath::Abs(Heights[I * Count + J + 1] - Heights[I * Count + J]));
					Steepest = FMath::Max(Steepest, FMath::RadiansToDegrees(FMath::Atan(Rise / (Spacing * 100.0))));
				}
			}
		}

		for (TActorIterator<AMmoTerrain> It(&World); It; ++It)
		{
			World.EditorDestroyActor(*It, true);
		}
		AMmoTerrain* Terrain = World.SpawnActor<AMmoTerrain>();
		Terrain->SetActorLabel(TEXT("Terrain"));
		Terrain->SetFolderPath(TEXT("Map"));
		Terrain->SetHeights(FVector2D(ExtMin * 100.0, ExtMin * 100.0), Spacing * 100.0f, Count, Count, Heights);

		// 조각: 한 변을 ChunksPerSide로 나눈 사각형마다 메시 하나(카메라가 보는 조각만 그림). 충돌은 삼각형 그대로이고 카메라는 막지 않는다.
		const int32 Quads = Count - 1;
		const int32 PerChunk = FMath::DivideAndRoundUp(Quads, ChunksPerSide);
		for (int32 CI = 0; CI < ChunksPerSide; ++CI)
		{
			for (int32 CJ = 0; CJ < ChunksPerSide; ++CJ)
			{
				const int32 I0 = CI * PerChunk;
				const int32 J0 = CJ * PerChunk;
				const int32 I1 = FMath::Min(I0 + PerChunk, Quads);
				const int32 J1 = FMath::Min(J0 + PerChunk, Quads);
				const int32 Width = J1 - J0 + 1;
				TArray<FVector3f> Positions;
				TArray<FVector2f> UVs;
				TArray<int32> Triangles;
				for (int32 I = I0; I <= I1; ++I)
				{
					for (int32 J = J0; J <= J1; ++J)
					{
						const float WX = (ExtMin + I * Spacing) * 100.0f;
						const float WY = (ExtMin + J * Spacing) * 100.0f;
						Positions.Add(FVector3f(WX, WY, Heights[I * Count + J]));
						UVs.Add(FVector2f(WY / 100.0f, WX / 100.0f));
					}
				}
				for (int32 I = 0; I < I1 - I0; ++I)
				{
					for (int32 J = 0; J < J1 - J0; ++J)
					{
						const int32 V00 = I * Width + J;
						const int32 V10 = V00 + Width;
						const int32 V01 = V00 + 1;
						const int32 V11 = V10 + 1;
						// 대각선은 (I, J)–(I+1, J+1)(AMmoTerrain::HeightAt과 같음). 위에서 볼 때 앞면이 되는 차례.
						Triangles.Append({ V00, V11, V10, V00, V01, V11 });
					}
				}
				const FString Name = FString::Printf(TEXT("/Game/Environment/Terrain/SM_Terrain_%d_%d"), CI, CJ);
				UStaticMesh* Mesh = MmoMeshBuilder::Create(Name, Positions, UVs, Triangles, nullptr, true);
				if (!Mesh)
				{
					return nullptr;
				}
				UStaticMeshComponent* Component = NewObject<UStaticMeshComponent>(Terrain, *FString::Printf(TEXT("Chunk_%d_%d"), CI, CJ));
				Component->SetStaticMesh(Mesh);
				Component->SetMobility(EComponentMobility::Static);
				Component->SetupAttachment(Terrain->GetRootComponent());
				Component->SetCollisionProfileName(UCollisionProfile::BlockAll_ProfileName);
				Component->SetCollisionResponseToChannel(ECC_Camera, ECR_Ignore);
				Terrain->AddInstanceComponent(Component);
				Component->RegisterComponent();
			}
		}
		UE_LOG(LogMmoMapDecoration, Display, TEXT("Built the terrain: %d x %d points every %d m, %d chunks, steepest walkable slope %.1f degrees."), Count, Count, Spacing,
			ChunksPerSide * ChunksPerSide, Steepest);
		return Terrain;
	}

	bool Decorate(UWorld& World, const FMmoFieldLayout& Layout, const TArray<FTreeSpot>& Trees, const AMmoTerrain& Terrain)
	{
		const FGround Ground(Layout, Trees);
		UTexture2D* Mask = BakeMask(Ground, Layout);
		UMaterialInstanceConstant* Instance = Mask ? GroundInstance(Mask, Layout) : nullptr;
		if (!Instance)
		{
			return false;
		}
		bool bFloor = false;
		for (TActorIterator<AStaticMeshActor> It(&World); It; ++It)
		{
			if (It->GetActorLabel() == TEXT("Floor"))
			{
				It->GetStaticMeshComponent()->SetMaterial(0, Instance);
				bFloor = true;
			}
		}
		if (!bFloor)
		{
			UE_LOG(LogMmoMapDecoration, Error, TEXT("The Field level has no Floor actor. Run Scripts/create_content.py first."));
			return false;
		}
		TArray<UStaticMeshComponent*> Chunks;
		Terrain.GetComponents(Chunks);
		for (UStaticMeshComponent* Chunk : Chunks)
		{
			Chunk->SetMaterial(0, Instance);
		}
		return Scatter(World, Ground, Layout, Terrain);
	}
}
