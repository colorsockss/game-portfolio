#pragma once

// 상호작용(엔진 없는 코드). 받은 개체 가운데 고르는 거리(Constants.interact_pick_range) 안의 가장 가까운 "상호작용할 수 있는 것"을 후보로
// 답하고, 고른 것까지 걸어가 실행 거리(Constants.interact_range) 안이고 선이 트인 곳에서 그 종류의 일을 하게 한다. 무엇이 상호작용할 수
// 있는지(KindOf)는 그 기능의 항목이 더한다(바닥 아이템 33, NPC 37·48·50·75, 채집물 47). 지금은 바닥 아이템이 줍기, NPC가 말하기이고 나머지는 None이다.
// Unity 클라이언트가 같은 구조를 C#으로 옮긴다.
#include <cstdint>
#include <functional>
#include <optional>

#include "Data/GameData.h"
#include "World/FieldMap.h"
#include "World/PathFinder.h"
#include "World/WorldState.h"

namespace MmoWorld
{
	enum class EInteractKind : uint8_t
	{
		None,
		/** 바닥 아이템을 줍는다(33). */
		PickUp,
		/** 채집물을 채집한다(47). */
		Gather,
		/** NPC에게 말한다(37). */
		Talk,
	};

	/** 상호작용의 후보: 개체 번호와 종류. */
	struct FInteractTarget
	{
		uint32_t Id = 0;
		EInteractKind Kind = EInteractKind::None;
	};

	/** 고른 상호작용을 지금 할 일. Approach면 Goal(개체의 자리)까지 걷고, Act면 Target의 종류의 일을 한다. */
	struct FInteractStep
	{
		enum class EKind : uint8_t { None, Approach, Act };
		EKind Kind = EKind::None;
		FPoint Goal;
		FInteractTarget Target;
	};

	class FInteraction
	{
	public:
		/** 개체가 어떤 상호작용을 받는가. 시험은 시험용 종류를 넣는다. */
		using FKindOf = std::function<EInteractKind(const FEntity&)>;

		/**
		 * 지금의 판단: 바닥 아이템은 줍기(주인은 보지 않음. 내 것만 고르려면 CanPickUp을 함께 쓴 FKindOf를 넘김), NPC는 말하기(역할이 경비병인 NPC는 None. 44),
		 * 나머지는 None(47이 더함).
		 */
		static EInteractKind KindOf(const FEntity& Entity, const MmoData::FGameData& Data);

		/**
		 * 내가 지금 이 바닥 아이템을 주울 수 있는가(33): 주인이 없거나 나이거나, 주인만 줍는 시간이 끝나는 틱이 어림한 서버 틱보다 앞이다(서버의
		 * GroundItem.CanPickUp과 같음). 이름표의 흐림, 상호작용 버튼, 자동 사냥(40)이 함께 쓴다. 주인이 내 파티(PartyId, 없으면 0)여도 줍는다(42).
		 */
		static bool CanPickUp(const portfolio::mmo::EntityEnter& Item, uint32_t SelfId, double ServerTick, uint32_t PartyId = 0);

		/**
		 * (X, Z)에서 고르는 거리(m) 안의 가장 가까운 상호작용할 수 있는 개체(내 개체 제외). 거리가 같으면 번호가 작은 것이다. 없으면 nullopt.
		 */
		static std::optional<FInteractTarget> Nearest(const FWorldState& World, int32_t X, int32_t Z, double PickMeters, const FKindOf& Kind);

		/** 후보에게 상호작용하러 간다(Update가 이어 감). 이미 가던 것은 바꾼다. */
		void Start(const FInteractTarget& Target) { Pending = Target; }

		/** 가던 것을 그만둔다(손 이동 입력, 대상 바꿈). */
		void Cancel() { Pending.reset(); }

		bool IsPending() const { return Pending.has_value(); }

		/**
		 * (X, Z)에서 할 일: 개체가 실행 거리(m) 안이고 선이 트였으면 Act(그리고 끝남), 아니면 Approach. 개체가 나갔거나 더는 그 종류가 아니면
		 * 그만두고 None이다.
		 */
		FInteractStep Update(const FWorldState& World, const FFieldMap& Field, int32_t X, int32_t Z, double RangeMeters, const FKindOf& Kind);

	private:
		std::optional<FInteractTarget> Pending;
	};
}
