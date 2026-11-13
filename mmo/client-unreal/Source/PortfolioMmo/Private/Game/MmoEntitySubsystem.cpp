#include "Game/MmoEntitySubsystem.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Game/MmoCharacter.h"
#include "Game/MmoCharacterLook.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoEntityActor.h"
#include "Game/MmoEntityVisuals.h"
#include "Animation/AnimSequence.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Components/StaticMeshComponent.h"
#include "Game/MmoAnimInstance.h"
#include "Materials/MaterialInterface.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformTime.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"

namespace
{
	/** 자리 표시의 색: 내 대상의 원(노랑), 발사체(밝은 보라). */
	const FLinearColor TargetColor(1.0f, 0.85f, 0.2f);
	const FLinearColor ProjectileColor(0.8f, 0.5f, 1.0f);

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
		Looks.Remove(Id);
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
			Other->EntityId = Id;
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

	// 사건은 받은 순서대로: 공격 동작은 시작 사건에서, 피격 동작은 피해에서 튼다(피해 숫자는 OnCombatEvent를 듣는 이름표 층).
	MmoWorld::FCombatState& Combat = GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>()->Combat();
	for (const MmoWorld::FCombatEvent& Event : Combat.TakeEvents())
	{
		if (Event.Kind == MmoWorld::ECombatEventKind::Swing)
		{
			PlayAction(Event.Attacker, &FMmoEntityVisual::Attack);
		}
		else if (Event.Kind == MmoWorld::ECombatEventKind::Damage)
		{
			PlayAction(Event.Target, &FMmoEntityVisual::Hit);
		}
		OnCombatEvent.Broadcast(Event);
	}
	DrawCombat(World, Combat);
}

void UMmoEntitySubsystem::PlayAction(uint32 Id, TSoftObjectPtr<UAnimSequence> FMmoEntityVisual::* Action)
{
	const FMmoEntityVisual* Row = Looks.FindRef(Id);
	AActor* Actor = Actors.FindRef(Id);
	if (Row && Actor)
	{
		MmoCharacterLook::PlayAction(*ComponentsOf(*Actor).Key, (Row->*Action).Get());
	}
}

void UMmoEntitySubsystem::DrawCombat(const MmoWorld::FWorldState& World, MmoWorld::FCombatState& Combat)
{
	Combat.UpdateProjectiles(World, FPlatformTime::Seconds());
	int32 Shown = 0;
	for (const MmoWorld::FProjectile& Projectile : Combat.Projectiles())
	{
		if (!Projectile.bLaunched)
		{
			continue;
		}
		if (Shown == ProjectileMarkers.Num())
		{
			ProjectileMarkers.Add(SpawnMarker(TEXT("Sphere"), FVector(0.3), ProjectileColor));
		}
		AStaticMeshActor* Marker = ProjectileMarkers[Shown++];
		// 가슴 높이(1 m)로 난다.
		Marker->SetActorLocation(MmoCoordinates::ToWorld(Projectile.X, Projectile.Z) + FVector(0.0, 0.0, 100.0));
		Marker->SetActorHiddenInGame(false);
	}
	for (int32 Index = Shown; Index < ProjectileMarkers.Num(); ++Index)
	{
		ProjectileMarkers[Index]->SetActorHiddenInGame(true);
	}

	// 대상의 발밑에 납작한 원을 둔다.
	const AActor* Target = Combat.Target() != 0 ? Actors.FindRef(Combat.Target()) : nullptr;
	if (!TargetMarker && Target)
	{
		TargetMarker = SpawnMarker(TEXT("Cylinder"), FVector(1.2, 1.2, 0.02), TargetColor);
	}
	if (TargetMarker)
	{
		TargetMarker->SetActorHiddenInGame(!Target);
		if (Target)
		{
			TargetMarker->SetActorLocation(Target->GetActorLocation() + FVector(0.0, 0.0, 2.0));
		}
	}
}

AStaticMeshActor* UMmoEntitySubsystem::SpawnMarker(const TCHAR* Shape, const FVector& Scale, const FLinearColor& Color)
{
	if (!MarkerMaterial)
	{
		// 맵의 자리 표시와 같은 머티리얼(커스텀 프리미티브 데이터 0–2가 색. create_content.py).
		MarkerMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Materials/M_Placeholder.M_Placeholder"));
	}
	FActorSpawnParameters Spawn;
	Spawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AStaticMeshActor* Marker = GetWorld()->SpawnActor<AStaticMeshActor>(FVector::ZeroVector, FRotator::ZeroRotator, Spawn);
	Marker->SetMobility(EComponentMobility::Movable);
	UStaticMeshComponent* Mesh = Marker->GetStaticMeshComponent();
	Mesh->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, *FString::Printf(TEXT("/Engine/BasicShapes/%s.%s"), Shape, Shape)));
	Mesh->SetMaterial(0, MarkerMaterial);
	Mesh->SetDefaultCustomPrimitiveDataVector4(0, FVector4(Color.R, Color.G, Color.B, 1.0));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetCastShadow(false);
	Marker->SetActorScale3D(Scale);
	return Marker;
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
	if (Row && Row->Mesh.Get() && Row->Animation.Get() && Row->Attack.Get() && Row->Hit.Get())
	{
		MmoCharacterLook::Apply(*Mesh, *Placeholder, Row->Mesh.Get(), Row->Animation.Get());
		Looks.Add(Id, Row);
		return;
	}

	MmoCharacterLook::ShowPlaceholder(*Mesh, *Placeholder, Visuals->Placeholder);
	if (!Row)
	{
		// shortcut: 표에 줄이 없는 템플릿은 원기둥으로 남는다. 템플릿마다의 자리 표시는 backlog 73이 만든다.
		return;
	}

	const TWeakObjectPtr<AActor> Requested(&Actor);
	const double Started = FPlatformTime::Seconds();
	Streamable.RequestAsyncLoad(
		TArray<FSoftObjectPath>{ Row->Mesh.ToSoftObjectPath(), Row->Animation.ToSoftObjectPath(), Row->Attack.ToSoftObjectPath(), Row->Hit.ToSoftObjectPath() },
		FStreamableDelegate::CreateWeakLambda(this, [this, Id, Requested, Row, Started]()
		{
			// 그동안 개체가 나갔거나 다시 들어와 다른 액터가 되었으면 버린다(새 액터는 자기 요청을 따로 했다).
			AActor* Current = Actors.FindRef(Id);
			if (!Requested.IsValid() || Current != Requested.Get() || !Row->Mesh.Get() || !Row->Animation.Get())
			{
				return;
			}

			const auto [LoadedMesh, LoadedPlaceholder] = ComponentsOf(*Current);
			MmoCharacterLook::Apply(*LoadedMesh, *LoadedPlaceholder, Row->Mesh.Get(), Row->Animation.Get());
			Looks.Add(Id, Row);
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
