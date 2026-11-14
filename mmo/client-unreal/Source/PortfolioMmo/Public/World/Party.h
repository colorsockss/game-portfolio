#pragma once

// 내 파티와 받은 초대(엔진 없는 코드, 42). 서버의 PartyState(파티원 목록)와 PartyMemberVitals(1초마다 파티원의 체력과 위치), PartyInvited를 반영한다.
#include <cstdint>
#include <optional>
#include <string>
#include <utility>
#include <vector>

#include "Protocol/MmoPackets.h"
#include "World/WorldState.h"

namespace MmoWorld
{
	/** 파티원 하나. 체력과 위치는 마지막으로 받은 PartyMemberVitals의 것이다(아직 없으면 bVitals가 거짓). */
	struct FPartyMember
	{
		uint32_t Id = 0;
		std::string Name;
		portfolio::mmo::CharacterClass Class = portfolio::mmo::CHARACTER_CLASS_UNSPECIFIED;
		bool bVitals = false;
		uint32_t Hp = 0;
		uint32_t MaxHp = 0;
		int32_t X = 0;
		int32_t Z = 0;
	};

	/** 받은 초대(초대한 사람, 만료되는 서버 틱). */
	struct FPartyInvite
	{
		uint32_t InviterId = 0;
		std::string InviterName;
		uint32_t ExpireTick = 0;
	};

	class FParty
	{
	public:
		/** 로그아웃하거나 끊겼을 때 비운다. */
		void Reset();

		/** PartyState, PartyMemberVitals, PartyInvited를 반영한다. 다른 패킷은 무시한다. */
		void Apply(const portfolio::mmo::Packet& Packet);

		/** 파티 번호(없으면 0). */
		uint32_t Id() const { return PartyId; }
		uint32_t LeaderId() const { return Leader; }

		/** 들어온 차례대로의 파티원(나 포함, 첫째가 파티장). */
		const std::vector<FPartyMember>& Members() const { return List; }

		/** 그 개체가 내 파티원인가(나 포함). */
		bool Contains(uint32_t EntityId) const;

		/** 파티원이 월드 모델에 있는 살아 있는 개체(시야 안)인가. 파티원 칸으로 대상을 삼을 수 있는 때다. */
		bool IsTargetable(const FWorldState& World, uint32_t EntityId) const;

		/** 나를 뺀 파티원의 자리(지도의 점). 시야 안이면 개체의 자리, 밖이면 PartyMemberVitals의 자리다(아직 받지 못했으면 뺌). */
		std::vector<std::pair<int32_t, int32_t>> Positions(const FWorldState& World) const;

		/** 답을 기다리는 받은 초대. */
		const std::optional<FPartyInvite>& Invite() const { return Pending; }

		/** 답했거나 만료되는 틱이 지난 초대를 지운다. */
		void ClearInvite() { Pending.reset(); ++Changes; }
		void ExpireInvite(double ServerTick);

		/** 파티원, 체력, 초대가 바뀔 때마다 오른다(화면이 다시 그릴지 본다). */
		uint64_t Revision() const { return Changes; }

	private:
		uint32_t PartyId = 0;
		uint32_t Leader = 0;
		std::vector<FPartyMember> List;
		std::optional<FPartyInvite> Pending;
		uint64_t Changes = 0;
	};
}
