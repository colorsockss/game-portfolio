#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "Protocol/MmoPackets.h"
#include "World/MoveSender.h"
#include "Screen/TouchOwners.h"
#include "World/PathFinder.h"

#include <optional>
#include <vector>

#include "MmoPlayerController.generated.h"

class UInputAction;
class UInputMappingContext;
class UMmoSession;
struct FInputActionValue;

/**
 * 내 캐릭터의 조작과 Move 보내기. 이동(WASD, 게임패드, 가상 조이스틱), 눌러서 이동(PC에서 땅을 왼쪽 클릭하면 길을 찾아 걸음),
 * 대상과 공격(개체를 누르면 대상, 대상인 몬스터를 다시 누르거나 F면 공격하러 감, Tab은 가장 가까운 적. 다가가서 사거리 안이고 선이 트인
 * 곳에 서면 AttackStart를 보냄), 스킬(퀵슬롯의 1–8 키와 HUD의 칸. 대상에게 쓰는 스킬은 같은 방법으로 다가가서 UseSkill을 보냄),
 * 내게 걸린 감속(최대 속도를 줄임)과 기절(이동과 행동의 입력을 막음),
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

	/** 공격 키(F)와 HUD의 공격 버튼: 대상이 없으면 가장 가까운 적을 대상으로 잡고, 대상에게 공격하러 간다. */
	void AttackOrTargetNearest();

	/** Tab과 HUD의 대상 고르기 버튼: 가장 가까운 적(몬스터만)을 대상으로 잡는다. */
	void TargetNearest();

	/** 퀵슬롯의 칸(0부터)의 스킬을 누른다(1–8 키와 HUD의 칸). 쓸 수 없으면(쿨다운, 마나, 대상 없음 등) 아무것도 보내지 않는다. */
	void UseQuickslot(int32 Index);

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

	/** 대상을 고른다(0이면 푼다). 공격 중에 바뀌면 AttackStop을 보낸다. 공격하러 가던 것은 그만둔다. */
	void SelectTarget(uint32 Id);

	/** 대상에게 공격하러 간다(UpdateEngagement가 이어 감). */
	void Engage();

	/**
	 * 공격하러 가는 중이면: 지금 자리에서 칠 수 있으면(사거리 안, 선이 트임, 몬스터면 안전 지대 밖) 서서 밀린 위치를 보내고 AttackStart를 보낸다.
	 * 아니면 대상까지 길을 찾아 걷는다(대상이 1 m 넘게 옮기면 다시 찾음). 공격 중에 대상이 사거리 밖으로 나가면 같은 방법으로 다시 다가간다.
	 */
	void UpdateEngagement();

	/**
	 * 누른 스킬이 있으면: 보낼 수 있으면 보내고(시전이면 세우고 밀린 위치를 먼저 보냄), 아니면 대상까지 길을 찾아 걷는다(UpdateEngagement처럼).
	 * 누른 스킬이 있는 동안은 공격하러 가기를 쉰다.
	 */
	void UpdateSkillUse();

	/** 내가 기절해 있다(이동과 행동의 입력을 막음). */
	bool IsStunned() const;

	UMmoSession& Session() const;
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
	UPROPERTY()
	TObjectPtr<UInputAction> AttackAction;
	UPROPERTY()
	TObjectPtr<UInputAction> TargetAction;
	/** 퀵슬롯 칸마다의 키(1–8). */
	UPROPERTY()
	TArray<TObjectPtr<UInputAction>> SlotActions;

	MmoWorld::FMoveSender MoveSender;
	/** 세션의 필드로 처음 걸을 때 만든다(버퍼가 필드 크기라 한 번만). */
	std::optional<MmoWorld::FPathFinder> PathFinder;
	MmoWorld::FPathFollower PathFollower;
	std::vector<MmoWorld::FPoint> Path;
	bool bManualMoveBlocked = false;
	/** 대상에게 공격하러 가는 중(손 이동 입력, 대상 바꿈, 대상이 풀림으로 끝남). */
	bool bEngaged = false;
	/** 공격하러 가는 길을 찾은 때의 대상 자리. 스킬을 쓰러 갈 때도 쓴다. */
	MmoWorld::FPoint EngagedGoal;
	/** 이번 프레임에 손 이동 입력이 있었다(시전 때 쥐고 있던 입력을 놓았는지 보는 데 씀). */
	bool bMoveInput = false;
	/** 지난 프레임의 손가락마다의 자리와 눌림. */
	FVector2D TouchWas[MmoScreen::FTouchOwners::MaxFingers];
	bool bTouchWasDown[MmoScreen::FTouchOwners::MaxFingers] = {};
	FDelegateHandle PacketHandle;
};
