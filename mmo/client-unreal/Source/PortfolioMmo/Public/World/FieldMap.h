#pragma once

// 필드의 1 m 칸 격자. 칸마다 구역 번호와 벽인지를 가진다. 서버의 FieldMap.cs와 같은 규칙이고, 같은 답을 내는지는
// 비교 벡터(mmo/shared/vectors/의 zones.tsv, walls.tsv)로 맞춘다. 필드는 한 변 FieldSize m이고 -FieldSize/2 이상 FieldSize/2 미만이다.
// 좌표(1/32 m) → 칸은 내림, 겹친 구역은 뒤 줄이 이기고, 어느 사각형에도 들지 않는 칸과 격자 밖은 구역 0이다. 벽은 맵 생성기의 격자에서
// 읽고 격자 밖도 벽이다. 클라이언트가 걷는 쪽은 플레이어뿐이라 걷는 쪽을 받지 않는다(몬스터에게만 막히는 안전 지대는 보지 않음).
// UE 타입 없이 표준 C++과 생성된 데이터 코드만 쓴다.
#include <array>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "Data/MmoDataTables.h"

namespace MmoWorld
{
	class FFieldMap
	{
	public:
		/**
		 * 필드의 크기(m), Zones의 줄, 맵 생성기의 격자로 편다. 크기가 짝수가 아니거나 패킷의 한도를 넘거나, 구역 번호가 1–255가 아니거나,
		 * 격자의 크기·원점이 필드와 다르면 nullopt.
		 */
		static std::optional<FFieldMap> Make(uint32_t FieldSize, const google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow>& Zones,
			const portfolio::mmo::data::MapGrid& Grid);

		/** 좌표(1/32 m)가 격자 안이다. */
		bool Contains(int32_t X, int32_t Z) const;

		/** 좌표(1/32 m)의 구역 번호. 어느 구역에도 들지 않거나 격자 밖이면 0이다. */
		uint32_t ZoneAt(int32_t X, int32_t Z) const;

		/** 좌표(1/32 m)가 안전 지대다. */
		bool IsSafe(int32_t X, int32_t Z) const;

		/** 좌표(1/32 m)의 칸을 걸을 수 있다(벽이 아니고 격자 안). */
		bool CanWalk(int32_t X, int32_t Z) const;

		/**
		 * A에서 B까지의 선이 지나는 칸에 벽이 없다. 지나는 칸은 두 끝점의 칸(내림)과, 끝점을 뺀 선분이 닿는 닫힌 칸이다(모서리를 정확히
		 * 지나면 네 칸, 변을 따라가면 양쪽 칸. 끝점에서만 닿고 선이 들어가지 않는 칸은 빼고, 길이가 0이면 그 칸만). 정수로만 계산한다.
		 * 좌표(1/32 m)는 패킷의 한도 안이어야 한다.
		 */
		bool HasLine(int32_t AX, int32_t AZ, int32_t BX, int32_t BZ) const;

		/** A에서 B까지 곧게 걸을 수 있다. 플레이어 쪽이라 HasLine과 같다(길찾기가 찾은 길을 줄일 때 쓰는 이름). */
		bool CanWalkLine(int32_t AX, int32_t AZ, int32_t BX, int32_t BZ) const { return HasLine(AX, AZ, BX, BZ); }

		/** 칸(1 m 칸 번호)을 걸을 수 있다. 격자 밖은 걸을 수 없다. 길찾기가 칸마다 묻는다. */
		bool CanWalkCell(int32_t CellX, int32_t CellZ) const { return CellOpen(CellX, CellZ); }

		/** 격자의 가장 작은 칸 번호(-FieldSize/2)와 한 변의 칸 수. */
		int32_t GridMin() const { return Min; }
		int32_t GridSize() const { return Size; }

		/** 좌표(1/32 m) → 1 m 칸 번호. 내림이다(-1/32 m는 칸 -1). */
		static int32_t CellOf(int32_t Coordinate);

	private:
		FFieldMap() = default;
		bool CellOpen(int32_t CellX, int32_t CellZ) const;
		bool InGrid(int32_t Cell) const;
		size_t Index(int32_t CellX, int32_t CellZ) const;

		int32_t Size = 0;
		int32_t Min = 0;
		/** 칸마다의 구역 번호. 행이 z, 열이 x다. */
		std::vector<uint8_t> Zones;
		/** 칸마다 벽이면 1. 행이 z, 열이 x다(MapGrid.cells 그대로). */
		std::string Walls;
		/** 구역 번호 → 안전 지대인지. */
		std::array<bool, 256> Safe{};
	};
}
