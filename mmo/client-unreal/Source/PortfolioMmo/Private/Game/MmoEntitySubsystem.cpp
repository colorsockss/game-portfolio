#include "Game/MmoEntitySubsystem.h"

#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Game/MmoCharacter.h"
#include "Game/MmoCharacterLook.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoCueSubsystem.h"
#include "NiagaraComponent.h"
#include "Game/MmoEntityActor.h"
#include "Game/MmoEntityVisuals.h"
#include "Animation/AnimSequence.h"
#include "Engine/StaticMesh.h"
#include "Engine/StaticMeshActor.h"
#include "Components/StaticMeshComponent.h"
#include "Game/MmoAnimInstance.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Materials/MaterialInterface.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/PlayerController.h"
#include "HAL/PlatformTime.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"
#include "World/Units.h"

namespace
{
	/** 바닥 표시의 색: 내 대상의 원(노랑), 범위 스킬의 원(주황). 범위의 원이 보이는 시간(초). */
	const FLinearColor TargetColor(1.0f, 0.85f, 0.2f);
	const FLinearColor AreaColor(1.0f, 0.45f, 0.1f);
	constexpr double AreaMarkerSeconds = 0.5;
	/** 공격·스킬 동작 동안 대상 쪽을 보는 시간(초). 동작(0.75–1.2초)의 휘두름이 끝날 즈음까지이고, 그 뒤 서버의 방향으로 돌아온다. */
	constexpr double FaceSeconds = 0.7;
	/** 돌려 그리는 메시가 도는 빠르기(FInterpTo의 속도). */
	constexpr float FaceTurnSpeed = 15.0f;
	/** 피격 번쩍임의 길이(초)와 처음 불투명도. */
	constexpr double HitFlashSeconds = 0.1;
	constexpr float HitFlashOpacity = 0.7f;
	/** 연출을 트는 높이(언리얼 단위): 가슴(1 m). */
	const FVector Chest(0.0, 0.0, 100.0);

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
		Facings.Remove(Id);
		MeshYaw.Remove(Id);
		FlashMaterials.Remove(Id);
		FlashUntil.Remove(Id);
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

	const double Now = FPlatformTime::Seconds();
	for (const TPair<uint32, TObjectPtr<AActor>>& Pair : Actors)
	{
		if (Pair.Key == World.SelfId())
		{
			// 내 캐릭터는 이동 컴포넌트가 옮기므로 그 속도로 달리고, 그 자리를 모델에 넣는다(발사체가 여기서 나가고 여기로 옴).
			AMmoCharacter* Self = CastChecked<AMmoCharacter>(Pair.Value);
			MmoCharacterLook::SetSpeed(*Self->GetMesh(), Self->GetVelocity().Size2D());
			const FVector SelfLocation = Self->GetActorLocation();
			Cues().Walk(Pair.Key, CueKey(Pair.Key).Key, CueKey(Pair.Key).Value, SelfLocation, Self->GetVelocity().Size2D() * DeltaTime);
			World.SetSelfPosition(MmoCoordinates::ToX(SelfLocation), MmoCoordinates::ToZ(SelfLocation), MmoCoordinates::ToYaw(Self->GetActorRotation()));
			continue;
		}
		AMmoEntityActor* Other = CastChecked<AMmoEntityActor>(Pair.Value);
		const MmoWorld::FPose Pose = World.DrawnPose(World.Entities().at(Pair.Key), Now);
		const FVector Location = MmoCoordinates::ToWorld(Pose.X, Pose.Z);
		// 다른 캐릭터는 이번 프레임에 보간이 옮긴 거리로 달리는 속도를 정한다.
		const double Speed = DeltaTime > 0 ? FVector::Dist2D(Location, Other->GetActorLocation()) / DeltaTime : 0;
		MmoCharacterLook::SetSpeed(Other->Mesh(), Speed);
		Other->SetActorLocationAndRotation(Location, MmoCoordinates::ToRotator(Pose.Yaw));
		if (const portfolio::mmo::EntityEnter& Info = World.Entities().at(Pair.Key).Info; !Info.dead()
			&& (Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER || Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER))
		{
			Cues().Walk(Pair.Key, Info.kind(), KeyOf(Info), Location, Speed * DeltaTime);
		}
	}

	// 사건은 받은 순서대로: 공격 동작은 시작 사건에서, 피격 동작은 피해에서 튼다(피해 숫자는 OnCombatEvent를 듣는 이름표 층).
	UMmoSession* Session = GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>();
	MmoWorld::FCombatState& Combat = Session->Combat();
	World.Expire(Now);
	for (const MmoWorld::FCombatEvent& Event : Combat.TakeEvents())
	{
		if (Event.Kind == MmoWorld::ECombatEventKind::Swing)
		{
			PlayAction(Event.Attacker, &FMmoEntityVisual::Attack);
			FaceTarget(Event.Attacker, Event.Target, Now);
		}
		else if (Event.Kind == MmoWorld::ECombatEventKind::Skill)
		{
			ShowSkill(Event, Session->Data());
		}
		else if (Event.Kind == MmoWorld::ECombatEventKind::ProgressStart)
		{
			StartCast(Event, World, Session->Data());
		}
		else if (Event.Kind == MmoWorld::ECombatEventKind::Interrupt)
		{
			StopAction(Event.Target);
		}
		else if (Event.Kind == MmoWorld::ECombatEventKind::Damage)
		{
			PlayAction(Event.Target, &FMmoEntityVisual::Hit);
			FlashHit(Event.Target, Now);
			if (AMmoCharacter* Self = Event.Target == World.SelfId() && Event.Damage > 0 ? Cast<AMmoCharacter>(Actors.FindRef(Event.Target)) : nullptr)
			{
				Self->Shake();
			}
			if (const AActor* Target = Actors.FindRef(Event.Target))
			{
				Cues().Play(EMmoCue::Hit, CueKey(Event.Attacker).Key, CueKey(Event.Attacker).Value, Target->GetActorLocation() + Chest);
			}
		}
		else if (Event.Kind == MmoWorld::ECombatEventKind::Death || Event.Kind == MmoWorld::ECombatEventKind::Revive)
		{
			const bool bDead = Event.Kind == MmoWorld::ECombatEventKind::Death;
			if (AActor* Actor = Actors.FindRef(Event.Target))
			{
				const FMmoEntityVisual* Row = Looks.FindRef(Event.Target);
				const auto [Mesh, Placeholder] = ComponentsOf(*Actor);
				MmoCharacterLook::SetDead(*Mesh, *Placeholder, Row ? Row->Death.Get() : nullptr, bDead, false);
				if (!bDead)
				{
					Cues().Play(EMmoCue::Revive, 0, 0, Actor->GetActorLocation() + Chest);
				}
			}
		}
		OnCombatEvent.Broadcast(Event);
	}
	DrawFacingAndFlashes(Now, DeltaTime);

	const double ServerTick = World.Clock().Now(Now);
	for (auto It = CastEnds.CreateIterator(); It; ++It)
	{
		if (ServerTick >= It.Value())
		{
			const uint32 Id = It.Key();
			It.RemoveCurrent();
			StopAction(Id);
		}
	}
	DrawCombat(World, Combat);
}

void UMmoEntitySubsystem::ShowSkill(const MmoWorld::FCombatEvent& Event, const MmoData::FGameData& Data)
{
	CastEnds.Remove(Event.Attacker);
	FaceTarget(Event.Attacker, Event.Target, FPlatformTime::Seconds());
	const FMmoEntityVisual* Row = Looks.FindRef(Event.Attacker);
	PlayAction(Event.Attacker, Row && !Row->Skill.IsNull() ? &FMmoEntityVisual::Skill : &FMmoEntityVisual::Attack);

	if (const AActor* Caster = Actors.FindRef(Event.Attacker))
	{
		Cues().Play(EMmoCue::SkillCast, 0, static_cast<int32>(Event.Skill), Caster->GetActorLocation() + Chest);
	}

	const portfolio::mmo::data::SkillsRow* Skill = Data.Skill(Event.Skill);
	if (!Skill)
	{
		return;
	}
	// 자기 중심의 범위와 그 자리에서 쓰는 스킬은 시전자에, 나머지는 대상에 둔다. 시전자를 받지 않았으면(0) 대상 쪽만.
	// 직선 발사체의 스킬은 빗나갈 수 있어 맞는 연출을 미리 두지 않는다(맞으면 피해의 연출이 남).
	const uint32 Anchor = !MmoWorld::FCombatState::TargetsOther(*Skill) && Event.Attacker != 0 ? Event.Attacker : Event.Target;
	if (!MmoWorld::FCombatState::Launches(*Skill))
	{
		PendingHits.Add({ FPlatformTime::Seconds() + Skill->hit_delay_ms() / 1000.0, Event.Skill, Anchor });
	}
	const AActor* At = Actors.FindRef(Anchor);
	if (At && Skill->kind() == portfolio::mmo::data::SKILL_KIND_AREA_DAMAGE)
	{
		// 엔진의 원기둥은 지름 1 m라 지름(m)을 그대로 배율로 쓴다.
		const double Diameter = Skill->radius() * 2.0;
		Flash(AreaMarkers, AreaUntil, TEXT("Cylinder"), AreaColor, At->GetActorLocation() + FVector(0.0, 0.0, 3.0), FVector(Diameter, Diameter, 0.02), AreaMarkerSeconds);
	}
}

void UMmoEntitySubsystem::FaceTarget(uint32 Attacker, uint32 Target, double Now)
{
	// 받지 않은 행위자(번호 0)나 대상(직선 발사체의 SkillUsed가 받지 않은 대상을 실을 수 있음), 자기에게 쓴 스킬은 돌리지 않는다.
	if (Attacker != 0 && Target != Attacker && Actors.Contains(Attacker) && Actors.Contains(Target))
	{
		Facings.Add(Attacker, { Target, Now + FaceSeconds });
	}
}

void UMmoEntitySubsystem::DrawFacingAndFlashes(double Now, float DeltaTime)
{
	for (auto It = Facings.CreateIterator(); It; ++It)
	{
		if (Now >= It.Value().Until || !Actors.Contains(It.Value().Target))
		{
			It.RemoveCurrent();
		}
		else
		{
			MeshYaw.FindOrAdd(It.Key());
		}
	}
	for (auto It = MeshYaw.CreateIterator(); It; ++It)
	{
		AActor* Actor = Actors.FindRef(It.Key());
		if (!Actor)
		{
			It.RemoveCurrent();
			continue;
		}
		// 대상 쪽(동작 동안)과 서버의 방향(액터의 방향, 그 뒤) 사이의 각을 돌린다.
		float Goal = 0.0f;
		if (const FFacing* Facing = Facings.Find(It.Key()))
		{
			const FVector ToTarget = Actors.FindRef(Facing->Target)->GetActorLocation() - Actor->GetActorLocation();
			if (!ToTarget.IsNearlyZero(1.0))
			{
				Goal = FMath::FindDeltaAngleDegrees(Actor->GetActorRotation().Yaw, ToTarget.Rotation().Yaw);
			}
		}
		float& Yaw = It.Value();
		Yaw = FMath::FInterpTo(Yaw, Goal, DeltaTime, FaceTurnSpeed);
		USkeletalMeshComponent* Mesh = ComponentsOf(*Actor).Key;
		// 들여온 메시는 −90° 돌려 둔다(MmoCharacterLook::SetUpBody). 그 위에 더한다.
		Mesh->SetRelativeRotation(FRotator(0.0, -90.0 + Yaw, 0.0));
		if (!Facings.Contains(It.Key()) && FMath::Abs(Yaw) < 0.5f)
		{
			Mesh->SetRelativeRotation(FRotator(0.0, -90.0, 0.0));
			It.RemoveCurrent();
		}
	}

	for (auto It = FlashUntil.CreateIterator(); It; ++It)
	{
		const AActor* Actor = Actors.FindRef(It.Key());
		UMaterialInstanceDynamic* Material = FlashMaterials.FindRef(It.Key());
		const double Left = It.Value() - Now;
		if (Material)
		{
			Material->SetScalarParameterValue(TEXT("Flash"), Left > 0.0 ? HitFlashOpacity * static_cast<float>(Left / HitFlashSeconds) : 0.0f);
		}
		if (Left <= 0.0)
		{
			if (Actor)
			{
				const auto [Mesh, Placeholder] = ComponentsOf(*const_cast<AActor*>(Actor));
				Mesh->SetOverlayMaterial(nullptr);
				Placeholder->SetOverlayMaterial(nullptr);
			}
			It.RemoveCurrent();
		}
	}
}

void UMmoEntitySubsystem::FlashHit(uint32 Id, double Now)
{
	AActor* Actor = Actors.FindRef(Id);
	UMaterialInterface* Base = Actor ? Cues().HitFlashMaterial() : nullptr;
	if (!Base)
	{
		return;
	}
	TObjectPtr<UMaterialInstanceDynamic>& Material = FlashMaterials.FindOrAdd(Id);
	if (!Material)
	{
		Material = UMaterialInstanceDynamic::Create(Base, this);
	}
	Material->SetScalarParameterValue(TEXT("Flash"), HitFlashOpacity);
	// 모습을 입힌 메시와 자리 표시 가운데 보이는 쪽에 덮는다.
	const auto [Mesh, Placeholder] = ComponentsOf(*Actor);
	(Mesh->IsVisible() ? static_cast<UMeshComponent*>(Mesh) : static_cast<UMeshComponent*>(Placeholder))->SetOverlayMaterial(Material);
	FlashUntil.Add(Id, Now + HitFlashSeconds);
}

UMmoCueSubsystem& UMmoEntitySubsystem::Cues() const
{
	return *GetWorld()->GetSubsystem<UMmoCueSubsystem>();
}

TPair<int32, int32> UMmoEntitySubsystem::CueKey(uint32 Id) const
{
	const auto& Entities = GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>()->World().Entities();
	const auto Found = Entities.find(Id);
	return Found != Entities.end() ? TPair<int32, int32>(Found->second.Info.kind(), KeyOf(Found->second.Info)) : TPair<int32, int32>(0, 0);
}

void UMmoEntitySubsystem::StartCast(const MmoWorld::FCombatEvent& Event, const MmoWorld::FWorldState& World, const MmoData::FGameData& Data)
{
	const auto Found = World.Entities().find(Event.Target);
	const portfolio::mmo::data::SkillsRow* Skill = Data.Skill(Event.Skill);
	if (Found == World.Entities().end() || !Skill)
	{
		return;
	}
	// 내 예측은 아직 Progress가 없어 시전 시간으로 어림한다.
	const portfolio::mmo::EntityEnter& Info = Found->second.Info;
	CastEnds.Add(Event.Target, Info.has_progress() ? Info.progress().end_tick()
		: static_cast<uint32>(World.Clock().Now(FPlatformTime::Seconds())) + MmoWorld::Units::TicksFromMilliseconds(Skill->cast_ms()));
	const FMmoEntityVisual* Row = Looks.FindRef(Event.Target);
	AActor* Actor = Actors.FindRef(Event.Target);
	if (Row && Actor && !Row->Cast.IsNull())
	{
		MmoCharacterLook::PlayAction(*ComponentsOf(*Actor).Key, Row->Cast.Get(), true);
	}
}

void UMmoEntitySubsystem::StopAction(uint32 Id)
{
	CastEnds.Remove(Id);
	if (AActor* Actor = Actors.FindRef(Id); Actor && Looks.Contains(Id))
	{
		MmoCharacterLook::StopAction(*ComponentsOf(*Actor).Key);
	}
}

void UMmoEntitySubsystem::Flash(TArray<TObjectPtr<AStaticMeshActor>>& Pool, TArray<double>& Until, const TCHAR* Shape, const FLinearColor& Color, const FVector& Location, const FVector& Scale, double Seconds)
{
	const double Now = FPlatformTime::Seconds();
	int32 Index = Until.IndexOfByPredicate([Now](double Each) { return Each <= Now; });
	if (Index == INDEX_NONE)
	{
		Index = Pool.Add(SpawnMarker(Shape, Scale, Color));
		Until.Add(0.0);
	}
	AStaticMeshActor* Marker = Pool[Index];
	Marker->SetActorLocation(Location);
	Marker->SetActorScale3D(Scale);
	Marker->SetActorHiddenInGame(false);
	Until[Index] = Now + Seconds;
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
	const double Now = FPlatformTime::Seconds();
	Combat.UpdateProjectiles(World, Now);
	// 발사체마다 되풀이하는 이펙트를 하나 붙여 가슴 높이로 옮기고, 끝난 발사체의 이펙트는 풀로 돌려놓는다.
	TSet<uint32> Flying;
	for (const MmoWorld::FProjectile& Projectile : Combat.Projectiles())
	{
		if (!Projectile.bLaunched)
		{
			continue;
		}
		const FVector Location = MmoCoordinates::ToWorld(Projectile.X, Projectile.Z) + Chest;
		TObjectPtr<UNiagaraComponent>& Effect = ProjectileEffects.FindOrAdd(Projectile.Id);
		if (!Effect)
		{
			// 불러오는 중이거나 이펙트가 상한이면 다음 프레임에 다시 본다.
			Effect = Cues().StartLoop(EMmoCue::Projectile, CueKey(Projectile.Attacker).Key, CueKey(Projectile.Attacker).Value, Location);
		}
		if (Effect)
		{
			Effect->SetWorldLocation(Location);
		}
		Flying.Add(Projectile.Id);
	}
	for (auto It = ProjectileEffects.CreateIterator(); It; ++It)
	{
		if (!Flying.Contains(It.Key()))
		{
			Cues().StopLoop(It.Value());
			It.RemoveCurrent();
		}
	}

	// 직선 발사체는 모델이 답한 자리(나간 자리와 틱에서 어림한 서버 틱까지)에 그리고, 끝 사건이나 쏜 쪽의 나감으로 목록에서 빠지면 그 자리에서 지운다.
	const double ServerTick = World.Clock().Now(Now);
	TSet<uint32> Lines;
	for (const MmoWorld::FLineProjectile& Line : Combat.LineProjectiles())
	{
		const MmoWorld::FPose Pose = Line.At(ServerTick);
		const FVector Location = MmoCoordinates::ToWorld(Pose.X, Pose.Z) + Chest;
		TObjectPtr<UNiagaraComponent>& Effect = LineEffects.FindOrAdd(Line.Id);
		if (!Effect)
		{
			Effect = Cues().StartLoop(EMmoCue::Projectile, CueKey(Line.Caster).Key, CueKey(Line.Caster).Value, Location);
		}
		if (Effect)
		{
			Effect->SetWorldLocation(Location);
		}
		Lines.Add(Line.Id);
	}
	for (auto It = LineEffects.CreateIterator(); It; ++It)
	{
		if (!Lines.Contains(It.Key()))
		{
			Cues().StopLoop(It.Value());
			It.RemoveCurrent();
		}
	}

	// 때가 된 스킬의 맞는 연출을 튼다(그 자리의 개체가 나갔으면 버림).
	for (int32 Index = PendingHits.Num() - 1; Index >= 0; --Index)
	{
		if (Now < PendingHits[Index].At)
		{
			continue;
		}
		if (const AActor* At = Actors.FindRef(PendingHits[Index].Anchor))
		{
			Cues().Play(EMmoCue::SkillHit, 0, static_cast<int32>(PendingHits[Index].Skill), At->GetActorLocation() + Chest);
		}
		PendingHits.RemoveAtSwap(Index);
	}

	// 범위의 원은 정한 시간이 지나면 감춘다.
	for (int32 Index = 0; Index < AreaMarkers.Num(); ++Index)
	{
		AreaMarkers[Index]->SetActorHiddenInGame(Now > AreaUntil[Index]);
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
	if (Row && Row->Mesh.Get() && Row->Animation.Get() && Row->Attack.Get() && Row->Hit.Get() && Row->Death.Get())
	{
		MmoCharacterLook::Apply(*Mesh, *Placeholder, Row->Mesh.Get(), Row->Animation.Get());
		Looks.Add(Id, Row);
		ShowDeadIfDead(Id, *Mesh, *Placeholder, Row);
		return;
	}

	const FMmoPlaceholder* Look = Visuals->PlaceholderOf(Info.kind());
	MmoCharacterLook::ShowPlaceholder(*Mesh, *Placeholder, Look ? Look->Mesh.Get() : nullptr, Visuals->PlaceholderMaterial, Look ? Look->Color : FLinearColor::White);
	ShowDeadIfDead(Id, *Mesh, *Placeholder, nullptr);
	if (!Row)
	{
		// 표에 줄이 없는 템플릿은 종류의 자리 표시로 남는다(그림은 91이 줄을 더함).
		return;
	}

	const TWeakObjectPtr<AActor> Requested(&Actor);
	const double Started = FPlatformTime::Seconds();
	Streamable.RequestAsyncLoad(
		TArray<FSoftObjectPath>{ Row->Mesh.ToSoftObjectPath(), Row->Animation.ToSoftObjectPath(), Row->Attack.ToSoftObjectPath(), Row->Hit.ToSoftObjectPath(), Row->Death.ToSoftObjectPath() },
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
			ShowDeadIfDead(Id, *LoadedMesh, *LoadedPlaceholder, Row);
			UE_LOG(LogMmoNet, Display, TEXT("Loaded the look of entity %u in %.0f ms"), Id, (FPlatformTime::Seconds() - Started) * 1000.0);
		}));
}

void UMmoEntitySubsystem::ShowDeadIfDead(uint32 Id, USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, const FMmoEntityVisual* Row)
{
	// 죽은 채 시야에 들어온 개체(EntityEnter의 "죽었는지")는 처음부터 쓰러진 자세다.
	const auto& Entities = GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>()->World().Entities();
	const auto Found = Entities.find(Id);
	if (Found != Entities.end() && Found->second.Info.dead())
	{
		MmoCharacterLook::SetDead(Mesh, Placeholder, Row ? Row->Death.Get() : nullptr, true, true);
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
