#include "Game/MmoMapObject.h"

#include "Components/BoxComponent.h"
#include "Components/StaticMeshComponent.h"

namespace
{
	/** 방향대로 돌린 뒤 차지하는 x, z 칸 수(m). 90도와 270도는 가로와 세로가 바뀐다. */
	FIntPoint Footprint(const FMmoMapObjectKind& Kind, int32 Rotation)
	{
		return Rotation % 180 == 0 ? FIntPoint(Kind.Width, Kind.Depth) : FIntPoint(Kind.Depth, Kind.Width);
	}
}

AMmoMapObject::AMmoMapObject()
{
	PrimaryActorTick.bCanEverTick = false;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
	GetRootComponent()->SetMobility(EComponentMobility::Static);

	MeshComponent = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Mesh"));
	MeshComponent->SetupAttachment(GetRootComponent());
	MeshComponent->SetMobility(EComponentMobility::Static);
	MeshComponent->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	MeshComponent->SetCanEverAffectNavigation(false);

	Collision = CreateDefaultSubobject<UBoxComponent>(TEXT("Collision"));
	Collision->SetupAttachment(GetRootComponent());
	Collision->SetMobility(EComponentMobility::Static);
	Collision->SetCanEverAffectNavigation(false);
	Collision->SetCollisionEnabled(ECollisionEnabled::NoCollision);
}

void AMmoMapObject::Place(const FMmoMapObjectKind& InKind, int32 X, int32 Z, int32 Rotation)
{
	KindRow = InKind;
	const FIntPoint Size = Footprint(KindRow, Rotation);

	// 패킷의 z(앞)가 Unreal의 X, x(오른쪽)가 Y이고 yaw는 둘 다 위에서 볼 때 시계 방향이다(MmoCoordinates와 같음).
	const FVector Center((Z + Size.Y * 0.5) * 100.0, (X + Size.X * 0.5) * 100.0, 0.0);
	SetActorLocationAndRotation(Center, FRotator(0.0, Rotation, 0.0));

	if (!KindRow.bBlocks)
	{
		Collision->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		return;
	}

	// 상자는 돌리기 전의 크기로 두고 액터와 함께 돈다(로컬 X가 세로, Y가 가로).
	SetHeight(MinBlockHeight);
	Collision->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
	Collision->SetCollisionObjectType(ECC_WorldStatic);
	Collision->SetCollisionResponseToAllChannels(ECR_Ignore);
	Collision->SetCollisionResponseToChannel(ECC_Pawn, ECR_Block);
	Collision->SetCollisionResponseToChannel(ECC_Camera, KindRow.bBlocksCamera ? ECR_Block : ECR_Ignore);
}

void AMmoMapObject::SetHeight(double Meters)
{
	const double Height = FMath::Max(Meters, MinBlockHeight) * 100.0;
	Collision->SetBoxExtent(FVector(KindRow.Depth * 50.0, KindRow.Width * 50.0, Height * 0.5));
	Collision->SetRelativeLocation(FVector(0.0, 0.0, Height * 0.5));
}

bool AMmoMapObject::ReadPlacement(int32& X, int32& Z, int32& Rotation, FString& Error) const
{
	const double Yaw = FRotator::ClampAxis(GetActorRotation().Yaw);
	const double Quarter = FMath::RoundToDouble(Yaw / 90.0);
	if (!FMath::IsNearlyEqual(Yaw, Quarter * 90.0, 0.01))
	{
		Error = FString::Printf(TEXT("yaw %.2f is not a multiple of 90 degrees"), Yaw);
		return false;
	}
	Rotation = static_cast<int32>(Quarter) % 4 * 90;

	const FIntPoint Size = Footprint(KindRow, Rotation);
	const FVector Location = GetActorLocation();
	const double MinX = Location.Y / 100.0 - Size.X * 0.5;
	const double MinZ = Location.X / 100.0 - Size.Y * 0.5;
	X = FMath::RoundToInt32(MinX);
	Z = FMath::RoundToInt32(MinZ);
	if (!FMath::IsNearlyEqual(MinX, X, 0.001) || !FMath::IsNearlyEqual(MinZ, Z, 0.001))
	{
		Error = FString::Printf(TEXT("the small corner (%.3f, %.3f) m is not on whole meters"), MinX, MinZ);
		return false;
	}

	return true;
}
