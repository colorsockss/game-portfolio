#include "World/BossWatch.h"

#include <algorithm>

namespace MmoWorld
{
	void FBossWatch::Reset()
	{
		Areas.clear();
		Spots.clear();
		Appeared.clear();
	}

	void FBossWatch::Apply(const portfolio::mmo::Packet& Packet, double ServerTick, FChatLog& Chat, const MmoData::FGameData& Data, const MmoData::FStrings& Strings)
	{
		if (Packet.body_case() == portfolio::mmo::Packet::kAreaWarning)
		{
			const portfolio::mmo::AreaWarning& Warning = Packet.area_warning();
			Areas.push_back({ Warning.caster_id(), Warning.skill_id(), Warning.x(), Warning.z(), Warning.hit_tick(), ServerTick });
			return;
		}
		if (Packet.body_case() != portfolio::mmo::Packet::kFieldNotice)
		{
			return;
		}

		const portfolio::mmo::FieldNotice& Notice = Packet.field_notice();
		const portfolio::mmo::data::MonstersRow* Monster = Data.Monster(Notice.template_id());
		const std::string Name = Monster ? Strings.Get(Monster->name_key()) : std::string();
		std::erase_if(Spots, [&](const FBossSpot& Spot) { return Spot.TemplateId == Notice.template_id(); });
		switch (Notice.kind())
		{
		case portfolio::mmo::FIELD_NOTICE_KIND_BOSS_APPEARED:
			Spots.push_back({ Notice.template_id(), Notice.x(), Notice.z() });
			Chat.AddSystem(Strings.Format("notice.bossAppeared", { Name }));
			Appeared.push_back(Notice.template_id());
			break;
		case portfolio::mmo::FIELD_NOTICE_KIND_BOSS_PRESENT:
			Spots.push_back({ Notice.template_id(), Notice.x(), Notice.z() });
			break;
		case portfolio::mmo::FIELD_NOTICE_KIND_BOSS_DIED:
			Chat.AddSystem(Strings.Format("notice.bossDied", { Name }));
			break;
		default:
			break;
		}
	}

	void FBossWatch::Expire(double ServerTick, const FWorldState& World)
	{
		std::erase_if(Areas, [&](const FAreaWarning& Area)
		{
			const auto Caster = World.Entities().find(Area.CasterId);
			return ServerTick >= Area.HitTick || Caster == World.Entities().end() || Caster->second.Info.dead();
		});
	}

	std::vector<std::pair<int32_t, int32_t>> FBossWatch::Positions() const
	{
		std::vector<std::pair<int32_t, int32_t>> Result;
		for (const FBossSpot& Spot : Spots)
		{
			Result.emplace_back(Spot.X, Spot.Z);
		}
		return Result;
	}

	std::vector<uint32_t> FBossWatch::TakeAppeared()
	{
		return std::exchange(Appeared, {});
	}

	uint32_t FBossWatch::BossInView(const FWorldState& World, const MmoData::FGameData& Data)
	{
		for (const auto& [Id, Entity] : World.Entities())
		{
			if (Entity.Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER && !Entity.Info.dead())
			{
				const portfolio::mmo::data::MonstersRow* Row = Data.Monster(Entity.Info.template_id());
				if (Row && Row->kind() == portfolio::mmo::data::MONSTER_KIND_BOSS)
				{
					return Id;
				}
			}
		}
		return 0;
	}
}
