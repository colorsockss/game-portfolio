#include "Game/MmoEntityVisuals.h"

#include "Protocol/MmoPackets.h"

const FMmoEntityVisual* UMmoEntityVisuals::Find(int32 Kind, int32 Key) const
{
	return Rows.FindByPredicate([Kind, Key](const FMmoEntityVisual& Row) { return Row.Kind == Kind && Row.Key == Key; });
}

const FMmoPlaceholder* UMmoEntityVisuals::PlaceholderOf(int32 Kind) const
{
	const FMmoPlaceholder* Found = Placeholders.FindByPredicate([Kind](const FMmoPlaceholder& Row) { return Row.Kind == Kind; });
	return Found ? Found : (Placeholders.IsEmpty() ? nullptr : &Placeholders[0]);
}

int32 UMmoEntityVisuals::PlayerKind()
{
	return portfolio::mmo::ENTITY_KIND_PLAYER;
}

int32 UMmoEntityVisuals::MonsterKind()
{
	return portfolio::mmo::ENTITY_KIND_MONSTER;
}

int32 UMmoEntityVisuals::NpcKind()
{
	return portfolio::mmo::ENTITY_KIND_NPC;
}

int32 UMmoEntityVisuals::GatherNodeKind()
{
	return portfolio::mmo::ENTITY_KIND_GATHER_NODE;
}

int32 UMmoEntityVisuals::GroundItemKind()
{
	return portfolio::mmo::ENTITY_KIND_GROUND_ITEM;
}

int32 UMmoEntityVisuals::SummonKind()
{
	return portfolio::mmo::ENTITY_KIND_SUMMON;
}

int32 UMmoEntityVisuals::PetKind()
{
	return -1;
}

int32 UMmoEntityVisuals::KnightKey()
{
	return portfolio::mmo::CHARACTER_CLASS_KNIGHT;
}

int32 UMmoEntityVisuals::MageKey()
{
	return portfolio::mmo::CHARACTER_CLASS_MAGE;
}
