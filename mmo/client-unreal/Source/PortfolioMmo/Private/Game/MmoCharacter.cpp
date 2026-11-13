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
	// 카메라가 놓일 자리를 프레임마다 본다(Tick).
	PrimaryActorTick.bCanEverTick = true;
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
	// 스프링 암의 충돌은 캐릭터에서 카메라까지의 선을 보아, 건물이 캐릭터를 가리기만 해도 카메라를 당긴다. 설계는 가려지는 것은 그대로 두고
	// 카메라가 건물이나 산 안에 들어가지 않게만 하므로, 카메라가 놓일 자리만 Tick에서 본다.
	CameraArm->bDoCollisionTest = false;
	WantedArmLength = DefaultArmLength;

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
	WantedArmLength = FMath::Clamp(WantedArmLength - Amount, MinArmLength, MaxArmLength);
}

void AMmoCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// 카메라가 놓일 자리(반지름 0.3 m)가 카메라를 막는 것(건물과 테두리의 산의 상자. ECC_Camera) 안이면 밖으로 나올 때까지 0.5 m씩 당긴다.
	// 나무·바위·울타리와 캐릭터는 카메라를 막지 않는다.
	const AController* Owner = GetController();
	if (!Owner)
	{
		return;
	}
	const FVector Pivot = CameraArm->GetComponentLocation();
	const FVector Back = -Owner->GetControlRotation().Vector();
	const FCollisionShape Probe = FCollisionShape::MakeSphere(30.0f);
	float Length = WantedArmLength;
	while (Length > 0.0f && GetWorld()->OverlapBlockingTestByChannel(Pivot + Back * Length, FQuat::Identity, ECC_Camera, Probe))
	{
		Length -= 50.0f;
	}
	CameraArm->TargetArmLength = FMath::Max(Length, 0.0f);
}

void AMmoCharacter::Teleport(const FVector& Location)
{
	GetCharacterMovement()->StopMovementImmediately();
	SetActorLocation(Location + FVector(0.0, 0.0, GetCapsuleComponent()->GetScaledCapsuleHalfHeight()), false, nullptr, ETeleportType::TeleportPhysics);
}
