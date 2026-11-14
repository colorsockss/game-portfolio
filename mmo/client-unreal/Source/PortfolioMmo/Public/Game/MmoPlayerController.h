#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "Protocol/MmoPackets.h"
#include "World/MoveSender.h"
#include "Screen/TouchGestures.h"
#include "Screen/TouchOwners.h"
#include "World/Interaction.h"
#include "World/PathFinder.h"

#include <optional>
#include <vector>

#include "MmoPlayerController.generated.h"

class ACameraActor;
class UInputAction;
class UInputMappingContext;
class UMmoSession;
struct FInputActionValue;

/**
 * 내 캐릭터의 조작과 Move 보내기. 이동(WASD, 게임패드, 가상 조이스틱), 눌러서 이동(PC에서 땅을 왼쪽 클릭하면 길을 찾아 걸음),
 * 대상과 공격(개체를 누르면 대상, 대상인 몬스터를 다시 누르거나 F면 공격하러 감, Tab은 가장 가까운 적. 다가가서 사거리 안이고 선이 트인
 * 곳에 서면 AttackStart를 보냄), 스킬(퀵슬롯의 1–8 키와 HUD의 칸. 대상에게 쓰는 스킬은 같은 방법으로 다가가서 UseSkill을 보냄),
 * 내게 걸린 감속(최대 속도를 줄임)과 기절(이동과 행동의 입력을 막음),
 * 카메라(마우스 오른쪽 끌기와 휠, 터치 끌기와 두 손가락 벌리기), 터치의 탭(PC의 왼쪽 클릭과 같은 누르기. 빈 땅은 대상을 풂),
 * 상호작용(E와 HUD의 버튼. 10 m 안의 가장 가까운 것까지 걸어가 함), 뒤로 가기(Esc, Android 뒤로 버튼. 화면 관리자에 넘김)를 받고,
 * 프레임마다 캐릭터의 자리를 FMoveSender에 넘겨 보낼 때가 되면 Move를 보낸다. PositionReset이 오면 그 자리로 옮긴다.
 * 입력 액션과 매핑은 에셋 없이 키 표(MmoKeys)로 여기서 만든다. 글 상자에 초점이 있는 동안은 키보드 입력을 버린다.
 * 개발 빌드에서는 시연 영상(69)을 찍는 UI 숨기기와 자유 카메라(키 표의 HideUi, FreeCamera)도 받는다.
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

	/** 상호작용 키(E)와 HUD의 상호작용 버튼: 10 m 안의 가장 가까운 상호작용할 수 있는 것까지 걸어가 그 종류의 일을 한다. 없으면 아무것도 하지 않는다. */
	void Interact();

	/** 내 자리에서 상호작용 버튼이 고를 후보(HUD가 글을 바꾸는 데 씀). */
	std::optional<MmoWorld::FInteractTarget> InteractCandidate() const;

	/** 키보드 입력은 글 상자에 초점이 있는 동안 버린다(이동과 단축키가 글 입력과 겹치지 않게). */
	virtual bool InputKey(const FInputKeyEventArgs& Params) override;

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
	/** 왼쪽 클릭: 커서 아래를 누른다(터치 기기와 -faketouches에서는 탭이 같은 일을 함). */
	void HandleClick();

	/**
	 * 화면의 자리(뷰포트 픽셀)를 누른다: 상호작용할 수 있는 개체면 걸어가 상호작용하고, 다른 개체면 대상(이미 대상인 몬스터면 공격하러 감)이다.
	 * 빈 곳이면 bWalk일 때(PC) 그 땅까지 걷고, 아니면(터치) 대상을 푼다.
	 */
	void PressAt(const FVector2D& ScreenPosition, bool bWalk);

	/** 상호작용하러 가는 중이면: 실행 거리 안이고 선이 트였으면 그 일을 하고, 아니면 길을 찾아 걷는다(UpdateEngagement처럼). */
	void UpdateInteraction();

	/** 상호작용의 일(줍기 33, 채집 47, 말하기 37이 넣음). 지금은 로그만 남긴다. */
	void Act(const MmoWorld::FInteractTarget& Target);

	/** 개발 빌드: UI의 층을 모두 감추거나 다시 보인다. */
	void ToggleHideUi();

	/**
	 * 개발 빌드: 자유 카메라. 지금 카메라의 자리에 카메라 액터를 두고 보는 쪽을 그것으로 바꾼다. 켠 동안 이동 입력은 카메라를 옮기고
	 * (캐릭터는 서 있음), 마우스 오른쪽 끌기는 카메라를 돌리고, 휠은 앞뒤로 옮긴다. 끄면 캐릭터의 카메라로 돌아온다.
	 */
	void ToggleFreeCamera();

	/** 개발 빌드: 개발용 표시를 그린다(켠 동안 프레임마다). 다른 개체의 서버 위치(빨강)와 그린 위치(초록), 내 길찾기 경로(노랑), 둘레 8 m의 막힌 칸, 넣은 지연. */
	void DrawDevOverlay();
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
	/** 터치: 한 손가락으로 끌면 카메라를 돌리고, 짧게 누르면(탭) 그 자리를 누르며, 두 손가락을 벌리면 당긴다. */
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
	UPROPERTY()
	TObjectPtr<UInputAction> InteractAction;
	UPROPERTY()
	TObjectPtr<UInputAction> HideUiAction;

	/** 캐릭터 창(31). */
	UPROPERTY()
	TObjectPtr<UInputAction> CharacterAction;

	/** 인벤토리 창(32). */
	UPROPERTY()
	TObjectPtr<UInputAction> BagAction;

	/** 스킬 창(36). */
	UPROPERTY()
	TObjectPtr<UInputAction> SkillsAction;
	UPROPERTY()
	TObjectPtr<UInputAction> FreeCameraAction;
	UPROPERTY()
	TObjectPtr<UInputAction> DevOverlayAction;
	bool bDevOverlay = false;

	/** 자유 카메라를 켠 동안의 카메라 액터. 꺼져 있으면 nullptr. */
	UPROPERTY()
	TObjectPtr<ACameraActor> FreeCamera;
	/** 퀵슬롯 칸마다의 키(1–8). */
	UPROPERTY()
	TArray<TObjectPtr<UInputAction>> SlotActions;

	MmoWorld::FMoveSender MoveSender;
	/** 세션의 필드로 처음 걸을 때 만든다(버퍼가 필드 크기라 한 번만). */
	std::optional<MmoWorld::FPathFinder> PathFinder;
	MmoWorld::FPathFollower PathFollower;
	MmoWorld::FInteraction Interaction;
	/** 상호작용하러 가는 길을 찾은 때의 개체 자리. */
	MmoWorld::FPoint InteractGoal;
	MmoScreen::FTouchGestures Gestures;
	/** 손가락마다 카메라의 것이었는지(뗄 때 탭인지 보려고. 주인은 뗄 때 이미 놓임). */
	bool bCameraFinger[MmoScreen::FTouchOwners::MaxFingers] = {};
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
