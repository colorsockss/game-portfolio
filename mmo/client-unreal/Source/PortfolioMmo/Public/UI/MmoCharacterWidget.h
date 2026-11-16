#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoCharacterWidget.generated.h"

class UMmoButtonWidget;
class UTextBlock;

/**
 * 캐릭터 창(WBP_Character의 기반, 31). HUD의 캐릭터 버튼과 C 키로 열고 닫는다. 레벨, 경험치, 능력치 넷(최대 체력·마나, 공격력, 방어력)을
 * 월드 모델에서 읽어 바뀔 때만 채운다. 성향의 줄은 44가, 가진 펫과 부르기·넣기 버튼은 96이 더한다.
 */
UCLASS(Abstract)
class UMmoCharacterWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	UFUNCTION()
	void HandleCloseClicked();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> LevelText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> ExpText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> StatsText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	/** 가진 펫과 부르기·넣기(96). */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> PetText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> PetButton;

	/** 마지막으로 채운 값(레벨, 경험치, 능력치 넷, 언어). 같으면 다시 채우지 않는다. */
	TArray<uint32> Shown;
};
