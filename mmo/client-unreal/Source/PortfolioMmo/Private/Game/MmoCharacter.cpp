#include "Game/MmoCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Game/MmoEntityActor.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "World/Units.h"

namespace
{
	constexpr float MinArmLength = 300.0f;
	constexpr float MaxArmLength = 1500.0f;
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

	// 몸통의 아래쪽을 캡슐의 바닥(지면)에 맞춘다.
	USceneComponent* Feet = CreateDefaultSubobject<USceneComponent>(TEXT("Feet"));
	Feet->SetupAttachment(GetCapsuleComponent());
	Feet->SetRelativeLocation(FVector(0.0, 0.0, -90.0));
	AMmoEntityActor::AddPlaceholderBody(*this, *Feet);

	CameraArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraArm"));
	CameraArm->SetupAttachment(GetCapsuleComponent());
	CameraArm->TargetArmLength = 800.0f;
	CameraArm->bUsePawnControlRotation = true;
	CameraArm->bDoCollisionTest = false;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(CameraArm, USpringArmComponent::SocketName);
}

void AMmoCharacter::BeginPlay()
{
	Super::BeginPlay();
	AMmoEntityActor::TintPlaceholderBody(*this, FLinearColor(0.15f, 0.45f, 0.95f));
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
