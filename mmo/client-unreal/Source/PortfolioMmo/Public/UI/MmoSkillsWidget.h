#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoSkillsWidget.generated.h"

class UMmoButtonWidget;
class UMmoQuickslotBarWidget;
class UTextBlock;

/**
 * 스킬 창(WBP_Skills의 기반, 36). HUD의 스킬 버튼과 K 키로 열고 닫는다. 직업의 스킬(Skills 테이블의 줄)을 배운 것과 아직 배우지 않은 것 모두 보이고,
 * 고른 스킬의 설명, 필요 레벨, 마나와 쿨다운을 보인다. 배운 스킬을 고른 채 퀵슬롯의 자리를 누르면 SetQuickslot을 보내고, 비우기를 누른 뒤 자리를 누르면 그 자리를 비운다.
 */
UCLASS(Abstract)
class UMmoSkillsWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 생성기가 만드는 스킬 버튼의 수와 이름(Skill0, Skill1, ...). 직업의 스킬이 이보다 많으면 뒤의 것은 보이지 않는다. */
	static constexpr int32 MaxSkills = 8;
	static FString SkillName(int32 Index) { return FString::Printf(TEXT("Skill%d"), Index); }

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	void HandlePicked(int32 Index);

	UFUNCTION()
	void HandleClearClicked();

	UFUNCTION()
	void HandleCloseClicked();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> DetailText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> HintText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoQuickslotBarWidget> SlotBar;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> ClearButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	UPROPERTY()
	TArray<TObjectPtr<UMmoButtonWidget>> SkillButtons;

	/** 버튼마다의 스킬(직업의 스킬, 번호 차례). */
	TArray<uint32> SkillIds;
	int32 Selected = 0;
	/** 비우기를 누른 뒤 자리를 고르는 중이다. */
	bool bClearing = false;
	/** 마지막으로 채운 값(직업, 레벨, 배운 스킬의 버전, 언어, 고른 것, 비우는 중). 같으면 다시 채우지 않는다. */
	TArray<uint32> Shown;
};
