#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoHudWidget.generated.h"

class UTexture2D;

class UBorder;

class UCanvasPanel;

class UImage;

class UButton;

class UMmoButtonWidget;
class UMmoChatWidget;
class UMmoIcons;
class UMmoJoystickWidget;
class UProgressBar;
class UTextBlock;

namespace MmoWorld
{
	struct FGrowthEvent;
}

/**
 * 게임 중의 HUD(WBP_Hud의 기반). 내 체력·마나 바(지금/최대), 걸린 효과와 전투 상태의 글자 아이콘과 남은 시간, 내 대상의 정보(이름과 레벨,
 * 체력 바), 퀵슬롯(쿨다운 가림, PC는 키 표의 키 표시)과 내 진행 바(시전), 터치 기기의 가상 조이스틱과 공격·대상 고르기·상호작용 버튼,
 * 메뉴 버튼(가방, 캐릭터, 스킬, 퀘스트, 설정. 설정 말고는 그 창을 만드는 항목 32, 31, 36, 50이 잇기 전까지 누를 수 없음),
 * 내 캐릭터가 있는 구역(이름, 권장 레벨, 안전 지대), 채팅창(41), 파티원 칸과 파티 버튼(42)을 보인다. 경험치 바(31) 등은 그 항목이 더한다.
 */
UCLASS(Abstract)
class UMmoHudWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 퀵슬롯의 칸 수(packets.proto의 CONSTANT_QUICKSLOT_COUNT). 위젯 생성기가 칸을 이만큼 만든다. */
	static PORTFOLIOMMO_API int32 QuickslotCount();

	/** 파티원 칸의 수(나를 뺀 최대 인원). 위젯 생성기가 칸을 이만큼 만든다. */
	static PORTFOLIOMMO_API int32 PartySlotCount();

	/** 미니맵 그림의 한 변(픽셀)과 보이는 둘레(m). */
	static constexpr float MinimapSize = 180.0f;
	static constexpr double MinimapMeters = 60.0;

	/** 채팅창(41). PC의 Enter가 화면 관리자를 거쳐 초점을 준다. */
	UMmoChatWidget* Chat() const { return ChatBox; }

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeDestruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	/** 구역이 바뀌었을 때만 글을 고친다. */
	void ShowZone(uint32 Zone);

	/** 대상의 정보를 보이거나(대상이 있으면) 감춘다. */
	void ShowTarget();

	/** 퀵슬롯의 스킬(직업이 바뀌면 이름과 키 표시)과 쿨다운 가림을 보인다. */
	void ShowSlots(double ServerTick);

	/** 내 진행 바를 보이거나(진행 중이면) 감춘다. */
	void ShowProgress(double NowSeconds);

	/** 걸린 효과와 전투 상태를 글자 아이콘과 남은 시간(초)으로 보인다. */
	void ShowEffects(double ServerTick);

	/** 퀵슬롯 칸을 눌렀다(PC의 1–8 키와 같은 일). */
	void UseSlot(int32 Index);

	/** 상호작용 버튼: 후보의 종류에 따라 글을 바꾸고, 후보가 없으면 누를 수 없게 한다. */
	void ShowInteract();

	/** 시연 표시: 켰으면 오른쪽 위에 프레임, 보이는 캐릭터 수(시야 안의 다른 플레이어), 지연을 0.5초마다 보인다. */
	void ShowStats(float DeltaTime);

	UFUNCTION()
	void HandleInteractClicked();

	UFUNCTION()
	void HandleSettingsClicked();

	UFUNCTION()
	void HandleAttackClicked();

	UFUNCTION()
	void HandleTargetClicked();

	/** 파티원 칸 하나를 눌렀다. */
	void TargetPartyMember(int32 Index);

	/** 바 하나에 지금 값과 최대값을 보인다. 값이 바뀌었을 때만 고친다. */
	static void ShowBar(UProgressBar& Bar, UTextBlock& Text, uint32 Value, uint32 Max, uint64& Shown);

	/** 경험치 바(31). */
	void ShowExp();

	/** 얻은 경험치와 내 레벨 업을 알림 층에 띄운다(31). */
	void HandleGrowthEvent(const MmoWorld::FGrowthEvent& Event);

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoJoystickWidget> Joystick;

	/** 구역의 이름과 권장 레벨. 구역 0이면 비운다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ZoneText;

	/** 안전 지대 안에서만 보인다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> SafeZoneText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> HpBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> HpText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> MpBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> MpText;

	/** 다음 레벨까지의 경험치(31). 글은 비율(최대 레벨이면 MAX). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> ExpBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ExpText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> TargetPanel;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> TargetNameText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> TargetHpBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> TargetHpText;

	/** 대상이 다른 플레이어면 보이는 귓속말 버튼(41). 누르면 채팅창을 그 이름의 귓속말로 연다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> WhisperButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoChatWidget> ChatBox;

	/** 대상이 다른 플레이어이고 내가 초대할 수 있으면(파티가 없거나 파티장, 그 플레이어가 내 파티원이 아님) 보이는 파티 초대 버튼(42). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> PartyInviteButton;

	/** 파티 창을 여는 버튼(42). 파티가 없어도 보인다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> PartyButton;

	/** 파티원 칸(이름 PartyMember<n>Box, 버튼 PartyMember<n>, 체력 바 PartyMember<n>HpBar로 찾음). 나를 뺀 파티원을 들어온 차례로 보이고,
	 * 버튼(라벨이 이름)을 누르면 그 파티원이 시야 안일 때만 대상이 된다. */
	UPROPERTY()
	TArray<TObjectPtr<UWidget>> PartySlots;

	UPROPERTY()
	TArray<TObjectPtr<UMmoButtonWidget>> PartyNames;

	UPROPERTY()
	TArray<TObjectPtr<UProgressBar>> PartyHpBars;

	/** 칸마다 보인 파티원의 개체 번호. */
	TArray<uint32> PartyShown;
	uint64 ShownParty = MAX_uint64;

	/** 파티가 바뀌었으면 파티원 칸을 다시 채운다. */
	void ShowParty();

	/** 시야 안의 보스가 있으면 보스 체력 바를 보인다(43). */
	void ShowBoss();

	/** 보스 체력 바(위 가운데, 대상 정보 아래. 43). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> BossPanel;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> BossNameText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> BossHpBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> BossHpText;

	uint32 ShownBoss = MAX_uint32;
	uint64 ShownBossHp = MAX_uint64;

	/** 미니맵(76): 내 자리를 가운데에 둔 둘레 60 m. 북쪽이 위로 고정이고 내 방향은 화살표가 돈다. 누르면 전체 지도를 연다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UButton> MinimapButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UImage> MinimapImage;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UCanvasPanel> MinimapDots;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> MinimapArrow;

	UPROPERTY()
	TObjectPtr<UTexture2D> MinimapTexture;

	UPROPERTY()
	TArray<TObjectPtr<UBorder>> MinimapDotPool;

	double NextMinimap = 0;

	UFUNCTION()
	void HandleMinimapClicked();

	/** 미니맵을 0.2초마다 옮긴다. */
	void ShowMinimap(double Now);


	/** 자동 사냥(40). PC와 터치 기기 모두 보이고 켜져 있으면 고른 상태다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> AutoButton;

	/** 터치 기기에서만 보이는 버튼(공용 버튼의 bTouchOnly). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> AttackButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> TargetButton;

	/** 강제 공격을 켜고 끈다(44). 켜져 있으면 고른 상태다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> ForceButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> InteractButton;

	/** 메뉴 버튼(PC와 터치 기기 모두 보임). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> BagButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CharacterButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> SkillsButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> QuestButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> SettingsButton;

	/** 시연 표시의 글(설정 창의 줄로 켬). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> StatsText;

	/** 시연 표시: 프레임을 고르게 보이려고 모은 시간과 프레임 수, 다음에 고칠 때까지 남은 시간. */
	float StatsSeconds = 0.0f;
	int32 StatsFrames = 0;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> EffectsText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UWidget> CastPanel;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UProgressBar> CastBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> CastText;

	/** 퀵슬롯 칸의 버튼과 쿨다운 가림(이름 Slot<n>, Slot<n>Cooldown으로 찾음). */
	UPROPERTY()
	TArray<TObjectPtr<UMmoButtonWidget>> Slots;

	UPROPERTY()
	TArray<TObjectPtr<UProgressBar>> SlotShades;

	/** 아이콘 표(73). 처음 퀵슬롯을 채울 때 읽는다. */
	UPROPERTY()
	TObjectPtr<UMmoIcons> Icons;

	/** 퀵슬롯마다 보인 것(종류 << 56 | 번호 << 24 | 물약의 가진 수). 처음에는 어떤 것과도 다르게 둔다. */
	TArray<uint64> ShownSlots;
	FString ShownEffects = TEXT("-");
	uint32 ShownProgress = MAX_uint32;
	/** 마지막으로 보인 상호작용의 종류(MmoWorld::EInteractKind). 처음에는 어떤 종류와도 다르게 둔다. */
	uint8 ShownInteract = MAX_uint8;

	/** 마지막으로 보인 (지금 값, 최대값). 처음에는 어떤 값과도 다르게 둔다. */
	uint64 ShownHp = MAX_uint64;
	uint64 ShownTargetHp = MAX_uint64;
	uint32 ShownTarget = MAX_uint32;
	uint64 ShownMp = MAX_uint64;
	/** 보인 경험치 비율(천분율). */
	uint32 ShownExp = MAX_uint32;
	FDelegateHandle GrowthHandle;

	/** 마지막으로 글을 채운 언어(Strings의 Version). 바뀌면 보인 값을 모두 잊어 새 언어로 다시 채운다. */
	uint32 ShownLanguage = MAX_uint32;

	/** 마지막으로 보인 구역. 처음에는 어떤 구역과도 다르게 둔다. */
	uint32 ShownZone = MAX_uint32;
};
