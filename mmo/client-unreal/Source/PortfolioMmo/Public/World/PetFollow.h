#pragma once

// 펫의 그리는 자리(96. 엔진 없는 코드). 펫은 서버의 개체가 아니라 플레이어의 값이라, 화면이 주인을 따라 그리는 자리를 이 함수로 낸다. 줍는 것은 서버다.
#include <cstdint>
#include <optional>

#include "World/FieldMap.h"
#include "World/PathFinder.h"

namespace MmoWorld
{
	struct FPetStep
	{
		/** 주인의 자리와 방향(좌표 단위, yaw 칸). */
		int32_t OwnerX = 0;
		int32_t OwnerZ = 0;
		uint32_t OwnerYaw = 0;
		/** 지난 프레임에 그린 펫의 자리. */
		FPoint Last;
		/** 지난 시간(초). */
		double Seconds = 0;
		/** 향할 바닥 아이템의 자리(내 펫이 주울 수 있는 드롭이 줍는 거리 안에 있을 때). 없으면 주인의 뒤로 간다. */
		std::optional<FPoint> Lure;
	};

	/** 펫이 걷는 속도(m/s). 주인(6 m/s)을 따라잡게 조금 빠르다. */
	constexpr double PetSpeedMeters = 7.0;
	/** 주인의 뒤로 서는 거리(m)와, 넘으면 주인 곁에 다시 놓는 거리(m). */
	constexpr double PetBehindMeters = 1.5;
	constexpr double PetLeashMeters = 6.0;

	/**
	 * 새 자리: 주인에게서 6 m 넘게 떨어졌거나 주인까지 걷는 선이 막혔으면 주인의 뒤(막혔으면 주인의 자리)에 다시 놓고,
	 * 아니면 향할 드롭이나 주인의 뒤 1.5 m를 향해 걷는 속도만큼 간다.
	 */
	FPoint NextPetPosition(const FFieldMap& Field, const FPetStep& Step);
}
