#include "World/Cooldowns.h"

#include <algorithm>
#include <cmath>

#include "World/Units.h"

namespace MmoWorld
{
	uint32_t FCooldowns::EndTick(uint32_t UsedTick, uint32_t CooldownMs)
	{
		return UsedTick + Units::TicksFromMilliseconds(CooldownMs);
	}

	uint32_t FCooldowns::End(uint32_t SkillId) const
	{
		const auto Found = Ends.find(SkillId);
		return Found != Ends.end() ? Found->second : 0;
	}

	bool FCooldowns::IsReady(uint32_t SkillId, double ServerTick) const
	{
		return Ready(End(SkillId), static_cast<uint32_t>(std::max(0.0, std::floor(ServerTick))));
	}

	double FCooldowns::Remaining(uint32_t SkillId, uint32_t CooldownMs, double ServerTick) const
	{
		const double Length = Units::TicksFromMilliseconds(CooldownMs);
		return Length > 0 ? std::clamp((End(SkillId) - ServerTick) / Length, 0.0, 1.0) : 0;
	}

	void FCooldowns::Predict(uint32_t SkillId, uint32_t UsedTick, uint32_t CooldownMs)
	{
		Predicted.emplace(SkillId, End(SkillId));
		Ends[SkillId] = EndTick(UsedTick, CooldownMs);
	}

	void FCooldowns::Revert()
	{
		if (Predicted)
		{
			Ends[Predicted->first] = Predicted->second;
			Predicted.reset();
		}
	}

	void FCooldowns::Apply(const portfolio::mmo::Cooldowns& Cooldowns)
	{
		for (const portfolio::mmo::Cooldown& Entry : Cooldowns.entries())
		{
			const uint32_t Key = Entry.potion() != 0 ? PotionKey(Entry.potion()) : Entry.skill_id();
			Ends[Key] = Entry.end_tick();
			if (Predicted && Predicted->first == Key)
			{
				Predicted.reset();
			}
		}
	}

	void FCooldowns::Reset()
	{
		Ends.clear();
		Predicted.reset();
	}
}
