#pragma once

// 퀘스트(50)의 엔진 없는 모델. 서버의 QuestState(끝낸 수, 받았는지, 센 수)를 반영하고, 지금 퀘스트의 진행(가진 수/필요한 수), 퀘스트 NPC의 표시,
// 목표의 자리를 답한다. 잡기와 제작은 서버가 센 수를, 모으기는 인벤토리의 가진 수를, 레벨과 장비 입기는 내 레벨과 입은 장비를 본다(서버와 같은 조건).
// 목표의 자리는 테이블에 두지 않고 Spawns·DropGroups·Npcs에서 내 자리에 가장 가까운 것을 구한다. Unity 클라이언트가 같은 구조를 C#으로 옮긴다.
#include <cstdint>
#include <optional>

#include "Data/GameData.h"
#include "Protocol/MmoPackets.h"
#include "World/Inventory.h"
#include "World/PathFinder.h"

namespace MmoWorld
{
	/** 퀘스트 NPC의 머리 위 표시. */
	enum class EQuestMark : uint8_t
	{
		None,
		/** 진행 중인 퀘스트가 없고 남은 것이 있다. */
		CanAccept,
		/** 받은 퀘스트의 조건을 채웠다. */
		CanComplete,
	};

	/** 지금 퀘스트의 진행. Need가 0이면 받은 퀘스트가 없다. */
	struct FQuestProgress
	{
		uint32_t Have = 0;
		uint32_t Need = 0;

		bool IsDone() const { return Need > 0 && Have >= Need; }
	};

	class FQuestState
	{
	public:
		/** 월드를 떠날 때 비운다. */
		void Reset();

		/** QuestState를 반영한다. 다른 패킷은 무시한다. */
		void Apply(const portfolio::mmo::Packet& Packet);

		uint32_t Completed() const { return Done; }
		bool IsAccepted() const { return bAccepted; }

		/** 상태가 바뀔 때마다 오른다. */
		uint32_t Version() const { return Changes; }

		/** 받은 퀘스트. 없으면 nullptr. */
		const portfolio::mmo::data::QuestsRow* Current(const MmoData::FGameData& Data) const;

		/** 다음에 받을(받았으면 받은) 차례의 퀘스트. 남은 것이 없으면 nullptr. */
		const portfolio::mmo::data::QuestsRow* Next(const MmoData::FGameData& Data) const;

		/** 받은 퀘스트의 진행(잡기·제작은 센 수, 모으기는 가진 수, 레벨은 지금 레벨, 장비 입기는 그 칸에 입었으면 1). */
		FQuestProgress Progress(const MmoData::FGameData& Data, const FInventory& Inventory, uint32_t Level) const;

		/** 퀘스트 NPC의 표시. */
		EQuestMark Mark(const MmoData::FGameData& Data, const FInventory& Inventory, uint32_t Level) const;

		/**
		 * 목표의 자리(1/32 m): 받을 수 있거나 끝낼 수 있으면 퀘스트 NPC, 아니면 잡기는 그 몬스터의 무리 가운데, 모으기는 그 재료를 주는 채집물의 무리 가운데
		 * (재료가 몬스터 부산물이면 그것을 떨어뜨리는 몬스터의 무리 가운데), 만들기는 제작 NPC이고 내 자리에 가장 가까운 것이다. 레벨과 장비 입기는 없다.
		 */
		std::optional<FPoint> Goal(const MmoData::FGameData& Data, const FInventory& Inventory, uint32_t Level, FPoint Here) const;

	private:
		uint32_t Done = 0;
		bool bAccepted = false;
		uint32_t Counted = 0;
		uint32_t Changes = 0;
	};
}
