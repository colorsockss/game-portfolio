#pragma once

// 패킷의 좌표·방향·틱 단위를 미터와 각도로 바꾼다. 값의 원본은 packets.proto의 Constant이고, 서버의 Units.cs와 같은 이름을 쓴다.
// UE 타입 없이 표준 C++만 쓴다. 미터·각도 → FVector·FRotator는 화면의 Game/MmoCoordinates.h가 한다.
#include <cmath>
#include <cstdint>

#include "Protocol/MmoPackets.h"

namespace MmoWorld::Units
{
	/** 1 m를 나눈 좌표 칸 수. */
	inline constexpr int32_t PerMeter = portfolio::mmo::CONSTANT_UNITS_PER_METER;

	/** 한 바퀴(360°)를 나눈 yaw 칸 수. yaw는 0 이상 YawSteps 미만이다. */
	inline constexpr int32_t YawSteps = portfolio::mmo::CONSTANT_YAW_STEPS;

	/** 서버의 초당 틱 수. */
	inline constexpr int32_t TicksPerSecond = portfolio::mmo::CONSTANT_TICKS_PER_SECOND;

	/** 최대 이동 속도(m/s). 서버의 이동 검증과 같은 값이다. */
	inline constexpr double MaxSpeedMetersPerSecond = portfolio::mmo::CONSTANT_MAX_SPEED_METERS_PER_SECOND;

	/** 좌표 칸 → 미터. 보간한 소수 칸도 받는다. */
	inline double ToMeters(double Cells)
	{
		return Cells / PerMeter;
	}

	/** 미터 → 좌표 칸. 가장 가까운 칸으로 반올림한다(가운데는 0에서 먼 쪽). */
	inline int32_t FromMeters(double Meters)
	{
		return static_cast<int32_t>(std::lround(Meters * PerMeter));
	}

	/** yaw 칸 → 도(0 이상 360 미만). 0이 +z(앞)이고 위에서 볼 때 시계 방향으로 는다. 보간한 소수 칸도 받는다. */
	inline double YawToDegrees(double Yaw)
	{
		return Yaw * 360.0 / YawSteps;
	}

	/** 도 → yaw 칸. 반올림하고 한 바퀴로 감아 0 이상 YawSteps 미만으로 낸다(음수, 360 이상도 받는다). */
	inline uint32_t YawFromDegrees(double Degrees)
	{
		const long Steps = std::lround(Degrees * YawSteps / 360.0) % YawSteps;
		return static_cast<uint32_t>(Steps < 0 ? Steps + YawSteps : Steps);
	}
}
