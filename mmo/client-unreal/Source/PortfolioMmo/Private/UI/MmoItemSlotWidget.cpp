#include "UI/MmoItemSlotWidget.h"

#include "Components/Border.h"
#include "Components/Image.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Net/MmoSession.h"
#include "UI/MmoIcons.h"
#include "UI/MmoText.h"

FLinearColor UMmoItemSlotWidget::GradeColor(int32 Grade)
{
	switch (Grade)
	{
	case portfolio::mmo::data::ITEM_GRADE_UNCOMMON:
		return FLinearColor(0.35f, 0.85f, 0.35f);
	case portfolio::mmo::data::ITEM_GRADE_RARE:
		return FLinearColor(0.35f, 0.6f, 1.0f);
	case portfolio::mmo::data::ITEM_GRADE_EPIC:
		return FLinearColor(0.75f, 0.4f, 1.0f);
	default:
		return FLinearColor(0.85f, 0.85f, 0.85f);
	}
}

void UMmoItemSlotWidget::NativeOnListItemObjectSet(UObject* ListItemObject)
{
	const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(ListItemObject);
	const MmoWorld::FInventory& Inventory = GetGameInstance()->GetSubsystem<UMmoSession>()->Inventory();
	const auto Found = Entry ? Inventory.Slots().find(static_cast<uint32>(Entry->SlotIndex)) : Inventory.Slots().end();
	Found == Inventory.Slots().end() ? Show(0, 0) : Show(Found->second.item_id(), Found->second.count());
}

void UMmoItemSlotWidget::Show(uint32 ItemId, uint32 Count)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const portfolio::mmo::data::ItemsRow* Item = ItemId != 0 ? Session->Data().Item(ItemId) : nullptr;
	GradeBorder->SetBrushColor(Item ? GradeColor(Item->grade()) : FLinearColor(0.2f, 0.2f, 0.22f));
	const UMmoIcons* Icons = LoadObject<UMmoIcons>(nullptr, UMmoIcons::Path);
	UTexture2D* Texture = Item && Icons ? Icons->Load(EMmoIconKind::Item, static_cast<int32>(ItemId)) : nullptr;
	IconImage->SetVisibility(Texture ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
	if (Texture)
	{
		IconImage->SetBrushFromTexture(Texture);
	}
	// 그림이 없으면 이름의 첫 글자(73의 글자 아이콘).
	LetterText->SetText(Item && !Texture ? FText::FromString(MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString().Left(1)) : FText::GetEmpty());
	CountText->SetText(Item && Item->stackable() ? FText::AsNumber(Count) : FText::GetEmpty());
}
