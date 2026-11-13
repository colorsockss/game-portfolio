#include "Game/MmoCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Game/MmoCharacterLook.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "World/Units.h"

namespace
{
	// 내려다보는 쿼터뷰(ROM 같은 리니지라이크)의 거리. 처음에는 캐릭터가 화면 높이의 11%쯤이다.
	constexpr float DefaultArmLength = 2400.0f;
	constexpr float MinArmLength = 1300.0f;
	constexpr float MaxArmLength = 3600.0f;
	/** 좁은 화각으로 원근 왜곡을 줄여 내려다보는 느낌을 낸다(엔진 기본은 90°). */
	constexpr float FieldOfView = 45.0f;
}

AMmoCharacter::AMmoCharacter()
{
	PrimaryActorTick.bCanEverTick = false;
	GetCapsuleComponent()->InitCapsuleSize(34.0f, 90.0f);

	// 서버의 이동 검증(속도 예산은 이 속도의 1.1배)과 같은 최대 속도로 걷는다.
	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->MaxWalkSpeed = MmoWorld::Units::MaxSpeedMetersPerSecond * 100.0;
	Movement->bOrientRotationToMovement = true;
	Movement->RotationRate = FRotator(0.0, 720.0, 0.0);
	bUseControllerRotationYaw = false;

	// 메시의 발을 캡슐의 바닥(지면)에 맞춘다.
	MmoCharacterLook::SetUpBody(*GetMesh(), FVector(0.0, 0.0, -90.0));

	CameraArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraArm"));
	CameraArm->SetupAttachment(GetCapsuleComponent());
	CameraArm->TargetArmLength = DefaultArmLength;
	CameraArm->bUsePawnControlRotation = true;
	// 건물과 테두리의 산(카메라를 막는 맵 액터의 상자)만 카메라를 막고, 나무·바위·울타리와 캐릭터는 막지 않는다.
	CameraArm->bDoCollisionTest = true;
	CameraArm->ProbeChannel = ECC_Camera;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(CameraArm, USpringArmComponent::SocketName);
	Camera->SetFieldOfView(FieldOfView);

	// 캡슐의 가운데가 원기둥의 가운데다.
	Placeholder = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Placeholder"));
	Placeholder->SetupAttachment(GetCapsuleComponent());
	MmoCharacterLook::SetUpPlaceholder(*Placeholder, FVector::ZeroVector);
}

void AMmoCharacter::Zoom(float Amount)
{
	CameraArm->TargetArmLength = FMath::Clamp(CameraArm->TargetArmLength - Amount, MinArmLength, MaxArmLength);
}

void AMmoCharacter::Teleport(const FVector& Location)
{
	GetCharacterMovement()->StopMovementImmediately();
	SetActorLocation(Location + FVector(0.0, 0.0, GetCapsuleComponent()->GetScaledCapsuleHalfHeight()), false, nullptr, ETeleportType::TeleportPhysics);
}
