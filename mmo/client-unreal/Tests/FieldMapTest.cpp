// World/FieldMap(엔진 없는 코드)이 서버와 같은 구역과 벽을 내는지 비교 벡터(mmo/shared/vectors/의 zones.tsv, walls.tsv)로 본다.
// 서버의 FieldMapTests와 FieldMapWallTests가 그 파일을 서버 구현의 답으로 만든다. run.mjs가 빌드하고 둘째 인자로 벡터 폴더를 넘긴다.
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "World/FieldMap.h"

namespace
{
	int Failures = 0;

	void Expect(bool bCondition, const std::string& What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What.c_str());
			++Failures;
		}
	}

	void CellsRoundDown()
	{
		Expect(MmoWorld::FFieldMap::CellOf(-33) == -2 && MmoWorld::FFieldMap::CellOf(-32) == -1 && MmoWorld::FFieldMap::CellOf(-1) == -1, "negative coordinates round down");
		Expect(MmoWorld::FFieldMap::CellOf(0) == 0 && MmoWorld::FFieldMap::CellOf(31) == 0 && MmoWorld::FFieldMap::CellOf(32) == 1, "positive coordinates round down");
	}

	/** 막힌 칸이 없는 격자. Rows가 있으면 그 줄들(첫 줄이 가장 큰 z, 첫 글자가 가장 작은 x, '#'이 벽)로 칸을 채운다. */
	portfolio::mmo::data::MapGrid Grid(uint32_t Size, const std::vector<std::string>& Rows = {})
	{
		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(Size);
		Grid.set_depth(Size);
		Grid.set_origin_x(-static_cast<int32_t>(Size) / 2);
		Grid.set_origin_z(-static_cast<int32_t>(Size) / 2);
		std::string Cells(static_cast<size_t>(Size) * Size, '\0');
		for (size_t Row = 0; Row < Rows.size(); ++Row)
		{
			for (size_t Column = 0; Column < Rows[Row].size(); ++Column)
			{
				Cells[(Rows.size() - 1 - Row) * Size + Column] = Rows[Row][Column] == '#' ? 1 : 0;
			}
		}
		Grid.set_cells(Cells);
		return Grid;
	}

	void RejectsBadFields()
	{
		google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow> Zones;
		Expect(!MmoWorld::FFieldMap::Make(601, Zones, Grid(601)), "an odd field size is rejected");
		Expect(!MmoWorld::FFieldMap::Make(600, Zones, Grid(602)), "a grid of another size is rejected");
		portfolio::mmo::data::MapGrid Shifted = Grid(600);
		Shifted.set_origin_x(0);
		Expect(!MmoWorld::FFieldMap::Make(600, Zones, Shifted), "a grid with another origin is rejected");
		Zones.Add()->set_id(256);
		Expect(!MmoWorld::FFieldMap::Make(600, Zones, Grid(600)), "a zone id above 255 is rejected");
	}

	// 머리(field, zone)로 같은 격자를 만들고, point 줄마다 답을 견준다.
	void MatchesTheServerVectors(const std::string& Folder)
	{
		std::ifstream File(Folder + "/zones.tsv");
		Expect(File.good(), "the zone vectors exist");
		uint32_t FieldSize = 0;
		google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow> Zones;
		std::optional<MmoWorld::FFieldMap> Map;
		int Points = 0;
		std::string Line;
		while (std::getline(File, Line))
		{
			std::istringstream Fields(Line);
			std::string Kind;
			Fields >> Kind;
			if (Kind == "field")
			{
				Fields >> FieldSize;
			}
			else if (Kind == "zone")
			{
				uint32_t Id = 0;
				int32_t MinX = 0, MinZ = 0, MaxX = 0, MaxZ = 0, Safe = 0;
				Fields >> Id >> MinX >> MinZ >> MaxX >> MaxZ >> Safe;
				portfolio::mmo::data::ZonesRow* Zone = Zones.Add();
				Zone->set_id(Id);
				Zone->set_min_x(MinX);
				Zone->set_min_z(MinZ);
				Zone->set_max_x(MaxX);
				Zone->set_max_z(MaxZ);
				Zone->set_safe(Safe != 0);
			}
			else if (Kind == "point")
			{
				if (!Map)
				{
					Map = MmoWorld::FFieldMap::Make(FieldSize, Zones, Grid(FieldSize));
					Expect(Map.has_value(), "the vector header makes a field");
					if (!Map)
					{
						return;
					}
				}
				int32_t X = 0, Z = 0, Inside = 0, Safe = 0;
				uint32_t Zone = 0;
				Fields >> X >> Z >> Zone >> Safe >> Inside;
				const std::string At = "(" + std::to_string(X) + ", " + std::to_string(Z) + ")";
				Expect(Map->ZoneAt(X, Z) == Zone, At + " zone");
				Expect(Map->IsSafe(X, Z) == (Safe != 0), At + " safe");
				Expect(Map->Contains(X, Z) == (Inside != 0), At + " inside");
				++Points;
			}
		}
		Expect(Points > 0, "the zone vectors have points");
	}

	// 머리(field, row)로 같은 격자를 만들고, point 줄마다 걸을 수 있는지를, line 줄마다 두 선 검사의 답을 견준다.
	void MatchesTheServerWallVectors(const std::string& Folder)
	{
		std::ifstream File(Folder + "/walls.tsv");
		Expect(File.good(), "the wall vectors exist");
		uint32_t FieldSize = 0;
		std::vector<std::string> Rows;
		std::optional<MmoWorld::FFieldMap> Map;
		int Checks = 0;
		std::string Line;
		while (std::getline(File, Line))
		{
			std::istringstream Fields(Line);
			std::string Kind;
			Fields >> Kind;
			if (Kind == "field")
			{
				Fields >> FieldSize;
				continue;
			}
			if (Kind == "row")
			{
				std::string Row;
				Fields >> Row;
				Rows.push_back(Row);
				continue;
			}
			if (Kind != "point" && Kind != "line")
			{
				continue;
			}
			if (!Map)
			{
				Map = MmoWorld::FFieldMap::Make(FieldSize, {}, Grid(FieldSize, Rows));
				Expect(Map.has_value(), "the wall vector header makes a field");
				if (!Map)
				{
					return;
				}
			}
			if (Kind == "point")
			{
				int32_t X = 0, Z = 0, Walkable = 0;
				Fields >> X >> Z >> Walkable;
				Expect(Map->CanWalk(X, Z) == (Walkable != 0), "(" + std::to_string(X) + ", " + std::to_string(Z) + ") walkable");
			}
			else
			{
				int32_t AX = 0, AZ = 0, BX = 0, BZ = 0, Clear = 0, Walk = 0;
				Fields >> AX >> AZ >> BX >> BZ >> Clear >> Walk;
				const std::string At = "(" + std::to_string(AX) + ", " + std::to_string(AZ) + ") -> (" + std::to_string(BX) + ", " + std::to_string(BZ) + ")";
				Expect(Map->HasLine(AX, AZ, BX, BZ) == (Clear != 0), At + " HasLine");
				Expect(Map->CanWalkLine(AX, AZ, BX, BZ) == (Walk != 0), At + " CanWalkLine");
			}
			++Checks;
		}
		Expect(Checks > 0, "the wall vectors have points and lines");
	}
}

int main(int ArgumentCount, char** Arguments)
{
	CellsRoundDown();
	RejectsBadFields();
	if (ArgumentCount < 3)
	{
		std::printf("FAIL: run.mjs passes the vectors folder\n");
		return EXIT_FAILURE;
	}

	MatchesTheServerVectors(Arguments[2]);
	MatchesTheServerWallVectors(Arguments[2]);
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}

	std::printf("FieldMap tests passed\n");
	return EXIT_SUCCESS;
}
