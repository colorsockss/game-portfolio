#include "World/Party.h"

#include <algorithm>

namespace MmoWorld
{
	void FParty::Reset()
	{
		PartyId = 0;
		Leader = 0;
		List.clear();
		Pending.reset();
		++Changes;
	}

	void FParty::Apply(const portfolio::mmo::Packet& Packet)
	{
		switch (Packet.body_case())
		{
		case portfolio::mmo::Packet::kPartyState:
		{
			const portfolio::mmo::PartyState& State = Packet.party_state();
			// 남은 파티원은 받아 둔 체력과 위치를 잇는다.
			std::vector<FPartyMember> Next;
			for (const portfolio::mmo::PartyMember& Member : State.members())
			{
				const auto Old = std::find_if(List.begin(), List.end(), [&](const FPartyMember& Known) { return Known.Id == Member.id(); });
				FPartyMember Row = Old != List.end() ? *Old : FPartyMember{};
				Row.Id = Member.id();
				Row.Name = Member.name();
				Row.Class = Member.character_class();
				Next.push_back(Row);
			}
			PartyId = State.party_id();
			Leader = State.leader_id();
			List = std::move(Next);
			++Changes;
			break;
		}
		case portfolio::mmo::Packet::kPartyMemberVitals:
			for (const portfolio::mmo::PartyMemberVital& Vital : Packet.party_member_vitals().members())
			{
				for (FPartyMember& Member : List)
				{
					if (Member.Id == Vital.id())
					{
						Member.bVitals = true;
						Member.Hp = Vital.hp();
						Member.MaxHp = Vital.max_hp();
						Member.X = Vital.x();
						Member.Z = Vital.z();
					}
				}
			}
			++Changes;
			break;
		case portfolio::mmo::Packet::kPartyInvited:
			Pending = FPartyInvite{ Packet.party_invited().inviter_id(), Packet.party_invited().inviter_name(), Packet.party_invited().expire_tick() };
			++Changes;
			break;
		default:
			break;
		}
	}

	bool FParty::Contains(uint32_t EntityId) const
	{
		return std::any_of(List.begin(), List.end(), [EntityId](const FPartyMember& Member) { return Member.Id == EntityId; });
	}

	bool FParty::IsTargetable(const FWorldState& World, uint32_t EntityId) const
	{
		const auto Found = World.Entities().find(EntityId);
		return Contains(EntityId) && Found != World.Entities().end() && !Found->second.Info.dead();
	}

	std::vector<std::pair<int32_t, int32_t>> FParty::Positions(const FWorldState& World) const
	{
		std::vector<std::pair<int32_t, int32_t>> Result;
		for (const FPartyMember& Member : List)
		{
			if (Member.Id == World.SelfId())
			{
				continue;
			}
			const auto Seen = World.Entities().find(Member.Id);
			if (Seen != World.Entities().end())
			{
				Result.emplace_back(Seen->second.X, Seen->second.Z);
			}
			else if (Member.bVitals)
			{
				Result.emplace_back(Member.X, Member.Z);
			}
		}
		return Result;
	}

	void FParty::ExpireInvite(double ServerTick)
	{
		if (Pending && ServerTick >= Pending->ExpireTick)
		{
			ClearInvite();
		}
	}
}
