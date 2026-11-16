#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoCharacterCreateWidget.generated.h"

class UMmoButtonWidget;
class UEditableTextBox;
class UTextBlock;
class UMmoSession;

namespace portfolio::mmo
{
	class Packet;
}

/**
 * 캐릭터 만들기(WBP_CharacterCreate의 기반, 캐릭터 선택 위의 팝업). 이름과 직업(기사, 마법사)을 받아 만들고, 성공하면 닫는다.
 * 이름의 형식과 겹침은 서버가 검사하고, 실패하면 그 까닭을 보인다.
 */
UCLASS(Abstract)
class UMmoCharacterCreateWidget : public UUserWidget
{
	GENERATED_BODY()

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeConstruct() override;

private:
	UFUNCTION()
	void HandleKnightClicked();

	UFUNCTION()
	void HandleMageClicked();

	UFUNCTION()
	void HandleCreateClicked();

	UFUNCTION()
	void HandleCancelClicked();

	void HandlePacket(const portfolio::mmo::Packet& Packet);
	void SelectClass(bool bMage);
	void Close();
	UMmoSession& Session() const;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UEditableTextBox> NameBox;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> KnightButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> MageButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CreateButton;

	/** 체험 캐릭터(94. 레벨 20)를 고른다. 서버가 만들 수 있다고 알렸을 때만 보인다. */
	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> DemoButton;

	bool bDemoSelected = false;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CancelButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> StatusText;

	bool bMageSelected = false;
	/** CreateCharacter를 보내고 답을 기다린다. */
	bool bCreating = false;
};
