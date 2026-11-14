#pragma once

// 미니맵과 지도(엔진 없는 코드, 76). 월드 좌표를 지도 좌표로 바꾸고, 바탕 그림의 픽셀(필드의 칸마다 하나)과 그릴 점의 목록을 낸다. 지도의 위는 +z(북)이고
// 돌지 않는다. NPC는 시야와 상관없이 Npcs의 자리로 그린다(뒤에 더하는 NPC도 따로 일 없이 보임). 파티원(42)과 나와 있는 보스(43)는 넘겨받은 자리로 그린다. 퀘스트 목표 50은 그 항목이 점을 더한다.
#include <cstdint>
#include <utility>
#include <vector>

#include "Data/GameData.h"
#include "World/FieldMap.h"

namespace MmoWorld
{
	/** 지도에 그릴 점 하나. U는 동쪽으로, V는 남쪽으로 0–1이다. */
	struct FMapPoint
	{
		enum class EKind : uint8_t { Self, Npc, Member, Boss };
		EKind Kind = EKind::Self;
		double U = 0;
		double V = 0;
		/** NPC의 역할(NpcRole). */
		int32_t Role = 0;
		/** 내 방향(도. 0이 북쪽, 시계 방향). */
		double YawDegrees = 0;
	};

	class FMapView
	{
	public:
		/** 막힌 칸의 픽셀 값. 아니면 그 칸의 구역 번호다. */
		static constexpr uint8_t Blocked = 255;

		/** 바탕 그림의 픽셀(한 변이 필드의 칸 수, 0행이 북쪽 끝, 0열이 서쪽 끝). */
		static std::vector<uint8_t> Pixels(const FFieldMap& Field);

		/** 월드 좌표(1/32 m) → 지도 좌표(U 동쪽, V 남쪽, 0–1). */
		static std::pair<double, double> ToMap(const FFieldMap& Field, double X, double Z);

		/** 그릴 점: 내 위치와 방향(yaw 칸), Npcs의 자리와 역할, 파티원의 자리(FParty::Positions. 42), 나와 있는 보스의 자리(FBossWatch::Positions. 43). 첫째가 늘 나다. */
		static std::vector<FMapPoint> Points(const FFieldMap& Field, const MmoData::FGameData& Data, int32_t SelfX, int32_t SelfZ, uint32_t SelfYaw,
			const std::vector<std::pair<int32_t, int32_t>>& Members = {}, const std::vector<std::pair<int32_t, int32_t>>& Bosses = {});
	};
}
