// 상호작용(World/의 Interaction)을 UE 없이 본다. 지금은 상호작용할 수 있는 종류가 없으므로 시험용 종류(몬스터를 채집물처럼)로 본다.
// run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include "World/Interaction.h"

namespace
{
	using MmoWorld::EInteractKind;
	using MmoWorld::FInteractStep;
	using MmoWorld::FInteraction;
	using portfolio::mmo::Packet;

	int Failures = 0;

	void Expect(bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	}

	constexpr int32_t M = 32;
	constexpr uint32_t Me = 1;

	/** 시험용 종류: 몬스터는 채집물, 나머지는 상호작용하지 않는다. */
	EInteractKind TestKind(const MmoWorld::FEntity& Entity)
	{
		return Entity.Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER ? EInteractKind::Gather : EInteractKind::None;
	}

	/** 원점의 나(1)와 (x m, 0)의 개체들. */
	MmoWorld::FWorldState World(const std::vector<std::pair<uint32_t, std::pair<int32_t, portfolio::mmo::EntityKind>>>& Others)
	{
		MmoWorld::FWorldState Result;
		Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(Me);
		Entered.mutable_enter_world_result()->set_tick(100);
		Result.Apply(Entered, 0);
		Packet Enter;
		portfolio::mmo::EntityEnter* Self = Enter.mutable_entities_enter()->add_entities();
		Self->set_id(Me);
		Self->set_kind(portfolio::mmo::ENTITY_KIND_PLAYER);
		for (const auto& [Id, Place] : Others)
		{
			portfolio::mmo::EntityEnter* Entity = Enter.mutable_entities_enter()->add_entities();
			Entity->set_id(Id);
			Entity->set_kind(Place.second);
			Entity->set_x(Place.first * M);
		}
		Result.Apply(Enter, 0);
		return Result;
	}

	/** 빈 Size m 필드. Walls의 x 칸(m)들은 z 전체가 벽이다. */
	MmoWorld::FFieldMap Field(uint32_t Size, std::vector<int32_t> Walls = {})
	{
		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(Size);
		Grid.set_depth(Size);
		const int32_t Min = -static_cast<int32_t>(Size) / 2;
		Grid.set_origin_x(Min);
		Grid.set_origin_z(Min);
		std::string Cells(static_cast<size_t>(Size) * Size, '\0');
		for (const int32_t X : Walls)
		{
			for (uint32_t Row = 0; Row < Size; ++Row)
			{
				Cells[Row * Size + static_cast<uint32_t>(X - Min)] = 1;
			}
		}
		Grid.set_cells(Cells);
		return *MmoWorld::FFieldMap::Make(Size, {}, Grid);
	}

	/** 후보는 고르는 거리 안의 가장 가까운 상호작용할 수 있는 것이고(상호작용하지 않는 개체는 더 가까워도 건너뜀), 거리 밖이면 없다. */
	void TheNearestCandidateInsideThePickRange()
	{
		const MmoWorld::FWorldState Near = World({ { 2, { 6, portfolio::mmo::ENTITY_KIND_MONSTER } }, { 3, { 4, portfolio::mmo::ENTITY_KIND_MONSTER } },
			{ 4, { 1, portfolio::mmo::ENTITY_KIND_PLAYER } } });
		const std::optional<MmoWorld::FInteractTarget> Found = FInteraction::Nearest(Near, 0, 0, 10, TestKind);
		Expect(Found && Found->Id == 3 && Found->Kind == EInteractKind::Gather, "the nearest interactable inside 10 m is the candidate");
		Expect(!FInteraction::Nearest(World({ { 2, { 11, portfolio::mmo::ENTITY_KIND_MONSTER } } }), 0, 0, 10, TestKind), "nothing beyond 10 m");
		Expect(!FInteraction::Nearest(Near, 0, 0, 10), "nothing is interactable yet");
	}

	/** 고른 것이 실행 거리 밖이면 다가가고, 안이고 선이 트이면 일을 부르고 끝난다. 벽 너머면 거리 안이어도 부르지 않는다. 나가면 그만둔다. */
	void WalkThenActInsideTheRangeAndInSight()
	{
		const MmoWorld::FWorldState Scene = World({ { 2, { 6, portfolio::mmo::ENTITY_KIND_MONSTER } } });
		const MmoWorld::FFieldMap Open = Field(32);
		FInteraction Interaction;
		Interaction.Start({ 2, EInteractKind::Gather });
		const FInteractStep Far = Interaction.Update(Scene, Open, 0, 0, 3, TestKind);
		Expect(Far.Kind == FInteractStep::EKind::Approach && Far.Goal.X == 6 * M, "it walks toward a far target");
		const FInteractStep Close = Interaction.Update(Scene, Open, 4 * M, 0, 3, TestKind);
		Expect(Close.Kind == FInteractStep::EKind::Act && Close.Target.Id == 2 && !Interaction.IsPending(), "inside 3 m in sight it acts once");

		Interaction.Start({ 2, EInteractKind::Gather });
		const FInteractStep Walled = Interaction.Update(Scene, Field(32, { 5 }), 4 * M, 0, 3, TestKind);
		Expect(Walled.Kind == FInteractStep::EKind::Approach, "a wall in between keeps it walking");

		Interaction.Start({ 9, EInteractKind::Gather });
		Expect(Interaction.Update(Scene, Open, 0, 0, 3, TestKind).Kind == FInteractStep::EKind::None && !Interaction.IsPending(), "a target that left ends it");
	}
}

int main()
{
	TheNearestCandidateInsideThePickRange();
	WalkThenActInsideTheRangeAndInSight();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Interaction tests passed\n");
	return EXIT_SUCCESS;
}
