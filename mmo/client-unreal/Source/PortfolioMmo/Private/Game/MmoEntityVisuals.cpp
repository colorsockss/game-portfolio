#include "Game/MmoEntityVisuals.h"

#include "Protocol/MmoPackets.h"

const FMmoEntityVisual* UMmoEntityVisuals::Find(int32 Kind, int32 Key) const
{
	return Rows.FindByPredicate([Kind, Key](const FMmoEntityVisual& Row) { return Row.Kind == Kind && Row.Key == Key; });
}

int32 UMmoEntityVisuals::PlayerKind()
{
	return portfolio::mmo::ENTITY_KIND_PLAYER;
}

int32 UMmoEntityVisuals::MonsterKind()
{
	return portfolio::mmo::ENTITY_KIND_MONSTER;
}

int32 UMmoEntityVisuals::KnightKey()
{
	return portfolio::mmo::CHARACTER_CLASS_KNIGHT;
}

int32 UMmoEntityVisuals::MageKey()
{
	return portfolio::mmo::CHARACTER_CLASS_MAGE;
}
