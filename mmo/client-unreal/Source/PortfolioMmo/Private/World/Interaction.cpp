#include "World/Interaction.h"

#include <limits>

#include "World/Units.h"

namespace MmoWorld
{
	EInteractKind FInteraction::KindOf(const FEntity& Entity)
	{
		// NPC는 말하기다(37. 역할마다 여는 창은 화면이 정함). shortcut: 경비병(44)도 NPC라 말하기가 되므로 44가 역할을 보고 뺀다.
		switch (Entity.Info.kind())
		{
		case portfolio::mmo::ENTITY_KIND_GROUND_ITEM: return EInteractKind::PickUp;
		case portfolio::mmo::ENTITY_KIND_NPC: return EInteractKind::Talk;
		default: return EInteractKind::None;
		}
	}

	bool FInteraction::CanPickUp(const portfolio::mmo::EntityEnter& Item, uint32_t SelfId, double ServerTick, uint32_t PartyId)
	{
		return Item.owner_case() == portfolio::mmo::EntityEnter::OWNER_NOT_SET
			|| (Item.owner_case() == portfolio::mmo::EntityEnter::kOwnerPlayerId && Item.owner_player_id() == SelfId)
			|| (Item.owner_case() == portfolio::mmo::EntityEnter::kOwnerPartyId && PartyId != 0 && Item.owner_party_id() == PartyId)
			|| ServerTick >= Item.owner_only_end_tick();
	}

	std::optional<FInteractTarget> FInteraction::Nearest(const FWorldState& World, int32_t X, int32_t Z, double PickMeters, const FKindOf& Kind)
	{
		const double Pick = PickMeters * Units::PerMeter;
		std::optional<FInteractTarget> Best;
		double BestDistance = std::numeric_limits<double>::max();
		for (const auto& [Id, Entity] : World.Entities())
		{
			if (Id == World.SelfId())
			{
				continue;
			}
			const EInteractKind EntityKind = Kind(Entity);
			if (EntityKind == EInteractKind::None)
			{
				continue;
			}
			const double DX = Entity.X - X;
			const double DZ = Entity.Z - Z;
			const double Distance = DX * DX + DZ * DZ;
			// 거리가 같으면 번호가 작은 쪽(맵의 차례와 상관없이 늘 같은 답).
			if (Distance <= Pick * Pick && (Distance < BestDistance || (Distance == BestDistance && Id < Best->Id)))
			{
				Best = FInteractTarget{ Id, EntityKind };
				BestDistance = Distance;
			}
		}
		return Best;
	}

	FInteractStep FInteraction::Update(const FWorldState& World, const FFieldMap& Field, int32_t X, int32_t Z, double RangeMeters, const FKindOf& Kind)
	{
		if (!Pending)
		{
			return {};
		}
		const auto Found = World.Entities().find(Pending->Id);
		if (Found == World.Entities().end() || Kind(Found->second) != Pending->Kind)
		{
			Pending.reset();
			return {};
		}

		const FEntity& Entity = Found->second;
		const double DX = Entity.X - X;
		const double DZ = Entity.Z - Z;
		const double Range = RangeMeters * Units::PerMeter;
		if (DX * DX + DZ * DZ <= Range * Range && Field.HasLine(X, Z, Entity.X, Entity.Z))
		{
			const FInteractTarget Target = *Pending;
			Pending.reset();
			return { FInteractStep::EKind::Act, {}, Target };
		}
		return { FInteractStep::EKind::Approach, { Entity.X, Entity.Z }, *Pending };
	}
}
