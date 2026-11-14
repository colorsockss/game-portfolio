#pragma once

// 내 스킬의 쿨다운(엔진 없는 코드). 서버의 Cooldowns를 그대로 두고, 시전 시간이 없는 스킬은 보낼 때 미리 돌렸다가 실패하면 되돌린다.
// 규칙(밀리초 → 틱의 올림, 끝나는 틱과 지금 틱의 비교)은 서버 테스트가 낸 비교 벡터(shared/vectors/cooldowns.tsv)로 검사한다.
#include <cstdint>
#include <optional>
#include <unordered_map>
#include <utility>

#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	class FCooldowns
	{
	public:
		/** 쓴 틱 + 쿨다운의 틱 수(밀리초를 올림)에 끝난다. 서버의 SkillSystem.CooldownEndTick과 같다. */
		static uint32_t EndTick(uint32_t UsedTick, uint32_t CooldownMs);

		/** 끝나는 틱부터 다시 쓸 수 있다. 서버의 SkillSystem.Ready와 같다. */
		static bool Ready(uint32_t EndTick, uint32_t Tick) { return Tick >= EndTick; }

		/** 스킬의 쿨다운이 끝나는 틱. 모르면 0. */
		uint32_t End(uint32_t SkillId) const;

		/** 어림한 서버 틱(소수는 버림)에 쓸 수 있는가. */
		bool IsReady(uint32_t SkillId, double ServerTick) const;

		/** 쿨다운의 남은 비율(0–1, 끝났으면 0). 쿨다운이 0이면 0. */
		double Remaining(uint32_t SkillId, uint32_t CooldownMs, double ServerTick) const;

		/** 시전 시간이 없는 스킬을 보낼 때 미리 돌린다. 되돌릴 옛 값을 하나 둔다(답을 기다리는 스킬은 하나). */
		void Predict(uint32_t SkillId, uint32_t UsedTick, uint32_t CooldownMs);

		/** 미리 돌린 쿨다운을 되돌린다(그 스킬의 실패가 옴). 미리 돌린 것이 없으면 하지 않는다. */
		void Revert();

		/** 서버의 값으로 맞춘다(들어올 때 전체, 그 뒤에는 바뀐 것). 그 스킬의 미리 돌린 값은 버린다. */
		void Apply(const portfolio::mmo::Cooldowns& Cooldowns);

		void Reset();

	private:
		std::unordered_map<uint32_t, uint32_t> Ends;
		/** 미리 돌린 스킬과 그 전의 끝나는 틱. */
		std::optional<std::pair<uint32_t, uint32_t>> Predicted;
	};
}
