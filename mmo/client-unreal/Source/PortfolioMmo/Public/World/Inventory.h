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

	/** 장비를 입었을 때 능력치가 바뀌는 양(34): 그 장비 칸에 입은 것과의 차이. */
	struct FStatDelta
	{
		int32_t Attack = 0;
		int32_t Defense = 0;
		int32_t MaxHp = 0;
		int32_t MaxMp = 0;
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
		FInventory() = default;

		/** bStorage면 창고(75)의 모델이다: Storage(전체)와 StorageChanged(바뀐 칸)만 반영하고 다른 패킷은 무시한다(골드 없음). */
		explicit FInventory(bool bInStorage) : bStorage(bInStorage) {}

		/** 월드를 떠날 때 비운다. */
		void Reset();

		/** Inventory, InventoryChanged, RequestResult를 반영한다. 다른 패킷은 무시한다. */
		void Apply(const portfolio::mmo::Packet& Packet);

		/** 빈 칸이 아닌 칸(칸 번호 → 칸). */
		const std::map<uint32_t, portfolio::mmo::ItemSlot>& Slots() const { return Filled; }

		/** 입은 장비(장비 칸 번호 = EquipSlot 값 − 1 → 칸. 34). */
		const std::map<uint32_t, portfolio::mmo::ItemSlot>& Worn() const { return Equipped; }

		/** 이 직업과 레벨이 그 장비를 입을 수 있는가(서버의 Equip과 같은 차례: 장비인지, 필요 레벨, 직업). 입을 수 있으면 NONE이다. */
		static portfolio::mmo::FailReason CanEquip(const portfolio::mmo::data::ItemsRow& Item, uint32_t Class, uint32_t Level);

		/** 그 장비를 입으면 능력치가 얼마나 바뀌는가: 테이블의 능력치에서 그 장비 칸에 지금 입은 것의 능력치를 뺀다(강화의 몫은 35). */
		FStatDelta Compare(const MmoData::FGameData& Data, const portfolio::mmo::data::ItemsRow& Item) const;

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

		/** PickUp(바닥 아이템을 줍기. 33)을 만든다. 번호는 UseItem과 같이 매긴다. */
		portfolio::mmo::Packet PickUp(uint32_t EntityId);

		/** DropItem(칸의 아이템을 Count개 떨어뜨리기. 33)을 만든다. */
		portfolio::mmo::Packet DropItem(uint32_t Slot, uint32_t Count);

		/** Equip(인벤토리 칸의 장비를 입기. 34)을 만든다. */
		portfolio::mmo::Packet Equip(uint32_t Slot);

		/** Unequip(장비 칸(EquipSlot 값)의 장비를 벗기. 34)을 만든다. */
		portfolio::mmo::Packet Unequip(uint32_t EquipSlot);

		/** Enchant(주문서 칸으로 장비를 강화하기. 35)를 만든다. */
		portfolio::mmo::Packet Enchant(portfolio::mmo::ItemPlace Place, uint32_t Slot, uint32_t ScrollSlot);

		/** Buy(상점에서 Shops의 아이템을 Count개 사기. 37)를 만든다. 상점이 하나라 NPC를 싣지 않는다. */
		portfolio::mmo::Packet Buy(uint32_t ItemId, uint32_t Count);

		/** StorageDeposit(인벤토리 칸의 아이템을 Count개 창고에 맡기기. 75)을 만든다. */
		portfolio::mmo::Packet Deposit(uint32_t Slot, uint32_t Count);

		/** StorageWithdraw(창고 칸의 아이템을 Count개 찾기. 75)를 만든다. */
		portfolio::mmo::Packet Withdraw(uint32_t StorageSlot, uint32_t Count);

		/** Sell(인벤토리 칸의 아이템을 Count개 팔기. 37)을 만든다. */
		portfolio::mmo::Packet Sell(uint32_t Slot, uint32_t Count);

		/** 지금 골드로 살 수 있는 가장 많은 수(골드 ÷ 값. 37). 상점에 없는 아이템은 0이다. 들어갈 자리는 서버가 본다. */
		uint32_t MaxBuy(const MmoData::FGameData& Data, uint32_t ItemId) const;

		/** 지금 수치의 장비를 한 단계 올리는 성공 확률(0–1). 더 올릴 수 없으면 nullopt. 1보다 작으면 실패할 때 장비가 사라지는 단계다. */
		static std::optional<double> NextEnchantChance(const MmoData::FGameData& Data, uint32_t Enchant);

		/** 지난번에 꺼낸 뒤로 온 강화의 결과(EnchantResult). */
		std::vector<portfolio::mmo::EnchantResult> TakeEnchantResults();

		/** 마지막으로 매긴 요청 번호. */
		uint32_t RequestId() const { return NextRequest; }

		/** 그 요청의 답을 기다리는 중이다. */
		bool IsWaiting(uint32_t RequestId) const { return Waiting.count(RequestId) > 0; }

		/** 답을 기다리는 요청이 하나라도 있다(자동 사냥이 물약의 답을 기다림. 40). */
		bool HasWaiting() const { return !Waiting.empty(); }

		/** 지난번에 꺼낸 뒤로 쌓인 "얻음" 사건(InventoryChanged의 gains만. 칸의 차이나 Inventory 전체로는 쌓지 않음). */
		std::vector<FItemGain> TakeGains();

		/** 지난번에 꺼낸 뒤로 쌓인 요청의 실패. */
		std::vector<FRequestFailure> TakeFailures();

	private:
		bool bStorage = false;
		std::map<uint32_t, portfolio::mmo::ItemSlot> Filled;
		std::map<uint32_t, portfolio::mmo::ItemSlot> Equipped;
		uint64_t Money = 0;
		uint32_t Changes = 0;
		uint32_t NextRequest = 0;
		std::set<uint32_t> Waiting;
		std::vector<FItemGain> Gains;
		std::vector<FRequestFailure> Failures;
		std::vector<portfolio::mmo::EnchantResult> EnchantResults;

		void Put(const portfolio::mmo::ItemSlot& Slot);
	};
}
