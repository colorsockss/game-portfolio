#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"
#include "Components/Button.h"

#include "MmoButtonWidget.generated.h"

class UImage;
class USizeBox;
class UTexture2D;
class UTextBlock;

/**
 * 모든 화면이 쓰는 공용 버튼(WBP_Button의 기반). 모양(색, 글꼴, 높이)은 위젯 생성기의 스타일 표가 정하고, 화면은 이 버튼을 놓기만 한다.
 *   - 최소 높이: 터치 기기에서는 손가락으로 누를 크기(MinHeightTouch), PC에서는 마우스의 크기(MinHeightPointer).
 *   - 키 표시: PC에서 단축키를 오른쪽 위에 붙일 자리(KeyHint. 비면 감춤. 키는 backlog 89의 키 표가 붙임).
 *   - 기다림: 요청의 답을 기다리는 동안 누를 수 없게 한다(SetWaiting).
 *   - 아이콘(SetIcon): 퀵슬롯처럼 아이콘을 보이는 버튼. 그림이 없으면 이름의 첫 글자를 크게 쓴 글자 아이콘이다(73).
 *   - 터치 기기에서만 보임(bTouchOnly): 공격·상호작용·대상 고르기·강제 공격 버튼처럼 PC에는 키가 있는 버튼.
 * 누른 손가락은 터치 나눔(MmoScreen::FTouchOwners)에서 버튼의 것이 되어 카메라로 가지 않는다. OnClicked는 UButton과 같은 신호다.
 */
UCLASS(Abstract)
class PORTFOLIOMMO_API UMmoButtonWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	UPROPERTY(BlueprintAssignable)
	FOnButtonClickedEvent OnClicked;

	/** OnClicked와 같은 신호의 C++ 델리게이트. 람다로 묶어 버튼마다 값(퀵슬롯의 칸)을 함께 넘길 때 쓴다. */
	FSimpleMulticastDelegate OnClickedNative;

	void SetLabel(const FText& InLabel);
	void SetKeyHint(const FText& InKeyHint);

	/** 답을 기다리는 동안 true. 누를 수 없고 흐리게 보인다. */
	void SetWaiting(bool bWaiting);

	/** 고른 것(캐릭터 칸, 직업)을 SelectedTint로 보인다. */
	void SetSelected(bool bSelected);

	/** 그림(아이콘 표의 줄)을 보이고, 없으면 Name의 첫 글자를 IconLetterSize로 쓴다. Name이 비면 빈 칸이다. */
	void SetIcon(UTexture2D* Texture, const FText& Name);

	UPROPERTY(EditAnywhere)
	FText Label;

	/** 라벨의 Strings 키(74). 있으면 실행 중에 그 문장으로 라벨을 채운다(Label은 디자인 화면에서만 보임). */
	UPROPERTY(EditAnywhere)
	FString LabelKey;

	/** LabelKey의 문장으로 라벨을 다시 채운다(언어가 바뀜). */
	void RefreshText();

	UPROPERTY(EditAnywhere)
	FText KeyHint;

	UPROPERTY(EditAnywhere)
	bool bTouchOnly = false;

	/** 글자 아이콘의 글자 크기(스타일 표). */
	UPROPERTY(EditAnywhere)
	int32 IconLetterSize = 24;

	UPROPERTY(EditAnywhere)
	float MinHeightTouch = 0.0f;

	UPROPERTY(EditAnywhere)
	float MinHeightPointer = 0.0f;

	/** 고른 버튼의 배경 곱(스타일 표). */
	UPROPERTY(EditAnywhere)
	FLinearColor SelectedTint = FLinearColor::White;

	/** 터치 기기이거나 Mac에서 -faketouches로 시험하는 중이다. */
	static bool IsTouchDevice();

protected:
	virtual void NativePreConstruct() override;
	virtual void NativeOnInitialized() override;
	virtual FReply NativeOnPreviewMouseButtonDown(const FGeometry& Geometry, const FPointerEvent& Event) override;

private:
	UFUNCTION()
	void HandleClicked();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<USizeBox> Size;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UButton> Button;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> LabelText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> KeyText;

	/** 아이콘의 그림. SetIcon 전에는 감춰져 있다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UImage> IconImage;
};
