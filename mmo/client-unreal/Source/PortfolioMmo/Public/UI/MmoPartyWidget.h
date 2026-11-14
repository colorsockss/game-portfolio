#pragma once

#include "CoreMinimal.h"
#include "Blueprint/UserWidget.h"

#include "MmoPartyWidget.generated.h"

class UMmoButtonWidget;
class UTextBlock;

/**
 * 파티 창(WBP_Party의 기반, 42): 파티원 목록(파티장 표시), 파티장에게만 보이는 내보내기 버튼(나 말고), 떠나기와 닫기. 파티가 없으면 "파티가 없습니다"를 보인다.
 * 줄은 생성기가 최대 인원만큼 만들고(Member<n>Row, Member<n>Text, Member<n>Kick) 이 클래스가 이름으로 찾는다.
 */
UCLASS(Abstract)
class UMmoPartyWidget : public UUserWidget
{
	GENERATED_BODY()

public:
	/** 파티의 최대 인원(packets.proto의 CONSTANT_MAX_PARTY_SIZE). 생성기가 줄을 이만큼 만든다. */
	static PORTFOLIOMMO_API int32 MaxMembers();

protected:
	virtual void NativeOnInitialized() override;
	virtual void NativeTick(const FGeometry& MyGeometry, float InDeltaTime) override;

private:
	/** 파티나 언어가 바뀌었으면 줄을 다시 채운다. */
	void ShowMembers();

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UTextBlock> EmptyText;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> LeaveButton;

	UPROPERTY(meta = (BindWidget))
	TObjectPtr<UMmoButtonWidget> CloseButton;

	UPROPERTY()
	TArray<TObjectPtr<UWidget>> Rows;

	UPROPERTY()
	TArray<TObjectPtr<UTextBlock>> Names;

	UPROPERTY()
	TArray<TObjectPtr<UMmoButtonWidget>> Kicks;

	/** 줄마다 보인 파티원의 개체 번호(내보내기 버튼이 보냄). */
	TArray<uint32> Shown;
	uint64 ShownRevision = MAX_uint64;
	uint32 ShownLanguage = MAX_uint32;
};
