#include "World/DrawSelection.h"

#include <algorithm>
#include <tuple>

namespace MmoWorld
{
	void FDrawSelection::Reset()
	{
		Drawn.clear();
		Attackers.clear();
		NextReselect = 0.0;
		LastLimit = 0;
	}

	void FDrawSelection::NoteAttack(uint32_t Attacker, double NowSeconds)
	{
		if (Attacker != 0)
		{
			Attackers[Attacker] = NowSeconds;
		}
	}

	void FDrawSelection::Update(const std::vector<FDrawCandidate>& Players, int32_t SelfX, int32_t SelfZ, const std::vector<uint32_t>& Party, uint32_t Target, size_t Limit, double NowSeconds)
	{
		std::erase_if(Attackers, [NowSeconds](const auto& Pair) { return NowSeconds - Pair.second > AttackSeconds; });
		std::unordered_set<uint32_t> Present;
		for (const FDrawCandidate& Player : Players)
		{
			Present.insert(Player.Id);
		}
		std::erase_if(Drawn, [&Present](uint32_t Id) { return !Present.contains(Id); });

		const bool bLimitChanged = Limit != LastLimit;
		LastLimit = Limit;
		if (Players.size() <= Limit)
		{
			Drawn = std::move(Present);
			return;
		}

		// (차례, 거리의 제곱, 번호)로 정렬한다. 차례: 0 파티원, 1 나를 공격하는 캐릭터, 2 내 대상, 3 그리던 캐릭터, 4 새 후보.
		std::vector<std::tuple<int, int64_t, uint32_t>> Ranked;
		Ranked.reserve(Players.size());
		for (const FDrawCandidate& Player : Players)
		{
			const int Rank = std::find(Party.begin(), Party.end(), Player.Id) != Party.end() ? 0
				: Attackers.contains(Player.Id) ? 1
				: Player.Id == Target ? 2
				: Drawn.contains(Player.Id) ? 3
				: 4;
			const int64_t DX = static_cast<int64_t>(Player.X) - SelfX;
			const int64_t DZ = static_cast<int64_t>(Player.Z) - SelfZ;
			Ranked.emplace_back(Rank, DX * DX + DZ * DZ, Player.Id);
		}
		std::sort(Ranked.begin(), Ranked.end());

		if (NowSeconds >= NextReselect || bLimitChanged || Drawn.size() > Limit)
		{
			Drawn.clear();
			for (size_t Index = 0; Index < Limit; ++Index)
			{
				Drawn.insert(std::get<2>(Ranked[Index]));
			}
			NextReselect = NowSeconds + ReselectSeconds;
			return;
		}

		// 다시 고르는 사이: 그리던 캐릭터는 그대로 두고, 빈자리만 차례대로 채운다.
		for (const auto& [Rank, Distance, Id] : Ranked)
		{
			if (Drawn.size() >= Limit)
			{
				break;
			}
			Drawn.insert(Id);
		}
	}

	std::vector<FDrawCandidate> FDrawSelection::Candidates(const FWorldState& World)
	{
		std::vector<FDrawCandidate> Players;
		for (const auto& [Id, Entity] : World.Entities())
		{
			if (Id != World.SelfId() && Entity.Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER)
			{
				Players.push_back({ Id, Entity.X, Entity.Z });
			}
		}
		return Players;
	}

	bool FDrawSelection::Draws(const FWorldState& World, uint32_t Id) const
	{
		if (Id == World.SelfId())
		{
			return true;
		}
		const auto Found = World.Entities().find(Id);
		if (Found == World.Entities().end())
		{
			return false;
		}
		const portfolio::mmo::EntityEnter& Info = Found->second.Info;
		if (Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER)
		{
			return Drawn.contains(Id);
		}
		if (Info.kind() == portfolio::mmo::ENTITY_KIND_SUMMON)
		{
			return Info.summon_owner_id() == World.SelfId() || Drawn.contains(Info.summon_owner_id());
		}
		return true;
	}
}
