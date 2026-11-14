#include "World/SkillBook.h"

#include <algorithm>

namespace MmoWorld
{
	void FSkillBook::Reset()
	{
		Learned.clear();
		Bar.assign(portfolio::mmo::CONSTANT_QUICKSLOT_COUNT, portfolio::mmo::Quickslot());
		NewlyLearned.clear();
		++Changes;
	}

	void FSkillBook::Apply(const portfolio::mmo::Packet& Packet)
	{
		switch (Packet.body_case())
		{
		case portfolio::mmo::Packet::kLearnedSkills:
			Learned.clear();
			Learned.insert(Packet.learned_skills().skills().begin(), Packet.learned_skills().skills().end());
			break;
		case portfolio::mmo::Packet::kSkillLearned:
			Learned.insert(Packet.skill_learned().skill());
			NewlyLearned.push_back(Packet.skill_learned().skill());
			break;
		case portfolio::mmo::Packet::kQuickslots:
		{
			const auto& Slots = Packet.quickslots().slots();
			Bar.assign(portfolio::mmo::CONSTANT_QUICKSLOT_COUNT, portfolio::mmo::Quickslot());
			std::copy_n(Slots.begin(), std::min<int>(Slots.size(), portfolio::mmo::CONSTANT_QUICKSLOT_COUNT), Bar.begin());
			break;
		}
		default:
			return;
		}
		++Changes;
	}

	std::vector<uint32_t> FSkillBook::TakeLearned()
	{
		std::vector<uint32_t> Result;
		Result.swap(NewlyLearned);
		return Result;
	}

	std::vector<const portfolio::mmo::data::SkillsRow*> FSkillBook::ClassSkills(const MmoData::FGameData& Data, uint32_t Class)
	{
		std::vector<const portfolio::mmo::data::SkillsRow*> Result;
		for (const portfolio::mmo::data::SkillsRow& Row : Data.Skills.rows())
		{
			if (Row.class_() == Class)
			{
				Result.push_back(&Row);
			}
		}
		std::sort(Result.begin(), Result.end(), [](const auto* A, const auto* B) { return A->id() < B->id(); });
		return Result;
	}

	portfolio::mmo::Packet FSkillBook::SetQuickslot(uint32_t Index, portfolio::mmo::QuickslotKind Kind, uint32_t Id)
	{
		portfolio::mmo::Packet Packet;
		portfolio::mmo::SetQuickslot* Request = Packet.mutable_set_quickslot();
		Request->set_index(Index);
		Request->mutable_slot()->set_kind(Kind);
		Request->mutable_slot()->set_id(Kind == portfolio::mmo::QUICKSLOT_KIND_EMPTY ? 0 : Id);
		return Packet;
	}
}
