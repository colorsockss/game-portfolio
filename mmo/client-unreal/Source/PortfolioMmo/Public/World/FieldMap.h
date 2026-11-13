#pragma once

// 필드의 1 m 칸 격자. 칸마다 구역 번호를 가진다(막힘은 backlog 65가 더한다). 서버의 FieldMap.cs와 같은 규칙이고, 같은 답을 내는지는
// 비교 벡터(mmo/shared/vectors/zones.tsv)로 맞춘다. 필드는 한 변 FieldSize m이고 -FieldSize/2 이상 FieldSize/2 미만이다.
// 좌표(1/32 m) → 칸은 내림, 겹친 구역은 뒤 줄이 이기고, 어느 사각형에도 들지 않는 칸과 격자 밖은 구역 0이다.
// UE 타입 없이 표준 C++과 생성된 데이터 코드만 쓴다.
#include <array>
#include <cstdint>
#include <optional>
#include <vector>

#include "Data/MmoDataTables.h"

namespace MmoWorld
{
	class FFieldMap
	{
	public:
		/** 필드의 크기(m)와 Zones의 줄로 격자를 편다. 크기가 짝수가 아니거나 패킷의 한도를 넘거나, 구역 번호가 1–255가 아니면 nullopt. */
		static std::optional<FFieldMap> Make(uint32_t FieldSize, const google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow>& Zones);

		/** 좌표(1/32 m)가 격자 안이다. */
		bool Contains(int32_t X, int32_t Z) const;

		/** 좌표(1/32 m)의 구역 번호. 어느 구역에도 들지 않거나 격자 밖이면 0이다. */
		uint32_t ZoneAt(int32_t X, int32_t Z) const;

		/** 좌표(1/32 m)가 안전 지대다. */
		bool IsSafe(int32_t X, int32_t Z) const;

		/** 좌표(1/32 m) → 1 m 칸 번호. 내림이다(-1/32 m는 칸 -1). */
		static int32_t CellOf(int32_t Coordinate);

	private:
		FFieldMap() = default;
		bool InGrid(int32_t Cell) const;
		size_t Index(int32_t CellX, int32_t CellZ) const;

		int32_t Size = 0;
		int32_t Min = 0;
		/** 칸마다의 구역 번호. 행이 z, 열이 x다. */
		std::vector<uint8_t> Zones;
		/** 구역 번호 → 안전 지대인지. */
		std::array<bool, 256> Safe{};
	};
}
