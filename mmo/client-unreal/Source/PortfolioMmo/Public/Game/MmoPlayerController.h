#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "Protocol/MmoPackets.h"
#include "World/MoveSender.h"
#include "World/PathFinder.h"

#include <optional>
#include <vector>

#include "MmoPlayerController.generated.h"

class UInputAction;
class UInputMappingContext;
struct FInputActionValue;

/**
 * 내 캐릭터의 조작과 Move 보내기. 이동(WASD, 게임패드, 가상 조이스틱), 눌러서 이동(PC에서 땅을 왼쪽 클릭하면 길을 찾아 걸음),
 * 카메라(마우스 오른쪽 끌기와 휠, 터치 끌기와 두 손가락 벌리기), 뒤로 가기(Esc, Android 뒤로 버튼. 화면 관리자에 넘김)를 받고,
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

	/**
	 * 손 조작(WASD, 게임패드, 조이스틱, 땅 누르기)을 막거나 푼다. 창이 열린 동안 화면 관리자가 부른다. 이미 따라가던 경로는 이어 걷는다
	 * (SetIgnoreMoveInput은 경로의 이동 입력까지 막으므로 쓰지 않는다).
	 */
	void SetManualMoveBlocked(bool bBlocked) { bManualMoveBlocked = bBlocked; }

	/** 땅의 자리(월드, 높이는 버림)까지 길을 찾아 걷기 시작한다. 길이 없으면 걷지 않고 false다. 걷던 경로는 바꾼다. */
	bool WalkTo(const FVector& Ground);

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
	/** 왼쪽 클릭: 커서 아래의 땅까지 걷는다(터치 기기와 -faketouches에서는 하지 않음). */
	void HandleClick();
	/** 경로를 따라가는 중이면 다음 점 쪽을 이번 프레임의 이동 입력으로 넣는다. */
	void FollowPath();
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

	UPROPERTY()
	TObjectPtr<UInputAction> ClickAction;

	MmoWorld::FMoveSender MoveSender;
	/** 세션의 필드로 처음 걸을 때 만든다(버퍼가 필드 크기라 한 번만). */
	std::optional<MmoWorld::FPathFinder> PathFinder;
	MmoWorld::FPathFollower PathFollower;
	std::vector<MmoWorld::FPoint> Path;
	bool bManualMoveBlocked = false;
	/** 지난 프레임의 첫째·둘째 손가락. */
	FVector2D TouchWas[2];
	bool bTouchWasDown[2] = { false, false };
	FDelegateHandle PacketHandle;
};
