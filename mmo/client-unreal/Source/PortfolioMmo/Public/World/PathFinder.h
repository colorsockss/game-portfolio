#pragma once

// 클라이언트의 길찾기(엔진 없는 코드). 서버의 PathFinder.cs와 같은 규칙의 A*다: FFieldMap의 1 m 칸에서 8방향으로 가고, 대각선으로는
// 양옆 두 칸이 모두 열려 있을 때만 가고, 휴리스틱은 옥타일 거리(곧게 10, 대각선 14)이고, 찾은 길은 CanWalkLine이 트인 구간을 합쳐
// 꺾이는 점의 목록으로 줄인다. 클라이언트가 걷는 쪽은 플레이어뿐이라 걷는 쪽을 받지 않는다. 서버처럼 범위를 받는 대신 한 번에 닫는
// 칸 수에 상한을 둔다. 길이 있는지는 비교 벡터(mmo/shared/vectors/paths.tsv)로 서버와 맞춘다(같은 길이의 길은 서로 다를 수 있음).
// 눌러서 이동(88), 공격하러 가기(24), 줍기(33), NPC(37), 채집(47), 자동 사냥(40), 퀘스트 목표까지 걷기(50)가 쓴다.
// UE 타입 없이 표준 C++만 쓴다.
#include <cstdint>
#include <optional>
#include <utility>
#include <vector>

#include "World/FieldMap.h"
#include "World/Units.h"

namespace MmoWorld
{
	/** 필드의 점(1/32 m). */
	struct FPoint
	{
		int32_t X = 0;
		int32_t Z = 0;

		bool operator==(const FPoint&) const = default;
	};

	class FPathFinder
	{
	public:
		/** 한 번에 닫는 칸 수의 상한. 넘으면 길이 없는 것으로 본다(길찾기의 구조 상수라 데이터가 아니라 여기에 둔다). */
		static constexpr int32_t MaxClosedCells = 20000;

		explicit FPathFinder(const FFieldMap& InField) : Field(InField) {}

		/**
		 * From에서 To까지의 길을 찾아 Path에 꺾이는 점(출발은 빼고 도착을 넣음)을 담는다. 출발이나 도착의 칸이 막혔거나, 이어지지 않거나,
		 * 상한까지 닫아도 닿지 못하면 false다.
		 */
		bool Find(FPoint From, FPoint To, std::vector<FPoint>& Path);

		/** 지난 찾기에서 닫은 칸 수(측정과 테스트용). */
		int32_t ClosedCells() const { return Closed; }

	private:
		void Smooth(FPoint From, FPoint To, int32_t Goal, std::vector<FPoint>& Path);

		const FFieldMap& Field;
		/** 칸마다: 이번 찾기에서 본 표시(Stamp와 같으면 봄), 닫힌 표시, 지금까지의 비용, 온 칸. 필드 전체 크기로 한 번 만들어 다시 쓴다. */
		std::vector<uint32_t> SeenStamp;
		std::vector<uint32_t> ClosedStamp;
		std::vector<int32_t> Cost;
		std::vector<int32_t> Parent;
		uint32_t Stamp = 0;
		/** 열린 목록(우선순위, 칸). 가장 작은 우선순위가 앞인 힙. 우선순위는 (비용 + 휴리스틱)을 앞에, 같으면 비용이 큰 쪽이 앞이다. */
		std::vector<std::pair<int64_t, int32_t>> Open;
		std::vector<FPoint> Points;
		int32_t Closed = 0;
	};

	/** 꺾이는 점의 목록을 따라 걷는 방향을 준다. 점에서 ReachDistance 안에 들면 닿은 것으로 보고 다음 점으로 넘어간다. */
	class FPathFollower
	{
	public:
		/** 닿은 것으로 보는 거리(1/32 m, 0.5 m). 캡슐이 벽의 모서리에 걸리지 않게 점을 일찍 넘긴다. */
		static constexpr int32_t ReachDistance = Units::PerMeter / 2;

		/** 새 길을 따른다. */
		void Start(std::vector<FPoint> InPoints);

		/** 지금 위치에서 다음 점 쪽의 단위 방향(x, z). 닿은 점은 넘기고, 마지막 점에 닿았으면(또는 길이 없으면) nullopt. */
		std::optional<std::pair<double, double>> Direction(FPoint At);

		/** 마지막 점에 닿았거나 길이 없다. */
		bool IsDone() const { return Next >= Points.size(); }

		/** 지금 향하는 점의 차례(테스트용). */
		size_t NextIndex() const { return Next; }

	private:
		std::vector<FPoint> Points;
		size_t Next = 0;
	};
}
