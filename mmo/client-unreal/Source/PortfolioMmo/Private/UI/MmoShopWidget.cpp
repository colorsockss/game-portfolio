#include "UI/MmoShopWidget.h"

#include "Components/TextBlock.h"
#include "Components/TileView.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoItemSlotWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

void UMmoShopWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	for (const portfolio::mmo::data::ShopsRow& Row : Session->Data().Shops.rows())
	{
		UMmoItemSlotEntry* Entry = NewObject<UMmoItemSlotEntry>(this);
		Entry->ItemId = Row.item_id();
		BuyEntries.Add(Entry);
	}
	BuyGrid->SetListItems(BuyEntries);
	for (int32 Index = 0; Index < static_cast<int32>(Session->Data().Constants.inventory_slots()); ++Index)
	{
		UMmoItemSlotEntry* Entry = NewObject<UMmoItemSlotEntry>(this);
		Entry->SlotIndex = Index;
		SellEntries.Add(Entry);
	}
	SellGrid->SetListItems(SellEntries);
	BuyGrid->OnItemClicked().AddUObject(this, &UMmoShopWidget::HandleBuyClicked);
	SellGrid->OnItemClicked().AddUObject(this, &UMmoShopWidget::HandleSellClicked);
	ActButton->OnClicked.AddDynamic(this, &UMmoShopWidget::HandleActClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoShopWidget::HandleCloseClicked);
}

void UMmoShopWidget::NativeConstruct()
{
	Super::NativeConstruct();
	Selected = -1;
	PendingRequest = 0;
	ShownVersion = MAX_uint32;
}

void UMmoShopWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (PendingRequest != 0 && !Session->Inventory().IsWaiting(PendingRequest))
	{
		PendingRequest = 0;
		ActButton->SetWaiting(false);
	}
	if (Session->Inventory().Version() == ShownVersion && Session->Strings().Version() == ShownLanguage)
	{
		return;
	}
	ShownVersion = Session->Inventory().Version();
	ShownLanguage = Session->Strings().Version();
	BuyGrid->RegenerateAllEntries();
	SellGrid->RegenerateAllEntries();
	GoldText->SetText(MmoText::Format(this, TEXT("shop.gold"), { FText::AsNumber(Session->Inventory().Gold()).ToString() }));
	Refresh();
}

void UMmoShopWidget::HandleBuyClicked(UObject* Item)
{
	if (const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(Item))
	{
		bBuying = true;
		Selected = Entry->ItemId;
		Refresh();
	}
}

void UMmoShopWidget::HandleSellClicked(UObject* Item)
{
	if (const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(Item))
	{
		bBuying = false;
		Selected = Entry->SlotIndex;
		Refresh();
	}
}

void UMmoShopWidget::Refresh()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const portfolio::mmo::data::ItemsRow* Item = nullptr;
	FText Info = MmoText::Get(this, TEXT("shop.pickBuy"));
	bool bCanAct = false;
	if (bBuying && Selected >= 0)
	{
		const portfolio::mmo::data::ShopsRow* Row = Session->Data().ShopItem(static_cast<uint32>(Selected));
		Item = Row ? Session->Data().Item(Row->item_id()) : nullptr;
		if (Item)
		{
			Info = MmoText::Format(this, TEXT("shop.price"), { MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString(), FText::AsNumber(Row->price()).ToString() });
			bCanAct = Session->Inventory().MaxBuy(Session->Data(), Row->item_id()) > 0;
		}
	}
	else if (!bBuying && Selected >= 0)
	{
		const auto Found = Session->Inventory().Slots().find(static_cast<uint32>(Selected));
		Item = Found != Session->Inventory().Slots().end() ? Session->Data().Item(Found->second.item_id()) : nullptr;
		Info = Item ? MmoText::Format(this, TEXT("shop.sellPrice"), { MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString(), FText::AsNumber(Item->sell_price()).ToString() })
			: MmoText::Get(this, TEXT("shop.pickSell"));
		bCanAct = Item && Item->sell_price() > 0;
	}
	InfoText->SetText(Info);
	ActButton->SetLabel(MmoText::Get(this, bBuying ? TEXT("shop.buy") : TEXT("shop.sell")));
	ActButton->SetIsEnabled(bCanAct);
}

void UMmoShopWidget::HandleActClicked()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (Selected < 0 || PendingRequest != 0)
	{
		return;
	}
	// 여럿을 고를 수 있으면(겹치는 아이템을 둘 이상 살 골드가 있거나, 둘 이상 겹친 칸) 수량 입력을 거친다.
	uint32 Max = 1;
	const TCHAR* Title = TEXT("shop.buyCount");
	if (bBuying)
	{
		const portfolio::mmo::data::ItemsRow* Item = Session->Data().Item(static_cast<uint32>(Selected));
		Max = Item && Item->stackable() ? Session->Inventory().MaxBuy(Session->Data(), static_cast<uint32>(Selected)) : 1;
	}
	else
	{
		const auto Found = Session->Inventory().Slots().find(static_cast<uint32>(Selected));
		Max = Found != Session->Inventory().Slots().end() ? Found->second.count() : 0;
		Title = TEXT("shop.sellCount");
	}
	if (Max <= 1)
	{
		Send(1);
		return;
	}
	TWeakObjectPtr<UMmoShopWidget> Self(this);
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Quantity(MmoText::Get(this, Title), static_cast<int32>(FMath::Min<uint32>(Max, MAX_int32)), [Self](int32 Chosen)
	{
		if (Self.IsValid() && Chosen > 0)
		{
			Self->Send(static_cast<uint32>(Chosen));
		}
	});
}

void UMmoShopWidget::Send(uint32 Count)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	Session->Send(bBuying ? Session->Inventory().Buy(static_cast<uint32>(Selected), Count) : Session->Inventory().Sell(static_cast<uint32>(Selected), Count));
	PendingRequest = Session->Inventory().RequestId();
	ActButton->SetWaiting(true);
}

void UMmoShopWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Shop);
}
