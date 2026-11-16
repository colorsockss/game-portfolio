#include "UI/MmoItemDetailWidget.h"

#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoItemSlotWidget.h"
#include "UI/MmoQuickslotBarWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"
#include "World/FailMessages.h"

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
	// 고른 자리에 물약을 올린다. 퀵슬롯은 서버의 Quickslots가 오면 바뀐다(36).
	SlotBar->OnPicked.AddWeakLambda(this, [this](int32 Index)
	{
		UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
		Session->Send(MmoWorld::FSkillBook::SetQuickslot(Index, portfolio::mmo::QUICKSLOT_KIND_ITEM, ItemId));
	});
	DropButton->OnClicked.AddDynamic(this, &UMmoItemDetailWidget::HandleDropClicked);
	EquipButton->OnClicked.AddDynamic(this, &UMmoItemDetailWidget::HandleEquipClicked);
	EnchantButton->OnClicked.AddDynamic(this, &UMmoItemDetailWidget::HandleEnchantClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoItemDetailWidget::HandleCloseClicked);
}

void UMmoItemDetailWidget::SetUp(uint32 InSlotIndex, bool bInEquipment)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const std::map<uint32_t, portfolio::mmo::ItemSlot>& Place = bInEquipment ? Session->Inventory().Worn() : Session->Inventory().Slots();
	const auto Found = Place.find(InSlotIndex);
	const portfolio::mmo::data::ItemsRow* Item = Found != Place.end() ? Session->Data().Item(Found->second.item_id()) : nullptr;
	if (!Item)
	{
		Close();
		return;
	}
	SlotIndex = InSlotIndex;
	bEquipment = bInEquipment;
	ItemId = Item->id();
	PendingRequest = 0;
	UseButton->SetWaiting(false);
	DropButton->SetWaiting(false);

	NameText->SetText(MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())));
	NameText->SetColorAndOpacity(FSlateColor(UMmoItemSlotWidget::GradeColor(Item->grade())));
	FString Info = MmoText::Get(this, GradeKey(Item->grade())).ToString();
	// 스킬북(36)의 필요 레벨과 직업은 Items의 열이 아니라 가르치는 Skills의 줄에서 읽는다.
	const portfolio::mmo::data::SkillsRow* Taught = Item->use() == portfolio::mmo::data::ITEM_USE_LEARN_SKILL ? Session->Data().Skill(Item->use_value()) : nullptr;
	const std::optional<uint32> Level = Taught ? std::optional<uint32>(Taught->level()) : Item->has_level() ? std::optional<uint32>(Item->level()) : std::nullopt;
	const std::optional<uint32> Class = Taught ? std::optional<uint32>(Taught->class_()) : Item->has_class_() ? std::optional<uint32>(Item->class_()) : std::nullopt;
	if (Level)
	{
		Info += TEXT("\n") + MmoText::Format(this, TEXT("detail.level"), { FString::FromInt(*Level) }).ToString();
	}
	if (Class)
	{
		Info += TEXT("\n") + MmoText::Format(this, TEXT("detail.class"),
			{ MmoText::Get(this, *Class == portfolio::mmo::CHARACTER_CLASS_MAGE ? TEXT("class.mage") : TEXT("class.knight")).ToString() }).ToString();
	}
	Info += TEXT("\n") + MmoText::Format(this, TEXT("detail.sell"), { FString::FromInt(Item->sell_price()) }).ToString();
	InfoText->SetText(FText::FromString(Info));
	DescText->SetText(MmoText::Get(this, *FString::Printf(TEXT("item.desc.%u"), Item->id())));

	// 쓰기는 지금 쓸 수 있는 종류(물약, 귀환, 스킬북)만, 퀵슬롯은 물약만, 떨어뜨리기는 입지 않은 것만 보인다.
	const bool bUsable = !bEquipment && (IsPotion(*Item) || Item->use() == portfolio::mmo::data::ITEM_USE_RECALL || Item->use() == portfolio::mmo::data::ITEM_USE_LEARN_SKILL);
	UseButton->SetVisibility(bUsable ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	const ESlateVisibility Quickslot = !bEquipment && IsPotion(*Item) ? ESlateVisibility::Visible : ESlateVisibility::Collapsed;
	QuickslotTitle->SetVisibility(Quickslot);
	SlotBar->SetVisibility(Quickslot);
	DropButton->SetVisibility(bEquipment ? ESlateVisibility::Collapsed : ESlateVisibility::Visible);
	EnchantButton->SetVisibility(Item->use() == portfolio::mmo::data::ITEM_USE_ENCHANT ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);

	// 장비(34): 능력치 줄(입지 않은 것은 입은 것과의 비교), 입기·벗기, 입을 수 없는 까닭.
	const bool bGear = Item->kind() == portfolio::mmo::data::ITEM_KIND_EQUIPMENT;
	EquipButton->SetVisibility(bGear ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	StatsText->SetVisibility(bGear ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
	WarnText->SetVisibility(ESlateVisibility::Collapsed);
	if (bGear)
	{
		const MmoWorld::FStatDelta Delta = bEquipment ? MmoWorld::FStatDelta{} : Session->Inventory().Compare(Session->Data(), *Item);
		FString Stats;
		const auto Line = [&](const TCHAR* Key, uint32 Value, int32 Change)
		{
			if (Value == 0 && Change == 0)
			{
				return;
			}
			const FString Base = MmoText::Format(this, Key, { FString::FromInt(Value) }).ToString();
			Stats += (Stats.IsEmpty() ? TEXT("") : TEXT("\n")) + (bEquipment ? Base
				: MmoText::Format(this, TEXT("detail.compare"), { Base, FString::Printf(TEXT("%+d"), Change) }).ToString());
		};
		Line(TEXT("detail.stat.attack"), Item->attack(), Delta.Attack);
		Line(TEXT("detail.stat.defense"), Item->defense(), Delta.Defense);
		Line(TEXT("detail.stat.maxHp"), Item->max_hp(), Delta.MaxHp);
		Line(TEXT("detail.stat.maxMp"), Item->max_mp(), Delta.MaxMp);
		StatsText->SetText(FText::FromString(Stats));
		EquipButton->SetLabel(MmoText::Get(this, bEquipment ? TEXT("detail.unequip") : TEXT("detail.equip")));
		const MmoWorld::FEntity* Me = Session->World().SelfEntity();
		const portfolio::mmo::FailReason Reason = bEquipment || !Me ? portfolio::mmo::FAIL_REASON_NONE
			: MmoWorld::FInventory::CanEquip(*Item, static_cast<uint32>(Me->Info.character_class()), Me->Info.level());
		EquipButton->SetIsEnabled(Reason == portfolio::mmo::FAIL_REASON_NONE);
		if (Reason != portfolio::mmo::FAIL_REASON_NONE)
		{
			WarnText->SetText(MmoText::Format(this, TEXT("detail.cannotEquip"), { MmoText::Get(this, UTF8_TO_TCHAR(MmoWorld::FailKey(Reason))).ToString() }));
			WarnText->SetVisibility(ESlateVisibility::HitTestInvisible);
		}
	}
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
		EquipButton->SetWaiting(false);
	}
	const std::map<uint32_t, portfolio::mmo::ItemSlot>& Place = bEquipment ? Session->Inventory().Worn() : Session->Inventory().Slots();
	const auto Found = Place.find(SlotIndex);
	if (Found == Place.end() || Found->second.item_id() != ItemId)
	{
		Close();
	}
}

void UMmoItemDetailWidget::HandleUseClicked()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	// 펫이 있는 채로 다른 펫의 아이템을 쓰면 묻는다(96).
	const portfolio::mmo::data::ItemsRow* Item = Session->Data().Item(ItemId);
	const MmoWorld::FSelfState& Self = Session->World().SelfState();
	if (Item && Item->use() == portfolio::mmo::data::ITEM_USE_GET_PET && Self.PetId != 0 && Self.PetId != Item->use_value() && !bConfirmedPet)
	{
		const portfolio::mmo::data::PetsRow* Owned = Session->Data().Pet(Self.PetId);
		const portfolio::mmo::data::PetsRow* Next = Session->Data().Pet(Item->use_value());
		GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Confirm(MmoText::Format(this, TEXT("pet.replace"), {
			Owned ? MmoText::Get(this, UTF8_TO_TCHAR(Owned->name_key().c_str())).ToString() : FString(),
			Next ? MmoText::Get(this, UTF8_TO_TCHAR(Next->name_key().c_str())).ToString() : FString() }),
			[this] { bConfirmedPet = true; HandleUseClicked(); bConfirmedPet = false; });
		return;
	}
	Session->Send(Session->Inventory().UseItem(SlotIndex));
	PendingRequest = Session->Inventory().RequestId();
	UseButton->SetWaiting(true);
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

void UMmoItemDetailWidget::HandleEquipClicked()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	Session->Send(bEquipment ? Session->Inventory().Unequip(SlotIndex + 1) : Session->Inventory().Equip(SlotIndex));
	PendingRequest = Session->Inventory().RequestId();
	EquipButton->SetWaiting(true);
}

void UMmoItemDetailWidget::HandleEnchantClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->ShowEnchant(ItemId);
}

void UMmoItemDetailWidget::HandleCloseClicked()
{
	Close();
}

void UMmoItemDetailWidget::Close()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::ItemDetail);
}
