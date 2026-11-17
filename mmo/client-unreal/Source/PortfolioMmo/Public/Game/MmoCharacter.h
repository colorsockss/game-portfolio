#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"

#include "MmoCharacter.generated.h"

class UCameraComponent;
class USpringArmComponent;
class UStaticMeshComponent;

/**
 * 내 캐릭터. UMmoEntitySubsystem이 내 개체가 들어오면 만들어 플레이어 컨트롤러에 붙이고, 나가면(끊김) 지운다.
 * 이동 컴포넌트가 걷기를 맡고, 위치는 AMmoPlayerController가 Move로 보낸다. 카메라는 컨트롤러의 회전을 따른다.
 */
UCLASS()
class AMmoCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AMmoCharacter();

	virtual void Tick(float DeltaSeconds) override;

	/** 카메라를 당기거나 민다. 양수가 가까이다. */
	void Zoom(float Amount);

	/** 서버가 정한 자리로 순간 이동한다(PositionReset). Location은 지면의 자리다. */
	void Teleport(const FVector& Location);

	/** 카메라를 흔든다(내가 맞음은 기본 세기, 큰 스킬의 착지는 연출 표의 세기. 105). 콘솔 변수 Mmo.CameraShake가 0이면 흔들지 않는다. */
	void Shake(float Strength = 12.0f);

	UStaticMeshComponent& PlaceholderMesh() const { return *Placeholder; }

private:
	/** 카메라와 나 사이에서 카메라를 막는 맵의 것(건물, 테두리의 산)을 반투명하게 하고, 벗어나면 되돌린다(97). */
	void FadeOccluders(float DeltaSeconds);

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USpringArmComponent> CameraArm;

	/** 반투명하게 한 맵의 것의 메시 → 지금의 사라진 정도. 0으로 돌아오면 뺀다. */
	TMap<TWeakObjectPtr<UStaticMeshComponent>, float> Occluders;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> Camera;

	/** 고른 카메라 거리(휠과 두 손가락). 카메라가 놓일 자리가 막는 것 안이면 그보다 당긴다. */
	float WantedArmLength = 0.0f;

	/** 흔들림이 끝나는 때(초, FPlatformTime)와 그 세기(cm). */
	double ShakeUntil = 0.0;
	float ShakeStrength = 0.0f;

	/** 모습을 불러오는 동안 보이는 단순한 메시. */
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UStaticMeshComponent> Placeholder;
};
