#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Types/SlateEnums.h"

#include "MmoChatWidget.generated.h"

class UEditableTextBox;
class UMmoButtonWidget;
class UScrollBox;
class UTextBlock;

/**
 * HUD의 채팅창(WBP_Chat의 기반, 41): 세션의 채팅 기록(FChatLog)을 줄 목록으로 보이고(종류마다 색), 보낼 채널 고르기와 입력 칸을 둔다.
 * 귓속말을 고르면 받는 사람의 칸이 함께 보인다. 입력 칸은 Constants의 길이(UTF-8 바이트)에서 더 받지 않고, /로 시작하는 줄은 개발 명령(68)으로 보낸다.
 * PC는 Enter(키 표의 채팅)로 입력 칸에 초점을 주고 보내면 초점을 게임으로 돌린다. 터치 기기는 입력 칸을 눌러 연다.
 */
UCLASS(Abstract)
class UMmoChatWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 입력 칸에 초점을 준다(PC의 Enter). */
	void Focus();

	/** 채널을 귓속말로, 받는 사람을 Name으로 채우고 입력 칸에 초점을 준다(대상 정보창의 귓속말 버튼). */
	void StartWhisper(const FString& Name);

	/** 종류마다의 글 색(주변, 파티, 전체, 귓속말, 시스템. MmoWorld::EChatKind의 차례). 생성기가 스타일 표의 값으로 채운다. */
	UPROPERTY(EditAnywhere, Category = "Chat")
	TArray<FLinearColor> KindColors;

	/** 줄의 글자 크기. 생성기가 스타일 표의 값으로 채운다. */
	UPROPERTY(EditAnywhere, Category = "Chat")
	int32 LineSize = 14;

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	/** 기록이나 언어가 바뀌었으면 줄을 다시 채우고 맨 아래로 내린다. */
	void ShowLines();

	/** 채널 버튼의 글과 받는 사람 칸을 고른 채널에 맞추고, 두 칸의 안내 글을 지금 언어로 채운다. */
	void ShowChannel();

	/** 입력 칸의 글을 보내고 비운다. */
	void Send();

	UFUNCTION()
	void HandleCommitted(const FText& Text, ETextCommit::Type CommitMethod);

	UFUNCTION()
	void HandleChanged(const FText& Text);

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UScrollBox> LinesBox;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> ChannelButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UEditableTextBox> ToBox;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UEditableTextBox> InputBox;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> SendButton;

	/** 줄마다의 글(필요한 만큼 만들고 기록이 줄면 감춤). */
	UPROPERTY()
	TArray<TObjectPtr<UTextBlock>> LineTexts;

	/** 보낼 채널(portfolio::mmo::ChatChannel의 값. 에디터 모듈의 생성기가 이 헤더를 읽어 protobuf 타입을 쓰지 않음). 처음은 주변이다. */
	int32 Channel = 1;
	uint64 ShownRevision = MAX_uint64;
	uint32 ShownLanguage = MAX_uint32;
};
