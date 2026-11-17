#include "MmoMapDecoration.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Async/ParallelFor.h"
#include "Components/HierarchicalInstancedStaticMeshComponent.h"
#include "Game/MmoFieldLayout.h"
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

		/** 풀과 덤불의 액터를 다시 만든다. 메시마다 인스턴스 메시 하나이고 충돌이 없다. */
		bool Scatter(UWorld& World, const FGround& Ground, const FMmoFieldLayout& Layout)
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
					Instances[Mesh].Add(FTransform(FRotator(0.0, Hash01(X, Z, 76) * 360.0, 0.0), FVector(PZ * 100.0, PX * 100.0, 0.0), FVector(Scale)));
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

	bool Decorate(UWorld& World, const FMmoFieldLayout& Layout, const TArray<FTreeSpot>& Trees)
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
		return Scatter(World, Ground, Layout);
	}
}
