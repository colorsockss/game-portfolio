#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoCharacterSelectWidget.generated.h"

class ACameraActor;
class ASkeletalMeshActor;
class UMaterialInstanceDynamic;
class UMmoButtonWidget;
class UStaticMeshComponent;
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
	virtual void NativeDestruct() override;

private:
	/**
	 * 고른 캐릭터를 카메라 앞(창의 왼쪽)에 세워 보인다(34). 메시와 대기 동작은 표현 표의 직업 줄, 무기는 그 직업의 기본 무기다.
	 * shortcut: 38 전에는 입은 무기를 저장하지 않아 기본 무기이고, 38이 CharacterList의 입은 무기를 쓴다. 0이면 미리 보기를 치운다.
	 */
	void ShowPreview(uint32 CharacterClass);

	TWeakObjectPtr<ASkeletalMeshActor> Preview;

	/** 미리 보기를 비추는 카메라(필드 위 높은 곳. 월드에 들어가 폰을 받으면 시점이 폰으로 돌아감). */
	TWeakObjectPtr<ACameraActor> PreviewCamera;

	UPROPERTY()
	TObjectPtr<UStaticMeshComponent> PreviewWeapon;

	UPROPERTY()
	TObjectPtr<UMaterialInstanceDynamic> HiddenWeapon;

	uint32 PreviewClass = 0;

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
