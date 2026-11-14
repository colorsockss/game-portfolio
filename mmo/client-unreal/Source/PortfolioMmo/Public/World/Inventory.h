#pragma once

// 내 인벤토리(엔진 없는 코드, 32). 서버의 Inventory(전체)와 InventoryChanged(바뀐 칸, 골드, 새로 얻은 것)를 반영하고, 요청 번호가 있는
// 요청(UseItem)의 번호를 매겨 답(RequestResult)이 올 때까지 기다리는 중으로 둔다. 화면은 얻은 것과 실패의 사건을 꺼내 알림을 띄운다.
#include <cstdint>
#include <map>
#include <optional>
#include <set>
#include <vector>

#include "Data/GameData.h"
#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	/** 새로 얻은 것 하나(InventoryChanged의 gains). 아이템이면 ItemId와 Count, 골드면 Gold다. */
	struct FItemGain
	{
		portfolio::mmo::GainReason Reason = portfolio::mmo::GAIN_REASON_UNSPECIFIED;
		uint32_t ItemId = 0;
		uint32_t Count = 0;
		uint64_t Gold = 0;
	};

	/** 요청 하나의 실패(RequestResult). */
	struct FRequestFailure
	{
		uint32_t RequestId = 0;
		portfolio::mmo::FailReason Reason = portfolio::mmo::FAIL_REASON_NONE;
	};

	class FInventory
	{
	public:
		/** 월드를 떠날 때 비운다. */
		void Reset();

		/** Inventory, InventoryChanged, RequestResult를 반영한다. 다른 패킷은 무시한다. */
		void Apply(const portfolio::mmo::Packet& Packet);

		/** 빈 칸이 아닌 칸(칸 번호 → 칸). */
		const std::map<uint32_t, portfolio::mmo::ItemSlot>& Slots() const { return Filled; }

		uint64_t Gold() const { return Money; }

		/** 칸이나 골드가 바뀔 때마다 오른다. 화면은 이것이 바뀌었을 때만 다시 채운다. */
		uint32_t Version() const { return Changes; }

		/** 그 아이템을 가진 수의 합. */
		uint32_t CountOf(uint32_t ItemId) const;

		/** 그 아이템이 든 첫 칸. 없으면 nullopt. */
		std::optional<uint32_t> FirstSlotOf(uint32_t ItemId) const;

		/** 그 아이템 하나가 들어갈 자리가 있는가: 겹치는 아이템은 같은 아이템이 든 칸이나 빈 칸, 겹치지 않는 아이템은 빈 칸(서버의 넣기와 같은 규칙). */
		bool HasRoom(const MmoData::FGameData& Data, uint32_t ItemId) const;

		/** UseItem을 만든다. 요청 번호를 1씩 올려 붙이고 답이 올 때까지 기다리는 중으로 둔다. 번호는 RequestId()로 읽는다. */
		portfolio::mmo::Packet UseItem(uint32_t Slot);

		/** 마지막으로 매긴 요청 번호. */
		uint32_t RequestId() const { return NextRequest; }

		/** 그 요청의 답을 기다리는 중이다. */
		bool IsWaiting(uint32_t RequestId) const { return Waiting.count(RequestId) > 0; }

		/** 지난번에 꺼낸 뒤로 쌓인 "얻음" 사건(InventoryChanged의 gains만. 칸의 차이나 Inventory 전체로는 쌓지 않음). */
		std::vector<FItemGain> TakeGains();

		/** 지난번에 꺼낸 뒤로 쌓인 요청의 실패. */
		std::vector<FRequestFailure> TakeFailures();

	private:
		std::map<uint32_t, portfolio::mmo::ItemSlot> Filled;
		uint64_t Money = 0;
		uint32_t Changes = 0;
		uint32_t NextRequest = 0;
		std::set<uint32_t> Waiting;
		std::vector<FItemGain> Gains;
		std::vector<FRequestFailure> Failures;

		void Put(const portfolio::mmo::ItemSlot& Slot);
	};
}
