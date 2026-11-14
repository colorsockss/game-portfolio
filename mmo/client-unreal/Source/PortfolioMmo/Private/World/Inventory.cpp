#include "World/Inventory.h"

#include <utility>

namespace MmoWorld
{
	void FInventory::Reset()
	{
		Filled.clear();
		Equipped.clear();
		Money = 0;
		++Changes;
		Waiting.clear();
		Gains.clear();
		Failures.clear();
	}

	void FInventory::Put(const portfolio::mmo::ItemSlot& Slot)
	{
		std::map<uint32_t, portfolio::mmo::ItemSlot>& Place = Slot.place() == portfolio::mmo::ITEM_PLACE_EQUIPMENT ? Equipped : Filled;
		if (Slot.item_id() == 0)
		{
			Place.erase(Slot.index());
		}
		else
		{
			Place[Slot.index()] = Slot;
		}
	}

	void FInventory::Apply(const portfolio::mmo::Packet& Packet)
	{
		switch (Packet.body_case())
		{
		case portfolio::mmo::Packet::kInventory:
			Filled.clear();
			Equipped.clear();
			for (const portfolio::mmo::ItemSlot& Slot : Packet.inventory().slots())
			{
				Put(Slot);
			}
			Money = Packet.inventory().gold();
			// 전체를 다시 받으면(들어옴, 넘겨받기 46, 다시 연결 64) 기다리던 요청은 답이 오지 않으므로 모두 푼다. 번호는 0부터 다시 시작한다.
			Waiting.clear();
			NextRequest = 0;
			++Changes;
			break;
		case portfolio::mmo::Packet::kInventoryChanged:
			for (const portfolio::mmo::ItemSlot& Slot : Packet.inventory_changed().slots())
			{
				Put(Slot);
			}
			Money = Packet.inventory_changed().gold();
			++Changes;
			for (const portfolio::mmo::Gain& Gain : Packet.inventory_changed().gains())
			{
				Gains.push_back({ Gain.reason(), Gain.has_item() ? Gain.item().item_id() : 0, Gain.has_item() ? Gain.item().count() : 0, Gain.has_gold() ? Gain.gold() : 0 });
			}
			break;
		case portfolio::mmo::Packet::kEnchantResult:
			EnchantResults.push_back(Packet.enchant_result());
			break;
		case portfolio::mmo::Packet::kRequestResult:
			Waiting.erase(Packet.request_result().request_id());
			if (Packet.request_result().result() != portfolio::mmo::FAIL_REASON_NONE)
			{
				Failures.push_back({ Packet.request_result().request_id(), Packet.request_result().result() });
			}
			break;
		default:
			break;
		}
	}

	uint32_t FInventory::CountOf(uint32_t ItemId) const
	{
		uint32_t Count = 0;
		for (const auto& [Index, Slot] : Filled)
		{
			Count += Slot.item_id() == ItemId ? Slot.count() : 0;
		}
		return Count;
	}

	std::optional<uint32_t> FInventory::FirstSlotOf(uint32_t ItemId) const
	{
		for (const auto& [Index, Slot] : Filled)
		{
			if (Slot.item_id() == ItemId)
			{
				return Index;
			}
		}
		return std::nullopt;
	}

	bool FInventory::HasRoom(const MmoData::FGameData& Data, uint32_t ItemId) const
	{
		const portfolio::mmo::data::ItemsRow* Item = Data.Item(ItemId);
		if (!Item)
		{
			return false;
		}
		if (Item->stackable() && FirstSlotOf(ItemId))
		{
			return true;
		}
		return Filled.size() < Data.Constants.inventory_slots();
	}

	portfolio::mmo::Packet FInventory::UseItem(uint32_t Slot)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_use_item()->set_slot(Slot);
		Packet.mutable_use_item()->set_request_id(++NextRequest);
		Waiting.insert(NextRequest);
		return Packet;
	}

	portfolio::mmo::FailReason FInventory::CanEquip(const portfolio::mmo::data::ItemsRow& Item, uint32_t Class, uint32_t Level)
	{
		if (Item.kind() != portfolio::mmo::data::ITEM_KIND_EQUIPMENT)
		{
			return portfolio::mmo::FAIL_REASON_UNUSABLE_ITEM;
		}
		if (Item.has_level() && Level < Item.level())
		{
			return portfolio::mmo::FAIL_REASON_LEVEL_TOO_LOW;
		}
		if (Item.has_class_() && Item.class_() != Class)
		{
			return portfolio::mmo::FAIL_REASON_WRONG_CLASS;
		}
		return portfolio::mmo::FAIL_REASON_NONE;
	}

	FStatDelta FInventory::Compare(const MmoData::FGameData& Data, const portfolio::mmo::data::ItemsRow& Item) const
	{
		FStatDelta Delta{ static_cast<int32_t>(Item.attack()), static_cast<int32_t>(Item.defense()), static_cast<int32_t>(Item.max_hp()), static_cast<int32_t>(Item.max_mp()) };
		const auto Found = Equipped.find(static_cast<uint32_t>(Item.slot()) - 1);
		if (const portfolio::mmo::data::ItemsRow* Current = Found != Equipped.end() ? Data.Item(Found->second.item_id()) : nullptr)
		{
			Delta.Attack -= static_cast<int32_t>(Current->attack());
			Delta.Defense -= static_cast<int32_t>(Current->defense());
			Delta.MaxHp -= static_cast<int32_t>(Current->max_hp());
			Delta.MaxMp -= static_cast<int32_t>(Current->max_mp());
		}
		return Delta;
	}

	portfolio::mmo::Packet FInventory::Equip(uint32_t Slot)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_equip()->set_slot(Slot);
		Packet.mutable_equip()->set_request_id(++NextRequest);
		Waiting.insert(NextRequest);
		return Packet;
	}

	portfolio::mmo::Packet FInventory::Unequip(uint32_t EquipSlot)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_unequip()->set_equip_slot(EquipSlot);
		Packet.mutable_unequip()->set_request_id(++NextRequest);
		Waiting.insert(NextRequest);
		return Packet;
	}

	portfolio::mmo::Packet FInventory::Enchant(portfolio::mmo::ItemPlace Place, uint32_t Slot, uint32_t ScrollSlot)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_enchant()->set_place(Place);
		Packet.mutable_enchant()->set_slot(Slot);
		Packet.mutable_enchant()->set_scroll_slot(ScrollSlot);
		Packet.mutable_enchant()->set_request_id(++NextRequest);
		Waiting.insert(NextRequest);
		return Packet;
	}

	std::optional<double> FInventory::NextEnchantChance(const MmoData::FGameData& Data, uint32_t Enchant)
	{
		const portfolio::mmo::data::EnchantsRow* Next = Data.Enchant(Enchant + 1);
		return Next ? std::optional<double>(Next->chance()) : std::nullopt;
	}

	std::vector<portfolio::mmo::EnchantResult> FInventory::TakeEnchantResults()
	{
		return std::exchange(EnchantResults, {});
	}

	portfolio::mmo::Packet FInventory::PickUp(uint32_t EntityId)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_pick_up()->set_entity_id(EntityId);
		Packet.mutable_pick_up()->set_request_id(++NextRequest);
		Waiting.insert(NextRequest);
		return Packet;
	}

	portfolio::mmo::Packet FInventory::DropItem(uint32_t Slot, uint32_t Count)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_drop_item()->set_slot(Slot);
		Packet.mutable_drop_item()->set_count(Count);
		Packet.mutable_drop_item()->set_request_id(++NextRequest);
		Waiting.insert(NextRequest);
		return Packet;
	}

	std::vector<FItemGain> FInventory::TakeGains()
	{
		return std::exchange(Gains, {});
	}

	std::vector<FRequestFailure> FInventory::TakeFailures()
	{
		return std::exchange(Failures, {});
	}
}
