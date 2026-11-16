// 제작(48)의 판단(World/의 Crafting)을 UE 없이 본다: 레벨, 재료, 골드, 재료를 뺀 뒤 결과가 들어갈 자리마다 모자란 것을 가리키는지.
// run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <initializer_list>
#include <tuple>

#include "World/Crafting.h"

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

	/** 칸 셋. 1은 물약 2002 둘을 만드는 제작법(재료 3001 셋, 50골드, 레벨 10), 2는 투구(종 3, 재료 3001 둘). */
	MmoData::FGameData Data()
	{
		MmoData::FGameData Result;
		Result.Constants.set_inventory_slots(3);
		portfolio::mmo::data::RecipesRow* Potion = Result.Recipes.add_rows();
		Potion->set_id(1);
		Potion->set_kind(portfolio::mmo::data::RECIPE_KIND_ITEM);
		Potion->set_item_id(2002);
		Potion->set_count(2);
		Potion->add_materials(3001);
		Potion->add_material_counts(3);
		Potion->set_gold(50);
		Potion->set_level(10);
		portfolio::mmo::data::RecipesRow* Helmet = Result.Recipes.add_rows();
		Helmet->set_id(2);
		Helmet->set_kind(portfolio::mmo::data::RECIPE_KIND_EQUIPMENT);
		Helmet->set_family(3);
		Helmet->add_materials(3001);
		Helmet->add_material_counts(2);
		Helmet->set_level(1);
		return Result;
	}

	/** (칸, 아이템, 수)들과 골드의 인벤토리. */
	MmoWorld::FInventory Bag(std::initializer_list<std::tuple<uint32_t, uint32_t, uint32_t>> Slots, uint64_t Gold)
	{
		portfolio::mmo::Packet Packet;
		for (const auto& [Index, ItemId, Count] : Slots)
		{
			portfolio::mmo::ItemSlot* Slot = Packet.mutable_inventory()->add_slots();
			Slot->set_index(Index);
			Slot->set_item_id(ItemId);
			Slot->set_count(Count);
		}
		Packet.mutable_inventory()->set_gold(Gold);
		MmoWorld::FInventory Inventory;
		Inventory.Apply(Packet);
		return Inventory;
	}

	/** 모자란 것마다 그 줄을 가리키고, 서버의 차례(레벨 → 재료 → 골드 → 자리)로 첫 이유를 답한다. */
	void EachShortageIsPointedAt()
	{
		const MmoData::FGameData Recipes = Data();
		const portfolio::mmo::data::RecipesRow& Potion = Recipes.Recipes.rows(0);
		const MmoWorld::FCraftCheck Poor = MmoWorld::CheckCraft(Potion, Bag({ { 0, 3001, 2 } }, 10), Recipes, 5);
		Expect(!Poor.bLevel && !Poor.Materials[0] && Poor.Have[0] == 2 && !Poor.bGold && Poor.bRoom, "level, materials and gold are short at once");
		Expect(Poor.Reason() == portfolio::mmo::FAIL_REASON_LEVEL_TOO_LOW, "the level is reported first");
		Expect(MmoWorld::CheckCraft(Potion, Bag({ { 0, 3001, 2 } }, 10), Recipes, 10).Reason() == portfolio::mmo::FAIL_REASON_NOT_ENOUGH_MATERIALS, "then the materials");
		Expect(MmoWorld::CheckCraft(Potion, Bag({ { 0, 3001, 3 } }, 10), Recipes, 10).Reason() == portfolio::mmo::FAIL_REASON_NOT_ENOUGH_GOLD, "then the gold");
		Expect(MmoWorld::CheckCraft(Potion, Bag({ { 0, 3001, 3 } }, 50), Recipes, 10).CanCraft(), "everything is there");
	}

	/** 결과가 들어갈 자리는 재료를 뺀 뒤로 본다: 다 비는 재료 칸은 자리가 되고, 물약은 같은 물약의 칸에 겹친다. */
	void RoomCountsTheSlotsTheMaterialsFree()
	{
		const MmoData::FGameData Recipes = Data();
		const portfolio::mmo::data::RecipesRow& Potion = Recipes.Recipes.rows(0);
		const portfolio::mmo::data::RecipesRow& Helmet = Recipes.Recipes.rows(1);
		Expect(MmoWorld::CheckCraft(Helmet, Bag({ { 0, 3001, 2 }, { 1, 1001, 1 }, { 2, 1002, 1 } }, 0), Recipes, 1).bRoom, "the emptied material slot takes the helmet");
		const MmoWorld::FCraftCheck Full = MmoWorld::CheckCraft(Helmet, Bag({ { 0, 3001, 5 }, { 1, 1001, 1 }, { 2, 1002, 1 } }, 0), Recipes, 1);
		Expect(!Full.bRoom && Full.Reason() == portfolio::mmo::FAIL_REASON_INVENTORY_FULL, "no slot is left when the materials remain");
		Expect(MmoWorld::CheckCraft(Potion, Bag({ { 0, 3001, 5 }, { 1, 2002, 1 }, { 2, 1002, 1 } }, 50), Recipes, 10).bRoom, "potions stack onto the same potion");
		Expect(MmoWorld::CheckCraft(Helmet, Bag({ { 0, 3001, 5 } }, 0), Recipes, 1).bRoom, "an empty slot takes it");
	}
}

int main()
{
	EachShortageIsPointedAt();
	RoomCountsTheSlotsTheMaterialsFree();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Crafting tests passed\n");
	return EXIT_SUCCESS;
}
