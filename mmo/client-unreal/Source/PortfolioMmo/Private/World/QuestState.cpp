#include "World/QuestState.h"

#include <algorithm>
#include <limits>
#include <vector>

#include "World/Units.h"

namespace MmoWorld
{
	namespace
	{
		/** 테이블의 자리(m)는 칸의 작은 모서리라 그 칸의 가운데로 바꾼다(서버의 놓기와 같음). */
		FPoint CellCenter(int32_t X, int32_t Z)
		{
			return { X * Units::PerMeter + Units::PerMeter / 2, Z * Units::PerMeter + Units::PerMeter / 2 };
		}

		std::optional<FPoint> Nearest(const std::vector<FPoint>& Points, FPoint Here)
		{
			std::optional<FPoint> Best;
			double BestDistance = std::numeric_limits<double>::max();
			for (const FPoint& Point : Points)
			{
				const double DX = static_cast<double>(Point.X) - Here.X;
				const double DZ = static_cast<double>(Point.Z) - Here.Z;
				if (DX * DX + DZ * DZ < BestDistance)
				{
					Best = Point;
					BestDistance = DX * DX + DZ * DZ;
				}
			}
			return Best;
		}

		std::optional<FPoint> NpcOf(const MmoData::FGameData& Data, portfolio::mmo::data::NpcRole Role)
		{
			for (const portfolio::mmo::data::NpcsRow& Npc : Data.Npcs.rows())
			{
				if (Npc.role() == Role)
				{
					return CellCenter(Npc.x(), Npc.z());
				}
			}
			return std::nullopt;
		}

		/** 그 몬스터들의 무리 가운데. */
		std::vector<FPoint> SpawnsOf(const MmoData::FGameData& Data, const std::vector<uint32_t>& Monsters)
		{
			std::vector<FPoint> Points;
			for (const portfolio::mmo::data::SpawnsRow& Spawn : Data.Spawns.rows())
			{
				if (Spawn.has_monster_id() && std::find(Monsters.begin(), Monsters.end(), Spawn.monster_id()) != Monsters.end())
				{
					Points.push_back(CellCenter(Spawn.x(), Spawn.z()));
				}
			}
			return Points;
		}
	}

	void FQuestState::Reset()
	{
		Done = 0;
		bAccepted = false;
		Counted = 0;
		++Changes;
	}

	void FQuestState::Apply(const portfolio::mmo::Packet& Packet)
	{
		if (Packet.body_case() == portfolio::mmo::Packet::kQuestState)
		{
			Done = Packet.quest_state().completed();
			bAccepted = Packet.quest_state().accepted();
			Counted = Packet.quest_state().progress();
			++Changes;
		}
	}

	const portfolio::mmo::data::QuestsRow* FQuestState::Current(const MmoData::FGameData& Data) const
	{
		return bAccepted ? Data.Quest(Done + 1) : nullptr;
	}

	const portfolio::mmo::data::QuestsRow* FQuestState::Next(const MmoData::FGameData& Data) const
	{
		return Data.Quest(Done + 1);
	}

	FQuestProgress FQuestState::Progress(const MmoData::FGameData& Data, const FInventory& Inventory, uint32_t Level) const
	{
		const portfolio::mmo::data::QuestsRow* Quest = Current(Data);
		if (!Quest)
		{
			return {};
		}
		switch (Quest->kind())
		{
		case portfolio::mmo::data::QUEST_KIND_KILL:
		case portfolio::mmo::data::QUEST_KIND_CRAFT: return { std::min(Counted, Quest->count()), Quest->count() };
		case portfolio::mmo::data::QUEST_KIND_COLLECT: return { std::min(Inventory.CountOf(Quest->target()), Quest->count()), Quest->count() };
		case portfolio::mmo::data::QUEST_KIND_LEVEL: return { std::min(Level, Quest->count()), Quest->count() };
		case portfolio::mmo::data::QUEST_KIND_EQUIP: return { Inventory.Worn().count(Quest->target() - 1) > 0 ? 1u : 0u, 1u };
		default: return { 0, Quest->count() };
		}
	}

	EQuestMark FQuestState::Mark(const MmoData::FGameData& Data, const FInventory& Inventory, uint32_t Level) const
	{
		if (!bAccepted)
		{
			return Next(Data) ? EQuestMark::CanAccept : EQuestMark::None;
		}
		return Progress(Data, Inventory, Level).IsDone() ? EQuestMark::CanComplete : EQuestMark::None;
	}

	std::optional<FPoint> FQuestState::Goal(const MmoData::FGameData& Data, const FInventory& Inventory, uint32_t Level, FPoint Here) const
	{
		if (Mark(Data, Inventory, Level) != EQuestMark::None)
		{
			return NpcOf(Data, portfolio::mmo::data::NPC_ROLE_QUEST);
		}
		const portfolio::mmo::data::QuestsRow* Quest = Current(Data);
		if (!Quest)
		{
			return std::nullopt;
		}
		switch (Quest->kind())
		{
		case portfolio::mmo::data::QUEST_KIND_KILL: return Nearest(SpawnsOf(Data, { Quest->target() }), Here);
		case portfolio::mmo::data::QUEST_KIND_COLLECT:
		{
			// 그 재료를 주는 채집물의 무리. 없으면 그것을 떨어뜨리는 몬스터의 무리다.
			std::vector<FPoint> Points;
			for (const portfolio::mmo::data::SpawnsRow& Spawn : Data.Spawns.rows())
			{
				const portfolio::mmo::data::GatherNodesRow* Node = Spawn.has_gather_node_id() ? Data.GatherNode(Spawn.gather_node_id()) : nullptr;
				if (Node && Node->item_id() == Quest->target())
				{
					Points.push_back(CellCenter(Spawn.x(), Spawn.z()));
				}
			}
			if (Points.empty())
			{
				std::vector<uint32_t> Droppers;
				for (const portfolio::mmo::data::MonstersRow& Monster : Data.Monsters.rows())
				{
					for (const portfolio::mmo::data::DropGroupsRow& Group : Data.DropGroups.rows())
					{
						if (Group.id() == Monster.drop_group() && std::find(Group.items().begin(), Group.items().end(), Quest->target()) != Group.items().end())
						{
							Droppers.push_back(Monster.id());
						}
					}
				}
				Points = SpawnsOf(Data, Droppers);
			}
			return Nearest(Points, Here);
		}
		case portfolio::mmo::data::QUEST_KIND_CRAFT: return NpcOf(Data, portfolio::mmo::data::NPC_ROLE_CRAFT);
		default: return std::nullopt;
		}
	}
}
