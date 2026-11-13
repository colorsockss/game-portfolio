#include "Game/MmoPlayerController.h"

#include "Camera/PlayerCameraManager.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Game/MmoCharacter.h"
#include "Game/MmoCoordinates.h"
#include "InputAction.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"
#include "Framework/Application/SlateApplication.h"
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
	MapMoveKey(EKeys::W, true, false);
	MapMoveKey(EKeys::S, true, true);
	MapMoveKey(EKeys::D, false, false);
	MapMoveKey(EKeys::A, false, true);
	// 게임패드의 왼쪽 스틱은 이미 (오른쪽, 앞)이다. 화면의 가상 조이스틱은 InjectMove로 같은 액션에 넣는다.
	Mapping->MapKey(MoveAction, EKeys::Gamepad_Left2D);
	Mapping->MapKey(LookAction, EKeys::Mouse2D);
	Mapping->MapKey(ZoomAction, EKeys::MouseWheelAxis);
	Mapping->MapKey(BackAction, EKeys::Escape);
	Mapping->MapKey(BackAction, EKeys::Android_Back);
	Mapping->MapKey(ClickAction, EKeys::LeftMouseButton);

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
	FollowPath();
	Super::PlayerTick(DeltaTime);

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
	if (!Self || !Connection->IsConnected())
	{
		return;
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
	if (!Self || PathFollower.IsDone())
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

void AMmoPlayerController::HandleClick()
{
	// 터치 기기에서는 이동을 조이스틱만 쓴다(빈 땅을 누르는 것은 대상 풀기. backlog 24). 창이 열린 동안은 손 조작을 막는다.
	if (bManualMoveBlocked || FPlatformMisc::SupportsTouchInput() || FSlateApplication::Get().IsFakingTouchEvents())
	{
		return;
	}

	// 땅은 평지(높이 0)라 커서 광선과 땅의 평면이 만나는 곳이다. 맵의 것(건물 등)을 눌러도 그 뒤의 땅이다.
	FVector Origin, Direction;
	if (!DeprojectMousePositionToWorld(Origin, Direction) || Direction.Z >= -KINDA_SMALL_NUMBER)
	{
		return;
	}
	WalkTo(Origin + Direction * (-Origin.Z / Direction.Z));
}

void AMmoPlayerController::HandleBack()
{
	GetLocalPlayer()->GetSubsystem<UMmoUiManager>()->Back();
}

void AMmoPlayerController::HandleMove(const FInputActionValue& Value)
{
	APawn* Self = GetPawn();
	if (!Self || bManualMoveBlocked)
	{
		return;
	}
	// 카메라가 보는 쪽이 앞이다. 손으로 걸으면 따라가던 경로를 버린다.
	const FVector2D Axis = Value.Get<FVector2D>();
	if (!Axis.IsNearlyZero())
	{
		PathFollower.Start({});
	}
	const FRotationMatrix Facing(FRotator(0.0, GetControlRotation().Yaw, 0.0));
	Self->AddMovementInput(Facing.GetUnitAxis(EAxis::X), Axis.Y);
	Self->AddMovementInput(Facing.GetUnitAxis(EAxis::Y), Axis.X);
}

void AMmoPlayerController::HandleLook(const FInputActionValue& Value)
{
	// 마우스는 오른쪽 버튼을 누른 동안만 카메라를 돌린다. 왼쪽 버튼과 커서는 대상 고르기(backlog 24)에 남긴다.
	if (!IsInputKeyDown(EKeys::RightMouseButton))
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
	FVector2D Now[2];
	bool bDown[2];
	for (int32 Finger = 0; Finger < 2; ++Finger)
	{
		float X, Y;
		GetInputTouchState(static_cast<ETouchIndex::Type>(Finger), X, Y, bDown[Finger]);
		Now[Finger] = FVector2D(X, Y);
	}

	// 같은 손가락들이 지난 프레임에도 닿아 있었을 때만 움직인 만큼 쓴다(새로 닿은 손가락은 튀지 않게 건너뛴다).
	const bool bSameFingers = bDown[0] == bTouchWasDown[0] && bDown[1] == bTouchWasDown[1];
	if (bSameFingers && bDown[0] && bDown[1])
	{
		// 두 손가락 사이가 벌어진 만큼 당긴다.
		const double Spread = FVector2D::Distance(Now[0], Now[1]) - FVector2D::Distance(TouchWas[0], TouchWas[1]);
		if (AMmoCharacter* Self = GetPawn<AMmoCharacter>())
		{
			Self->Zoom(Spread * 2.0);
		}
	}
	else if (bSameFingers && (bDown[0] || bDown[1]))
	{
		// 손가락 하나면 그 번호가 무엇이든 돌린다. 가상 조이스틱을 누른 손가락은 조이스틱이 가져가 여기 오지 않으므로,
		// 걷는 동안 카메라를 돌리는 손가락은 둘째 번호일 수 있다.
		// 화면 좌표는 아래가 +y다. 끄는 쪽으로 화면이 따라오게 돌린다(DefaultInput.ini에서 옛 입력 배율을 꺼 값이 곧 각도다).
		const int32 Finger = bDown[0] ? 0 : 1;
		const FVector2D Delta = Now[Finger] - TouchWas[Finger];
		AddYawInput(Delta.X * TouchTurnRate);
		AddPitchInput(-Delta.Y * TouchTurnRate);
	}

	for (int32 Finger = 0; Finger < 2; ++Finger)
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
