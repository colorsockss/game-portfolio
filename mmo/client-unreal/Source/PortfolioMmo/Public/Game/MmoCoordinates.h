#pragma once

// 패킷의 좌표·방향(칸) ↔ Unreal의 FVector·FRotator. 바꾸는 곳은 여기 한 곳뿐이다.
// 패킷의 z(앞)가 Unreal의 X, x(오른쪽)가 Y이고 1 m가 100 언리얼 단위다. yaw는 둘 다 위에서 볼 때 시계 방향이라 각도만 바꾼다.
// 높이는 패킷에 없고 땅(AMmoTerrain. 106)의 높이다.
#include "CoreMinimal.h"
#include "Game/MmoTerrain.h"
#include "World/Units.h"

namespace MmoCoordinates
{
	/** 지면 위의 자리. 높이는 그 자리의 땅이다(106). 보간한 소수 칸도 받는다. */
	inline FVector ToWorld(double X, double Z)
	{
		const double WorldX = MmoWorld::Units::ToMeters(Z) * 100.0;
		const double WorldY = MmoWorld::Units::ToMeters(X) * 100.0;
		return FVector(WorldX, WorldY, AMmoTerrain::GroundZ(WorldX, WorldY));
	}

	inline FRotator ToRotator(double Yaw)
	{
		return FRotator(0.0, MmoWorld::Units::YawToDegrees(Yaw), 0.0);
	}

	/** 월드 자리 → 패킷의 x. 높이는 버린다. */
	inline int32 ToX(const FVector& Location)
	{
		return MmoWorld::Units::FromMeters(Location.Y / 100.0);
	}

	/** 월드 자리 → 패킷의 z. */
	inline int32 ToZ(const FVector& Location)
	{
		return MmoWorld::Units::FromMeters(Location.X / 100.0);
	}

	inline uint32 ToYaw(const FRotator& Rotation)
	{
		return MmoWorld::Units::YawFromDegrees(Rotation.Yaw);
	}
}
