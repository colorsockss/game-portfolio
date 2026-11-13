#include "World/FieldMap.h"

#include <algorithm>
#include <utility>

#include "World/Units.h"

namespace MmoWorld
{
	namespace
	{
		/** 내림 나눗셈(Divisor는 양수). */
		int64_t FloorDiv(int64_t Value, int64_t Divisor)
		{
			const int64_t Quotient = Value / Divisor;
			return (Value % Divisor != 0 && Value < 0) ? Quotient - 1 : Quotient;
		}

		/** 올림 나눗셈(Divisor는 양수). */
		int64_t CeilDiv(int64_t Value, int64_t Divisor)
		{
			return -FloorDiv(-Value, Divisor);
		}

		/** 점 P를 품은 칸(P의 칸은 빼고)에 P에서 (DX, DZ) 쪽으로 가는 선이 들어가지 않는다. 서버의 OnlyAt과 같다. */
		bool OnlyAt(int32_t CellX, int32_t CellZ, int32_t PX, int32_t PZ, int64_t DX, int64_t DZ)
		{
			if (CellX == FFieldMap::CellOf(PX) && CellZ == FFieldMap::CellOf(PZ))
			{
				return false;
			}

			const int64_t MinX = static_cast<int64_t>(CellX) * Units::PerMeter;
			const int64_t MinZ = static_cast<int64_t>(CellZ) * Units::PerMeter;
			const bool bHolds = PX >= MinX && PX <= MinX + Units::PerMeter && PZ >= MinZ && PZ <= MinZ + Units::PerMeter;
			const bool bEnters = !(PX == MinX && DX < 0) && !(PX == MinX + Units::PerMeter && DX > 0)
				&& !(PZ == MinZ && DZ < 0) && !(PZ == MinZ + Units::PerMeter && DZ > 0);
			return bHolds && !bEnters;
		}
	}

	std::optional<FFieldMap> FFieldMap::Make(uint32_t FieldSize, const google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow>& Rows,
		const portfolio::mmo::data::MapGrid& Grid)
	{
		if (FieldSize == 0 || FieldSize % 2 != 0 || FieldSize > 2u * portfolio::mmo::CONSTANT_MAP_HALF_EXTENT_METERS)
		{
			return std::nullopt;
		}

		FFieldMap Map;
		Map.Size = static_cast<int32_t>(FieldSize);
		Map.Min = -Map.Size / 2;
		Map.Zones.assign(static_cast<size_t>(Map.Size) * Map.Size, 0);
		if (Grid.width() != FieldSize || Grid.depth() != FieldSize || Grid.origin_x() != Map.Min || Grid.origin_z() != Map.Min
			|| Grid.cells().size() != Map.Zones.size())
		{
			return std::nullopt;
		}

		Map.Walls = Grid.cells();
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

	bool FFieldMap::CanWalk(int32_t X, int32_t Z) const
	{
		return CellOpen(CellOf(X), CellOf(Z));
	}

	bool FFieldMap::HasLine(int32_t AX, int32_t AZ, int32_t BX, int32_t BZ) const
	{
		if (AX == BX && AZ == BZ)
		{
			return CellOpen(CellOf(AX), CellOf(AZ));
		}

		if (AX > BX)
		{
			std::swap(AX, BX);
			std::swap(AZ, BZ);
		}

		// x 칸의 열마다, 선이 그 열(닫힌 구간) 안에 있는 동안의 z 범위가 닿는 칸을 본다. z는 분모 DX를 곱한 정수로 다룬다.
		const int64_t DX = static_cast<int64_t>(BX) - AX;
		const int64_t DZ = static_cast<int64_t>(BZ) - AZ;
		const int64_t Denominator = std::max<int64_t>(DX, 1) * Units::PerMeter;
		for (int64_t CellX = CeilDiv(AX, Units::PerMeter) - 1; CellX <= FloorDiv(BX, Units::PerMeter); ++CellX)
		{
			const int64_t FromX = std::max<int64_t>(CellX * Units::PerMeter, AX);
			const int64_t ToX = std::min<int64_t>((CellX + 1) * Units::PerMeter, BX);
			const int64_t FromZ = DX == 0 ? AZ : AZ * DX + (FromX - AX) * DZ;
			const int64_t ToZ = DX == 0 ? BZ : AZ * DX + (ToX - AX) * DZ;
			for (int64_t CellZ = CeilDiv(std::min(FromZ, ToZ), Denominator) - 1; CellZ <= FloorDiv(std::max(FromZ, ToZ), Denominator); ++CellZ)
			{
				const int32_t X = static_cast<int32_t>(CellX);
				const int32_t Z = static_cast<int32_t>(CellZ);
				const bool bOnlyAtEnd = OnlyAt(X, Z, AX, AZ, DX, DZ) || OnlyAt(X, Z, BX, BZ, -DX, -DZ);
				if (!bOnlyAtEnd && !CellOpen(X, Z))
				{
					return false;
				}
			}
		}

		return true;
	}

	bool FFieldMap::CellOpen(int32_t CellX, int32_t CellZ) const
	{
		return InGrid(CellX) && InGrid(CellZ) && Walls[Index(CellX, CellZ)] == 0;
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
