#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "Protocol/MmoPackets.h"
#include "World/MoveSender.h"

#include "MmoPlayerController.generated.h"

class UInputAction;
class UInputMappingContext;
struct FInputActionValue;

/**
 * 내 캐릭터의 조작과 Move 보내기. 이동(WASD, 게임패드, 가상 조이스틱), 카메라(마우스 오른쪽 끌기와 휠, 터치 끌기와 두 손가락 벌리기),
 * 뒤로 가기(Esc, Android 뒤로 버튼. 화면 관리자에 넘김)를 받고,
 * 프레임마다 캐릭터의 자리를 FMoveSender에 넘겨 보낼 때가 되면 Move를 보낸다. PositionReset이 오면 그 자리로 옮긴다.
 * 입력 액션과 매핑은 에셋 없이 여기서 만든다.
 */
UCLASS()
class AMmoPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AMmoPlayerController();

	virtual void PlayerTick(float DeltaTime) override;

	/** 가상 조이스틱의 값(오른쪽, 앞)을 이번 프레임의 이동 입력으로 넣는다. */
	void InjectMove(const FVector2D& Axis);

protected:
	virtual void SetupInputComponent() override;
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void OnPossess(APawn* InPawn) override;

private:
	void HandleMove(const FInputActionValue& Value);
	void HandleLook(const FInputActionValue& Value);
	void HandleZoom(const FInputActionValue& Value);
	void HandleBack();
	/** 터치: 한 손가락으로 끌면 카메라를 돌리고, 두 손가락을 벌리면 당긴다. */
	void UpdateTouchCamera();
	void HandlePacket(const portfolio::mmo::Packet& Packet);

	UPROPERTY()
	TObjectPtr<UInputMappingContext> Mapping;

	UPROPERTY()
	TObjectPtr<UInputAction> MoveAction;

	UPROPERTY()
	TObjectPtr<UInputAction> LookAction;

	UPROPERTY()
	TObjectPtr<UInputAction> ZoomAction;

	UPROPERTY()
	TObjectPtr<UInputAction> BackAction;

	MmoWorld::FMoveSender MoveSender;
	/** 지난 프레임의 첫째·둘째 손가락. */
	FVector2D TouchWas[2];
	bool bTouchWasDown[2] = { false, false };
	FDelegateHandle PacketHandle;
};
