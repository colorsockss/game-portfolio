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
#include "Game/MmoGameUserSettings.h"
#include "World/Interaction.h"
#include "World/PetFollow.h"
#include "World/Units.h"

namespace
{
	/** 바닥 표시의 색: 내 대상의 원(노랑), 범위 스킬의 원(주황). 범위의 원이 보이는 시간(초). */
	const FLinearColor TargetColor(1.0f, 0.85f, 0.2f);
	const FLinearColor AreaColor(1.0f, 0.45f, 0.1f);
	/** 보스의 예고된 범위(43): 바깥 원(어두운 빨강)과 차오르는 안쪽 원(빨강). */
	const FLinearColor WarningRingColor(0.35f, 0.05f, 0.05f);
	const FLinearColor WarningFillColor(1.0f, 0.15f, 0.1f);
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
	/** 서서히 나타나고 사라지는 시간(초. 59). */
	constexpr float FadeSeconds = 0.3f;
	/** 사라진 정도를 읽는 커스텀 프리미티브 데이터의 칸: 캐릭터 머티리얼은 0, 개체의 자리 표시·무기·펫은 3(create_entity_materials.py). */
	constexpr int32 MeshFadeIndex = 0;
	constexpr int32 PlaceholderFadeIndex = 3;
	/** 품질 높음에서 그림자를 드리우는 다른 개체의 거리(언리얼 단위, 15 m. 59의 처음 값). */
	constexpr double ShadowDistance = 1500.0;

	/** 액터의 메시들에 보이는 정도(0–1)를 넣는다. 머티리얼이 사라진 정도(1 - Shown)를 디더 마스크로 거른다. */
	void SetFade(AActor& Actor, float Visible)
	{
		Actor.ForEachComponent<UPrimitiveComponent>(false, [Visible](UPrimitiveComponent* Component)
		{
			if (Component->IsA<USkeletalMeshComponent>())
			{
				Component->SetCustomPrimitiveDataFloat(MeshFadeIndex, 1.0f - Visible);
			}
			else if (Component->IsA<UStaticMeshComponent>())
			{
				Component->SetCustomPrimitiveDataFloat(PlaceholderFadeIndex, 1.0f - Visible);
			}
		});
	}

	/** 개체의 몸(스켈레탈 메시와 자리 표시)이 그림자를 드리우는지 정한다. 손의 무기는 늘 드리우지 않는다(MmoCharacterLook). */
	void SetShadow(USkeletalMeshComponent& Mesh, UStaticMeshComponent& Placeholder, bool bCast)
	{
		Mesh.SetCastShadow(bCast);
		Placeholder.SetCastShadow(bCast);
	}

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
		Weapons.Remove(Id);
		ShownWeapons.Remove(Id);
		Facings.Remove(Id);
		MeshYaw.Remove(Id);
		FlashMaterials.Remove(Id);
		FlashUntil.Remove(Id);
		CastsShadow.Remove(Id);
		const float Visible = Shown.FindRef(Id);
		Shown.Remove(Id);
		if (TObjectPtr<AActor> Actor; Actors.RemoveAndCopyValue(Id, Actor) && Actor)
		{
			// 다른 개체는 그 자리에서 서서히 사라진 뒤 지운다(누를 수 없게 충돌을 끔). 내 캐릭터(월드를 떠남)는 바로 지운다.
			if (Cast<AMmoEntityActor>(Actor) && Visible > 0.0f)
			{
				Actor->SetActorEnableCollision(false);
				LeavingActors.Add(Actor);
				LeavingShown.Add(Visible);
			}
			else
			{
				Actor->Destroy();
			}
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

	// 입은 무기가 바뀌었거나 모습을 막 입힌 플레이어의 손에 무기를 그린다(34).
	for (const auto& [Id, Look] : Looks)
	{
		const auto Found = World.Entities().find(Id);
		AActor* Actor = Actors.FindRef(Id);
		if (Found == World.Entities().end() || !Actor || Found->second.Info.kind() != portfolio::mmo::ENTITY_KIND_PLAYER)
		{
			continue;
		}
		const uint32 Worn = Found->second.Info.weapon_item_id();
		if (const uint32* Drawn = ShownWeapons.Find(Id); !Drawn || *Drawn != Worn)
		{
			ShowWeapon(Id, *Actor, Worn);
		}
	}

	// 사건은 받은 순서대로: 공격 동작은 시작 사건에서, 피격 동작은 피해에서 튼다(피해 숫자는 OnCombatEvent를 듣는 이름표 층).
	UMmoSession* Session = GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>();
	MmoWorld::FCombatState& Combat = Session->Combat();
	World.Expire(Now);
	for (const MmoWorld::FCombatEvent& Event : Combat.TakeEvents())
	{
		// 나를 대상으로 한 공격의 공격자는 그릴 캐릭터를 고를 때 앞에 둔다(59).
		if ((Event.Kind == MmoWorld::ECombatEventKind::Swing || Event.Kind == MmoWorld::ECombatEventKind::Damage) && Event.Target == World.SelfId())
		{
			Drawing.NoteAttack(Event.Attacker, Now);
		}
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
	for (const MmoWorld::FGrowthEvent& Event : World.TakeGrowth())
	{
		if (Event.Kind == MmoWorld::FGrowthEvent::EKind::LevelUp)
		{
			if (const AActor* Actor = Actors.FindRef(Event.Id))
			{
				Cues().Play(EMmoCue::LevelUp, 0, 0, Actor->GetActorLocation());
			}
			if (Event.bMine)
			{
				Cues().PlayUi(EMmoCue::UiLevelUp);
			}
		}
		OnGrowthEvent.Broadcast(Event);
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
	DrawWarnings(Session->Bosses(), World, Session->Data(), ServerTick);
	DrawFadesAndShadows(World, *Session, DeltaTime, Now);
	DrawPets(World, Session->Data(), ServerTick, DeltaTime);
}

void UMmoEntitySubsystem::DrawFadesAndShadows(const MmoWorld::FWorldState& World, UMmoSession& Session, float DeltaTime, double Now)
{
	const UMmoGameUserSettings::FLevel& Level = UMmoGameUserSettings::Levels[UMmoGameUserSettings::Get().QualityLevel()];
	std::vector<uint32_t> Party;
	for (const MmoWorld::FPartyMember& Member : Session.Party().Members())
	{
		Party.push_back(Member.Id);
	}
	const MmoWorld::FEntity* Self = World.SelfEntity();
	Drawing.Update(MmoWorld::FDrawSelection::Candidates(World), Self ? Self->X : 0, Self ? Self->Z : 0, Party, Session.Combat().Target(), static_cast<size_t>(Level.DrawCharacters), Now);

	const AActor* SelfActor = Actors.FindRef(World.SelfId());
	const float Step = DeltaTime / FadeSeconds;
	for (const TPair<uint32, TObjectPtr<AActor>>& Pair : Actors)
	{
		AActor* Actor = Pair.Value;
		if (!Actor)
		{
			continue;
		}
		const bool bSelf = Pair.Key == World.SelfId();
		if (!bSelf)
		{
			// 막 들어온 개체는 감춘 채 0에서 시작한다(그리지 않는 개체는 그대로 감춰 둠).
			float* Found = Shown.Find(Pair.Key);
			if (!Found)
			{
				Found = &Shown.Add(Pair.Key, 0.0f);
				Actor->SetActorHiddenInGame(true);
				SetFade(*Actor, 0.0f);
			}
			float& Visible = *Found;
			const float Goal = Drawing.Draws(World, Pair.Key) ? 1.0f : 0.0f;
			if (Visible != Goal)
			{
				Visible = Goal > Visible ? FMath::Min(Goal, Visible + Step) : FMath::Max(Goal, Visible - Step);
				Actor->SetActorHiddenInGame(Visible <= 0.0f);
				SetFade(*Actor, Visible);
			}
		}

		// 그림자: 낮음은 끔(엔진의 그림자 품질 0), 중간은 내 캐릭터만, 높음은 내 캐릭터와 가까운 개체까지.
		const bool bCast = Level.Shadows == 1 ? bSelf
			: Level.Shadows == 2 && (bSelf || (SelfActor && FVector::DistSquared2D(Actor->GetActorLocation(), SelfActor->GetActorLocation()) <= ShadowDistance * ShadowDistance));
		if (bool* Cast = CastsShadow.Find(Pair.Key); !Cast || *Cast != bCast)
		{
			const auto [Mesh, Placeholder] = ComponentsOf(*Actor);
			SetShadow(*Mesh, *Placeholder, bCast);
			CastsShadow.Add(Pair.Key, bCast);
		}
	}

	for (int32 Index = LeavingActors.Num() - 1; Index >= 0; --Index)
	{
		LeavingShown[Index] -= Step;
		AActor* Actor = LeavingActors[Index];
		if (!Actor || LeavingShown[Index] <= 0.0f)
		{
			if (Actor)
			{
				Actor->Destroy();
			}
			LeavingActors.RemoveAtSwap(Index);
			LeavingShown.RemoveAtSwap(Index);
			continue;
		}
		SetFade(*Actor, LeavingShown[Index]);
	}
}

void UMmoEntitySubsystem::DrawPets(const MmoWorld::FWorldState& World, const MmoData::FGameData& Data, double ServerTick, float DeltaTime)
{
	UMmoSession* Session = GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FFieldMap* Field = Session->Field();
	const bool bOthers = UMmoGameUserSettings::Get().QualityLevel() > 0;
	TSet<uint32> Seen;
	for (const auto& [Id, Entity] : World.Entities())
	{
		const uint32 PetId = Entity.Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER ? Entity.Info.pet_id() : 0;
		const portfolio::mmo::data::PetsRow* Pet = Data.Pet(PetId);
		const AActor* Owner = Actors.FindRef(Id);
		// 펫은 주인과 함께 나타나고 사라진다(59). 그리지 않는 주인(다 사라짐)의 펫은 없다.
		const float OwnerShown = Id == World.SelfId() ? 1.0f : Shown.FindRef(Id);
		if (!Pet || !Owner || !Field || (Id != World.SelfId() && !bOthers) || OwnerShown <= 0.0f)
		{
			continue;
		}

		Seen.Add(Id);
		const FVector OwnerLocation = Owner->GetActorLocation();
		const MmoWorld::FPoint OwnerPoint{ MmoCoordinates::ToX(OwnerLocation), MmoCoordinates::ToZ(OwnerLocation) };
		MmoWorld::FPetStep Step{ OwnerPoint.X, OwnerPoint.Z, MmoCoordinates::ToYaw(Owner->GetActorRotation()), PetPoints.FindRef(Id), DeltaTime, std::nullopt };
		if (!PetPoints.Contains(Id))
		{
			Step.Last = OwnerPoint;
		}
		// 내 펫은 줍는 거리 안의 주울 수 있는 드롭(플레이어가 떨어뜨리지 않은 것) 쪽을 향한다. 줍는 것은 서버다.
		if (Id == World.SelfId())
		{
			const double Range = Pet->pick_range() * MmoWorld::Units::PerMeter;
			double Best = Range * Range;
			for (const auto& [ItemId, Item] : World.Entities())
			{
				const double DX = static_cast<double>(Item.X) - OwnerPoint.X;
				const double DZ = static_cast<double>(Item.Z) - OwnerPoint.Z;
				if (Item.Info.kind() == portfolio::mmo::ENTITY_KIND_GROUND_ITEM && !Item.Info.dropped_by_player() && DX * DX + DZ * DZ <= Best
					&& MmoWorld::FInteraction::CanPickUp(Item.Info, World.SelfId(), ServerTick, Session->Party().Id()))
				{
					Best = DX * DX + DZ * DZ;
					Step.Lure = MmoWorld::FPoint{ Item.X, Item.Z };
				}
			}
		}
		const MmoWorld::FPoint Next = MmoWorld::NextPetPosition(*Field, Step);
		PetPoints.Add(Id, Next);
		const FVector Location = MmoCoordinates::ToWorld(Next.X, Next.Z);
		AActor* Actor = PetActors.FindRef(Id);
		if (!Actor)
		{
			Actor = SpawnPet(PetId, Location);
			PetActors.Add(Id, Actor);
		}
		// 움직인 만큼 걷기와 대기를 섞고 가는 쪽을 본다(펫의 걸음은 주인을 따르는 클라이언트의 계산이라 서버의 속도가 없다).
		const FVector Moved = Location - Actor->GetActorLocation();
		const double Speed = DeltaTime > 0.0f ? Moved.Size2D() / DeltaTime : 0.0;
		Actor->SetActorHiddenInGame(false);
		Actor->SetActorLocation(Location);
		if (Speed > 1.0)
		{
			Actor->SetActorRotation(FRotator(0.0, Moved.Rotation().Yaw, 0.0));
		}
		MmoCharacterLook::SetSpeed(*ComponentsOf(*Actor).Key, Speed);
		SetFade(*Actor, OwnerShown);
	}
	for (auto It = PetActors.CreateIterator(); It; ++It)
	{
		if (!Seen.Contains(It.Key()))
		{
			// 주인이 시야에서 나갔으면 그 자리에서 서서히 사라지고, 주인을 다 감췄거나 펫을 넣었으면 바로 지운다.
			if (AActor* Pet = It.Value(); Pet && !World.Entities().contains(It.Key()))
			{
				LeavingActors.Add(Pet);
				LeavingShown.Add(1.0f);
			}
			else if (Pet)
			{
				Pet->Destroy();
			}
			PetPoints.Remove(It.Key());
			It.RemoveCurrent();
		}
	}
}

void UMmoEntitySubsystem::DrawWarnings(MmoWorld::FBossWatch& Watch, const MmoWorld::FWorldState& World, const MmoData::FGameData& Data, double ServerTick)
{
	Watch.Expire(ServerTick, World);
	int32 Used = 0;
	for (const MmoWorld::FAreaWarning& Area : Watch.Warnings())
	{
		const portfolio::mmo::data::SkillsRow* Skill = Data.Skill(Area.SkillId);
		if (!Skill)
		{
			continue;
		}
		if (Used == WarningRings.Num())
		{
			WarningRings.Add(SpawnMarker(TEXT("Cylinder"), FVector::OneVector, WarningRingColor));
			WarningFills.Add(SpawnMarker(TEXT("Cylinder"), FVector::OneVector, WarningFillColor));
		}
		// 엔진의 원기둥은 지름 1 m라 지름(m)을 그대로 배율로 쓴다. 안쪽 원은 받은 때부터 피해를 주는 틱까지 0에서 가득으로 자라고, 바깥 원보다 조금 위다.
		const double Diameter = Skill->radius() * 2.0;
		const double Span = FMath::Max(1.0, Area.HitTick - Area.ShownTick);
		const double Ratio = FMath::Clamp((ServerTick - Area.ShownTick) / Span, 0.0, 1.0);
		const FVector Center = MmoCoordinates::ToWorld(Area.X, Area.Z);
		WarningRings[Used]->SetActorLocation(Center + FVector(0.0, 0.0, 2.5));
		WarningRings[Used]->SetActorScale3D(FVector(Diameter, Diameter, 0.02));
		WarningRings[Used]->SetActorHiddenInGame(false);
		WarningFills[Used]->SetActorLocation(Center + FVector(0.0, 0.0, 3.5));
		WarningFills[Used]->SetActorScale3D(FVector(Diameter * Ratio, Diameter * Ratio, 0.02));
		WarningFills[Used]->SetActorHiddenInGame(Ratio <= 0.0);
		++Used;
	}
	for (int32 Index = Used; Index < WarningRings.Num(); ++Index)
	{
		WarningRings[Index]->SetActorHiddenInGame(true);
		WarningFills[Index]->SetActorHiddenInGame(true);
	}
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

void UMmoEntitySubsystem::ShowWeapon(uint32 Id, AActor& Actor, uint32 ItemId)
{
	ShownWeapons.Add(Id, ItemId);
	const auto [Mesh, Placeholder] = ComponentsOf(Actor);
	if (!Mesh->GetSkeletalMeshAsset())
	{
		ShownWeapons.Remove(Id);
		return;
	}
	if (!HiddenWeaponMaterial && Cues().HitFlashMaterial())
	{
		HiddenWeaponMaterial = UMaterialInstanceDynamic::Create(Cues().HitFlashMaterial(), this);
		HiddenWeaponMaterial->SetScalarParameterValue(TEXT("Flash"), 0.0f);
	}
	const portfolio::mmo::data::ItemsRow* Item = ItemId != 0 ? GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>()->Data().Item(ItemId) : nullptr;
	MmoCharacterLook::ShowWeapon(*Mesh, Weapons.FindOrAdd(Id), Item, Visuals, HiddenWeaponMaterial);
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
	if (Found != World.Entities().end() && (Found->second.Info.progress().kind() == portfolio::mmo::PROGRESS_KIND_GATHER
		|| Found->second.Info.progress().kind() == portfolio::mmo::PROGRESS_KIND_CRAFT))
	{
		// 채집(47)과 제작(48. 팩에 제작 동작이 없어 같은 줍는 동작): 끝나는 틱까지 그 동작을 되풀이한다(남의 것도 보임).
		CastEnds.Add(Event.Target, Found->second.Info.progress().end_tick());
		const FMmoEntityVisual* Row = Looks.FindRef(Event.Target);
		AActor* Actor = Actors.FindRef(Event.Target);
		if (Row && Actor && !Row->Gather.IsNull() && Row->Gather.Get())
		{
			MmoCharacterLook::PlayAction(*ComponentsOf(*Actor).Key, Row->Gather.Get(), true);
		}
		return;
	}
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

AStaticMeshActor* UMmoEntitySubsystem::SpawnMarker(const TCHAR* Shape, const FVector& Scale, const FLinearColor& Color, UMaterialInterface* Material)
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
	Mesh->SetMaterial(0, Material ? Material : MarkerMaterial.Get());
	Mesh->SetDefaultCustomPrimitiveDataVector4(0, FVector4(Color.R, Color.G, Color.B, 1.0));
	Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Mesh->SetCastShadow(false);
	Marker->SetActorScale3D(Scale);
	return Marker;
}

AActor* UMmoEntitySubsystem::SpawnPet(uint32 PetId, const FVector& Location)
{
	FActorSpawnParameters Spawn;
	Spawn.SpawnCollisionHandlingOverride = ESpawnActorCollisionHandlingMethod::AlwaysSpawn;
	AMmoEntityActor* Pet = GetWorld()->SpawnActor<AMmoEntityActor>(Location, FRotator::ZeroRotator, Spawn);
	const FMmoEntityVisual* Row = Visuals ? Visuals->Find(UMmoEntityVisuals::PetKind(), static_cast<int32>(PetId)) : nullptr;
	// 펫의 모습은 둘뿐이고 처음 꺼낼 때 한 번만 불러오므로 기다려 불러온다.
	if (Row && Row->Mesh.LoadSynchronous() && Row->Animation.LoadSynchronous())
	{
		MmoCharacterLook::Apply(Pet->Mesh(), Pet->PlaceholderMesh(), Row->Mesh.Get(), Row->Animation.Get(), Row->Scale);
	}
	else
	{
		MmoCharacterLook::ShowPlaceholder(Pet->Mesh(), Pet->PlaceholderMesh(), LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere")),
			Visuals ? Visuals->PlaceholderMaterial.Get() : nullptr, PetId == 1 ? FLinearColor(1.0f, 0.75f, 0.35f) : FLinearColor(0.85f, 0.9f, 1.0f), FVector(0.35));
	}
	Pet->Mesh().SetCastShadow(false);
	Pet->PlaceholderMesh().SetCastShadow(false);
	return Pet;
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
	// 피격 동작이 없는 모델도 있다(슬라임, 해골. 91).
	if (Row && Row->Mesh.Get() && Row->Animation.Get() && Row->Attack.Get() && (Row->Hit.IsNull() || Row->Hit.Get()) && Row->Death.Get())
	{
		MmoCharacterLook::Apply(*Mesh, *Placeholder, Row->Mesh.Get(), Row->Animation.Get(), Row->Scale);
		Looks.Add(Id, Row);
		ShowDeadIfDead(Id, *Mesh, *Placeholder, Row);
		return;
	}

	const FMmoPlaceholder* Look = Visuals->PlaceholderOf(Info.kind());
	MmoCharacterLook::ShowPlaceholder(*Mesh, *Placeholder, Look ? Look->Mesh.Get() : nullptr, Visuals->PlaceholderMaterial, Look ? Look->Color : FLinearColor::White,
		Look ? Look->Scale : FVector(0.6, 0.6, 1.8));
	ShowDeadIfDead(Id, *Mesh, *Placeholder, nullptr);
	if (!Row)
	{
		// 표에 줄이 없는 템플릿은 종류의 자리 표시로 남는다(그림은 91이 줄을 더함).
		return;
	}

	const TWeakObjectPtr<AActor> Requested(&Actor);
	const double Started = FPlatformTime::Seconds();
	Streamable.RequestAsyncLoad(
		TArray<FSoftObjectPath>{ Row->Mesh.ToSoftObjectPath(), Row->Animation.ToSoftObjectPath(), Row->Attack.ToSoftObjectPath(), Row->Hit.ToSoftObjectPath(), Row->Death.ToSoftObjectPath(),
			Row->Gather.ToSoftObjectPath() },
		FStreamableDelegate::CreateWeakLambda(this, [this, Id, Requested, Row, Started]()
		{
			// 그동안 개체가 나갔거나 다시 들어와 다른 액터가 되었으면 버린다(새 액터는 자기 요청을 따로 했다).
			AActor* Current = Actors.FindRef(Id);
			if (!Requested.IsValid() || Current != Requested.Get() || !Row->Mesh.Get() || !Row->Animation.Get())
			{
				return;
			}

			const auto [LoadedMesh, LoadedPlaceholder] = ComponentsOf(*Current);
			MmoCharacterLook::Apply(*LoadedMesh, *LoadedPlaceholder, Row->Mesh.Get(), Row->Animation.Get(), Row->Scale);
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
