// 파티의 모델(World/Party, 42)과 파티가 주인인 바닥 아이템의 줍기를 UE 없이 본다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <string>

#include "World/Interaction.h"
#include "World/Party.h"

namespace
{
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

	Packet State(uint32_t PartyId, std::initializer_list<uint32_t> Members)
	{
		Packet Result;
		portfolio::mmo::PartyState* Body = Result.mutable_party_state();
		Body->set_party_id(PartyId);
		Body->set_leader_id(PartyId != 0 ? *Members.begin() : 0);
		for (const uint32_t Id : Members)
		{
			portfolio::mmo::PartyMember* Member = Body->add_members();
			Member->set_id(Id);
			Member->set_name("hero" + std::to_string(Id));
		}
		return Result;
	}

	Packet Vitals(uint32_t Id, uint32_t Hp, int32_t X)
	{
		Packet Result;
		portfolio::mmo::PartyMemberVital* Vital = Result.mutable_party_member_vitals()->add_members();
		Vital->set_id(Id);
		Vital->set_hp(Hp);
		Vital->set_max_hp(100);
		Vital->set_x(X);
		return Result;
	}

	/** 나(1)와 플레이어 2(4 m 동쪽)를 받은 월드. 3은 시야 밖이다. */
	MmoWorld::FWorldState World()
	{
		MmoWorld::FWorldState Result;
		Packet Entered;
		Entered.mutable_enter_world_result()->set_self_id(1);
		Result.Apply(Entered, 0);
		Packet Enter;
		for (const uint32_t Id : { 1u, 2u })
		{
			portfolio::mmo::EntityEnter* Entity = Enter.mutable_entities_enter()->add_entities();
			Entity->set_id(Id);
			Entity->set_kind(portfolio::mmo::ENTITY_KIND_PLAYER);
			Entity->set_x(Id == 2 ? 4 * M : 0);
		}
		Result.Apply(Enter, 0);
		return Result;
	}

	/** PartyState가 파티원과 파티장을 바꾸고, 남은 파티원은 받아 둔 체력과 위치를 잇는다. 빈 PartyState는 파티를 비운다. */
	void StatesReplaceMembersAndKeepVitals()
	{
		MmoWorld::FParty Party;
		Party.Apply(State(4, { 1, 2, 3 }));
		Party.Apply(Vitals(3, 40, 90 * M));
		Expect(Party.Id() == 4 && Party.LeaderId() == 1 && Party.Members().size() == 3 && Party.Members()[2].Name == "hero3", "the state lists the members");
		Party.Apply(State(4, { 2, 3 }));
		Expect(Party.LeaderId() == 2 && Party.Members()[1].bVitals && Party.Members()[1].Hp == 40, "a remaining member keeps its vitals");
		Expect(!Party.Contains(1) && Party.Contains(3), "membership follows the state");
		Party.Apply(State(0, {}));
		Expect(Party.Id() == 0 && Party.Members().empty(), "an empty state clears the party");
	}

	/** 시야 밖의 파티원은 대상이 되지 않고, 지도의 자리는 시야 안이면 개체의, 밖이면 PartyMemberVitals의 것이다(받지 못했으면 뺌). */
	void OnlySeenMembersAreTargetable()
	{
		const MmoWorld::FWorldState Seen = World();
		MmoWorld::FParty Party;
		Party.Apply(State(4, { 1, 2, 3, 5 }));
		Party.Apply(Vitals(3, 40, 90 * M));
		Expect(Party.IsTargetable(Seen, 2) && !Party.IsTargetable(Seen, 3), "only seen members are targetable");
		const auto Positions = Party.Positions(Seen);
		Expect(Positions.size() == 2 && Positions[0].first == 4 * M && Positions[1].first == 90 * M, "positions use the entity or the vitals");
	}

	/** 받은 초대는 만료되는 틱이 지나면 지워진다. */
	void InvitesExpire()
	{
		MmoWorld::FParty Party;
		Packet Invited;
		Invited.mutable_party_invited()->set_inviter_id(2);
		Invited.mutable_party_invited()->set_inviter_name("hero2");
		Invited.mutable_party_invited()->set_expire_tick(700);
		Party.Apply(Invited);
		Party.ExpireInvite(699);
		Expect(Party.Invite() && Party.Invite()->InviterName == "hero2", "the invite waits for an answer");
		Party.ExpireInvite(700);
		Expect(!Party.Invite(), "an expired invite is dropped");
	}

	/** 주인이 내 파티인 바닥 아이템은 주인만 줍는 시간 안에도 주울 수 있고, 다른 파티의 것은 그 시간이 지나야 줍는다. */
	void PartyOwnedItemsArePickable()
	{
		portfolio::mmo::EntityEnter Item;
		Item.set_kind(portfolio::mmo::ENTITY_KIND_GROUND_ITEM);
		Item.set_owner_party_id(7);
		Item.set_owner_only_end_tick(200);
		Expect(MmoWorld::FInteraction::CanPickUp(Item, 1, 100, 7), "my party picks up at once");
		Expect(!MmoWorld::FInteraction::CanPickUp(Item, 1, 100, 8) && !MmoWorld::FInteraction::CanPickUp(Item, 1, 100), "others wait");
		Expect(MmoWorld::FInteraction::CanPickUp(Item, 1, 200, 8), "anyone picks up after the owner-only time");
	}
}

int main()
{
	StatesReplaceMembersAndKeepVitals();
	OnlySeenMembersAreTargetable();
	InvitesExpire();
	PartyOwnedItemsArePickable();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Party tests passed\n");
	return EXIT_SUCCESS;
}
