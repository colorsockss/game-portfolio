#include "MmoMapCommandlets.h"

#include "Components/StaticMeshComponent.h"
#include "Editor.h"
#include "EngineUtils.h"
#include "Engine/StaticMesh.h"
#include "FileHelpers.h"
#include "Game/MmoMapObject.h"
#include "Materials/MaterialInterface.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"

DEFINE_LOG_CATEGORY_STATIC(LogMmoMap, Log, All);

namespace
{
	const TCHAR* const Level = TEXT("/Game/Maps/Field");
	const TCHAR* const PlaceholderMaterial = TEXT("/Game/Materials/M_Placeholder.M_Placeholder");

	/** 맵 생성기의 목록(생성물)과 놓인 것의 원본. */
	FString MapListPath() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../shared/data/files/Map.tsv")); }
	FString SourcePath() { return FPaths::ConvertRelativePathToFull(FPaths::ProjectDir() / TEXT("../data/MapObjects.tsv")); }

	/** 메시가 아직 없는 키의 자리 표시: 엔진 기본 도형(지름·한 변 1 m, 가운데가 원점), 높이(m), 차지하는 칸에 대한 너비 비율, 색. */
	struct FPlaceholder
	{
		const TCHAR* Shape;
		double Height;
		double Fill;
		FLinearColor Color;
	};

	const FPlaceholder& PlaceholderOf(const FString& MeshKey)
	{
		static const TMap<FString, FPlaceholder> Table = {
			{ TEXT("house_small"), { TEXT("Cube"), 4.0, 1.0, FLinearColor(0.55f, 0.36f, 0.20f) } },
			{ TEXT("house_large"), { TEXT("Cube"), 5.5, 1.0, FLinearColor(0.48f, 0.30f, 0.18f) } },
			{ TEXT("tree"), { TEXT("Cone"), 4.5, 1.0, FLinearColor(0.12f, 0.38f, 0.12f) } },
			{ TEXT("rock"), { TEXT("Sphere"), 1.2, 1.0, FLinearColor(0.42f, 0.42f, 0.40f) } },
			{ TEXT("rock_large"), { TEXT("Sphere"), 2.2, 1.0, FLinearColor(0.36f, 0.36f, 0.35f) } },
			{ TEXT("fence"), { TEXT("Cube"), 1.1, 0.5, FLinearColor(0.40f, 0.27f, 0.14f) } },
			{ TEXT("mountain"), { TEXT("Cone"), 14.0, 1.4, FLinearColor(0.30f, 0.28f, 0.25f) } },
			{ TEXT("grass"), { TEXT("Cone"), 0.35, 0.6, FLinearColor(0.25f, 0.50f, 0.18f) } },
			{ TEXT("flower"), { TEXT("Sphere"), 0.3, 0.4, FLinearColor(0.90f, 0.70f, 0.20f) } },
		};
		static const FPlaceholder Unknown = { TEXT("Cube"), 1.0, 1.0, FLinearColor(1.0f, 0.0f, 1.0f) };
		const FPlaceholder* Found = Table.Find(MeshKey);
		return Found ? *Found : Unknown;
	}

	/** 맵 생성기의 kind 줄과 같은 형식. */
	FString KindLine(const FMmoMapObjectKind& Kind)
	{
		return FString::Printf(TEXT("kind\t%d\t%d\t%d\t%d\t%d\t%s"), Kind.Id, Kind.Width, Kind.Depth, Kind.bBlocks ? 1 : 0, Kind.bBlocksCamera ? 1 : 0, *Kind.MeshKey);
	}

	struct FPlaced
	{
		int32 Kind = 0;
		int32 X = 0;
		int32 Z = 0;
		int32 Rotation = 0;

		/** 내보내는 차례: 종류, z, x, 방향. */
		bool operator<(const FPlaced& Other) const
		{
			return Kind != Other.Kind ? Kind < Other.Kind : Z != Other.Z ? Z < Other.Z : X != Other.X ? X < Other.X : Rotation < Other.Rotation;
		}
	};

	/** Map.tsv를 읽는다. 종류는 번호로, 놓인 줄은 파일의 차례로. */
	bool ReadMapList(TMap<int32, FMmoMapObjectKind>& Kinds, TArray<FPlaced>& Objects)
	{
		TArray<FString> Lines;
		if (!FFileHelper::LoadFileToStringArray(Lines, *MapListPath()))
		{
			UE_LOG(LogMmoMap, Error, TEXT("Could not read %s. Run npm run generate -- mmo."), *MapListPath());
			return false;
		}

		for (const FString& Line : Lines)
		{
			TArray<FString> Fields;
			Line.ParseIntoArray(Fields, TEXT("\t"), false);
			if (Fields.Num() == 7 && Fields[0] == TEXT("kind"))
			{
				FMmoMapObjectKind Kind;
				Kind.Id = FCString::Atoi(*Fields[1]);
				Kind.Width = FCString::Atoi(*Fields[2]);
				Kind.Depth = FCString::Atoi(*Fields[3]);
				Kind.bBlocks = Fields[4] == TEXT("1");
				Kind.bBlocksCamera = Fields[5] == TEXT("1");
				Kind.MeshKey = Fields[6];
				Kinds.Add(Kind.Id, Kind);
			}
			else if (Fields.Num() == 5 && Fields[0] == TEXT("object"))
			{
				Objects.Add({ FCString::Atoi(*Fields[1]), FCString::Atoi(*Fields[2]), FCString::Atoi(*Fields[3]), FCString::Atoi(*Fields[4]) });
			}
		}

		return true;
	}

	/** 메시의 키로 메시를 고른다. 진짜 메시가 없으면 자리 표시 도형에 크기와 색(커스텀 프리미티브 데이터 0–2)을 입힌다. */
	void ApplyMesh(AMmoMapObject& Object, UMaterialInterface* Placeholder)
	{
		const FMmoMapObjectKind& Kind = Object.Kind();
		UStaticMeshComponent& Mesh = Object.Mesh();
		const FString Asset = FString::Printf(TEXT("/Game/Environment/%s.%s"), *Kind.MeshKey, *Kind.MeshKey);
		if (UStaticMesh* Real = LoadObject<UStaticMesh>(nullptr, *Asset, nullptr, LOAD_NoWarn | LOAD_Quiet))
		{
			Mesh.SetStaticMesh(Real);
			return;
		}

		const FPlaceholder& Shape = PlaceholderOf(Kind.MeshKey);
		Mesh.SetStaticMesh(LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Shape.Shape, Shape.Shape)));
		Mesh.SetMaterial(0, Placeholder);
		// 액터의 로컬 X가 세로(depth), Y가 가로(width)다. 기본 도형은 1 m이고 가운데가 원점이라 높이의 절반만큼 올린다.
		Mesh.SetRelativeScale3D(FVector(Kind.Depth * Shape.Fill, Kind.Width * Shape.Fill, Shape.Height));
		Mesh.SetRelativeLocation(FVector(0.0, 0.0, Shape.Height * 50.0));
		Mesh.SetDefaultCustomPrimitiveDataVector4(0, FVector4(Shape.Color.R, Shape.Color.G, Shape.Color.B, 1.0));
	}

	UWorld* LoadField()
	{
		UWorld* World = UEditorLoadingAndSavingUtils::LoadMap(Level);
		if (!World)
		{
			UE_LOG(LogMmoMap, Error, TEXT("Could not load %s. Run Scripts/create_content.py first."), Level);
		}
		return World;
	}
}

UMmoBuildMapCommandlet::UMmoBuildMapCommandlet()
{
	IsClient = false;
	IsEditor = true;
	IsServer = false;
	LogToConsole = true;
}

int32 UMmoBuildMapCommandlet::Main(const FString& Params)
{
	TMap<int32, FMmoMapObjectKind> Kinds;
	TArray<FPlaced> Objects;
	UMaterialInterface* Placeholder = LoadObject<UMaterialInterface>(nullptr, PlaceholderMaterial);
	UWorld* World = LoadField();
	if (!ReadMapList(Kinds, Objects) || !World || !Placeholder)
	{
		UE_LOG(LogMmoMap, Error, TEXT("Need Map.tsv, the Field level and %s (Scripts/create_content.py)."), PlaceholderMaterial);
		return 1;
	}

	int32 Removed = 0;
	for (TActorIterator<AMmoMapObject> It(World); It; ++It)
	{
		World->EditorDestroyActor(*It, true);
		++Removed;
	}

	for (const FPlaced& Placed : Objects)
	{
		const FMmoMapObjectKind* Kind = Kinds.Find(Placed.Kind);
		if (!Kind)
		{
			UE_LOG(LogMmoMap, Error, TEXT("Map.tsv places kind %d without its kind line."), Placed.Kind);
			return 1;
		}

		AMmoMapObject* Object = World->SpawnActor<AMmoMapObject>();
		Object->Place(*Kind, Placed.X, Placed.Z, Placed.Rotation);
		ApplyMesh(*Object, Placeholder);
		Object->SetActorLabel(FString::Printf(TEXT("%s_%d_%d"), *Kind->MeshKey, Placed.X, Placed.Z));
		Object->SetFolderPath(TEXT("Map"));
	}

	if (!UEditorLoadingAndSavingUtils::SaveMap(World, Level))
	{
		UE_LOG(LogMmoMap, Error, TEXT("Could not save %s."), Level);
		return 1;
	}

	UE_LOG(LogMmoMap, Display, TEXT("Rebuilt %s: removed %d and placed %d map objects."), Level, Removed, Objects.Num());
	return 0;
}

UMmoExportMapCommandlet::UMmoExportMapCommandlet()
{
	IsClient = false;
	IsEditor = true;
	IsServer = false;
	LogToConsole = true;
}

int32 UMmoExportMapCommandlet::Main(const FString& Params)
{
	const bool bCheck = FParse::Param(*Params, TEXT("Check"));
	UWorld* World = LoadField();
	if (!World)
	{
		return 1;
	}

	TArray<FPlaced> Placed;
	TMap<int32, FMmoMapObjectKind> Kinds;
	TArray<FString> Errors;
	for (TActorIterator<AMmoMapObject> It(World); It; ++It)
	{
		FPlaced Line;
		FString Error;
		if (!It->ReadPlacement(Line.X, Line.Z, Line.Rotation, Error))
		{
			Errors.Add(FString::Printf(TEXT("%s: %s"), *It->GetActorLabel(), *Error));
			continue;
		}
		Line.Kind = It->Kind().Id;
		Kinds.Add(Line.Kind, It->Kind());
		Placed.Add(Line);
	}

	if (!Errors.IsEmpty())
	{
		for (const FString& Error : Errors)
		{
			UE_LOG(LogMmoMap, Error, TEXT("%s"), *Error);
		}
		UE_LOG(LogMmoMap, Error, TEXT("%d map object(s) are off the 1 m / 90 degree grid. Nothing was written."), Errors.Num());
		return 1;
	}

	Placed.Sort();
	if (bCheck)
	{
		// 놓인 줄은 차례 없이, 종류의 줄은 놓인 것이 쓰는 것끼리 견준다. 놓이지 않은 종류의 줄은 Map.tsv에도 없다.
		TMap<int32, FMmoMapObjectKind> ListKinds;
		TArray<FPlaced> ListObjects;
		if (!ReadMapList(ListKinds, ListObjects))
		{
			return 1;
		}
		ListObjects.Sort();

		TArray<FString> Differences;
		ListKinds.KeySort(TLess<int32>());
		Kinds.KeySort(TLess<int32>());
		TArray<FString> LevelKinds, FileKinds;
		for (const TPair<int32, FMmoMapObjectKind>& Kind : Kinds) LevelKinds.Add(KindLine(Kind.Value));
		for (const TPair<int32, FMmoMapObjectKind>& Kind : ListKinds) FileKinds.Add(KindLine(Kind.Value));
		if (LevelKinds != FileKinds)
		{
			Differences.Add(FString::Printf(TEXT("kind lines: level [%s] / Map.tsv [%s]"), *FString::Join(LevelKinds, TEXT("; ")), *FString::Join(FileKinds, TEXT("; "))));
		}
		const int32 Count = FMath::Min(Placed.Num(), ListObjects.Num());
		for (int32 Index = 0; Index < Count && Differences.Num() < 5; ++Index)
		{
			const FPlaced& A = Placed[Index];
			const FPlaced& B = ListObjects[Index];
			if (A < B || B < A)
			{
				Differences.Add(FString::Printf(TEXT("object %d: level (%d, %d, %d, %d) / Map.tsv (%d, %d, %d, %d)"),
					Index, A.Kind, A.X, A.Z, A.Rotation, B.Kind, B.X, B.Z, B.Rotation));
			}
		}
		if (Placed.Num() != ListObjects.Num())
		{
			Differences.Add(FString::Printf(TEXT("the level places %d objects and Map.tsv %d"), Placed.Num(), ListObjects.Num()));
		}

		if (!Differences.IsEmpty())
		{
			for (const FString& Difference : Differences)
			{
				UE_LOG(LogMmoMap, Error, TEXT("%s"), *Difference);
			}
			UE_LOG(LogMmoMap, Error, TEXT("The Field level is out of date with Map.tsv. Rebuild it (MmoBuildMap) or export the level (MmoExportMap) and run npm run generate -- mmo."));
			return 1;
		}

		UE_LOG(LogMmoMap, Display, TEXT("The Field level matches Map.tsv (%d objects, %d kinds)."), Placed.Num(), Kinds.Num());
		return 0;
	}

	TArray<FString> Lines = {
		TEXT("# 맵에 놓인 것. 줄마다 종류(MapObjectKinds의 id), 위치 x, z(m, 정수), 방향(0·90·180·270도)이고 탭으로 나눈다."),
		TEXT("# 위치는 방향대로 돌린 뒤 차지하는 사각형의 작은 모서리다. #으로 시작하는 줄과 빈 줄은 건너뛴다."),
		TEXT("# Unreal 에디터의 MmoExportMap이 Field 레벨에서 내보낸다(줄은 종류, z, x, 방향의 차례). 손으로 고쳐도 되지만 MmoBuildMap으로 레벨도 다시 만든다."),
	};
	for (const FPlaced& Line : Placed)
	{
		Lines.Add(FString::Printf(TEXT("%d\t%d\t%d\t%d"), Line.Kind, Line.X, Line.Z, Line.Rotation));
	}

	const FString Text = FString::Join(Lines, TEXT("\n")) + TEXT("\n");
	if (!FFileHelper::SaveStringToFile(Text, *SourcePath(), FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM))
	{
		UE_LOG(LogMmoMap, Error, TEXT("Could not write %s."), *SourcePath());
		return 1;
	}

	UE_LOG(LogMmoMap, Display, TEXT("Exported %d map objects to %s. Run npm run generate -- mmo."), Placed.Num(), *SourcePath());
	return 0;
}
