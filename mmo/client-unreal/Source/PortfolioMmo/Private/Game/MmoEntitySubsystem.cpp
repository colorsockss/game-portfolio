#include "Game/MmoEntitySubsystem.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Game/MmoCharacter.h"
#include "Game/MmoCharacterLook.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoEntityActor.h"
#include "Game/MmoEntityVisuals.h"
#include "Animation/BlendSpace.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformTime.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"

namespace
{
	/** 표현 표에서 개체를 찾는 키: 플레이어는 직업, 몬스터·NPC·채집물은 템플릿 번호, 바닥 아이템은 아이템 번호. */
	int32 KeyOf(const portfolio::mmo::EntityEnter& Info)
	{
		switch (Info.kind())
		{
		case portfolio::mmo::ENTITY_KIND_PLAYER:
			return Info.character_class();
		case portfolio::mmo::ENTITY_KIND_GROUND_ITEM:
			return static_cast<int32>(Info.item_id());
		default:
			return static_cast<int32>(Info.template_id());
		}
	}

	/** 액터의 스켈레탈 메시와 자리 표시 메시. 내 캐릭터와 다른 개체의 액터 클래스가 다르다. */
	TPair<USkeletalMeshComponent*, UStaticMeshComponent*> ComponentsOf(AActor& Actor)
	{
		if (AMmoCharacter* Self = Cast<AMmoCharacter>(&Actor))
		{
			return { Self->GetMesh(), &Self->PlaceholderMesh() };
		}
		AMmoEntityActor& Other = *CastChecked<AMmoEntityActor>(&Actor);
		return { &Other.Mesh(), &Other.PlaceholderMesh() };
	}
}

void UMmoEntitySubsystem::Tick(float DeltaTime)
{
	Super::Tick(DeltaTime);
	MmoWorld::FWorldState& World = GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>()->World();

	// 나간 것을 먼저 지워야, 같은 프레임에 나갔다가 다시 들어온 개체가 새 액터로 만들어진다.
	for (const uint32 Id : World.TakeLeft())
	{
		if (TObjectPtr<AActor> Actor; Actors.RemoveAndCopyValue(Id, Actor) && Actor)
		{
			Actor->Destroy();
		}
	}

	FActorSpawnParameters Spawn;
	Spawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	for (const uint32 Id : World.TakeEntered())
	{
		const auto Found = World.Entities().find(Id);
		if (Found == World.Entities().end() || Actors.Contains(Id))
		{
			continue;
		}
		const MmoWorld::FEntity& Entity = Found->second;
		const FVector Location = MmoCoordinates::ToWorld(Entity.X, Entity.Z);
		const FRotator Rotation = MmoCoordinates::ToRotator(Entity.Yaw);
		if (Id == World.SelfId())
		{
			AMmoCharacter* Self = GetWorld()->SpawnActor<AMmoCharacter>(Location, Rotation, Spawn);
			Self->Teleport(Location);
			GetWorld()->GetFirstPlayerController()->Possess(Self);
			Actors.Add(Id, Self);
			ShowEntity(Id, *Self, Entity.Info);
		}
		else
		{
			AMmoEntityActor* Other = GetWorld()->SpawnActor<AMmoEntityActor>(Location, Rotation, Spawn);
#if WITH_EDITOR
			// 에디터의 아웃라이너에서 찾기 쉽게 한다. 머리 위의 이름은 이름표 층(backlog 16)이 그린다.
			Other->SetActorLabel(UTF8_TO_TCHAR(Entity.Info.name().c_str()));
#endif
			Actors.Add(Id, Other);
			ShowEntity(Id, *Other, Entity.Info);
		}
	}

	const double RenderTick = World.RenderTick(FPlatformTime::Seconds());
	for (const TPair<uint32, TObjectPtr<AActor>>& Pair : Actors)
	{
		if (Pair.Key == World.SelfId())
		{
			// 내 캐릭터는 이동 컴포넌트가 옮기므로 그 속도로 달린다.
			AMmoCharacter* Self = CastChecked<AMmoCharacter>(Pair.Value);
			MmoCharacterLook::SetSpeed(*Self->GetMesh(), Self->GetVelocity().Size2D());
			continue;
		}
		AMmoEntityActor* Other = CastChecked<AMmoEntityActor>(Pair.Value);
		const MmoWorld::FPose Pose = World.Entities().at(Pair.Key).Track.Sample(RenderTick);
		const FVector Location = MmoCoordinates::ToWorld(Pose.X, Pose.Z);
		// 다른 캐릭터는 이번 프레임에 보간이 옮긴 거리로 달리는 속도를 정한다.
		const double Speed = DeltaTime > 0 ? FVector::Dist2D(Location, Other->GetActorLocation()) / DeltaTime : 0;
		MmoCharacterLook::SetSpeed(Other->Mesh(), Speed);
		Other->SetActorLocationAndRotation(Location, MmoCoordinates::ToRotator(Pose.Yaw));
	}
}

void UMmoEntitySubsystem::ShowEntity(uint32 Id, AActor& Actor, const portfolio::mmo::EntityEnter& Info)
{
	if (!Visuals)
	{
		Visuals = LoadObject<UMmoEntityVisuals>(nullptr, UMmoEntityVisuals::Path);
		if (!Visuals)
		{
			UE_LOG(LogMmoNet, Error, TEXT("The entity visuals %s are missing. Run the MmoCreateCharacterAssets commandlet."), UMmoEntityVisuals::Path);
			return;
		}
	}

	const auto [Mesh, Placeholder] = ComponentsOf(Actor);
	const FMmoEntityVisual* Row = Visuals->Find(Info.kind(), KeyOf(Info));
	if (Row && Row->Mesh.Get() && Row->Locomotion.Get())
	{
		MmoCharacterLook::Apply(*Mesh, *Placeholder, Row->Mesh.Get(), Row->Locomotion.Get());
		return;
	}

	MmoCharacterLook::ShowPlaceholder(*Mesh, *Placeholder, Visuals->Placeholder);
	if (!Row)
	{
		// shortcut: 표에 줄이 없는 템플릿은 원기둥으로 남는다. 템플릿마다의 자리 표시는 backlog 73이 만든다.
		return;
	}

	const TSoftObjectPtr<USkeletalMesh> MeshAsset = Row->Mesh;
	const TSoftObjectPtr<UBlendSpace> LocomotionAsset = Row->Locomotion;
	const TWeakObjectPtr<AActor> Requested(&Actor);
	const double Started = FPlatformTime::Seconds();
	Streamable.RequestAsyncLoad(
		TArray<FSoftObjectPath>{ MeshAsset.ToSoftObjectPath(), LocomotionAsset.ToSoftObjectPath() },
		FStreamableDelegate::CreateWeakLambda(this, [this, Id, Requested, MeshAsset, LocomotionAsset, Started]()
		{
			// 그동안 개체가 나갔거나 다시 들어와 다른 액터가 되었으면 버린다(새 액터는 자기 요청을 따로 했다).
			AActor* Current = Actors.FindRef(Id);
			if (!Requested.IsValid() || Current != Requested.Get() || !MeshAsset.Get() || !LocomotionAsset.Get())
			{
				return;
			}

			const auto [LoadedMesh, LoadedPlaceholder] = ComponentsOf(*Current);
			MmoCharacterLook::Apply(*LoadedMesh, *LoadedPlaceholder, MeshAsset.Get(), LocomotionAsset.Get());
			UE_LOG(LogMmoNet, Display, TEXT("Loaded the look of entity %u in %.0f ms"), Id, (FPlatformTime::Seconds() - Started) * 1000.0);
		}));
}

TStatId UMmoEntitySubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UMmoEntitySubsystem, STATGROUP_Tickables);
}

bool UMmoEntitySubsystem::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}
