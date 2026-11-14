#include "UI/MmoEnchantWidget.h"

#include "Components/TextBlock.h"
#include "Components/TileView.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Game/MmoCueSubsystem.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoItemSlotWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

void UMmoEnchantWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	GoButton->OnClicked.AddDynamic(this, &UMmoEnchantWidget::HandleGoClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoEnchantWidget::HandleCloseClicked);
	Targets->OnItemClicked().AddUObject(this, &UMmoEnchantWidget::HandleTargetClicked);
}

void UMmoEnchantWidget::SetUp(uint32 InScrollItemId)
{
	ScrollItemId = InScrollItemId;
	SelectedIndex = -1;
	PendingRequest = 0;
	ResultText->SetText(FText::GetEmpty());
	ShownVersion = MAX_uint32;
}

void UMmoEnchantWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	for (const portfolio::mmo::EnchantResult& Result : Session->Inventory().TakeEnchantResults())
	{
		ResultText->SetText(Result.success() ? MmoText::Format(this, TEXT("enchant.success"), { FString::FromInt(Result.enchant()) }) : MmoText::Get(this, TEXT("enchant.failure")));
		if (UMmoCueSubsystem* Cues = GetWorld()->GetSubsystem<UMmoCueSubsystem>())
		{
			Cues->PlayUi(Result.success() ? EMmoCue::UiEnchantSuccess : EMmoCue::UiEnchantFailure);
		}
		if (!Result.success())
		{
			SelectedIndex = -1;
		}
	}
	if (PendingRequest != 0 && !Session->Inventory().IsWaiting(PendingRequest))
	{
		PendingRequest = 0;
		ShownVersion = MAX_uint32;
	}
	if (Session->Inventory().Version() != ShownVersion)
	{
		ShownVersion = Session->Inventory().Version();
		Refresh();
	}
}

void UMmoEnchantWidget::Refresh()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FInventory& Inventory = Session->Inventory();
	Entries.Reset();
	const auto AddGear = [&](const std::map<uint32_t, portfolio::mmo::ItemSlot>& Place, bool bWorn)
	{
		for (const auto& [Index, Slot] : Place)
		{
			const portfolio::mmo::data::ItemsRow* Item = Session->Data().Item(Slot.item_id());
			if (Item && Item->kind() == portfolio::mmo::data::ITEM_KIND_EQUIPMENT)
			{
				UMmoItemSlotEntry* Entry = NewObject<UMmoItemSlotEntry>(this);
				Entry->SlotIndex = static_cast<int32>(Index);
				Entry->bEquipment = bWorn;
				Entries.Add(Entry);
			}
		}
	};
	AddGear(Inventory.Worn(), true);
	AddGear(Inventory.Slots(), false);
	Targets->SetListItems(Entries);
	Targets->RegenerateAllEntries();

	const std::map<uint32_t, portfolio::mmo::ItemSlot>& Place = bSelectedWorn ? Inventory.Worn() : Inventory.Slots();
	const auto Found = SelectedIndex >= 0 ? Place.find(static_cast<uint32>(SelectedIndex)) : Place.end();
	const uint32 Scrolls = Inventory.CountOf(ScrollItemId);
	FString Info = MmoText::Format(this, TEXT("enchant.scrolls"), { FString::FromInt(Scrolls) }).ToString();
	bool bCanGo = false;
	if (Found == Place.end())
	{
		Info += TEXT("\n") + MmoText::Get(this, TEXT("enchant.pick")).ToString();
	}
	else
	{
		const portfolio::mmo::data::ItemsRow* Item = Session->Data().Item(Found->second.item_id());
		Info += TEXT("\n") + (Item ? MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString() : FString()) + FString::Printf(TEXT(" +%u"), Found->second.enchant());
		const std::optional<double> Chance = MmoWorld::FInventory::NextEnchantChance(Session->Data(), Found->second.enchant());
		if (!Chance)
		{
			Info += TEXT("\n") + MmoText::Get(this, TEXT("enchant.max")).ToString();
		}
		else
		{
			Info += TEXT("\n") + MmoText::Format(this, TEXT("enchant.next"),
				{ FString::FromInt(Found->second.enchant()), FString::FromInt(Found->second.enchant() + 1), FString::FromInt(FMath::RoundToInt(*Chance * 100.0)) }).ToString();
			if (*Chance < 1.0)
			{
				Info += TEXT("\n") + MmoText::Get(this, TEXT("enchant.risk")).ToString();
			}
			bCanGo = Scrolls > 0;
		}
	}
	InfoText->SetText(FText::FromString(Info));
	GoButton->SetIsEnabled(bCanGo && PendingRequest == 0);
}

void UMmoEnchantWidget::HandleTargetClicked(UObject* Item)
{
	if (const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(Item))
	{
		SelectedIndex = Entry->SlotIndex;
		bSelectedWorn = Entry->bEquipment;
		ResultText->SetText(FText::GetEmpty());
		ShownVersion = MAX_uint32;
	}
}

void UMmoEnchantWidget::HandleGoClicked()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FInventory& Inventory = Session->Inventory();
	const auto& Place = bSelectedWorn ? Inventory.Worn() : Inventory.Slots();
	const auto Found = SelectedIndex >= 0 ? Place.find(static_cast<uint32>(SelectedIndex)) : Place.end();
	if (Found == Place.end())
	{
		return;
	}
	const std::optional<double> Chance = MmoWorld::FInventory::NextEnchantChance(Session->Data(), Found->second.enchant());
	if (Chance && *Chance < 1.0)
	{
		// 깨질 수 있는 단계는 확인 팝업을 거친다.
		const portfolio::mmo::data::ItemsRow* Item = Session->Data().Item(Found->second.item_id());
		TWeakObjectPtr<UMmoEnchantWidget> Self(this);
		GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Confirm(
			MmoText::Format(this, TEXT("enchant.question"), { Item ? MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString() : FString() }),
			[Self] { if (Self.IsValid()) { Self->Send(); } });
		return;
	}
	Send();
}

void UMmoEnchantWidget::Send()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const std::optional<uint32_t> Scroll = Session->Inventory().FirstSlotOf(ScrollItemId);
	if (!Scroll || SelectedIndex < 0)
	{
		return;
	}
	Session->Send(Session->Inventory().Enchant(bSelectedWorn ? portfolio::mmo::ITEM_PLACE_EQUIPMENT : portfolio::mmo::ITEM_PLACE_INVENTORY, static_cast<uint32>(SelectedIndex), *Scroll));
	PendingRequest = Session->Inventory().RequestId();
	GoButton->SetIsEnabled(false);
}

void UMmoEnchantWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Enchant);
}
