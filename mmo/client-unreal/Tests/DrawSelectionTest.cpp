// 그릴 캐릭터 고르기(World/DrawSelection, 59)를 UE 없이 본다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <unordered_set>
#include <vector>

#include "World/DrawSelection.h"
#include "World/WorldState.h"

namespace
{
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

	/** 번호 Id의 후보를 x축의 Meters m에 둔다. */
	MmoWorld::FDrawCandidate At(uint32_t Id, int32_t Meters)
	{
		return { Id, Meters * M, 0 };
	}

	bool Same(const MmoWorld::FDrawSelection& Selection, std::unordered_set<uint32_t> Expected)
	{
		return Selection.DrawnPlayers() == Expected;
	}

	/** 수 안이면 모두 그리고, 넘으면 멀리 있는 파티원, 나를 공격하는 캐릭터, 내 대상이 가까운 캐릭터보다 먼저 남는다. */
	void PartyAttackersAndTargetsOutrankCloserPlayers()
	{
		MmoWorld::FDrawSelection Selection;
		Selection.Update({ At(2, 3), At(3, 4) }, 0, 0, {}, 0, 3, 0.0);
		Expect(Same(Selection, { 2, 3 }), "every player is drawn under the limit");

		Selection.NoteAttack(6, 0.5);
		Selection.NoteAttack(0, 0.5);
		Selection.Update({ At(2, 3), At(3, 4), At(4, 5), At(5, 60), At(6, 70), At(7, 80) }, 0, 0, { 5 }, 7, 3, 1.0);
		Expect(Same(Selection, { 5, 6, 7 }), "the party member, the attacker and the target take the three places");
		Expect(!Selection.IsDrawn(2), "closer strangers wait");
	}

	/** 이미 그리던 캐릭터는 더 가까운 새 후보에게 밀리지 않고, 후보가 움직여도 1초마다의 다시 고르기에서 바뀌지 않는다. */
	void DrawnPlayersStayAndNothingFlickers()
	{
		MmoWorld::FDrawSelection Selection;
		Selection.Update({ At(2, 15), At(3, 16) }, 0, 0, {}, 0, 2, 0.0);
		for (int Step = 1; Step <= 30; ++Step)
		{
			const int32_t Near = Step % 5;
			Selection.Update({ At(2, 15), At(3, 16), At(4, Near), At(5, Near + 1) }, 0, 0, {}, 0, 2, Step * 0.1);
			Expect(Same(Selection, { 2, 3 }), "the drawn players stay while closer ones come and go");
		}
	}

	/** 다시 고르기는 1초에 한 번이다: 그리지 않던 캐릭터가 나를 치기 시작해도 다음 차례에 든다. 수가 줄면 그 자리에서 다시 고른다. */
	void ReselectingWaitsForTheNextSecondUnlessTheLimitShrinks()
	{
		MmoWorld::FDrawSelection Selection;
		const std::vector<MmoWorld::FDrawCandidate> Players{ At(2, 3), At(3, 4), At(4, 10) };
		Selection.Update(Players, 0, 0, {}, 0, 2, 0.0);
		Expect(Same(Selection, { 2, 3 }), "the two nearest are drawn");

		Selection.NoteAttack(4, 0.2);
		Selection.Update(Players, 0, 0, {}, 0, 2, 0.5);
		Expect(!Selection.IsDrawn(4), "an attacker waits for the next reselect");
		Selection.Update(Players, 0, 0, {}, 0, 2, 1.0);
		Expect(Same(Selection, { 4, 2 }), "the attacker comes in on the next reselect");

		Selection.Update(Players, 0, 0, {}, 0, 1, 1.2);
		Expect(Same(Selection, { 4 }), "a smaller limit trims at once");

		Selection.Update(Players, 0, 0, {}, 0, 1, 7.0);
		Expect(Same(Selection, { 4 }), "a drawn player stays after the attack memory ends");
		Selection.Update({ At(2, 3), At(3, 4), At(4, 10), At(5, 1) }, 0, 0, {}, 0, 1, 8.0);
		Expect(Same(Selection, { 4 }), "and a closer stranger still does not push it out");
	}

	/** 그리던 캐릭터가 나가 자리가 나면, 다시 고를 차례를 기다리지 않고 가까운 후보로 채운다. */
	void AFreedPlaceGoesToTheNearestAtOnce()
	{
		MmoWorld::FDrawSelection Selection;
		Selection.Update({ At(2, 15), At(3, 16), At(4, 5), At(5, 10) }, 0, 0, {}, 0, 2, 0.0);
		Expect(Same(Selection, { 4, 5 }), "the nearest two are drawn first");
		Selection.Update({ At(2, 15), At(3, 16), At(5, 10) }, 0, 0, {}, 0, 2, 0.1);
		Expect(Same(Selection, { 5, 2 }), "the freed place goes to the nearest waiting player");
	}

	/** 후보는 받은 다른 플레이어뿐이고, 몬스터·NPC는 늘 그린다. 소환수는 주인이 나이거나 그리는 플레이어일 때만 그린다. */
	void OnlyOtherPlayersCountAndSummonsFollowTheirOwners()
	{
		MmoWorld::FWorldState World;
		portfolio::mmo::Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(1);
		World.Apply(Entered, 0);
		portfolio::mmo::Packet Packet;
		const auto Add = [&Packet](uint32_t Id, portfolio::mmo::EntityKind Kind, int32_t Meters, uint32_t Owner = 0)
		{
			portfolio::mmo::EntityEnter* Entity = Packet.mutable_entities_enter()->add_entities();
			Entity->set_id(Id);
			Entity->set_kind(Kind);
			Entity->set_x(Meters * M);
			Entity->set_summon_owner_id(Owner);
		};
		Add(1, portfolio::mmo::ENTITY_KIND_PLAYER, 0);
		Add(2, portfolio::mmo::ENTITY_KIND_PLAYER, 2);
		Add(3, portfolio::mmo::ENTITY_KIND_PLAYER, 3);
		Add(10, portfolio::mmo::ENTITY_KIND_MONSTER, 1);
		Add(11, portfolio::mmo::ENTITY_KIND_NPC, 1);
		Add(20, portfolio::mmo::ENTITY_KIND_SUMMON, 2, 2);
		Add(21, portfolio::mmo::ENTITY_KIND_SUMMON, 3, 3);
		Add(22, portfolio::mmo::ENTITY_KIND_SUMMON, 0, 1);
		World.Apply(Packet, 0);

		const std::vector<MmoWorld::FDrawCandidate> Players = MmoWorld::FDrawSelection::Candidates(World);
		Expect(Players.size() == 2, "only the other players are candidates");
		MmoWorld::FDrawSelection Selection;
		Selection.Update(Players, 0, 0, {}, 0, 1, 0.0);
		Expect(Same(Selection, { 2 }), "the nearer player is drawn");
		Expect(Selection.Draws(World, 1) && Selection.Draws(World, 10) && Selection.Draws(World, 11), "I, monsters and NPCs are always drawn");
		Expect(Selection.Draws(World, 20) && Selection.Draws(World, 22), "summons of drawn players and mine are drawn");
		Expect(!Selection.Draws(World, 3) && !Selection.Draws(World, 21), "an undrawn player and its summon are not");
	}
}

int main()
{
	PartyAttackersAndTargetsOutrankCloserPlayers();
	DrawnPlayersStayAndNothingFlickers();
	ReselectingWaitsForTheNextSecondUnlessTheLimitShrinks();
	AFreedPlaceGoesToTheNearestAtOnce();
	OnlyOtherPlayersCountAndSummonsFollowTheirOwners();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("DrawSelection tests passed\n");
	return EXIT_SUCCESS;
}
