#pragma once

// 자동 사냥(엔진 없는 코드, 40). Decide는 상태 없는 함수로 월드 모델과 입력에서 다음에 할 일 하나를 고르고, FAutoHuntState가 시작한 자리, 후보에서 뺀
// 대상과 그 끝나는 때, 대상에 가까워지는지를 재는 시간을 가진다. 서버에는 손으로 한 것과 같은 패킷이 간다(이동과 패킷으로 옮기는 것은 화면).
#include <cstdint>
#include <map>
#include <set>

#include "Data/GameData.h"
#include "World/Cooldowns.h"
#include "World/FieldMap.h"
#include "World/Inventory.h"
#include "World/PathFinder.h"
#include "World/SkillBook.h"
#include "World/WorldState.h"

namespace MmoWorld
{
	/** Decide가 고르는 일. Id는 물약이면 아이템 번호, 스킬이면 스킬 번호, 나머지는 개체 번호다. */
	enum class EAutoAction : uint8_t
	{
		/** 끈다(죽음). */
		Stop,
		UsePotion,
		UseSkill,
		/** 바닥 아이템을 주우러 간다(상호작용의 줍기). */
		PickUp,
		/** 대상으로 고른다. */
		SelectTarget,
		/** 대상을 칠 수 있는 곳까지 다가간다. */
		Approach,
		/** 기본 공격을 시작한다. */
		Attack,
		/** 아무것도 하지 않는다(기절, 진행 중인 일, 답을 기다림, 고를 것이 없음). */
		Wait,
	};

	struct FAutoDecision
	{
		EAutoAction Kind = EAutoAction::Wait;
		uint32_t Id = 0;

		bool operator==(const FAutoDecision& Other) const { return Kind == Other.Kind && Id == Other.Id; }
	};

	/** Decide의 입력. 판단에 쓰는 모델을 모두 빌려 온다. */
	struct FAutoHuntInput
	{
		const FWorldState& World;
		const MmoData::FGameData& Data;
		const FFieldMap& Field;
		const FInventory& Inventory;
		const FSkillBook& Skills;
		const FCooldowns& Cooldowns;
		/** 내 자리와 시작한 자리(1/32 m). */
		FPoint Self;
		FPoint Origin;
		/** 내 대상과 기본 공격 중인지(전투 모델). */
		uint32_t Target = 0;
		bool bAttacking = false;
		/** 보낸 스킬이나 물약(인벤토리의 요청)의 답을 기다리는 중이다. */
		bool bAwaiting = false;
		double NowSeconds = 0;
		/** 어림한 서버의 지금 틱. */
		double ServerTick = 0;
		/** 후보에서 뺀 개체. */
		const std::set<uint32_t>& Excluded;
		/** 내 파티 번호(없으면 0). 주인이 내 파티인 드롭도 줍는다(42). */
		uint32_t PartyId = 0;
	};

	class FAutoHunt
	{
	public:
		/**
		 * 다음에 할 일: 죽었으면 끄기 → 기절, 진행 중인 일, 답을 기다림이면 기다리기 → 체력이 기준 아래면 회복 스킬, 안 되면 체력 물약 → 마나가 기준 아래면 마나 물약 →
		 * 대상이 고를 수 없는 것이면 주울 것, 없으면 다음 대상 → 효과가 없는 강화 → 칠 수 없으면 다가가기 → 공격 시작 → 쿨다운이 돈 공격 스킬 → 기다리기.
		 * 스킬과 물약은 퀵슬롯에 올린 것만 앞자리부터 쓴다.
		 */
		static FAutoDecision Decide(const FAutoHuntInput& In);

		/** 자동 사냥이 대상으로 고를 수 있는 개체인가: 살아 있는 몬스터, 보스가 아님, 시작한 자리에서 범위 안, 후보에서 빼지 않음. */
		static bool IsHuntable(const FEntity& Entity, const FAutoHuntInput& In);
	};

	class FAutoHuntState
	{
	public:
		/** 지금 자리에서 켠다(뺀 것과 재던 시간을 비움). */
		void Start(FPoint Here);
		void Stop() { bOn = false; }
		bool IsOn() const { return bOn; }
		FPoint Origin() const { return StartPoint; }

		/** 그 개체를 Seconds초 동안 후보에서 뺀다(길이 없음, 공격할 수 없음, 가까워지지 못함). */
		void Exclude(uint32_t Id, double NowSeconds, double Seconds);

		/** 지금 후보에서 빠진 개체(끝난 것은 지움). */
		const std::set<uint32_t>& Excluded(double NowSeconds);

		/**
		 * 모델의 사건을 본다: 공격이나 스킬의 ActionFailed가 "공격할 수 없는 대상"이거나 내 시전이 같은 이유의 ProgressCancelled로 끝나면 그때의 대상(Target)을
		 * Seconds초 동안 뺀다. 다른 이유로는 빼지 않는다.
		 */
		void OnPacket(const portfolio::mmo::Packet& Packet, uint32_t SelfId, uint32_t Target, double NowSeconds, double Seconds);

		/**
		 * Decide의 결과를 본다: 다가가기를 이어 가는 동안 대상까지의 거리(1/32 m)가 줄지 않은 시간을 더하고, StallSeconds를 넘으면 그 대상을 ExcludeSeconds초
		 * 동안 빼고 true다. 다가가기가 아닌 결과(기다리기 등) 사이의 시간은 세지 않는다.
		 */
		bool Observe(const FAutoDecision& Decision, double Distance, double NowSeconds, double StallSeconds, double ExcludeSeconds);

	private:
		bool bOn = false;
		FPoint StartPoint;
		std::map<uint32_t, double> Until;
		std::set<uint32_t> Current;
		uint32_t Approaching = 0;
		double BestDistance = 0;
		double Stalled = 0;
		double LastApproach = -1;
	};
}
