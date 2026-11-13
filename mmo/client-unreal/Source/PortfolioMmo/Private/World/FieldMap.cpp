#include "World/FieldMap.h"

#include <algorithm>

#include "World/Units.h"

namespace MmoWorld
{
	std::optional<FFieldMap> FFieldMap::Make(uint32_t FieldSize, const google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow>& Rows)
	{
		if (FieldSize == 0 || FieldSize % 2 != 0 || FieldSize > 2u * portfolio::mmo::CONSTANT_MAP_HALF_EXTENT_METERS)
		{
			return std::nullopt;
		}

		FFieldMap Map;
		Map.Size = static_cast<int32_t>(FieldSize);
		Map.Min = -Map.Size / 2;
		Map.Zones.assign(static_cast<size_t>(Map.Size) * Map.Size, 0);
		for (const portfolio::mmo::data::ZonesRow& Zone : Rows)
		{
			if (Zone.id() == 0 || Zone.id() > 255)
			{
				return std::nullopt;
			}

			Map.Safe[Zone.id()] = Zone.safe();
			for (int32_t CellZ = std::max(Zone.min_z(), Map.Min); CellZ < std::min(Zone.max_z(), Map.Min + Map.Size); ++CellZ)
			{
				for (int32_t CellX = std::max(Zone.min_x(), Map.Min); CellX < std::min(Zone.max_x(), Map.Min + Map.Size); ++CellX)
				{
					Map.Zones[Map.Index(CellX, CellZ)] = static_cast<uint8_t>(Zone.id());
				}
			}
		}

		return Map;
	}

	bool FFieldMap::Contains(int32_t X, int32_t Z) const
	{
		return InGrid(CellOf(X)) && InGrid(CellOf(Z));
	}

	uint32_t FFieldMap::ZoneAt(int32_t X, int32_t Z) const
	{
		const int32_t CellX = CellOf(X);
		const int32_t CellZ = CellOf(Z);
		return InGrid(CellX) && InGrid(CellZ) ? Zones[Index(CellX, CellZ)] : 0;
	}

	bool FFieldMap::IsSafe(int32_t X, int32_t Z) const
	{
		return Safe[ZoneAt(X, Z)];
	}

	int32_t FFieldMap::CellOf(int32_t Coordinate)
	{
		const int32_t Cell = Coordinate / Units::PerMeter;
		return (Coordinate % Units::PerMeter != 0 && Coordinate < 0) ? Cell - 1 : Cell;
	}

	bool FFieldMap::InGrid(int32_t Cell) const
	{
		return Cell >= Min && Cell < Min + Size;
	}

	size_t FFieldMap::Index(int32_t CellX, int32_t CellZ) const
	{
		return static_cast<size_t>(CellZ - Min) * Size + static_cast<size_t>(CellX - Min);
	}
}
