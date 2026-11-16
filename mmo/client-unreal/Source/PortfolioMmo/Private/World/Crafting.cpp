#include "World/Crafting.h"

#include <algorithm>
#include <map>

namespace MmoWorld
{
	portfolio::mmo::FailReason FCraftCheck::Reason() const
	{
		if (!bLevel)
		{
			return portfolio::mmo::FAIL_REASON_LEVEL_TOO_LOW;
		}
		if (std::find(Materials.begin(), Materials.end(), false) != Materials.end())
		{
			return portfolio::mmo::FAIL_REASON_NOT_ENOUGH_MATERIALS;
		}
		if (!bGold)
		{
			return portfolio::mmo::FAIL_REASON_NOT_ENOUGH_GOLD;
		}
		return bRoom ? portfolio::mmo::FAIL_REASON_NONE : portfolio::mmo::FAIL_REASON_INVENTORY_FULL;
	}

	FCraftCheck CheckCraft(const portfolio::mmo::data::RecipesRow& Recipe, const FInventory& Inventory, const MmoData::FGameData& Data, uint32_t Level)
	{
		FCraftCheck Check;
		Check.bLevel = Level >= Recipe.level();
		// 재료를 뺄 계획: 재료마다 칸의 차례로 필요한 만큼(서버의 CraftSystem.Removal과 같음). 다 비는 칸은 결과가 들어갈 수 있다.
		std::map<uint32_t, uint32_t> Removal;
		for (int Index = 0; Index < Recipe.materials_size(); ++Index)
		{
			const uint32_t Need = Index < Recipe.material_counts_size() ? Recipe.material_counts(Index) : 0;
			const uint32_t Have = Inventory.CountOf(Recipe.materials(Index));
			Check.Have.push_back(Have);
			Check.Materials.push_back(Have >= Need);
			uint32_t Left = Need;
			for (const auto& [Slot, Item] : Inventory.Slots())
			{
				if (Left == 0)
				{
					break;
				}
				if (Item.item_id() == Recipe.materials(Index))
				{
					const uint32_t Take = std::min(Left, Item.count());
					Removal[Slot] = Take;
					Left -= Take;
				}
			}
		}
		Check.bGold = Inventory.Gold() >= Recipe.gold();

		// 빈 칸(채워진 칸이 아닌 칸)이나 재료로 다 비는 칸이 있으면 들어간다. 물약은 같은 물약이 남는 칸에도 겹친다.
		const uint32_t SlotCount = Data.Constants.inventory_slots();
		bool bEmptied = Inventory.Slots().size() < SlotCount;
		bool bStacks = false;
		for (const auto& [Slot, Item] : Inventory.Slots())
		{
			const auto Removed = Removal.find(Slot);
			const bool bEmptiedHere = Removed != Removal.end() && Removed->second == Item.count();
			bEmptied = bEmptied || bEmptiedHere;
			bStacks = bStacks || (Recipe.kind() == portfolio::mmo::data::RECIPE_KIND_ITEM && Item.item_id() == Recipe.item_id() && !bEmptiedHere);
		}
		Check.bRoom = bEmptied || bStacks;
		return Check;
	}
}
