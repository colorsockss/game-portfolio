#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoCharacterSelectWidget.generated.h"

class UMmoButtonWidget;
class UTextBlock;
class UMmoSession;

namespace portfolio::mmo
{
	class Packet;
}

/**
 * 캐릭터 선택 화면(WBP_CharacterSelect의 기반). 계정의 캐릭터 4칸을 보이고, 칸을 골라 시작하거나 캐릭터 만들기를 연다.
 * 목록은 세션이 가진 마지막 CharacterList이고, 바뀌면 다시 그린다.
 */
UCLASS(Abstract)
class UMmoCharacterSelectWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;

private:
	UFUNCTION()
	void HandleSlot0Clicked();

	UFUNCTION()
	void HandleSlot1Clicked();

	UFUNCTION()
	void HandleSlot2Clicked();

	UFUNCTION()
	void HandleSlot3Clicked();

	UFUNCTION()
	void HandleStartClicked();

	UFUNCTION()
	void HandleCreateClicked();

	void HandlePacket(const portfolio::mmo::Packet& Packet);
	void Select(int32 Index);
	/** 칸과 버튼을 세션의 목록과 고른 칸에 맞춘다. */
	void Refresh();
	/** 명령줄에 -MmoEnter가 있으면 처음 한 번 첫 캐릭터로 들어간다(개발용. -MmoLogin과 함께 써서 클릭 없이 월드까지 간다). */
	void EnterFromCommandLine();
	UMmoSession& Session() const;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> Slot0Button;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> Slot1Button;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> Slot2Button;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> Slot3Button;





	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> StartButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CreateButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> StatusText;

	/** 고른 칸. 없으면 INDEX_NONE. */
	int32 Selected = INDEX_NONE;
	/** 마지막으로 그린 캐릭터 수. 목록이 늘었는지 본다. */
	int32 ShownCount = 0;
	/** EnterWorld를 보내고 답을 기다린다. */
	bool bEntering = false;
};
