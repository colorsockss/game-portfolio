#include "MmoMeshBuilder.h"

#include "AssetRegistry/AssetRegistryModule.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "Misc/PackageName.h"
#include "PhysicsEngine/BodySetup.h"
#include "StaticMeshAttributes.h"
#include "UObject/Package.h"
#include "UObject/SavePackage.h"

DEFINE_LOG_CATEGORY_STATIC(LogMmoMeshBuilder, Log, All);

UStaticMesh* MmoMeshBuilder::Create(const FString& PackageName, const TArray<FVector3f>& Positions, const TArray<FVector2f>& UVs, const TArray<int32>& Triangles,
	UMaterialInterface* Material, bool bCollision)
{
	check(Positions.Num() == UVs.Num() && Triangles.Num() % 3 == 0);
	const FString Filename = FPackageName::LongPackageNameToFilename(PackageName, FPackageName::GetAssetPackageExtension());
	// 있으면(레벨이 쓰는 중일 수 있음) 그 메시를 고쳐 쓴다. 파일을 먼저 지우면 메모리에 남은 옛 메시가 원본 데이터를 읽지 못한다.
	const FString ShortName = FPackageName::GetShortName(PackageName);
	UStaticMesh* Mesh = LoadObject<UStaticMesh>(nullptr, *(PackageName + TEXT(".") + ShortName), nullptr, LOAD_NoWarn | LOAD_Quiet);
	if (Mesh)
	{
		Mesh->GetPackage()->FullyLoad();
		Mesh->SetNumSourceModels(0);
		Mesh->GetStaticMaterials().Reset();
	}
	else
	{
		Mesh = NewObject<UStaticMesh>(CreatePackage(*PackageName), *ShortName, RF_Public | RF_Standalone);
	}
	UPackage* Package = Mesh->GetPackage();

	FMeshDescription Description;
	FStaticMeshAttributes Attributes(Description);
	Attributes.Register();
	TVertexAttributesRef<FVector3f> VertexPositions = Attributes.GetVertexPositions();
	TVertexInstanceAttributesRef<FVector2f> InstanceUVs = Attributes.GetVertexInstanceUVs();
	Description.ReserveNewVertices(Positions.Num());
	Description.ReserveNewVertexInstances(Positions.Num());
	Description.ReserveNewTriangles(Triangles.Num() / 3);
	TArray<FVertexInstanceID> Instances;
	Instances.Reserve(Positions.Num());
	for (int32 Index = 0; Index < Positions.Num(); ++Index)
	{
		const FVertexID Vertex = Description.CreateVertex();
		VertexPositions[Vertex] = Positions[Index];
		const FVertexInstanceID Instance = Description.CreateVertexInstance(Vertex);
		InstanceUVs.Set(Instance, 0, UVs[Index]);
		Instances.Add(Instance);
	}
	const FPolygonGroupID Group = Description.CreatePolygonGroup();
	Attributes.GetPolygonGroupMaterialSlotNames()[Group] = TEXT("Material");
	for (int32 Index = 0; Index < Triangles.Num(); Index += 3)
	{
		Description.CreateTriangle(Group, { Instances[Triangles[Index]], Instances[Triangles[Index + 1]], Instances[Triangles[Index + 2]] });
	}

	FStaticMeshSourceModel& Source = Mesh->AddSourceModel();
	Source.BuildSettings.bRecomputeNormals = true;
	Source.BuildSettings.bRecomputeTangents = true;
	Source.BuildSettings.bGenerateLightmapUVs = false;
	Mesh->CreateMeshDescription(0, MoveTemp(Description));
	Mesh->CommitMeshDescription(0);
	Mesh->GetStaticMaterials().Add(FStaticMaterial(Material, TEXT("Material"), TEXT("Material")));
	if (bCollision)
	{
		Mesh->CreateBodySetup();
		Mesh->GetBodySetup()->CollisionTraceFlag = CTF_UseComplexAsSimple;
	}
	Mesh->Build(true);
	Mesh->PostEditChange();

	FAssetRegistryModule::AssetCreated(Mesh);
	FSavePackageArgs Args;
	Args.TopLevelFlags = RF_Public | RF_Standalone;
	if (!UPackage::SavePackage(Package, Mesh, *Filename, Args))
	{
		UE_LOG(LogMmoMeshBuilder, Error, TEXT("Could not save %s."), *Filename);
		return nullptr;
	}
	return Mesh;
}
