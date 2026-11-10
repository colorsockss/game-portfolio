#pragma once

#include "CoreMinimal.h"
#include "Screen/ScreenStack.h"
#include "Subsystems/LocalPlayerSubsystem.h"

#include "MmoUiManager.generated.h"

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
 * 세션을 들어 로그인하면 HUD로, 연결이 끊기면 로그인 화면으로 바꾼다.
 */
UCLASS()
class UMmoUiManager : public ULocalPlayerSubsystem
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

	/** 알림 층에 잠깐 글을 띄운다. */
	void ShowNotice(const FText& Message);

	/** 예·아니요를 묻는 팝업. 예를 누르면 OnYes를 부른다. */
	void Confirm(const FText& Message, TFunction<void()> OnYes);

	/** 확인을 받은 뒤 로그아웃한다(설정 창의 버튼). */
	void LogOut();

private:
	void Show(MmoScreen::EScreen Screen, UUserWidget& Widget, const FOnShown& OnShown);
	void ApplyInputMode();
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
	/** 지금 캐릭터 이동을 막고 있는가. SetIgnoreMoveInput은 횟수를 세므로 바뀔 때만 부른다. */
	bool bMoveIgnored = false;
	FDelegateHandle PacketHandle;
	FDelegateHandle ClosedHandle;
};
