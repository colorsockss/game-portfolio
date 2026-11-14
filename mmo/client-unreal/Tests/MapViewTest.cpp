// 미니맵과 지도의 모델(World/MapView, 76)을 UE 없이 본다. run.mjs가 빌드하고 실행한다.
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>

#include "World/MapView.h"

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

	bool Near(double A, double B)
	{
		return std::abs(A - B) < 1e-9;
	}

	constexpr int32_t M = 32;

	/** 8 m 필드(−4..4 m). 구역 2는 x ≥ 0인 칸이고, 칸 (−4, 3)(북서 끝)이 막혔다. */
	MmoWorld::FFieldMap Field()
	{
		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(8);
		Grid.set_depth(8);
		Grid.set_origin_x(-4);
		Grid.set_origin_z(-4);
		std::string Cells(64, '\0');
		Cells[7 * 8 + 0] = 1;
		Grid.set_cells(Cells);
		google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow> Zones;
		portfolio::mmo::data::ZonesRow* Zone = Zones.Add();
		Zone->set_id(2);
		Zone->set_min_x(0);
		Zone->set_min_z(-4);
		Zone->set_max_x(4);
		Zone->set_max_z(4);
		return *MmoWorld::FFieldMap::Make(8, Zones, Grid);
	}

	/** 필드의 네 모서리와 가운데의 좌표 변환. 지도의 위가 북(+z)이다. */
	void CornersAndCenterMapToTheSquare()
	{
		const MmoWorld::FFieldMap Map = Field();
		const auto Center = MmoWorld::FMapView::ToMap(Map, 0, 0);
		const auto NorthWest = MmoWorld::FMapView::ToMap(Map, -4 * M, 4 * M);
		const auto SouthEast = MmoWorld::FMapView::ToMap(Map, 4 * M, -4 * M);
		const auto NorthEast = MmoWorld::FMapView::ToMap(Map, 4 * M, 4 * M);
		const auto SouthWest = MmoWorld::FMapView::ToMap(Map, -4 * M, -4 * M);
		Expect(Near(Center.first, 0.5) && Near(Center.second, 0.5), "the origin is the middle");
		Expect(Near(NorthWest.first, 0) && Near(NorthWest.second, 0), "the north-west corner is the top left");
		Expect(Near(SouthEast.first, 1) && Near(SouthEast.second, 1), "the south-east corner is the bottom right");
		Expect(Near(NorthEast.first, 1) && Near(NorthEast.second, 0) && Near(SouthWest.first, 0) && Near(SouthWest.second, 1), "the other corners");
	}

	/** 픽셀은 칸마다 하나이고 0행이 북쪽 끝이다. 막힌 칸은 Blocked, 아니면 구역 번호다. */
	void PixelsFollowBlockedCellsAndZones()
	{
		const std::vector<uint8_t> Pixels = MmoWorld::FMapView::Pixels(Field());
		Expect(Pixels.size() == 64, "one pixel per cell");
		Expect(Pixels[0] == MmoWorld::FMapView::Blocked, "the blocked north-west cell is dark");
		Expect(Pixels[1] == 0 && Pixels[4] == 2 && Pixels[63] == 2 && Pixels[56] == 0, "open cells carry their zone");
	}

	/** 점: 나(방향은 도)와 Npcs의 자리(칸의 가운데)와 역할. */
	void PointsAreMeAndTheTableNpcs()
	{
		MmoData::FGameData Data;
		portfolio::mmo::data::NpcsRow* Npc = Data.Npcs.add_rows();
		Npc->set_x(1);
		Npc->set_z(-2);
		Npc->set_role(portfolio::mmo::data::NPC_ROLE_SHOP);
		const std::vector<MmoWorld::FMapPoint> Points = MmoWorld::FMapView::Points(Field(), Data, 0, 0, 64);
		Expect(Points.size() == 2 && Points[0].Kind == MmoWorld::FMapPoint::EKind::Self && Near(Points[0].YawDegrees, 90), "my point faces east at yaw 64");
		Expect(Points[1].Kind == MmoWorld::FMapPoint::EKind::Npc && Points[1].Role == portfolio::mmo::data::NPC_ROLE_SHOP && Near(Points[1].U, 5.5 / 8) && Near(Points[1].V, 5.5 / 8),
			"an NPC is drawn at its cell's middle with its role");
	}
}

int main()
{
	CornersAndCenterMapToTheSquare();
	PixelsFollowBlockedCellsAndZones();
	PointsAreMeAndTheTableNpcs();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("MapView tests passed\n");
	return EXIT_SUCCESS;
}
