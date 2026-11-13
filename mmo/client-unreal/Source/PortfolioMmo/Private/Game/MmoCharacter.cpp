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

	// 메시의 발을 캡슐의 바닥(지면)에 맞춘다.
	GetMesh()->SetRelativeLocation(FVector(0.0, 0.0, -90.0));
	GetMesh()->SetCollisionEnabled(ECollisionEnabled::NoCollision);

	CameraArm = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraArm"));
	CameraArm->SetupAttachment(GetCapsuleComponent());
	CameraArm->TargetArmLength = 800.0f;
	CameraArm->bUsePawnControlRotation = true;
	CameraArm->bDoCollisionTest = false;

	Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Camera"));
	Camera->SetupAttachment(CameraArm, USpringArmComponent::SocketName);

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
