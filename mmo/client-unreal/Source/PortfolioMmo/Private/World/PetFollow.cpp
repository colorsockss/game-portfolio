#include "World/PetFollow.h"

#include <cmath>

#include "World/Units.h"

namespace MmoWorld
{
	FPoint NextPetPosition(const FFieldMap& Field, const FPetStep& Step)
	{
		// yaw 0이 +z이고 시계 방향으로 는다(64가 +x).
		const double Angle = Step.OwnerYaw * 2.0 * 3.14159265358979323846 / Units::YawSteps;
		const double Behind = PetBehindMeters * Units::PerMeter;
		FPoint Back{ Step.OwnerX - static_cast<int32_t>(std::lround(std::sin(Angle) * Behind)), Step.OwnerZ - static_cast<int32_t>(std::lround(std::cos(Angle) * Behind)) };
		if (!Field.CanWalkLine(Step.OwnerX, Step.OwnerZ, Back.X, Back.Z))
		{
			Back = { Step.OwnerX, Step.OwnerZ };
		}

		const double OwnerDX = static_cast<double>(Step.Last.X) - Step.OwnerX;
		const double OwnerDZ = static_cast<double>(Step.Last.Z) - Step.OwnerZ;
		const double Leash = PetLeashMeters * Units::PerMeter;
		if (OwnerDX * OwnerDX + OwnerDZ * OwnerDZ > Leash * Leash || !Field.CanWalkLine(Step.OwnerX, Step.OwnerZ, Step.Last.X, Step.Last.Z))
		{
			return Back;
		}

		const FPoint Goal = Step.Lure.value_or(Back);
		const double DX = static_cast<double>(Goal.X) - Step.Last.X;
		const double DZ = static_cast<double>(Goal.Z) - Step.Last.Z;
		const double Distance = std::sqrt(DX * DX + DZ * DZ);
		const double Move = PetSpeedMeters * Units::PerMeter * Step.Seconds;
		if (Distance <= Move || Distance == 0)
		{
			return Goal;
		}
		return { Step.Last.X + static_cast<int32_t>(std::lround(DX / Distance * Move)), Step.Last.Z + static_cast<int32_t>(std::lround(DZ / Distance * Move)) };
	}
}
