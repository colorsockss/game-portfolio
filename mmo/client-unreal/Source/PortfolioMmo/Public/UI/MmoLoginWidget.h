#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoLoginWidget.generated.h"

class UButton;
class UEditableTextBox;
class UTextBlock;
class UMmoSession;

namespace portfolio::mmo
{
	class Packet;
}

/**
 * 로그인 화면(WBP_Login의 기반). 아이디를 받아 세션(UMmoSession)에 로그인을 맡기고, LoginResult나 Kicked, 연결 끊김을 상태 줄에 보여 준다.
 * 화면 관리자가 닫아도 위젯은 남아 세션을 계속 들으므로, 게임 중에 끊긴 까닭도 다시 열릴 때 보인다.
 */
UCLASS(Abstract)
class UMmoLoginWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** LoginId로 로그인한다. 버튼과 명령줄의 -MmoLogin이 부른다. */
	void LogIn(const FString& LoginId);

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;

private:
	UFUNCTION()
	void HandleLogInClicked();

	UFUNCTION()
	void HandleLoginIdCommitted(const FText& Text, ETextCommit::Type CommitMethod);

	void HandleConnected();
	void HandlePacket(const portfolio::mmo::Packet& Packet);
	void HandleClosed(const FString& Reason);
	void SetStatus(const FText& Status);
	UMmoSession& Session() const;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UEditableTextBox> LoginIdBox;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UButton> LogInButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> StatusText;

	/** 로그인 실패나 Kicked를 이미 보여 줬다. 뒤따르는 연결 끊김으로 그 메시지를 덮지 않는다. */
	bool bExplained = false;
};
