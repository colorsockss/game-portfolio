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
		// 일반 등급은 어두운 청동 테두리(101).
		return FLinearColor(0.42f, 0.36f, 0.26f);
	}
}

void UMmoItemSlotWidget::NativeOnListItemObjectSet(UObject* ListItemObject)
{
	const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(ListItemObject);
	if (Entry && Entry->ItemId != 0)
	{
		Show(Entry->ItemId, 0);
		return;
	}
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FInventory& Inventory = Entry && Entry->bStorage ? Session->Storage() : Session->Inventory();
	const std::map<uint32_t, portfolio::mmo::ItemSlot>& Place = Entry && Entry->bEquipment ? Inventory.Worn() : Inventory.Slots();
	const auto Found = Entry ? Place.find(static_cast<uint32>(Entry->SlotIndex)) : Place.end();
	Found == Place.end() ? Show(0, 0) : Show(Found->second.item_id(), Found->second.count());
}

void UMmoItemSlotWidget::Show(uint32 ItemId, uint32 Count)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const portfolio::mmo::data::ItemsRow* Item = ItemId != 0 ? Session->Data().Item(ItemId) : nullptr;
	// 칸의 테두리 색이다. 빈 칸은 어두운 회색.
	GradeBorder->SetBrushColor(Item ? GradeColor(Item->grade()) : FLinearColor(0.16f, 0.16f, 0.17f));
	const UMmoIcons* Icons = LoadObject<UMmoIcons>(nullptr, UMmoIcons::Path);
	UTexture2D* Texture = Item && Icons ? Icons->Load(EMmoIconKind::Item, static_cast<int32>(ItemId)) : nullptr;
	IconImage->SetVisibility(Texture ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
	if (Texture)
	{
		IconImage->SetBrushFromTexture(Texture);
	}
	// 그림이 없으면 이름의 첫 글자(73의 글자 아이콘).
	LetterText->SetText(Item && !Texture ? FText::FromString(MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString().Left(1)) : FText::GetEmpty());
	CountText->SetText(Item && Item->stackable() && Count > 0 ? FText::AsNumber(Count) : FText::GetEmpty());
}
