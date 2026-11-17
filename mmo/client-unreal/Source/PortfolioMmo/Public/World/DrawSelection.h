#pragma once

// 그릴 캐릭터 고르기(엔진 없는 코드, 59). 받은 다른 플레이어 가운데 품질 단계의 그릴 캐릭터 수까지를 서버의 시야 인원 상한(55)과 같은 차례로 고른다.
#include <cstddef>
#include <cstdint>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#include "World/WorldState.h"

namespace MmoWorld
{
	/** 그릴 캐릭터의 후보 하나(받은 다른 플레이어): 번호와 받은 자리. */
	struct FDrawCandidate
	{
		uint32_t Id = 0;
		int32_t X = 0;
		int32_t Z = 0;
	};

	/**
	 * 차례는 파티원 → 나를 공격하는 캐릭터(AttackSeconds 안에 나를 대상으로 한 AttackSwing이나 Damaged의 공격자) → 내 대상 → 이미 그리던 캐릭터 → 새 후보이고,
	 * 같은 차례 안에서는 가까운 순(같으면 번호 순)이다. 수를 넘을 때만 1초마다 다시 고르고(이미 그리던 캐릭터가 새 후보보다 앞이라 경계에서 깜빡이지 않음),
	 * 그 사이에는 그리던 캐릭터를 지키되 빠진 자리는 바로 새 후보로 채운다. 수가 줄면(품질을 낮춤) 그 자리에서 다시 고른다.
	 * 수에는 다른 플레이어만 들고, 몬스터·NPC·채집물·바닥 아이템은 늘 그린다. 소환수는 주인을 그릴 때만 그린다.
	 */
	class FDrawSelection
	{
	public:
		/** 수를 넘을 때 다시 고르는 간격(초). 서버의 시야 인원 상한과 같다. */
		static constexpr double ReselectSeconds = 1.0;

		/** 나를 친 캐릭터를 "나를 공격하는 캐릭터"로 치는 시간(초). 서버의 전투 상태(5초)와 같다. */
		static constexpr double AttackSeconds = 5.0;

		/** 월드를 떠날 때 비운다. */
		void Reset();

		/** 나를 대상으로 한 공격(AttackSwing, Damaged)의 공격자. 번호 0(받지 않은 개체)은 버린다. */
		void NoteAttack(uint32_t Attacker, double NowSeconds);

		/** 받은 다른 플레이어(내 개체 뺌)를 후보로 그릴 캐릭터를 고친다. Party는 파티원의 번호, Target은 내 대상(0이면 없음)이다. */
		void Update(const std::vector<FDrawCandidate>& Players, int32_t SelfX, int32_t SelfZ, const std::vector<uint32_t>& Party, uint32_t Target, size_t Limit, double NowSeconds);

		/** 월드의 받은 다른 플레이어. */
		static std::vector<FDrawCandidate> Candidates(const FWorldState& World);

		/** 그리는 플레이어인가(Update가 고른 것). */
		bool IsDrawn(uint32_t PlayerId) const { return Drawn.contains(PlayerId); }

		/** 개체를 그리는가: 나는 늘, 다른 플레이어는 고른 것만, 소환수는 주인이 나이거나 고른 플레이어일 때만, 그 밖의 개체는 늘. */
		bool Draws(const FWorldState& World, uint32_t Id) const;

		const std::unordered_set<uint32_t>& DrawnPlayers() const { return Drawn; }

	private:
		std::unordered_set<uint32_t> Drawn;

		/** 나를 친 캐릭터 → 마지막으로 친 때(초). */
		std::unordered_map<uint32_t, double> Attackers;

		double NextReselect = 0.0;
		size_t LastLimit = 0;
	};
}
