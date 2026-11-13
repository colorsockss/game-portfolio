#include "World/PathFinder.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <functional>

namespace MmoWorld
{
	namespace
	{
		constexpr int32_t StraightCost = 10;
		constexpr int32_t DiagonalCost = 14;
		constexpr int32_t Directions[8][2] = { { 1, 0 }, { -1, 0 }, { 0, 1 }, { 0, -1 }, { 1, 1 }, { 1, -1 }, { -1, 1 }, { -1, -1 } };

		/** 옥타일 거리(곧게 10, 대각선 14). */
		int32_t Heuristic(int32_t FromX, int32_t FromZ, int32_t ToX, int32_t ToZ)
		{
			const int32_t DX = std::abs(ToX - FromX);
			const int32_t DZ = std::abs(ToZ - FromZ);
			return StraightCost * std::max(DX, DZ) + (DiagonalCost - StraightCost) * std::min(DX, DZ);
		}

		/**
		 * 열린 목록의 우선순위. (비용 + 휴리스틱)이 같으면 비용이 큰(도착에 가까운) 칸을 먼저 꺼낸다. 빈 들판에서는 같은 값의 칸이 많아
		 * 이 순서가 없으면 넓게 퍼진다. 꺼내는 순서만 바뀌어 길의 비용은 같다. 서버의 Priority와 같다.
		 */
		int64_t Priority(int32_t CellCost, int32_t Estimate)
		{
			return (static_cast<int64_t>(CellCost) + Estimate) * (int64_t{ 1 } << 32) - CellCost;
		}

		int32_t Center(int32_t Cell)
		{
			return Cell * Units::PerMeter + Units::PerMeter / 2;
		}
	}

	bool FPathFinder::Find(FPoint From, FPoint To, std::vector<FPoint>& Path)
	{
		Path.clear();
		Closed = 0;
		const int32_t Min = Field.GridMin();
		const int32_t Size = Field.GridSize();
		const int32_t StartX = FFieldMap::CellOf(From.X);
		const int32_t StartZ = FFieldMap::CellOf(From.Z);
		const int32_t GoalX = FFieldMap::CellOf(To.X);
		const int32_t GoalZ = FFieldMap::CellOf(To.Z);
		if (!Field.CanWalkCell(StartX, StartZ) || !Field.CanWalkCell(GoalX, GoalZ))
		{
			return false;
		}

		// 표시는 번호를 올려 지우고, 번호가 끝에 닿으면 배열을 비운다.
		const size_t Cells = static_cast<size_t>(Size) * Size;
		if (SeenStamp.size() != Cells)
		{
			SeenStamp.assign(Cells, 0);
			ClosedStamp.assign(Cells, 0);
			Cost.assign(Cells, 0);
			Parent.assign(Cells, -1);
			Stamp = 0;
		}
		if (Stamp == UINT32_MAX)
		{
			std::fill(SeenStamp.begin(), SeenStamp.end(), 0);
			std::fill(ClosedStamp.begin(), ClosedStamp.end(), 0);
			Stamp = 0;
		}
		++Stamp;
		Open.clear();

		const auto Index = [Min, Size](int32_t X, int32_t Z) { return (Z - Min) * Size + (X - Min); };
		const auto Push = [this](int32_t Cell, int32_t From, int32_t CellCost, int32_t Estimate)
		{
			SeenStamp[Cell] = Stamp;
			Cost[Cell] = CellCost;
			Parent[Cell] = From;
			Open.emplace_back(Priority(CellCost, Estimate), Cell);
			std::push_heap(Open.begin(), Open.end(), std::greater<>());
		};

		const int32_t Goal = Index(GoalX, GoalZ);
		Push(Index(StartX, StartZ), -1, 0, Heuristic(StartX, StartZ, GoalX, GoalZ));
		while (!Open.empty())
		{
			std::pop_heap(Open.begin(), Open.end(), std::greater<>());
			const int32_t Current = Open.back().second;
			Open.pop_back();
			if (ClosedStamp[Current] == Stamp)
			{
				continue;
			}

			ClosedStamp[Current] = Stamp;
			if (Current == Goal)
			{
				Smooth(From, To, Goal, Path);
				return true;
			}
			if (++Closed >= MaxClosedCells)
			{
				return false;
			}

			const int32_t CellX = Min + Current % Size;
			const int32_t CellZ = Min + Current / Size;
			for (const auto& Direction : Directions)
			{
				const int32_t NextX = CellX + Direction[0];
				const int32_t NextZ = CellZ + Direction[1];
				const bool bDiagonal = Direction[0] != 0 && Direction[1] != 0;
				if (!Field.CanWalkCell(NextX, NextZ)
					|| (bDiagonal && (!Field.CanWalkCell(CellX + Direction[0], CellZ) || !Field.CanWalkCell(CellX, CellZ + Direction[1]))))
				{
					continue;
				}

				const int32_t Next = Index(NextX, NextZ);
				const int32_t NextCost = Cost[Current] + (bDiagonal ? DiagonalCost : StraightCost);
				if (ClosedStamp[Next] != Stamp && (SeenStamp[Next] != Stamp || NextCost < Cost[Next]))
				{
					Push(Next, Current, NextCost, Heuristic(NextX, NextZ, GoalX, GoalZ));
				}
			}
		}

		return false;
	}

	// 출발 → 출발 칸의 가운데 → 지난 칸들의 가운데 → 도착을 잇고, 앞 점에서 곧게 갈 수 있는 가장 먼 점만 남긴다. 서버의 Smooth와 같다.
	void FPathFinder::Smooth(FPoint From, FPoint To, int32_t Goal, std::vector<FPoint>& Path)
	{
		const int32_t Min = Field.GridMin();
		const int32_t Size = Field.GridSize();
		Points.clear();
		Points.push_back(To);
		for (int32_t Cell = Goal; Cell != -1; Cell = Parent[Cell])
		{
			Points.push_back({ Center(Min + Cell % Size), Center(Min + Cell / Size) });
		}
		Points.push_back(From);
		std::reverse(Points.begin(), Points.end());

		size_t Anchor = 0;
		while (Anchor + 1 < Points.size())
		{
			size_t Last = Anchor + 1;
			while (Last + 1 < Points.size() && Field.CanWalkLine(Points[Anchor].X, Points[Anchor].Z, Points[Last + 1].X, Points[Last + 1].Z))
			{
				++Last;
			}
			Path.push_back(Points[Last]);
			Anchor = Last;
		}
	}

	void FPathFollower::Start(std::vector<FPoint> InPoints)
	{
		Points = std::move(InPoints);
		Next = 0;
	}

	std::optional<std::pair<double, double>> FPathFollower::Direction(FPoint At)
	{
		while (Next < Points.size())
		{
			const double DX = static_cast<double>(Points[Next].X) - At.X;
			const double DZ = static_cast<double>(Points[Next].Z) - At.Z;
			const double Distance = std::sqrt(DX * DX + DZ * DZ);
			if (Distance > ReachDistance)
			{
				return std::make_pair(DX / Distance, DZ / Distance);
			}
			++Next;
		}

		return std::nullopt;
	}
}
