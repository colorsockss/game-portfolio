#include "UI/MmoItemDetailWidget.h"

#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoItemSlotWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

namespace
{
	const TCHAR* GradeKey(int32 Grade)
	{
		switch (Grade)
		{
		case portfolio::mmo::data::ITEM_GRADE_UNCOMMON: return TEXT("grade.uncommon");
		case portfolio::mmo::data::ITEM_GRADE_RARE: return TEXT("grade.rare");
		case portfolio::mmo::data::ITEM_GRADE_EPIC: return TEXT("grade.epic");
		default: return TEXT("grade.common");
		}
	}

	bool IsPotion(const portfolio::mmo::data::ItemsRow& Item)
	{
		return Item.use() == portfolio::mmo::data::ITEM_USE_HEAL_HP || Item.use() == portfolio::mmo::data::ITEM_USE_HEAL_MP;
	}
}

void UMmoItemDetailWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	UseButton->OnClicked.AddDynamic(this, &UMmoItemDetailWidget::HandleUseClicked);
	QuickslotButton->OnClicked.AddDynamic(this, &UMmoItemDetailWidget::HandleQuickslotClicked);
	DropButton->OnClicked.AddDynamic(this, &UMmoItemDetailWidget::HandleDropClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoItemDetailWidget::HandleCloseClicked);
}

void UMmoItemDetailWidget::SetUp(uint32 InSlotIndex)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const auto Found = Session->Inventory().Slots().find(InSlotIndex);
	const portfolio::mmo::data::ItemsRow* Item = Found != Session->Inventory().Slots().end() ? Session->Data().Item(Found->second.item_id()) : nullptr;
	if (!Item)
	{
		Close();
		return;
	}
	SlotIndex = InSlotIndex;
	ItemId = Item->id();
	PendingRequest = 0;
	UseButton->SetWaiting(false);
	DropButton->SetWaiting(false);

	NameText->SetText(MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())));
	NameText->SetColorAndOpacity(FSlateColor(UMmoItemSlotWidget::GradeColor(Item->grade())));
	FString Info = MmoText::Get(this, GradeKey(Item->grade())).ToString();
	if (Item->has_level())
	{
		Info += TEXT("\n") + MmoText::Format(this, TEXT("detail.level"), { FString::FromInt(Item->level()) }).ToString();
	}
	if (Item->has_class_())
	{
		Info += TEXT("\n") + MmoText::Format(this, TEXT("detail.class"),
			{ MmoText::Get(this, Item->class_() == portfolio::mmo::CHARACTER_CLASS_MAGE ? TEXT("class.mage") : TEXT("class.knight")).ToString() }).ToString();
	}
	Info += TEXT("\n") + MmoText::Format(this, TEXT("detail.sell"), { FString::FromInt(Item->sell_price()) }).ToString();
	InfoText->SetText(FText::FromString(Info));
	DescText->SetText(MmoText::Get(this, *FString::Printf(TEXT("item.desc.%u"), Item->id())));

	// 쓰기는 지금 쓸 수 있는 종류(물약, 귀환)만, 퀵슬롯은 물약만 보인다.
	const bool bUsable = IsPotion(*Item) || Item->use() == portfolio::mmo::data::ITEM_USE_RECALL;
	UseButton->SetVisibility(bUsable ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	QuickslotButton->SetVisibility(IsPotion(*Item) ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
}

void UMmoItemDetailWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (PendingRequest != 0 && !Session->Inventory().IsWaiting(PendingRequest))
	{
		PendingRequest = 0;
		UseButton->SetWaiting(false);
		DropButton->SetWaiting(false);
	}
	const auto Found = Session->Inventory().Slots().find(SlotIndex);
	if (Found == Session->Inventory().Slots().end() || Found->second.item_id() != ItemId)
	{
		Close();
	}
}

void UMmoItemDetailWidget::HandleUseClicked()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	Session->Send(Session->Inventory().UseItem(SlotIndex));
	PendingRequest = Session->Inventory().RequestId();
	UseButton->SetWaiting(true);
}

void UMmoItemDetailWidget::HandleQuickslotClicked()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (!Session->PlacePotion(ItemId))
	{
		GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ShowNotice(MmoText::Get(this, TEXT("quickslot.full")));
	}
}

void UMmoItemDetailWidget::HandleDropClicked()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const auto Found = Session->Inventory().Slots().find(SlotIndex);
	const portfolio::mmo::data::ItemsRow* Item = Session->Data().Item(ItemId);
	if (Found == Session->Inventory().Slots().end() || !Item)
	{
		return;
	}
	const uint32 Count = Found->second.count();
	UMmoUiManager* Ui = GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>();
	const FText Question = MmoText::Format(this, TEXT("detail.dropQuestion"), { MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString() });
	TWeakObjectPtr<UMmoItemDetailWidget> Self(this);
	Ui->Confirm(Question, [Self, Ui, Count]
	{
		if (!Self.IsValid())
		{
			return;
		}
		if (Count <= 1)
		{
			Self->SendDrop(1);
			return;
		}
		Ui->Quantity(MmoText::Get(Self.Get(), TEXT("detail.dropCount")), static_cast<int32>(Count), [Self](int32 Chosen)
		{
			if (Self.IsValid() && Chosen > 0)
			{
				Self->SendDrop(static_cast<uint32>(Chosen));
			}
		});
	});
}

void UMmoItemDetailWidget::SendDrop(uint32 Count)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	Session->Send(Session->Inventory().DropItem(SlotIndex, Count));
	PendingRequest = Session->Inventory().RequestId();
	DropButton->SetWaiting(true);
}

void UMmoItemDetailWidget::HandleCloseClicked()
{
	Close();
}

void UMmoItemDetailWidget::Close()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::ItemDetail);
}
