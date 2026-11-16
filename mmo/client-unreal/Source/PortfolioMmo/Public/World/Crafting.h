#pragma once

// 제작(48)의 엔진 없는 판단: 제작법을 지금 만들 수 있는지와 모자란 것. 서버의 CraftSystem.Check와 같은 조건과 차례(필요 레벨, 재료, 골드,
// 재료를 뺀 뒤 결과가 들어갈 자리)다. 제작 창이 버튼과 붉은 줄을 정한다. Unity 클라이언트가 같은 구조를 C#으로 옮긴다.
#include <cstdint>
#include <vector>

#include "Data/GameData.h"
#include "World/Inventory.h"

namespace MmoWorld
{
	/** 제작법 하나의 판단. Materials는 제작법의 재료와 같은 차례로 가진 수다. */
	struct FCraftCheck
	{
		bool bLevel = true;
		std::vector<uint32_t> Have;
		std::vector<bool> Materials;
		bool bGold = true;
		bool bRoom = true;

		/** 서버가 답할 이유: 레벨 → 재료 → 골드 → 자리의 차례로 첫 모자람. 모두 되면 NONE이다. */
		portfolio::mmo::FailReason Reason() const;

		bool CanCraft() const { return Reason() == portfolio::mmo::FAIL_REASON_NONE; }
	};

	/** 내 인벤토리, 레벨로 그 제작법을 본다. 칸 수는 Constants의 인벤토리 칸 수다. */
	FCraftCheck CheckCraft(const portfolio::mmo::data::RecipesRow& Recipe, const FInventory& Inventory, const MmoData::FGameData& Data, uint32_t Level);
}
