// World/Inventory(32)와 물약의 쿨다운 키를 UE 없이 컴파일해 확인한다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>

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

int main()
{
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
