// World/PathFinder(엔진 없는 코드)를 본다. 서버의 PathFinderTests가 낸 비교 벡터(mmo/shared/vectors/paths.tsv)에서 길이 있는지가 서버와
// 같고 자기 길의 구간마다 CanWalkLine이 트인 것, 상한을 넘으면 길이 없는 것, 실제 맵(85)의 끝에서 끝까지 상한 안에서 찾는 것,
// FPathFollower가 점을 넘기고 끝나는 것. run.mjs가 빌드하고 [데이터 폴더, 벡터 폴더]를 넘긴다.
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#include "Data/GameData.h"
#include "World/PathFinder.h"

namespace
{
	using MmoWorld::FPoint;

	int Failures = 0;

	void Expect(bool bCondition, const std::string& What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What.c_str());
			++Failures;
		}
	}

	/** 줄들(첫 줄이 가장 큰 z, 첫 글자가 가장 작은 x, '#'이 벽)로 Size m 필드를 만든다. */
	std::optional<MmoWorld::FFieldMap> Field(uint32_t Size, const std::vector<std::string>& Rows)
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
				Cells[(Size - 1 - Row) * Size + Column] = Rows[Row][Column] == '#' ? 1 : 0;
			}
		}
		Grid.set_cells(Cells);
		return MmoWorld::FFieldMap::Make(Size, {}, Grid);
	}

	bool Clear(const MmoWorld::FFieldMap& Map, FPoint From, const std::vector<FPoint>& Path)
	{
		FPoint Previous = From;
		for (const FPoint& Point : Path)
		{
			if (!Map.CanWalkLine(Previous.X, Previous.Z, Point.X, Point.Z))
			{
				return false;
			}
			Previous = Point;
		}
		return true;
	}

	void MatchesTheServerVectors(const std::string& Folder)
	{
		std::ifstream File(Folder + "/paths.tsv");
		Expect(File.good(), "the path vectors exist");
		uint32_t FieldSize = 0;
		std::vector<std::string> Rows;
		std::optional<MmoWorld::FFieldMap> Map;
		std::optional<MmoWorld::FPathFinder> Finder;
		std::vector<FPoint> Path;
		int Queries = 0;
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
			else if (Kind == "row")
			{
				std::string Row;
				Fields >> Row;
				Rows.push_back(Row);
			}
			else if (Kind == "query")
			{
				if (!Map)
				{
					Map = Field(FieldSize, Rows);
					Expect(Map.has_value(), "the path vector header makes a field");
					if (!Map)
					{
						return;
					}
					Finder.emplace(*Map);
				}
				FPoint From, To;
				int Found = 0;
				Fields >> From.X >> From.Z >> To.X >> To.Z >> Found;
				const std::string At = "(" + std::to_string(From.X) + ", " + std::to_string(From.Z) + ") -> (" + std::to_string(To.X) + ", " + std::to_string(To.Z) + ")";
				const bool bFound = Finder->Find(From, To, Path);
				Expect(bFound == (Found != 0), At + " found");
				Expect(!bFound || (!Path.empty() && Path.back() == To && Clear(*Map, From, Path)), At + " every segment is clear");
				++Queries;
			}
		}
		Expect(Queries > 0, "the path vectors have queries");
	}

	// 300 m 필드를 x = 0의 벽이 가르고 위 끝에만 틈이 있다. 벽 바로 건너는 길이 있지만 왼쪽 절반(약 45,000칸)을 거의 다 닫아야 닿는다.
	void GivesUpAtTheLimit()
	{
		std::vector<std::string> Rows(300, std::string(300, '.'));
		for (size_t Row = 1; Row < Rows.size(); ++Row)
		{
			Rows[Row][150] = '#';
		}
		const std::optional<MmoWorld::FFieldMap> Map = Field(300, Rows);
		MmoWorld::FPathFinder Finder(*Map);
		std::vector<FPoint> Path;
		Expect(!Finder.Find({ -32 * 2 + 16, -32 * 140 }, { 32 + 16, -32 * 140 }, Path), "a path past the limit counts as none");
		Expect(Finder.ClosedCells() == MmoWorld::FPathFinder::MaxClosedCells, "it stops at the limit");
		Expect(Finder.Find({ -32 * 2 + 16, 32 * 140 }, { 32 + 16, 32 * 140 }, Path), "the same wall near the gap has a path");
	}

	// 실제 맵의 남서쪽 끝에서 북동쪽 끝까지(테두리의 산 안쪽에서 처음 걸을 수 있는 칸).
	void CrossesTheRealMap(const char* DataFolder)
	{
		const auto Data = MmoData::Load([DataFolder](std::string_view Name) -> std::optional<std::string>
		{
			std::ifstream File(std::string(DataFolder) + "/" + std::string(Name), std::ios::binary);
			if (!File)
			{
				return std::nullopt;
			}
			std::ostringstream Bytes;
			Bytes << File.rdbuf();
			return Bytes.str();
		});
		Expect(Data.has_value(), "the generated data loads");
		const std::optional<MmoWorld::FFieldMap> Map = Data ? MmoWorld::FFieldMap::Make(Data->Constants.field_size(), Data->Zones.rows(), Data->Grid) : std::nullopt;
		Expect(Map.has_value(), "the real map loads");
		if (!Map)
		{
			return;
		}

		// (X, Z) 칸에서 (StepX, StepZ) 쪽으로 처음 걸을 수 있는 칸의 가운데.
		const auto Open = [&Map](int32_t X, int32_t Z, int32_t StepX, int32_t StepZ)
		{
			while (!Map->CanWalkCell(X, Z))
			{
				X += StepX;
				Z += StepZ;
			}
			return FPoint{ X * 32 + 16, Z * 32 + 16 };
		};
		MmoWorld::FPathFinder Finder(*Map);
		std::vector<FPoint> Path;
		const FPoint Corners[4] = { Open(-289, -289, 1, 1), Open(288, 288, -1, -1), Open(-289, 288, 1, -1), Open(288, -289, -1, 1) };
		for (int Pair = 0; Pair < 2; ++Pair)
		{
			const FPoint From = Corners[Pair * 2];
			const FPoint To = Corners[Pair * 2 + 1];
			for (int Call = 0; Call < 2; ++Call)
			{
				const auto Started = std::chrono::steady_clock::now();
				const bool bFound = Finder.Find(From, To, Path);
				const double Milliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - Started).count();
				Expect(bFound && Clear(*Map, From, Path), "the real map has a clear path from corner to corner within the limit");
				std::printf("PathFinder: real map diagonal %d call %d closed %d cells, %zu points, %.2f ms\n", Pair + 1, Call + 1, Finder.ClosedCells(), Path.size(), Milliseconds);
			}
		}
	}

	void FollowsThePoints()
	{
		MmoWorld::FPathFollower Follower;
		Expect(!Follower.Direction({ 0, 0 }) && Follower.IsDone(), "no path is done");

		Follower.Start({ { 64, 0 }, { 64, 64 } });
		const auto First = Follower.Direction({ 0, 0 });
		Expect(First && First->first == 1.0 && First->second == 0.0 && Follower.NextIndex() == 0, "it heads for the first point");

		// 첫 점에서 14칸(0.5 m 안)이면 닿은 것으로 보고 다음 점 쪽을 준다.
		const auto Second = Follower.Direction({ 50, 0 });
		Expect(Second && Follower.NextIndex() == 1 && Second->second > 0.9, "it turns to the next point within 0.5 m");
		Expect(!Follower.Direction({ 64, 50 }) && Follower.IsDone(), "it is done within 0.5 m of the last point");
	}
}

int main(int ArgumentCount, char** Arguments)
{
	if (ArgumentCount < 3)
	{
		std::printf("FAIL: run.mjs passes the data and vectors folders\n");
		return EXIT_FAILURE;
	}

	MatchesTheServerVectors(Arguments[2]);
	GivesUpAtTheLimit();
	CrossesTheRealMap(Arguments[1]);
	FollowsThePoints();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}

	std::printf("PathFinder tests passed\n");
	return EXIT_SUCCESS;
}
