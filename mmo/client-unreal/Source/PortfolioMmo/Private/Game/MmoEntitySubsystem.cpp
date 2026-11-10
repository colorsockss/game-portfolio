#include "Game/MmoEntitySubsystem.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Game/MmoCharacter.h"
#include "Game/MmoCharacterLook.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoEntityActor.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformTime.h"
#include "Net/MmoSession.h"

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
			Self->SetClass(Entity.Class);
			Self->Teleport(Location);
			GetWorld()->GetFirstPlayerController()->Possess(Self);
			Actors.Add(Id, Self);
		}
		else
		{
			AMmoEntityActor* Other = GetWorld()->SpawnActor<AMmoEntityActor>(Location, Rotation, Spawn);
			Other->SetClass(Entity.Class);
#if WITH_EDITOR
			// 에디터의 아웃라이너에서 찾기 쉽게 한다. 머리 위의 이름은 이름표 층(backlog 16)이 그린다.
			Other->SetActorLabel(UTF8_TO_TCHAR(Entity.Name.c_str()));
#endif
			Actors.Add(Id, Other);
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

TStatId UMmoEntitySubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UMmoEntitySubsystem, STATGROUP_Tickables);
}

bool UMmoEntitySubsystem::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}
