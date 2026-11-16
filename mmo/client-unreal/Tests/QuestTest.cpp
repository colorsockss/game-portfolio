// 퀘스트(50)의 모델(World/의 QuestState)을 UE 없이 본다: NPC의 표시, 모으기의 진행, 목표의 자리. 목표까지 걷기의 길은 PathFinderTest가 본다.
// run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>

#include "World/QuestState.h"
#include "World/Units.h"

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

	constexpr int32_t M = MmoWorld::Units::PerMeter;

	/** 칸 (x, z) m의 가운데. */
	MmoWorld::FPoint Cell(int32_t X, int32_t Z)
	{
		return { X * M + M / 2, Z * M + M / 2 };
	}

	/**
	 * 퀘스트 1 몬스터 5 잡기 셋, 2 재료 3201 모으기 둘(채집물 1이 줌), 3 부산물 3105 모으기 하나(몬스터 5가 떨어뜨림), 4 레벨 7, 5 투구 칸 입기.
	 * 몬스터 5의 무리는 (10, 0)과 (−30, 0), 채집물 1의 무리는 (0, 20)과 (0, −5), 퀘스트 NPC는 (−8, −16).
	 */
	MmoData::FGameData Data()
	{
		MmoData::FGameData Result;
		const auto Quest = [&Result](uint32_t Id, portfolio::mmo::data::QuestKind Kind, uint32_t Target, uint32_t Count)
		{
			portfolio::mmo::data::QuestsRow* Row = Result.Quests.add_rows();
			Row->set_id(Id);
			Row->set_kind(Kind);
			Row->set_target(Target);
			Row->set_count(Count);
		};
		Quest(1, portfolio::mmo::data::QUEST_KIND_KILL, 5, 3);
		Quest(2, portfolio::mmo::data::QUEST_KIND_COLLECT, 3201, 2);
		Quest(3, portfolio::mmo::data::QUEST_KIND_COLLECT, 3105, 1);
		Quest(4, portfolio::mmo::data::QUEST_KIND_LEVEL, 0, 7);
		Quest(5, portfolio::mmo::data::QUEST_KIND_EQUIP, 2, 1);
		const auto Spawn = [&Result](int32_t X, int32_t Z, uint32_t Monster, uint32_t Node)
		{
			portfolio::mmo::data::SpawnsRow* Row = Result.Spawns.add_rows();
			Row->set_x(X);
			Row->set_z(Z);
			if (Monster != 0)
			{
				Row->set_monster_id(Monster);
			}
			else
			{
				Row->set_gather_node_id(Node);
			}
		};
		Spawn(10, 0, 5, 0);
		Spawn(-30, 0, 5, 0);
		Spawn(0, 20, 0, 1);
		Spawn(0, -5, 0, 1);
		portfolio::mmo::data::GatherNodesRow* Pine = Result.GatherNodes.add_rows();
		Pine->set_id(1);
		Pine->set_item_id(3201);
		portfolio::mmo::data::MonstersRow* Wolf = Result.Monsters.add_rows();
		Wolf->set_id(5);
		Wolf->set_drop_group(2);
		portfolio::mmo::data::DropGroupsRow* Drops = Result.DropGroups.add_rows();
		Drops->set_id(2);
		Drops->add_items(3105);
		portfolio::mmo::data::NpcsRow* Giver = Result.Npcs.add_rows();
		Giver->set_role(portfolio::mmo::data::NPC_ROLE_QUEST);
		Giver->set_x(-8);
		Giver->set_z(-16);
		return Result;
	}

	MmoWorld::FQuestState State(uint32_t Completed, bool bAccepted, uint32_t Progress)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_quest_state()->set_completed(Completed);
		Packet.mutable_quest_state()->set_accepted(bAccepted);
		Packet.mutable_quest_state()->set_progress(Progress);
		MmoWorld::FQuestState Result;
		Result.Apply(Packet);
		return Result;
	}

	MmoWorld::FInventory Bag(uint32_t ItemId, uint32_t Count, bool bHelmet = false)
	{
		portfolio::mmo::Packet Packet;
		portfolio::mmo::ItemSlot* Slot = Packet.mutable_inventory()->add_slots();
		Slot->set_index(0);
		Slot->set_item_id(ItemId);
		Slot->set_count(Count);
		if (bHelmet)
		{
			portfolio::mmo::ItemSlot* Worn = Packet.mutable_inventory()->add_slots();
			Worn->set_place(portfolio::mmo::ITEM_PLACE_EQUIPMENT);
			Worn->set_index(1);
			Worn->set_item_id(1071);
			Worn->set_count(1);
		}
		MmoWorld::FInventory Inventory;
		Inventory.Apply(Packet);
		return Inventory;
	}

	/** NPC의 표시는 받을 수 있을 때와 끝낼 수 있을 때 바뀌고, 모두 끝내면 없다. 모으기의 진행은 가진 수를 따르고 장비 입기는 그 칸을 본다. */
	void TheMarkAndProgressFollowTheState()
	{
		const MmoData::FGameData Quests = Data();
		const MmoWorld::FInventory Empty = Bag(3001, 1);
		Expect(State(0, false, 0).Mark(Quests, Empty, 1) == MmoWorld::EQuestMark::CanAccept, "a new character can accept");
		Expect(State(0, true, 2).Mark(Quests, Empty, 1) == MmoWorld::EQuestMark::None, "two of three kills are not done");
		Expect(State(0, true, 3).Mark(Quests, Empty, 1) == MmoWorld::EQuestMark::CanComplete, "three kills can be completed");
		const MmoWorld::FQuestProgress One = State(1, true, 0).Progress(Quests, Bag(3201, 1), 1);
		Expect(One.Have == 1 && One.Need == 2 && !One.IsDone(), "collecting counts the bag");
		Expect(State(1, true, 0).Progress(Quests, Bag(3201, 9), 1).Have == 2, "collecting does not count past the need");
		Expect(State(3, true, 0).Mark(Quests, Empty, 7) == MmoWorld::EQuestMark::CanComplete, "the level is the current level");
		Expect(State(4, true, 0).Mark(Quests, Empty, 1) == MmoWorld::EQuestMark::None, "no helmet worn");
		Expect(State(4, true, 0).Mark(Quests, Bag(3001, 1, true), 1) == MmoWorld::EQuestMark::CanComplete, "any helmet completes the equip quest");
		Expect(State(5, false, 0).Mark(Quests, Empty, 1) == MmoWorld::EQuestMark::None && !State(5, false, 0).Next(Quests), "nothing is left after the last");
	}

	/** 목표는 가장 가까운 무리이고, 재료가 몬스터 부산물이면 그 몬스터의 무리다. 표시가 있으면 퀘스트 NPC, 레벨과 장비 입기는 없다. */
	void TheGoalIsTheNearestPlace()
	{
		const MmoData::FGameData Quests = Data();
		const MmoWorld::FInventory Empty = Bag(3001, 1);
		const std::optional<MmoWorld::FPoint> Wolves = State(0, true, 0).Goal(Quests, Empty, 1, Cell(-20, 0));
		Expect(Wolves && *Wolves == Cell(-30, 0), "the nearest of the two monster groups");
		const std::optional<MmoWorld::FPoint> Pines = State(1, true, 0).Goal(Quests, Empty, 1, Cell(0, 0));
		Expect(Pines && *Pines == Cell(0, -5), "the nearest gather group for the material");
		const std::optional<MmoWorld::FPoint> Pelts = State(2, true, 0).Goal(Quests, Empty, 1, Cell(20, 0));
		Expect(Pelts && *Pelts == Cell(10, 0), "a monster byproduct leads to the monster that drops it");
		const std::optional<MmoWorld::FPoint> Giver = State(0, false, 0).Goal(Quests, Empty, 1, Cell(0, 0));
		Expect(Giver && *Giver == Cell(-8, -16), "an acceptable quest leads to the giver");
		Expect(!State(3, true, 0).Goal(Quests, Empty, 1, Cell(0, 0)), "a level quest has no place");
		Expect(!State(4, true, 0).Goal(Quests, Empty, 1, Cell(0, 0)), "an equip quest has no place");
	}
}

int main()
{
	TheMarkAndProgressFollowTheState();
	TheGoalIsTheNearestPlace();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Quest tests passed\n");
	return EXIT_SUCCESS;
}
