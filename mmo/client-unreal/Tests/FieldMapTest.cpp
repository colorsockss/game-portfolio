// World/FieldMap(엔진 없는 코드)이 서버와 같은 구역을 내는지 비교 벡터(mmo/shared/vectors/zones.tsv)로 본다. 서버의 FieldMapTests가
// 그 파일을 서버 구현의 답으로 만든다. run.mjs가 빌드하고 둘째 인자로 벡터 폴더를 넘긴다.
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>

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

	void RejectsBadFields()
	{
		google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow> Zones;
		Expect(!MmoWorld::FFieldMap::Make(601, Zones), "an odd field size is rejected");
		Zones.Add()->set_id(256);
		Expect(!MmoWorld::FFieldMap::Make(600, Zones), "a zone id above 255 is rejected");
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
					Map = MmoWorld::FFieldMap::Make(FieldSize, Zones);
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
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}

	std::printf("FieldMap tests passed\n");
	return EXIT_SUCCESS;
}
