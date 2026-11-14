#pragma once

#include "CoreMinimal.h"
#include "Screen/ScreenStack.h"
#include "Screen/TouchOwners.h"
#include "Subsystems/LocalPlayerSubsystem.h"

#include "MmoUiManager.generated.h"

class IInputProcessor;
class UMmoNoticeWidget;
class UMmoSession;
class UMmoUiRoot;
class UUserWidget;

namespace portfolio::mmo
{
	class Packet;
}

/**
 * 화면 관리자. 뿌리 위젯(UMmoUiRoot)의 층에 화면을 올리고 내리며, 무엇이 열렸는지와 뒤로 가기, 입력 모드는 FScreenStack의 판단을 따른다.
 * 화면은 위젯 블루프린트(MmoUiPaths)를 비동기로 불러와 만들고, 닫아도 지우지 않고 다음에 다시 쓴다.
 * 세션을 들어 로그인하면 캐릭터 선택으로, 월드에 들어가면 HUD로, 연결이 끊기면 로그인 화면으로 바꾼다.
 */
UCLASS()
class PORTFOLIOMMO_API UMmoUiManager : public ULocalPlayerSubsystem
{
	GENERATED_BODY()

public:
	/** 화면이 보이게 된 뒤에 부른다(이미 만든 화면이면 바로). */
	using FOnShown = TFunction<void(UUserWidget&)>;

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;
	virtual void PlayerControllerChanged(APlayerController* NewPlayerController) override;

	/** 화면을 연다. 이미 열려 있으면 그 층의 맨 위로 올린다. */
	void Open(MmoScreen::EScreen Screen, FOnShown OnShown = nullptr);

	void Close(MmoScreen::EScreen Screen);

	/** 뒤로 가기(Esc, Android 뒤로 버튼). 닫을 창이 없고 게임 중이면 설정을 연다. */
	void Back();

	/** 인벤토리 창을 열고 닫는다(HUD의 가방 버튼과 I 키. 32). 닫을 때 상세 창도 닫는다. */
	void ToggleInventory();

	/** 인벤토리 칸(bEquipment면 입은 장비의 칸. 34)의 아이템 상세 창을 연다(32). */
	void ShowItemDetail(uint32 Slot, bool bEquipment = false);

	/** 캐릭터 창을 열고 닫는다(HUD의 캐릭터 버튼과 C 키. 31). 게임 중이고 죽어 있지 않을 때만 연다. */
	void ToggleCharacter();

	/** 언어가 바뀌면 키로 채운 버튼과 글 상자(이 월드의 것)를 다시 채운다(74). */
	void RefreshTexts();

	/** 개발 빌드의 UI 숨기기(68): 뿌리 위젯의 층(이름표, HUD, 창, 팝업, 알림)을 모두 감추거나 다시 보인다. */
	void ToggleHidden();

	/** 시연 표시(프레임, 보이는 캐릭터 수, 지연. 30)를 켰다. 설정 창의 줄로 바꾸고, 기기에 남기지 않는다(앱을 다시 켜면 꺼짐). */
	bool IsStatsShown() const { return bShowStats; }
	void SetStatsShown(bool bShown) { bShowStats = bShown; }

	/** 알림 층에 잠깐 글을 띄운다. */
	void ShowNotice(const FText& Message);

	/** 예·아니요를 묻는 팝업. 예를 누르면 OnYes를 부른다. */
	void Confirm(const FText& Message, TFunction<void()> OnYes);

	/** 1부터 Max까지의 수를 고르는 팝업(떨어뜨리기, 상점, 창고). 확인을 누르면 고른 수로 OnChosen을 부른다. */
	void Quantity(const FText& Title, int32 Max, TFunction<void(int32)> OnChosen);

	/** 손가락마다의 주인(조이스틱, 버튼, 카메라). 위젯과 컨트롤러가 누를 때 가지고, 뗄 때는 입력 전처리기가 놓는다. */
	MmoScreen::FTouchOwners& TouchOwners() { return Touches; }

	/** 확인을 받은 뒤 로그아웃한다(설정 창의 버튼). */
	void LogOut();

	/** 월드를 떠나 캐릭터 선택으로 돌아간다(설정 창의 버튼). 연결은 그대로다. */
	void ReturnToCharacterSelect();

private:
	void Show(MmoScreen::EScreen Screen, UUserWidget& Widget, const FOnShown& OnShown);
	void ApplyInputMode();
	void OpenFromCommandLine();
	void HandlePacket(const portfolio::mmo::Packet& Packet);
	void HandleClosed(const FString& Reason);
	APlayerController* PlayerController() const;
	UMmoSession& Session() const;

	UPROPERTY()
	TObjectPtr<UMmoUiRoot> Root;

	/** 화면(EScreen) → 만든 위젯. */
	UPROPERTY()
	TMap<uint8, TObjectPtr<UUserWidget>> Widgets;

	UPROPERTY()
	TObjectPtr<UMmoNoticeWidget> Notice;

	MmoScreen::FScreenStack Stack;
	MmoScreen::FTouchOwners Touches;
	/** 모든 터치의 뗌을 위젯보다 먼저 보는 Slate 입력 전처리기(손가락의 주인을 놓음). */
	TSharedPtr<IInputProcessor> TouchReleaser;

	bool bShowStats = false;

	/** 글자·숫자 키를 키 코드로 다시 읽는다(Mac의 입력기, 89). */
	TSharedPtr<IInputProcessor> KeyCodeInput;
	FDelegateHandle PacketHandle;
	FDelegateHandle ClosedHandle;
	FDelegateHandle LanguageHandle;
};
