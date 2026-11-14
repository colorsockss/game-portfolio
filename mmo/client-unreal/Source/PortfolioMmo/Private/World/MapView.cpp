#include "World/MapView.h"

#include "World/Units.h"

namespace MmoWorld
{
	std::vector<uint8_t> FMapView::Pixels(const FFieldMap& Field)
	{
		const int32_t Size = Field.GridSize();
		const int32_t Min = Field.GridMin();
		std::vector<uint8_t> Result(static_cast<size_t>(Size) * Size);
		for (int32_t Row = 0; Row < Size; ++Row)
		{
			const int32_t CellZ = Min + Size - 1 - Row;
			for (int32_t Column = 0; Column < Size; ++Column)
			{
				const int32_t CellX = Min + Column;
				Result[static_cast<size_t>(Row) * Size + Column] = Field.CanWalkCell(CellX, CellZ)
					? static_cast<uint8_t>(Field.ZoneAt(CellX * Units::PerMeter + Units::PerMeter / 2, CellZ * Units::PerMeter + Units::PerMeter / 2))
					: Blocked;
			}
		}
		return Result;
	}

	std::pair<double, double> FMapView::ToMap(const FFieldMap& Field, double X, double Z)
	{
		const double Size = Field.GridSize();
		const double Min = Field.GridMin();
		return { (X / Units::PerMeter - Min) / Size, (Min + Size - Z / Units::PerMeter) / Size };
	}

	std::vector<FMapPoint> FMapView::Points(const FFieldMap& Field, const MmoData::FGameData& Data, int32_t SelfX, int32_t SelfZ, uint32_t SelfYaw)
	{
		std::vector<FMapPoint> Result;
		const auto [U, V] = ToMap(Field, SelfX, SelfZ);
		Result.push_back({ FMapPoint::EKind::Self, U, V, 0, SelfYaw * 360.0 / Units::YawSteps });
		for (const portfolio::mmo::data::NpcsRow& Npc : Data.Npcs.rows())
		{
			// NPC의 자리(m)는 칸의 작은 모서리라 그 칸의 가운데에 그린다(서버의 Npc와 같음).
			const auto [NpcU, NpcV] = ToMap(Field, Npc.x() * Units::PerMeter + Units::PerMeter / 2.0, Npc.z() * Units::PerMeter + Units::PerMeter / 2.0);
			Result.push_back({ FMapPoint::EKind::Npc, NpcU, NpcV, static_cast<int32_t>(Npc.role()), 0 });
		}
		return Result;
	}
}
