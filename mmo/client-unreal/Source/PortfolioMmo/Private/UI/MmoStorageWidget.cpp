#include "UI/MmoStorageWidget.h"

#include "Components/TileView.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoItemSlotWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

void UMmoStorageWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	const portfolio::mmo::data::Constants& Constants = GetGameInstance()->GetSubsystem<UMmoSession>()->Data().Constants;
	for (int32 Index = 0; Index < static_cast<int32>(Constants.storage_slots()); ++Index)
	{
		UMmoItemSlotEntry* Entry = NewObject<UMmoItemSlotEntry>(this);
		Entry->SlotIndex = Index;
		Entry->bStorage = true;
		StorageEntries.Add(Entry);
	}
	StorageGrid->SetListItems(StorageEntries);
	for (int32 Index = 0; Index < static_cast<int32>(Constants.inventory_slots()); ++Index)
	{
		UMmoItemSlotEntry* Entry = NewObject<UMmoItemSlotEntry>(this);
		Entry->SlotIndex = Index;
		BagEntries.Add(Entry);
	}
	BagGrid->SetListItems(BagEntries);
	StorageGrid->OnItemClicked().AddUObject(this, &UMmoStorageWidget::HandleStorageClicked);
	BagGrid->OnItemClicked().AddUObject(this, &UMmoStorageWidget::HandleBagClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoStorageWidget::HandleCloseClicked);
}

void UMmoStorageWidget::NativeConstruct()
{
	Super::NativeConstruct();
	PendingRequest = 0;
	ShownStorage = MAX_uint32;
	ShownBag = MAX_uint32;
}

void UMmoStorageWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (PendingRequest != 0 && !Session->Inventory().IsWaiting(PendingRequest))
	{
		PendingRequest = 0;
	}
	if (Session->Storage().Version() != ShownStorage)
	{
		ShownStorage = Session->Storage().Version();
		StorageGrid->RegenerateAllEntries();
	}
	if (Session->Inventory().Version() != ShownBag)
	{
		ShownBag = Session->Inventory().Version();
		BagGrid->RegenerateAllEntries();
	}
}

void UMmoStorageWidget::HandleStorageClicked(UObject* Item)
{
	const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(Item);
	const auto& Slots = GetGameInstance()->GetSubsystem<UMmoSession>()->Storage().Slots();
	const auto Found = Entry ? Slots.find(static_cast<uint32>(Entry->SlotIndex)) : Slots.end();
	if (Found != Slots.end())
	{
		Move(true, Found->first, Found->second.count());
	}
}

void UMmoStorageWidget::HandleBagClicked(UObject* Item)
{
	const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(Item);
	const auto& Slots = GetGameInstance()->GetSubsystem<UMmoSession>()->Inventory().Slots();
	const auto Found = Entry ? Slots.find(static_cast<uint32>(Entry->SlotIndex)) : Slots.end();
	if (Found != Slots.end())
	{
		Move(false, Found->first, Found->second.count());
	}
}

void UMmoStorageWidget::Move(bool bWithdraw, uint32 Slot, uint32 Count)
{
	if (PendingRequest != 0)
	{
		return;
	}
	TWeakObjectPtr<UMmoStorageWidget> Self(this);
	const auto Send = [Self, bWithdraw, Slot](uint32 Chosen)
	{
		if (!Self.IsValid() || Chosen == 0)
		{
			return;
		}
		UMmoSession* Session = Self->GetGameInstance()->GetSubsystem<UMmoSession>();
		Session->Send(bWithdraw ? Session->Inventory().Withdraw(Slot, Chosen) : Session->Inventory().Deposit(Slot, Chosen));
		Self->PendingRequest = Session->Inventory().RequestId();
	};
	if (Count <= 1)
	{
		Send(1);
		return;
	}
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Quantity(MmoText::Get(this, bWithdraw ? TEXT("storage.withdrawCount") : TEXT("storage.depositCount")),
		static_cast<int32>(FMath::Min<uint32>(Count, MAX_int32)), [Send](int32 Chosen) { Send(static_cast<uint32>(FMath::Max(Chosen, 0))); });
}

void UMmoStorageWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Storage);
}
