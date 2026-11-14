#include "UI/MmoInventoryWidget.h"

#include "Components/TextBlock.h"
#include "Components/TileView.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoItemSlotWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

void UMmoInventoryWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	CloseButton->OnClicked.AddDynamic(this, &UMmoInventoryWidget::HandleCloseClicked);
	Grid->OnItemClicked().AddUObject(this, &UMmoInventoryWidget::HandleItemClicked);
	const int32 Count = static_cast<int32>(GetGameInstance()->GetSubsystem<UMmoSession>()->Data().Constants.inventory_slots());
	for (int32 Index = 0; Index < Count; ++Index)
	{
		UMmoItemSlotEntry* Entry = NewObject<UMmoItemSlotEntry>(this);
		Entry->SlotIndex = Index;
		Entries.Add(Entry);
	}
	Grid->SetListItems(Entries);
}

void UMmoInventoryWidget::NativeConstruct()
{
	Super::NativeConstruct();
	ShownVersion = MAX_uint32;
}

void UMmoInventoryWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (Session->Inventory().Version() == ShownVersion && Session->Strings().Version() == ShownLanguage)
	{
		return;
	}
	ShownVersion = Session->Inventory().Version();
	ShownLanguage = Session->Strings().Version();
	// 보이는 항목만 다시 그린다(목록 위젯이 만든 칸 위젯은 보이는 줄의 것뿐).
	Grid->RegenerateAllEntries();
	GoldText->SetText(MmoText::Format(this, TEXT("inventory.gold"), { FText::AsNumber(Session->Inventory().Gold()).ToString() }));
}

void UMmoInventoryWidget::HandleItemClicked(UObject* Item)
{
	const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(Item);
	if (Entry && GetGameInstance()->GetSubsystem<UMmoSession>()->Inventory().Slots().count(static_cast<uint32>(Entry->SlotIndex)))
	{
		GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ShowItemDetail(static_cast<uint32>(Entry->SlotIndex));
	}
}

void UMmoInventoryWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Inventory);
}
