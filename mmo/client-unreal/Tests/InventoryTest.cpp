// World/Inventory(32)와 물약의 쿨다운 키를 UE 없이 컴파일해 확인한다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <optional>

#include "Data/GameData.h"
#include "World/Cooldowns.h"
#include "World/Inventory.h"

namespace
{
	int Failures = 0;

	void Expect(bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	}

	void AddSlot(google::protobuf::RepeatedPtrField<portfolio::mmo::ItemSlot>* Slots, uint32_t Index, uint32_t ItemId, uint32_t Count)
	{
		portfolio::mmo::ItemSlot* Slot = Slots->Add();
		Slot->set_index(Index);
		Slot->set_item_id(ItemId);
		Slot->set_count(Count);
	}

	/** 칸 둘의 인벤토리에서 전체·바뀜의 반영, 가진 수의 합, 들어갈 자리(빈 칸이 없을 때 이미 가진 겹치는 아이템은 있고 새 아이템은 없음). */
	void SlotsAndRoomFollowTheServer()
	{
		MmoData::FGameData Data;
		Data.Constants.set_inventory_slots(2);
		for (const auto& [Id, bStackable] : { std::pair<uint32_t, bool>{ 2001, true }, { 3001, true }, { 1001, false } })
		{
			portfolio::mmo::data::ItemsRow* Row = Data.Items.add_rows();
			Row->set_id(Id);
			Row->set_stackable(bStackable);
		}

		MmoWorld::FInventory Inventory;
		portfolio::mmo::Packet Whole;
		AddSlot(Whole.mutable_inventory()->mutable_slots(), 0, 2001, 3);
		Whole.mutable_inventory()->set_gold(5);
		Inventory.Apply(Whole);
		Expect(Inventory.CountOf(2001) == 3 && Inventory.Gold() == 5 && *Inventory.FirstSlotOf(2001) == 0, "Inventory fills the slots and gold");
		Expect(Inventory.HasRoom(Data, 1001) && Inventory.HasRoom(Data, 3001), "an empty slot takes anything");

		portfolio::mmo::Packet Changed;
		AddSlot(Changed.mutable_inventory_changed()->mutable_slots(), 1, 1001, 1);
		Changed.mutable_inventory_changed()->set_gold(5);
		Inventory.Apply(Changed);
		Expect(Inventory.HasRoom(Data, 2001), "a stackable item already held still fits when full");
		Expect(!Inventory.HasRoom(Data, 3001) && !Inventory.HasRoom(Data, 1001), "a new item does not fit when full");
		Expect(Inventory.TakeGains().empty(), "a change without gains is not an event");

		portfolio::mmo::Packet Emptied;
		AddSlot(Emptied.mutable_inventory_changed()->mutable_slots(), 0, 0, 0);
		Emptied.mutable_inventory_changed()->set_gold(9);
		portfolio::mmo::Gain* Gold = Emptied.mutable_inventory_changed()->add_gains();
		Gold->set_reason(portfolio::mmo::GAIN_REASON_DEV_COMMAND);
		Gold->set_gold(4);
		Inventory.Apply(Emptied);
		const std::vector<MmoWorld::FItemGain> Gains = Inventory.TakeGains();
		Expect(Inventory.CountOf(2001) == 0 && Inventory.Slots().size() == 1 && Inventory.Gold() == 9, "an item id 0 empties the slot");
		Expect(Gains.size() == 1 && Gains[0].Gold == 4 && Gains[0].Reason == portfolio::mmo::GAIN_REASON_DEV_COMMAND, "only the listed gains become events");

		Inventory.Apply(Whole);
		Expect(Inventory.TakeGains().empty(), "the whole Inventory is not an event");
	}

	/** 요청 번호는 1씩 오르고, RequestResult가 그 번호를 풀며 실패는 사건이 된다. Inventory(전체)는 기다리던 것을 모두 풀고 번호를 0부터 다시 센다. */
	void RequestsWaitForTheirResult()
	{
		MmoWorld::FInventory Inventory;
		const portfolio::mmo::Packet First = Inventory.UseItem(4);
		const portfolio::mmo::Packet Second = Inventory.UseItem(5);
		Expect(First.use_item().slot() == 4 && First.use_item().request_id() == 1 && Second.use_item().request_id() == 2, "request ids count up from 1");
		Expect(Inventory.IsWaiting(1) && Inventory.IsWaiting(2), "sent requests wait");

		portfolio::mmo::Packet Result;
		Result.mutable_request_result()->set_request_id(1);
		Result.mutable_request_result()->set_result(portfolio::mmo::FAIL_REASON_COOLDOWN);
		Inventory.Apply(Result);
		const std::vector<MmoWorld::FRequestFailure> Failed = Inventory.TakeFailures();
		Expect(!Inventory.IsWaiting(1) && Inventory.IsWaiting(2), "a result releases its request");
		Expect(Failed.size() == 1 && Failed[0].Reason == portfolio::mmo::FAIL_REASON_COOLDOWN, "a failed result is an event");

		portfolio::mmo::Packet Whole;
		Whole.mutable_inventory();
		Inventory.Apply(Whole);
		Expect(!Inventory.IsWaiting(2) && Inventory.UseItem(0).use_item().request_id() == 1, "the whole Inventory releases all and restarts the ids");
	}

	/** 물약의 쿨다운은 쓰는 종류의 키로 들어가 스킬의 쿨다운과 섞이지 않는다. */
	void PotionCooldownsUseTheirOwnKey()
	{
		MmoWorld::FCooldowns Cooldowns;
		portfolio::mmo::Cooldowns Packet;
		portfolio::mmo::Cooldown* Potion = Packet.add_entries();
		Potion->set_potion(1);
		Potion->set_end_tick(300);
		Cooldowns.Apply(Packet);
		Expect(Cooldowns.End(MmoWorld::FCooldowns::PotionKey(1)) == 300 && Cooldowns.End(1) == 0 && Cooldowns.End(MmoWorld::FCooldowns::PotionKey(2)) == 0,
			"a potion cooldown goes to its kind's key");
	}
}

namespace
{
	/** 장비(34): 입을 수 있는지(장비인지, 레벨, 직업)와, 입은 것과의 능력치 차이. 입은 장비는 장비 칸 쪽에 들어간다. */
	void EquipmentChecksAndCompares()
	{
		MmoData::FGameData Data;
		auto AddItem = [&Data](uint32_t Id, uint32_t Level, std::optional<uint32_t> Class, uint32_t Attack)
		{
			portfolio::mmo::data::ItemsRow* Row = Data.Items.add_rows();
			Row->set_id(Id);
			Row->set_kind(portfolio::mmo::data::ITEM_KIND_EQUIPMENT);
			Row->set_slot(portfolio::mmo::data::EQUIP_SLOT_WEAPON);
			Row->set_level(Level);
			if (Class)
			{
				Row->set_class_(*Class);
			}
			Row->set_attack(Attack);
			return Row;
		};
		const portfolio::mmo::data::ItemsRow& Old = *AddItem(1011, 1, 1, 6);
		const portfolio::mmo::data::ItemsRow& New = *AddItem(1021, 10, 1, 16);
		const portfolio::mmo::data::ItemsRow& Staff = *AddItem(1041, 1, 2, 7);
		portfolio::mmo::data::ItemsRow Potion;
		Potion.set_kind(portfolio::mmo::data::ITEM_KIND_CONSUMABLE);
		Expect(MmoWorld::FInventory::CanEquip(Potion, 1, 30) == portfolio::mmo::FAIL_REASON_UNUSABLE_ITEM, "a potion is not equipment");
		Expect(MmoWorld::FInventory::CanEquip(New, 1, 9) == portfolio::mmo::FAIL_REASON_LEVEL_TOO_LOW, "the level is checked");
		Expect(MmoWorld::FInventory::CanEquip(Staff, 1, 30) == portfolio::mmo::FAIL_REASON_WRONG_CLASS, "the class is checked");
		Expect(MmoWorld::FInventory::CanEquip(New, 1, 10) == portfolio::mmo::FAIL_REASON_NONE, "a matching piece can be worn");

		MmoWorld::FInventory Inventory;
		Expect(Inventory.Compare(Data, New).Attack == 16, "nothing worn compares against zero");
		portfolio::mmo::Packet Whole;
		portfolio::mmo::ItemSlot* Worn = Whole.mutable_inventory()->add_slots();
		Worn->set_place(portfolio::mmo::ITEM_PLACE_EQUIPMENT);
		Worn->set_index(0);
		Worn->set_item_id(Old.id());
		Worn->set_count(1);
		Inventory.Apply(Whole);
		Expect(Inventory.Worn().size() == 1 && Inventory.Slots().empty(), "worn pieces go to the equipment side");
		Expect(Inventory.Compare(Data, New).Attack == 10, "the difference subtracts what is worn in that slot");
		Expect(Inventory.Equip(4).equip().slot() == 4 && Inventory.Unequip(1).unequip().equip_slot() == 1, "equip and unequip carry their slots");
	}
}

namespace
{
	/** 강화(35): 다음 단계의 확률, 깨질 수 있는 단계(1보다 작음), 더 올릴 수 없음. EnchantResult는 사건으로 쌓인다. */
	void EnchantChancesComeFromTheTable()
	{
		MmoData::FGameData Data;
		for (uint32_t Level = 1; Level <= 9; ++Level)
		{
			portfolio::mmo::data::EnchantsRow* Row = Data.Enchants.add_rows();
			Row->set_id(Level);
			Row->set_chance(Level <= 3 ? 1.0 : 0.5);
		}
		Expect(*MmoWorld::FInventory::NextEnchantChance(Data, 2) == 1.0, "+3 is safe");
		Expect(*MmoWorld::FInventory::NextEnchantChance(Data, 3) == 0.5, "+4 can break");
		Expect(!MmoWorld::FInventory::NextEnchantChance(Data, 9), "+9 cannot go higher");
		MmoWorld::FInventory Inventory;
		portfolio::mmo::Packet Result;
		Result.mutable_enchant_result()->set_success(true);
		Result.mutable_enchant_result()->set_enchant(4);
		Inventory.Apply(Result);
		const std::vector<portfolio::mmo::EnchantResult> Results = Inventory.TakeEnchantResults();
		Expect(Results.size() == 1 && Results[0].enchant() == 4 && Inventory.TakeEnchantResults().empty(), "an enchant result is taken once");
	}
}

namespace
{
	/** 상점(37): 살 수 있는 가장 많은 수는 골드 ÷ 값(상점에 없으면 0), 사고파는 요청은 번호를 붙여 기다리는 중으로 둔다. */
	void ShopRequestsAndAffordableCounts()
	{
		MmoData::FGameData Data;
		portfolio::mmo::data::ShopsRow* Row = Data.Shops.add_rows();
		Row->set_item_id(2001);
		Row->set_price(40);
		MmoWorld::FInventory Inventory;
		portfolio::mmo::Packet Whole;
		Whole.mutable_inventory()->set_gold(130);
		Inventory.Apply(Whole);
		Expect(Inventory.MaxBuy(Data, 2001) == 3 && Inventory.MaxBuy(Data, 3001) == 0, "the affordable count is gold over price");
		const portfolio::mmo::Packet Buy = Inventory.Buy(2001, 2);
		Expect(Buy.buy().item_id() == 2001 && Buy.buy().count() == 2 && Inventory.IsWaiting(Buy.buy().request_id()), "Buy waits for its result");
		const portfolio::mmo::Packet Sell = Inventory.Sell(4, 1);
		Expect(Sell.sell().slot() == 4 && Sell.sell().request_id() == Buy.buy().request_id() + 1 && Inventory.IsWaiting(Sell.sell().request_id()), "Sell takes the next request id");
	}
}

int main()
{
	ShopRequestsAndAffordableCounts();
	EnchantChancesComeFromTheTable();
	EquipmentChecksAndCompares();
	SlotsAndRoomFollowTheServer();
	RequestsWaitForTheirResult();
	PotionCooldownsUseTheirOwnKey();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Inventory tests passed\n");
	return EXIT_SUCCESS;
}
