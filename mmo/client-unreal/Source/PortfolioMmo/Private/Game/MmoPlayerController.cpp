#include "Game/MmoPlayerController.h"

#include "Camera/PlayerCameraManager.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Game/MmoCharacter.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoEntityActor.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "HAL/PlatformTime.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Input/MmoKeys.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"
#include "Framework/Application/SlateApplication.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoUiManager.h"

namespace
{
	/** 터치로 끈 거리(픽셀) → 카메라 회전(도). */
	constexpr float TouchTurnRate = 0.2f;
	/** 휠 한 칸에 당기는 거리(언리얼 단위). */
	constexpr float WheelZoomStep = 100.0f;
	/** 처음 내려다보는 각도와 돌릴 수 있는 범위(도, 아래가 음수). 쿼터뷰를 벗어나 눕지 않게 좁힌다. */
	constexpr float DefaultPitch = -60.0f;
	constexpr float MinPitch = -80.0f;
	constexpr float MaxPitch = -45.0f;
}

AMmoPlayerController::AMmoPlayerController()
{
	bShowMouseCursor = true;
}

void AMmoPlayerController::SetupInputComponent()
{
	Super::SetupInputComponent();

	MoveAction = NewObject<UInputAction>(this, TEXT("Move"));
	MoveAction->ValueType = EInputActionValueType::Axis2D;
	LookAction = NewObject<UInputAction>(this, TEXT("Look"));
	LookAction->ValueType = EInputActionValueType::Axis2D;
	ZoomAction = NewObject<UInputAction>(this, TEXT("Zoom"));
	ZoomAction->ValueType = EInputActionValueType::Axis1D;
	BackAction = NewObject<UInputAction>(this, TEXT("Back"));
	BackAction->ValueType = EInputActionValueType::Boolean;
	ClickAction = NewObject<UInputAction>(this, TEXT("Click"));
	ClickAction->ValueType = EInputActionValueType::Boolean;
	AttackAction = NewObject<UInputAction>(this, TEXT("Attack"));
	AttackAction->ValueType = EInputActionValueType::Boolean;
	TargetAction = NewObject<UInputAction>(this, TEXT("Target"));
	TargetAction->ValueType = EInputActionValueType::Boolean;
	InteractAction = NewObject<UInputAction>(this, TEXT("Interact"));
	InteractAction->ValueType = EInputActionValueType::Boolean;

	// 이동은 (x: 오른쪽, y: 앞). 키 하나의 값은 x로 들어오므로 앞뒤 키는 y로 옮기고(Swizzle) 반대쪽 키는 뒤집는다(Negate).
	Mapping = NewObject<UInputMappingContext>(this, TEXT("Mapping"));
	auto MapMoveKey = [this](const FKey& Key, bool bForward, bool bNegate)
	{
		FEnhancedActionKeyMapping& KeyMapping = Mapping->MapKey(MoveAction, Key);
		if (bForward)
		{
			KeyMapping.Modifiers.Add(NewObject<UInputModifierSwizzleAxis>(this));
		}
		if (bNegate)
		{
			KeyMapping.Modifiers.Add(NewObject<UInputModifierNegate>(this));
		}
	};
	// 키는 키 표(MmoKeys)에서 읽는다. 아직 기능이 없는 줄(자동 사냥, 강제 공격, 창들, 채팅)은 그 항목이 묶는다.
	MapMoveKey(MmoKeys::KeyOf(EMmoAction::MoveForward), true, false);
	MapMoveKey(MmoKeys::KeyOf(EMmoAction::MoveBack), true, true);
	MapMoveKey(MmoKeys::KeyOf(EMmoAction::MoveRight), false, false);
	MapMoveKey(MmoKeys::KeyOf(EMmoAction::MoveLeft), false, true);
	// 게임패드의 왼쪽 스틱은 이미 (오른쪽, 앞)이다. 화면의 가상 조이스틱은 InjectMove로 같은 액션에 넣는다.
	Mapping->MapKey(MoveAction, EKeys::Gamepad_Left2D);
	Mapping->MapKey(LookAction, EKeys::Mouse2D);
	Mapping->MapKey(ZoomAction, MmoKeys::KeyOf(EMmoAction::CameraZoom));
	Mapping->MapKey(BackAction, MmoKeys::KeyOf(EMmoAction::Back));
	// Android의 뒤로 버튼은 PC의 키가 아니라 표에 두지 않는다.
	Mapping->MapKey(BackAction, EKeys::Android_Back);
	Mapping->MapKey(ClickAction, MmoKeys::KeyOf(EMmoAction::Click));
	Mapping->MapKey(AttackAction, MmoKeys::KeyOf(EMmoAction::Attack));
	Mapping->MapKey(TargetAction, MmoKeys::KeyOf(EMmoAction::TargetNearest));
	Mapping->MapKey(InteractAction, MmoKeys::KeyOf(EMmoAction::Interact));
	for (int32 Index = 0; Index < 8; ++Index)
	{
		UInputAction* Action = NewObject<UInputAction>(this, *FString::Printf(TEXT("Slot%d"), Index));
		Action->ValueType = EInputActionValueType::Boolean;
		Mapping->MapKey(Action, MmoKeys::KeyOf(MmoKeys::Slot(Index)));
		SlotActions.Add(Action);
	}

	if (UEnhancedInputLocalPlayerSubsystem* Input = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
	{
		Input->AddMappingContext(Mapping, 0);
	}

	UEnhancedInputComponent* Enhanced = CastChecked<UEnhancedInputComponent>(InputComponent);
	Enhanced->BindAction(MoveAction, ETriggerEvent::Triggered, this, &AMmoPlayerController::HandleMove);
	Enhanced->BindAction(LookAction, ETriggerEvent::Triggered, this, &AMmoPlayerController::HandleLook);
	Enhanced->BindAction(ZoomAction, ETriggerEvent::Triggered, this, &AMmoPlayerController::HandleZoom);
	Enhanced->BindAction(BackAction, ETriggerEvent::Started, this, &AMmoPlayerController::HandleBack);
	Enhanced->BindAction(ClickAction, ETriggerEvent::Started, this, &AMmoPlayerController::HandleClick);
	Enhanced->BindAction(AttackAction, ETriggerEvent::Started, this, &AMmoPlayerController::AttackOrTargetNearest);
	for (int32 Index = 0; Index < SlotActions.Num(); ++Index)
	{
		Enhanced->BindActionValueLambda(SlotActions[Index], ETriggerEvent::Started, [this, Index](const FInputActionValue&) { UseQuickslot(Index); });
	}
	Enhanced->BindAction(TargetAction, ETriggerEvent::Started, this, &AMmoPlayerController::TargetNearest);
	Enhanced->BindAction(InteractAction, ETriggerEvent::Started, this, &AMmoPlayerController::Interact);
}

bool AMmoPlayerController::InputKey(const FInputKeyEventArgs& Params)
{
	// 글 상자가 받은 키도 뷰포트로 올라오므로, 글을 입력하는 동안은 키보드의 키를 게임에 넘기지 않는다(마우스와 터치는 넘김).
	if (Params.Key.IsValid() && !Params.Key.IsMouseButton() && !Params.Key.IsTouch() && !Params.Key.IsGamepadKey() && Params.Event != IE_Released && MmoKeys::IsTyping())
	{
		return false;
	}
	return Super::InputKey(Params);
}

void AMmoPlayerController::BeginPlay()
{
	Super::BeginPlay();
	if (PlayerCameraManager)
	{
		// 위에서 비스듬히 내려다보는 범위로만 돌린다.
		PlayerCameraManager->ViewPitchMin = MinPitch;
		PlayerCameraManager->ViewPitchMax = MaxPitch;
	}
	PacketHandle = GetGameInstance()->GetSubsystem<UMmoSession>()->OnPacket.AddUObject(this, &AMmoPlayerController::HandlePacket);
}

void AMmoPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>())
	{
		Session->OnPacket.Remove(PacketHandle);
	}
	Super::EndPlay(EndPlayReason);
}

void AMmoPlayerController::OnPossess(APawn* InPawn)
{
	Super::OnPossess(InPawn);
	MoveSender.Reset();
	// 캐릭터가 보던 쪽과 상관없이 북쪽(패킷의 +z, Unreal의 +X)이 화면 위다. 미니맵(북쪽이 위로 고정)과 같은 방향이다.
	SetControlRotation(FRotator(DefaultPitch, 0.0, 0.0));
}

void AMmoPlayerController::PlayerTick(float DeltaTime)
{
	// 회전 입력은 Super::PlayerTick 안에서 적용되고 액터 틱 끝에 지워지므로, 그 앞에서 넣어야 한다.
	UpdateTouchCamera();
	if (Interaction.IsPending())
	{
		UpdateInteraction();
	}
	else if (Session().Combat().PendingSkill() != 0)
	{
		UpdateSkillUse();
	}
	else
	{
		UpdateEngagement();
	}
	FollowPath();
	Super::PlayerTick(DeltaTime);
	// 이번 프레임에 이동 입력이 없었으면 시전 때 쥐고 있던 입력을 놓은 것이다.
	if (!bMoveInput)
	{
		Session().Combat().AllowMove(false);
	}
	bMoveInput = false;

	const APawn* Self = GetPawn();
	UMmoConnection* Connection = GetGameInstance()->GetSubsystem<UMmoConnection>();

	// 개발용: -MmoWalkTo=x,z(m)면 들어온 뒤 한 번 땅을 누른 것처럼 그곳까지 걷는다(눌러서 이동을 키 입력 없이 확인).
	static bool bWalkedFromCommandLine = false;
	FString WalkTo;
	if (Self && !bWalkedFromCommandLine && FParse::Value(FCommandLine::Get(), TEXT("MmoWalkTo="), WalkTo, false))
	{
		bWalkedFromCommandLine = true;
		FString X, Z;
		if (WalkTo.Split(TEXT(","), &X, &Z))
		{
			this->WalkTo(MmoCoordinates::ToWorld(FCString::Atod(*X) * MmoWorld::Units::PerMeter, FCString::Atod(*Z) * MmoWorld::Units::PerMeter));
		}
	}
	// LeaveWorld를 보낸 뒤(월드 밖)에는 월드의 요청을 만들지 않는다(서버는 월드 밖의 Move를 잘못된 패킷으로 끊음).
	if (!Self || !Connection->IsConnected() || !Session().World().InWorld())
	{
		return;
	}

	// 죽은 동안에는 이동과 행동의 요청을 만들지 않는다(사망 화면이 손 조작을 막음). 부활의 PositionReset 뒤에 다시 보낸다.
	if (Session().World().SelfState().bDead)
	{
		PathFollower.Start({});
		bEngaged = false;
		Interaction.Cancel();
		return;
	}

	// 내게 걸린 감속은 최대 속도에 반영해 서버의 이동 예산과 맞춘다(되돌려지지 않게).
	if (UCharacterMovementComponent* Movement = GetPawn<ACharacter>() ? GetPawn<ACharacter>()->GetCharacterMovement() : nullptr)
	{
		const uint32 Slow = Session().World().SelfEffect(Session().Data(), portfolio::mmo::data::EFFECT_KIND_SLOW, FPlatformTime::Seconds()).value_or(0);
		Movement->MaxWalkSpeed = MmoWorld::Units::MaxSpeedMetersPerSecond * 100.0 * (100 - FMath::Min<uint32>(Slow, 100)) / 100.0;
	}

	// 개발용: -MmoAttack이면 걷기가 끝난 뒤 대상이 없을 때마다 가장 가까운 적에게 공격하러 간다(키 입력 없이 전투를 확인).
	if (PathFollower.IsDone() && !bEngaged && Session().Combat().Target() == 0 && FParse::Param(FCommandLine::Get(), TEXT("MmoAttack")))
	{
		AttackOrTargetNearest();
	}

	// 개발용: 대상이 있으면 2초마다 퀵슬롯을 차례대로 누른다(키 입력 없이 스킬을 확인). -MmoSkills=N이면 N번 칸만 누른다.
	static double NextSkillSeconds = 0;
	static int32 NextSlot = 0;
	int32 OnlySlot = 0;
	const bool bOnly = FParse::Value(FCommandLine::Get(), TEXT("MmoSkills="), OnlySlot);
	if (Session().Combat().Target() != 0 && (bOnly || FParse::Param(FCommandLine::Get(), TEXT("MmoSkills"))) && FPlatformTime::Seconds() >= NextSkillSeconds)
	{
		NextSkillSeconds = FPlatformTime::Seconds() + 2.0;
		UseQuickslot(bOnly ? OnlySlot - 1 : NextSlot);
		NextSlot = (NextSlot + 1) % MmoWorld::FCombatState::Quickslots(Session().Data(), Session().World().SelfEntity()->Info.character_class()).size();
	}

	const FVector Location = Self->GetActorLocation();
	portfolio::mmo::Packet Packet;
	const uint32 Ack = GetGameInstance()->GetSubsystem<UMmoSession>()->World().Ack();
	if (MoveSender.Update(DeltaTime, MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location), MmoCoordinates::ToYaw(Self->GetActorRotation()), Ack, *Packet.mutable_move()))
	{
		Connection->Send(Packet);
	}
}

void AMmoPlayerController::InjectMove(const FVector2D& Axis)
{
	if (UEnhancedInputLocalPlayerSubsystem* Input = ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(GetLocalPlayer()))
	{
		Input->InjectInputForAction(MoveAction, FInputActionValue(Axis), {}, {});
	}
}

bool AMmoPlayerController::WalkTo(const FVector& Ground)
{
	const APawn* Self = GetPawn();
	const MmoWorld::FFieldMap* Field = GetGameInstance()->GetSubsystem<UMmoSession>()->Field();
	if (!Self || !Field)
	{
		return false;
	}
	if (!PathFinder)
	{
		PathFinder.emplace(*Field);
	}

	const FVector Location = Self->GetActorLocation();
	const MmoWorld::FPoint From{ MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location) };
	const MmoWorld::FPoint To{ MmoCoordinates::ToX(Ground), MmoCoordinates::ToZ(Ground) };
	if (!PathFinder->Find(From, To, Path))
	{
		UE_LOG(LogMmoNet, Display, TEXT("No path from (%d, %d) to (%d, %d), closed %d cells"), From.X, From.Z, To.X, To.Z, PathFinder->ClosedCells());
		return false;
	}

	UE_LOG(LogMmoNet, Display, TEXT("Walking from (%d, %d) to (%d, %d) through %d points"), From.X, From.Z, To.X, To.Z, static_cast<int32>(Path.size()));
	PathFollower.Start(Path);
	return true;
}

void AMmoPlayerController::FollowPath()
{
	APawn* Self = GetPawn();
	if (!Self || PathFollower.IsDone() || IsStunned())
	{
		return;
	}

	const FVector Location = Self->GetActorLocation();
	if (const std::optional<std::pair<double, double>> Direction = PathFollower.Direction({ MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location) }))
	{
		// 패킷의 z(앞)가 Unreal의 X, x(오른쪽)가 Y다.
		Self->AddMovementInput(FVector(Direction->second, Direction->first, 0.0));
	}
	else
	{
		UE_LOG(LogMmoNet, Display, TEXT("Reached the end of the path at (%d, %d)"), MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location));
	}
}

UMmoSession& AMmoPlayerController::Session() const
{
	return *GetGameInstance()->GetSubsystem<UMmoSession>();
}

bool AMmoPlayerController::IsStunned() const
{
	return Session().World().SelfEffect(Session().Data(), portfolio::mmo::data::EFFECT_KIND_STUN, FPlatformTime::Seconds()).has_value();
}

void AMmoPlayerController::UseQuickslot(int32 Index)
{
	const MmoWorld::FEntity* Me = Session().World().SelfEntity();
	if (bManualMoveBlocked || !Me)
	{
		return;
	}
	const std::vector<uint32_t> Skills = MmoWorld::FCombatState::Quickslots(Session().Data(), Me->Info.character_class());
	if (Index < 0 || Index >= static_cast<int32>(Skills.size()))
	{
		return;
	}
	// 실패의 이유는 전투 모델이 알림으로 쌓고 HUD가 띄운다.
	const portfolio::mmo::FailReason Reason = Session().Combat().PressSkill(Skills[Index], Session().World(), Session().Data(), FPlatformTime::Seconds());
	if (Reason != portfolio::mmo::FAIL_REASON_NONE)
	{
		UE_LOG(LogMmoNet, Display, TEXT("Skill %u is not ready: %s"), Skills[Index], UTF8_TO_TCHAR(portfolio::mmo::FailReason_Name(Reason).c_str()));
		return;
	}
	EngagedGoal = { MIN_int32, MIN_int32 };
}

void AMmoPlayerController::UpdateSkillUse()
{
	UMmoSession& Net = Session();
	ACharacter* Self = GetPawn<ACharacter>();
	const MmoWorld::FFieldMap* Field = Net.Field();
	if (!Self || !Field || IsStunned())
	{
		Net.Combat().CancelSkill();
		return;
	}

	const FVector Location = Self->GetActorLocation();
	const int32 X = MmoCoordinates::ToX(Location);
	const int32 Z = MmoCoordinates::ToZ(Location);
	const MmoWorld::FSkillStep Step = Net.Combat().UpdateSkill(Net.World(), *Field, Net.Data(), X, Z);
	if (Step.Kind == MmoWorld::FSkillStep::EKind::Approach)
	{
		const double Moved = FMath::Sqrt(FMath::Square(static_cast<double>(Step.Goal.X) - EngagedGoal.X) + FMath::Square(static_cast<double>(Step.Goal.Z) - EngagedGoal.Z));
		if (PathFollower.IsDone() || Moved > MmoWorld::Units::PerMeter)
		{
			EngagedGoal = Step.Goal;
			if (!WalkTo(MmoCoordinates::ToWorld(Step.Goal.X, Step.Goal.Z)))
			{
				Net.Combat().CancelSkill();
			}
		}
		return;
	}
	if (Step.Kind != MmoWorld::FSkillStep::EKind::Fire)
	{
		return;
	}

	PathFollower.Start({});
	const MmoWorld::FSkillFire Fire = Net.Combat().FireSkill(Net.World(), Net.Data(), MoveSender, X, Z, MmoCoordinates::ToYaw(Self->GetActorRotation()), FPlatformTime::Seconds());
	if (Fire.bStop)
	{
		// 시전은 세운 자리에서 해야 다음 Move가 시전을 취소하지 않는다. 공격하러 가던 길도 버린다.
		bEngaged = false;
		Self->GetCharacterMovement()->StopMovementImmediately();
	}
	for (const portfolio::mmo::Packet& Packet : Fire.Packets)
	{
		Net.Send(Packet);
	}
}

void AMmoPlayerController::SelectTarget(uint32 Id)
{
	bEngaged = false;
	Interaction.Cancel();
	Session().Combat().CancelSkill();
	if (const std::optional<portfolio::mmo::Packet> Stop = Session().Combat().SetTarget(Id))
	{
		Session().Send(*Stop);
	}
}

void AMmoPlayerController::Engage()
{
	bEngaged = Session().Combat().Target() != 0;
	// 길은 다음 UpdateEngagement가 찾는다.
	EngagedGoal = { MIN_int32, MIN_int32 };
	PathFollower.Start({});
}

void AMmoPlayerController::AttackOrTargetNearest()
{
	if (bManualMoveBlocked || Session().World().SelfState().bDead)
	{
		return;
	}
	if (Session().Combat().Target() == 0)
	{
		TargetNearest();
	}
	Engage();
}

void AMmoPlayerController::TargetNearest()
{
	const APawn* Self = GetPawn();
	if (!Self || bManualMoveBlocked || Session().World().SelfState().bDead)
	{
		return;
	}
	const FVector Location = Self->GetActorLocation();
	SelectTarget(MmoWorld::FCombatState::NearestEnemy(Session().World(), MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location)));
}

void AMmoPlayerController::UpdateEngagement()
{
	UMmoSession& Net = Session();
	MmoWorld::FCombatState& Combat = Net.Combat();
	const APawn* Self = GetPawn();
	const MmoWorld::FFieldMap* Field = Net.Field();
	const MmoWorld::FEntity* Me = Net.World().SelfEntity();
	const auto& Entities = Net.World().Entities();
	const auto Target = Entities.find(Combat.Target());
	if (!bEngaged || !Self || !Field || !Me || Target == Entities.end() || Target->second.Info.dead())
	{
		bEngaged = false;
		return;
	}
	const std::optional<MmoWorld::FCombatState::FAttack> Attack = MmoWorld::FCombatState::AttackOf(Me->Info, Net.Data());
	if (!Attack)
	{
		bEngaged = false;
		return;
	}

	const FVector Location = Self->GetActorLocation();
	const int32 X = MmoCoordinates::ToX(Location);
	const int32 Z = MmoCoordinates::ToZ(Location);
	const MmoWorld::FEntity& Goal = Target->second;
	if (MmoWorld::FCombatState::CanStrikeFrom(*Field, X, Z, Goal, Attack->RangeMeters))
	{
		PathFollower.Start({});
		if (!Combat.IsAttacking() && !IsStunned())
		{
			// 밀린 위치를 먼저 보내 서버가 지금 자리에서 사거리와 선을 보게 한다.
			portfolio::mmo::Packet Move;
			if (MoveSender.Flush(X, Z, MmoCoordinates::ToYaw(Self->GetActorRotation()), Net.World().Ack(), *Move.mutable_move()))
			{
				Net.Send(Move);
			}
			if (const std::optional<portfolio::mmo::Packet> Start = Combat.StartAttack(Net.World().SelfId()))
			{
				Net.Send(*Start);
			}
		}
		return;
	}

	const double Moved = FMath::Sqrt(FMath::Square(static_cast<double>(Goal.X) - EngagedGoal.X) + FMath::Square(static_cast<double>(Goal.Z) - EngagedGoal.Z));
	if (PathFollower.IsDone() || Moved > MmoWorld::Units::PerMeter)
	{
		EngagedGoal = { Goal.X, Goal.Z };
		bEngaged = WalkTo(MmoCoordinates::ToWorld(Goal.X, Goal.Z));
	}
}

void AMmoPlayerController::HandleClick()
{
	// 터치 기기에서는 탭이 누르기다(UpdateTouchCamera). 이동은 조이스틱만 쓴다.
	FVector2D Mouse;
	if (!UMmoButtonWidget::IsTouchDevice() && GetMousePosition(Mouse.X, Mouse.Y))
	{
		PressAt(Mouse, true);
	}
}

void AMmoPlayerController::PressAt(const FVector2D& ScreenPosition, bool bWalk)
{
	// 창이 열린 동안은 손 조작을 막는다.
	if (bManualMoveBlocked || Session().World().SelfState().bDead)
	{
		return;
	}

	// 상호작용할 수 있는 개체(NPC, 채집물, 바닥 아이템)는 대상이 되지 않고 걸어가 상호작용한다. 다른 개체를 누르면 대상이 되고, 이미 대상인
	// 몬스터를 다시 누르면 공격하러 간다. 다른 플레이어도 대상이 된다(공격은 44 전에는 서버가 거절).
	FHitResult Hit;
	if (GetHitResultAtScreenPosition(ScreenPosition, ECC_Visibility, false, Hit))
	{
		if (const AMmoEntityActor* Picked = Cast<AMmoEntityActor>(Hit.GetActor()))
		{
			const auto& Entities = Session().World().Entities();
			const auto Found = Entities.find(Picked->EntityId);
			const MmoWorld::EInteractKind Kind = Found != Entities.end() ? MmoWorld::FInteraction::KindOf(Found->second) : MmoWorld::EInteractKind::None;
			if (Kind != MmoWorld::EInteractKind::None)
			{
				bEngaged = false;
				Session().Combat().CancelSkill();
				Interaction.Start({ Picked->EntityId, Kind });
				InteractGoal = { MIN_int32, MIN_int32 };
			}
			else if (Found != Entities.end() && Picked->EntityId == Session().Combat().Target() && Found->second.Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER)
			{
				Engage();
			}
			else
			{
				SelectTarget(Picked->EntityId);
			}
			return;
		}
	}

	// 터치의 빈 곳은 대상을 푼다(이동은 조이스틱만).
	if (!bWalk)
	{
		SelectTarget(0);
		return;
	}

	// 땅은 평지(높이 0)라 화면의 광선과 땅의 평면이 만나는 곳이다. 맵의 것(건물 등)을 눌러도 그 뒤의 땅이다. 대상은 그대로다.
	bEngaged = false;
	Interaction.Cancel();
	if (IsStunned())
	{
		return;
	}
	Session().Combat().CancelSkill();
	FVector Origin, Direction;
	if (!DeprojectScreenPositionToWorld(ScreenPosition.X, ScreenPosition.Y, Origin, Direction) || Direction.Z >= -KINDA_SMALL_NUMBER)
	{
		return;
	}
	WalkTo(Origin + Direction * (-Origin.Z / Direction.Z));
}

std::optional<MmoWorld::FInteractTarget> AMmoPlayerController::InteractCandidate() const
{
	const APawn* Self = GetPawn();
	if (!Self)
	{
		return std::nullopt;
	}
	const FVector Location = Self->GetActorLocation();
	return MmoWorld::FInteraction::Nearest(Session().World(), MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location), Session().Data().Constants.interact_pick_range());
}

void AMmoPlayerController::Interact()
{
	if (bManualMoveBlocked || Session().World().SelfState().bDead || IsStunned())
	{
		return;
	}
	if (const std::optional<MmoWorld::FInteractTarget> Candidate = InteractCandidate())
	{
		bEngaged = false;
		Session().Combat().CancelSkill();
		Interaction.Start(*Candidate);
		InteractGoal = { MIN_int32, MIN_int32 };
	}
}

void AMmoPlayerController::UpdateInteraction()
{
	UMmoSession& Net = Session();
	const APawn* Self = GetPawn();
	const MmoWorld::FFieldMap* Field = Net.Field();
	if (!Self || !Field || IsStunned())
	{
		Interaction.Cancel();
		return;
	}
	const FVector Location = Self->GetActorLocation();
	const MmoWorld::FInteractStep Step = Interaction.Update(Net.World(), *Field, MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location), Net.Data().Constants.interact_range());
	if (Step.Kind == MmoWorld::FInteractStep::EKind::Act)
	{
		PathFollower.Start({});
		Act(Step.Target);
	}
	else if (Step.Kind == MmoWorld::FInteractStep::EKind::Approach)
	{
		const double Moved = FMath::Sqrt(FMath::Square(static_cast<double>(Step.Goal.X) - InteractGoal.X) + FMath::Square(static_cast<double>(Step.Goal.Z) - InteractGoal.Z));
		if (PathFollower.IsDone() || Moved > MmoWorld::Units::PerMeter)
		{
			InteractGoal = Step.Goal;
			if (!WalkTo(MmoCoordinates::ToWorld(Step.Goal.X, Step.Goal.Z)))
			{
				Interaction.Cancel();
			}
		}
	}
}

void AMmoPlayerController::Act(const MmoWorld::FInteractTarget& Target)
{
	UE_LOG(LogMmoNet, Display, TEXT("Interact with %u (kind %d)"), Target.Id, static_cast<int32>(Target.Kind));
}

void AMmoPlayerController::HandleBack()
{
	GetLocalPlayer()->GetSubsystem<UMmoUiManager>()->Back();
}

void AMmoPlayerController::HandleMove(const FInputActionValue& Value)
{
	APawn* Self = GetPawn();
	// 카메라가 보는 쪽이 앞이다. 손으로 걸으면 따라가던 경로와 누른 스킬을 버린다.
	const FVector2D Axis = Value.Get<FVector2D>();
	bMoveInput |= !Axis.IsNearlyZero();
	// 시전 시간이 있는 스킬을 보낼 때 쥐고 있던 입력은 한 번 놓을 때까지 쓰지 않는다(그대로 걸으면 시전이 바로 취소됨).
	if (!Self || bManualMoveBlocked || Session().World().SelfState().bDead || IsStunned() || !Session().Combat().AllowMove(!Axis.IsNearlyZero()))
	{
		return;
	}
	if (!Axis.IsNearlyZero())
	{
		PathFollower.Start({});
		bEngaged = false;
		Session().Combat().CancelSkill();
		Interaction.Cancel();
	}
	const FRotationMatrix Facing(FRotator(0.0, GetControlRotation().Yaw, 0.0));
	Self->AddMovementInput(Facing.GetUnitAxis(EAxis::X), Axis.Y);
	Self->AddMovementInput(Facing.GetUnitAxis(EAxis::Y), Axis.X);
}

void AMmoPlayerController::HandleLook(const FInputActionValue& Value)
{
	// 마우스는 오른쪽 버튼을 누른 동안만 카메라를 돌린다. 왼쪽 버튼과 커서는 대상 고르기(backlog 24)에 남긴다.
	if (!IsInputKeyDown(MmoKeys::KeyOf(EMmoAction::CameraDrag)))
	{
		return;
	}
	const FVector2D Delta = Value.Get<FVector2D>();
	AddYawInput(Delta.X);
	AddPitchInput(-Delta.Y);
}

void AMmoPlayerController::HandleZoom(const FInputActionValue& Value)
{
	if (AMmoCharacter* Self = GetPawn<AMmoCharacter>())
	{
		Self->Zoom(Value.Get<float>() * WheelZoomStep);
	}
}

void AMmoPlayerController::UpdateTouchCamera()
{
	// 손가락마다 주인이 하나다(조이스틱, 버튼, 카메라. MmoScreen::FTouchOwners). 조이스틱과 버튼은 누른 순간 가져가고 그 터치는 뷰포트에
	// 오지 않으므로, 여기서 눌린 것으로 보이고 주인이 없는 손가락은 카메라가 가진다. 카메라의 손가락만 돌리고 당기는 데 쓴다.
	MmoScreen::FTouchOwners& Owners = GetLocalPlayer()->GetSubsystem<UMmoUiManager>()->TouchOwners();
	int32 CameraFingers[2];
	int32 CameraCount = 0;
	FVector2D Now[MmoScreen::FTouchOwners::MaxFingers];
	bool bDown[MmoScreen::FTouchOwners::MaxFingers];
	for (int32 Finger = 0; Finger < MmoScreen::FTouchOwners::MaxFingers; ++Finger)
	{
		float X, Y;
		GetInputTouchState(static_cast<ETouchIndex::Type>(Finger), X, Y, bDown[Finger]);
		Now[Finger] = FVector2D(X, Y);
		if (bDown[Finger] && Owners.Claim(Finger, MmoScreen::ETouchOwner::Camera) && CameraCount < 2)
		{
			CameraFingers[CameraCount++] = Finger;
		}
	}

	// 카메라의 손가락마다 탭과 끌기를 가른다. 끌기가 된 뒤에만 돌리고, 끌기가 되지 않은 채 짧게 뗀 손가락은 그 자리를 누른 것이다.
	const double NowSeconds = FPlatformTime::Seconds();
	for (int32 Finger = 0; Finger < MmoScreen::FTouchOwners::MaxFingers; ++Finger)
	{
		const bool bCamera = bDown[Finger] && Owners.OwnerOf(Finger) == MmoScreen::ETouchOwner::Camera;
		if (bCamera && !bTouchWasDown[Finger])
		{
			Gestures.Down(Finger, Now[Finger].X, Now[Finger].Y, NowSeconds);
		}
		else if (bCamera)
		{
			Gestures.Move(Finger, Now[Finger].X, Now[Finger].Y);
		}
		double TapX = 0;
		double TapY = 0;
		if (!bDown[Finger] && bTouchWasDown[Finger] && bCameraFinger[Finger] && Gestures.Up(Finger, NowSeconds, TapX, TapY))
		{
			PressAt(FVector2D(TapX, TapY), false);
		}
		bCameraFinger[Finger] = bCamera;
	}

	// 같은 손가락이 지난 프레임에도 닿아 있었을 때만 움직인 만큼 쓴다(새로 닿은 손가락은 튀지 않게 건너뛴다).
	const auto Held = [this, &bDown](int32 Finger) { return bDown[Finger] && bTouchWasDown[Finger]; };
	if (CameraCount == 2 && Held(CameraFingers[0]) && Held(CameraFingers[1]))
	{
		Gestures.MarkDrag(CameraFingers[0]);
		Gestures.MarkDrag(CameraFingers[1]);
		// 두 손가락 사이가 벌어진 만큼 당긴다.
		const int32 A = CameraFingers[0];
		const int32 B = CameraFingers[1];
		const double Spread = FVector2D::Distance(Now[A], Now[B]) - FVector2D::Distance(TouchWas[A], TouchWas[B]);
		if (AMmoCharacter* Self = GetPawn<AMmoCharacter>())
		{
			Self->Zoom(Spread * 2.0);
		}
	}
	else if (CameraCount == 1 && Held(CameraFingers[0]) && Gestures.Move(CameraFingers[0], Now[CameraFingers[0]].X, Now[CameraFingers[0]].Y))
	{
		// 화면 좌표는 아래가 +y다. 끄는 쪽으로 화면이 따라오게 돌린다(DefaultInput.ini에서 옛 입력 배율을 꺼 값이 곧 각도다).
		const FVector2D Delta = Now[CameraFingers[0]] - TouchWas[CameraFingers[0]];
		AddYawInput(Delta.X * TouchTurnRate);
		AddPitchInput(-Delta.Y * TouchTurnRate);
	}

	for (int32 Finger = 0; Finger < MmoScreen::FTouchOwners::MaxFingers; ++Finger)
	{
		TouchWas[Finger] = Now[Finger];
		bTouchWasDown[Finger] = bDown[Finger];
	}
}

void AMmoPlayerController::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (Packet.body_case() != portfolio::mmo::Packet::kPositionReset)
	{
		return;
	}
	if (AMmoCharacter* Self = GetPawn<AMmoCharacter>())
	{
		const portfolio::mmo::PositionReset& Reset = Packet.position_reset();
		UE_LOG(LogMmoNet, Display, TEXT("PositionReset to (%d, %d), ack %u"), Reset.x(), Reset.z(), Reset.ack());
		Self->Teleport(MmoCoordinates::ToWorld(Reset.x(), Reset.z()));
	}
}
