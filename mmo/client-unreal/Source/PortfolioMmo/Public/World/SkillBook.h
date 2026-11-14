#pragma once

// 배운 스킬과 퀵슬롯(엔진 없는 코드, 36). 서버의 LearnedSkills(전체), SkillLearned(하나), Quickslots(전체)를 반영한다. 퀵슬롯은 미리 바꾸지 않고
// SetQuickslot을 보낸 뒤 Quickslots가 오면 바꾼다. 직업의 스킬 목록과 필요 레벨은 Skills 테이블에서 읽는다(수를 코드에 두지 않음).
#include <cstdint>
#include <set>
#include <vector>

#include "Data/GameData.h"
#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	class FSkillBook
	{
	public:
		/** 월드를 떠날 때 비운다. */
		void Reset();

		/** LearnedSkills, SkillLearned, Quickslots를 반영한다. 다른 패킷은 무시한다. */
		void Apply(const portfolio::mmo::Packet& Packet);

		bool IsLearned(uint32_t SkillId) const { return Learned.count(SkillId) > 0; }

		/** 퀵슬롯(CONSTANT_QUICKSLOT_COUNT 자리. Quickslots가 오기 전에는 모두 빈 자리). */
		const std::vector<portfolio::mmo::Quickslot>& Slots() const { return Bar; }

		/** 배운 스킬이나 퀵슬롯이 바뀔 때마다 오른다. 화면은 이것이 바뀌었을 때만 다시 채운다. */
		uint32_t Version() const { return Changes; }

		/** 지난번에 꺼낸 뒤로 배운 스킬(SkillLearned만. 들어올 때의 전체는 사건이 아님). */
		std::vector<uint32_t> TakeLearned();

		/** 직업의 스킬(번호 차례). 필요 레벨은 줄의 level이다. */
		static std::vector<const portfolio::mmo::data::SkillsRow*> ClassSkills(const MmoData::FGameData& Data, uint32_t Class);

		/** SetQuickslot을 만든다. Kind가 EMPTY면 그 자리를 비운다. */
		static portfolio::mmo::Packet SetQuickslot(uint32_t Index, portfolio::mmo::QuickslotKind Kind, uint32_t Id);

	private:
		std::set<uint32_t> Learned;
		std::vector<portfolio::mmo::Quickslot> Bar = std::vector<portfolio::mmo::Quickslot>(portfolio::mmo::CONSTANT_QUICKSLOT_COUNT);
		std::vector<uint32_t> NewlyLearned;
		uint32_t Changes = 0;
	};
}
