#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"

#include "MmoCharacter.generated.h"

class UCameraComponent;
class USpringArmComponent;

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

	/** 카메라를 당기거나 민다. 양수가 가까이다. */
	void Zoom(float Amount);

	/** 서버가 정한 자리로 순간 이동한다(PositionReset). Location은 지면의 자리다. */
	void Teleport(const FVector& Location);

protected:
	virtual void BeginPlay() override;

private:
	UPROPERTY(VisibleAnywhere)
	TObjectPtr<USpringArmComponent> CameraArm;

	UPROPERTY(VisibleAnywhere)
	TObjectPtr<UCameraComponent> Camera;
};
