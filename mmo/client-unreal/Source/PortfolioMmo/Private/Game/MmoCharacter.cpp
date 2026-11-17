#include "Game/MmoCharacter.h"

#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Game/MmoCharacterLook.h"
#include "Game/MmoMapObject.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "HAL/IConsoleManager.h"
#include "HAL/PlatformTime.h"
#include "World/Units.h"

namespace
{
	// 리니지(2D)처럼 보이는 고정 시점(97): 대각선에서 낮게 내려다보고 화각을 좁혀 원근을 줄인다. 40 m에서 화면 가로가 약 14 m다.
	constexpr float DefaultArmLength = 4000.0f;
	constexpr float MinArmLength = 2800.0f;
	constexpr float MaxArmLength = 5600.0f;
	/** 좁은 화각으로 원근을 줄여 2D 아이소메트릭에 가깝게 한다(엔진 기본은 90°). */
	constexpr float FieldOfView = 20.0f;

	/** 나를 가리는 맵의 것의 사라진 정도(0 다 보임 ~ 1 안 보임. 97). 디더라 남은 픽셀 사이로 내가 보인다. */
	constexpr float OccluderFade = 0.6f;
	/** 가리는 것을 찾는 구의 반지름(언리얼 단위). 몸의 가운데에서 몸통만큼. */
	constexpr float OccluderProbeRadius = 40.0f;
	/** 한 프레임에 찾는 가리는 것의 수. 카메라를 막는 것은 드물게 놓여 이만큼 겹치지 않는다. */
	constexpr int32 MaxOccluders = 4;
}

AMmoCharacter::AMmoCharacter()
{
	// 카메라가 놓일 자리를 프레임마다 본다(Tick).
	PrimaryActorTick.bCanEverTick = true;
	GetCapsuleComponent()->InitCapsuleSize(34.0f, 90.0f);

	// 서버의 이동 검증(속도 예산은 이 속도의 1.1배)과 같은 최대 속도로 걷는다. 출발과 멈춤은 한 프레임이다: 서버가 보는 쪽에 알리는 빠르기가
	// 최대 속도에 감속을 곱한 값이라(54), 가속하는 동안이 있으면 다른 클라이언트가 그 빠르기로 앞질러 그린다.
	UCharacterMovementComponent* Movement = GetCharacterMovement();
	Movement->MaxWalkSpeed = MmoWorld::Units::MaxSpeedMetersPerSecond * 100.0;
	Movement->MaxAcceleration = 1.0e6;
	Movement->BrakingDecelerationWalking = 1.0e6;
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

namespace
{
	/** 카메라 흔들림을 켜고 끄는 한 곳(처음 값은 켬). 설정 창의 줄과 기기에 남기는 것은 77이 이 값에 잇는다. */
	TAutoConsoleVariable<bool> CVarCameraShake(TEXT("Mmo.CameraShake"), true, TEXT("Shake the camera a little when my character is hit."));

	/** 흔들림의 길이(초)와 세기(언리얼 단위, 카메라 거리 13–36 m에서 약하게 보이는 값). */
	constexpr double ShakeSeconds = 0.2;
	constexpr double ShakeStrength = 12.0;
}

void AMmoCharacter::Shake()
{
	if (CVarCameraShake.GetValueOnGameThread())
	{
		ShakeUntil = FPlatformTime::Seconds() + ShakeSeconds;
	}
}

void AMmoCharacter::Zoom(float Amount)
{
	WantedArmLength = FMath::Clamp(WantedArmLength - Amount, MinArmLength, MaxArmLength);
}

void AMmoCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);

	// 흔들림: 남은 시간만큼 줄어드는 무작위 자리로 카메라 팔의 끝을 옮긴다.
	const double ShakeLeft = ShakeUntil - FPlatformTime::Seconds();
	CameraArm->SocketOffset = ShakeLeft > 0.0 ? FMath::VRand() * ShakeStrength * (ShakeLeft / ShakeSeconds) : FVector::ZeroVector;

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

	FadeOccluders(DeltaSeconds);
}

void AMmoCharacter::FadeOccluders(float DeltaSeconds)
{
	// 카메라에서 몸의 가운데까지 카메라를 막는 상자(건물과 테두리의 산만 ECC_Camera를 막음)를 찾는다. 막는 채널은 첫 것에서 멈추므로 찾은 것을 빼고 다시 본다.
	TSet<UStaticMeshComponent*> Hiding;
	FCollisionQueryParams Params(SCENE_QUERY_STAT(MmoOccluders), false, this);
	const FCollisionShape Probe = FCollisionShape::MakeSphere(OccluderProbeRadius);
	FHitResult Hit;
	for (int32 Index = 0; Index < MaxOccluders && GetWorld()->SweepSingleByChannel(Hit, Camera->GetComponentLocation(), GetActorLocation(), FQuat::Identity, ECC_Camera, Probe, Params); ++Index)
	{
		AActor* Actor = Hit.GetActor();
		if (!Actor)
		{
			break;
		}
		if (const AMmoMapObject* Object = Cast<AMmoMapObject>(Actor))
		{
			Hiding.Add(&Object->Mesh());
		}
		Params.AddIgnoredActor(Actor);
	}

	for (UStaticMeshComponent* Mesh : Hiding)
	{
		Occluders.FindOrAdd(Mesh, 0.0f);
	}
	for (auto It = Occluders.CreateIterator(); It; ++It)
	{
		UStaticMeshComponent* Mesh = It.Key().Get();
		if (!Mesh)
		{
			It.RemoveCurrent();
			continue;
		}
		const float Target = Hiding.Contains(Mesh) ? OccluderFade : 0.0f;
		const float Next = FMath::FInterpConstantTo(It.Value(), Target, DeltaSeconds, 1.0f / MmoCharacterLook::FadeSeconds);
		if (Next != It.Value())
		{
			// M_EntityProp의 사라진 정도(import_props.py가 카메라를 막는 맵의 것을 이 머티리얼로 가져옴).
			Mesh->SetCustomPrimitiveDataFloat(MmoCharacterLook::PlaceholderFadeIndex, Next);
			It.Value() = Next;
		}
		if (Next == 0.0f)
		{
			It.RemoveCurrent();
		}
	}
}

void AMmoCharacter::Teleport(const FVector& Location)
{
	GetCharacterMovement()->StopMovementImmediately();
	SetActorLocation(Location + FVector(0.0, 0.0, GetCapsuleComponent()->GetScaledCapsuleHalfHeight()), false, nullptr, ETeleportType::TeleportPhysics);
}
