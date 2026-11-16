// 상호작용(World/의 Interaction)을 UE 없이 본다. 채집물(47), 바닥 아이템(33), NPC(37)의 종류와 다가가기를 본다.
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

	/** 실제 판단(KindOf). 채집물과 바닥 아이템은 데이터 없이도 종류가 정해진다. */
	EInteractKind TestKind(const MmoWorld::FEntity& Entity)
	{
		static const MmoData::FGameData NoData;
		return FInteraction::KindOf(Entity, NoData);
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
		const MmoWorld::FWorldState Near = World({ { 2, { 6, portfolio::mmo::ENTITY_KIND_GATHER_NODE } }, { 3, { 4, portfolio::mmo::ENTITY_KIND_GATHER_NODE } },
			{ 4, { 1, portfolio::mmo::ENTITY_KIND_PLAYER } }, { 5, { 2, portfolio::mmo::ENTITY_KIND_MONSTER } } });
		const std::optional<MmoWorld::FInteractTarget> Found = FInteraction::Nearest(Near, 0, 0, 10, TestKind);
		Expect(Found && Found->Id == 3 && Found->Kind == EInteractKind::Gather, "the nearest interactable inside 10 m is the candidate");
		Expect(!FInteraction::Nearest(World({ { 2, { 11, portfolio::mmo::ENTITY_KIND_GATHER_NODE } } }), 0, 0, 10, TestKind), "nothing beyond 10 m");
		Expect(!FInteraction::Nearest(World({ { 2, { 3, portfolio::mmo::ENTITY_KIND_MONSTER } } }), 0, 0, 10, TestKind), "monsters are not interactions");
	}

	/** 고른 것이 실행 거리 밖이면 다가가고, 안이고 선이 트이면 일을 부르고 끝난다. 벽 너머면 거리 안이어도 부르지 않는다. 나가면 그만둔다. */
	void WalkThenActInsideTheRangeAndInSight()
	{
		const MmoWorld::FWorldState Scene = World({ { 2, { 6, portfolio::mmo::ENTITY_KIND_GATHER_NODE } } });
		const MmoWorld::FFieldMap Open = Field(32);
		FInteraction Interaction;
		Interaction.Start({ 2, EInteractKind::Gather });
		const FInteractStep Far = Interaction.Update(Scene, Open, 0, 0, 3, TestKind);
		Expect(Far.Kind == FInteractStep::EKind::Approach && Far.Goal.X == 6 * M, "it walks toward a far target");
		const FInteractStep Close = Interaction.Update(Scene, Open, 4 * M, 0, 3, TestKind);
		Expect(Close.Kind == FInteractStep::EKind::Act && Close.Target.Id == 2 && !Interaction.IsPending(), "inside 3 m in sight it acts once");

		// 채집물 너머의 칸 (7, 0)에서 채집물(6, 0) 사이에는 벽이 없고, (4, 0)과 채집물 사이에는 벽(5)이 있다: 벽 너머 3 m 안에서는 멈추지 않고,
		// 벽을 돌아 3 m 안이고 선이 트인 곳에 와서야 채집한다.
		Interaction.Start({ 2, EInteractKind::Gather });
		const MmoWorld::FFieldMap Walled = Field(32, { 5 });
		Expect(Interaction.Update(Scene, Walled, 4 * M, 0, 3, TestKind).Kind == FInteractStep::EKind::Approach, "a wall in between keeps it walking");
		const FInteractStep Around = Interaction.Update(Scene, Walled, 8 * M, 0, 3, TestKind);
		Expect(Around.Kind == FInteractStep::EKind::Act && Around.Target.Kind == EInteractKind::Gather, "it gathers from the open side inside 3 m");

		Interaction.Start({ 9, EInteractKind::Gather });
		Expect(Interaction.Update(Scene, Open, 0, 0, 3, TestKind).Kind == FInteractStep::EKind::None && !Interaction.IsPending(), "a target that left ends it");
	}
}

namespace
{
	/** 바닥 아이템(33)은 줍기이고, 주인이 없거나 나이거나 주인만 줍는 시간이 지났을 때만 내가 주울 수 있다. NPC는 말하기이고 경비병(44)은 아니다. */
	void GroundItemsArePickedUpByTheirOwnerFirst()
	{
		MmoWorld::FEntity Item;
		Item.Info.set_kind(portfolio::mmo::ENTITY_KIND_GROUND_ITEM);
		MmoData::FGameData Data;
		portfolio::mmo::data::NpcsRow* Merchant = Data.Npcs.add_rows();
		Merchant->set_id(1);
		Merchant->set_role(portfolio::mmo::data::NPC_ROLE_SHOP);
		portfolio::mmo::data::NpcsRow* Guard = Data.Npcs.add_rows();
		Guard->set_id(3);
		Guard->set_role(portfolio::mmo::data::NPC_ROLE_GUARD);
		Expect(FInteraction::KindOf(Item, Data) == EInteractKind::PickUp, "a ground item is picked up");
		Expect(FInteraction::CanPickUp(Item.Info, 7, 0), "an item without an owner is anyone's");
		Item.Info.set_owner_player_id(7);
		Item.Info.set_owner_only_end_tick(200);
		Expect(FInteraction::CanPickUp(Item.Info, 7, 100), "the owner picks up at once");
		Expect(!FInteraction::CanPickUp(Item.Info, 8, 199.5), "others wait for the owner-only time");
		Expect(FInteraction::CanPickUp(Item.Info, 8, 200), "anyone picks up after the owner-only time");
		MmoWorld::FEntity Monster;
		Monster.Info.set_kind(portfolio::mmo::ENTITY_KIND_MONSTER);
		Expect(FInteraction::KindOf(Monster, Data) == EInteractKind::None, "a monster is not an interaction");
		MmoWorld::FEntity Npc;
		Npc.Info.set_kind(portfolio::mmo::ENTITY_KIND_NPC);
		Npc.Info.set_template_id(1);
		Expect(FInteraction::KindOf(Npc, Data) == EInteractKind::Talk, "an NPC is talked to");
		Npc.Info.set_template_id(3);
		Expect(FInteraction::KindOf(Npc, Data) == EInteractKind::None, "a guard is not talked to");
	}
}

namespace
{
	/** 채집물(47)은 채집이고, GatherNodes의 필요 레벨에 닿은 내 레벨만 채집할 수 있다. 모르는 채집물은 채집할 수 없다. */
	void GatherNodesNeedTheirLevel()
	{
		MmoData::FGameData Data;
		portfolio::mmo::data::GatherNodesRow* Oak = Data.GatherNodes.add_rows();
		Oak->set_id(4);
		Oak->set_level(15);
		MmoWorld::FEntity Node;
		Node.Info.set_kind(portfolio::mmo::ENTITY_KIND_GATHER_NODE);
		Node.Info.set_template_id(4);
		Expect(FInteraction::KindOf(Node, Data) == EInteractKind::Gather, "a gather node is gathered");
		Expect(!FInteraction::CanGather(Node.Info, Data, 14), "level 14 cannot gather a level 15 node");
		Expect(FInteraction::CanGather(Node.Info, Data, 15), "level 15 can");
		Node.Info.set_template_id(9);
		Expect(!FInteraction::CanGather(Node.Info, Data, 30), "an unknown node cannot be gathered");
	}
}

int main()
{
	GatherNodesNeedTheirLevel();
	GroundItemsArePickedUpByTheirOwnerFirst();
	TheNearestCandidateInsideThePickRange();
	WalkThenActInsideTheRangeAndInSight();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Interaction tests passed\n");
	return EXIT_SUCCESS;
}
