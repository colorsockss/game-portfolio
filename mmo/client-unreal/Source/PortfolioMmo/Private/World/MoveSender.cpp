#include "World/MoveSender.h"

#include "World/Units.h"

namespace MmoWorld
{
	namespace
	{
		/** Move를 보내는 간격(초). 서버 틱 하나다. */
		constexpr double SendInterval = 1.0 / Units::TicksPerSecond;
	}

	void FMoveSender::Reset()
	{
		*this = FMoveSender();
	}

	bool FMoveSender::Update(double DeltaSeconds, int32_t X, int32_t Z, uint32_t Yaw, uint32_t Ack, portfolio::mmo::Move& Out)
	{
		Elapsed += DeltaSeconds;
		if (Elapsed < SendInterval)
		{
			return false;
		}

		if (!SendIfChanged(X, Z, Yaw, Ack, Out))
		{
			// 서 있는 동안은 간격을 채운 채로 두어, 다시 움직이는 첫 프레임에 바로 보낸다.
			Elapsed = SendInterval;
			return false;
		}

		// 간격을 빼서 프레임 시간이 50 ms로 나눠떨어지지 않아도 평균 간격을 지킨다. 긴 프레임 뒤에는 몰아 보내지 않는다.
		Elapsed -= SendInterval;
		if (Elapsed >= SendInterval)
		{
			Elapsed = 0;
		}
		return true;
	}

	bool FMoveSender::Flush(int32_t X, int32_t Z, uint32_t Yaw, uint32_t Ack, portfolio::mmo::Move& Out)
	{
		return SendIfChanged(X, Z, Yaw, Ack, Out);
	}

	bool FMoveSender::SendIfChanged(int32_t X, int32_t Z, uint32_t Yaw, uint32_t Ack, portfolio::mmo::Move& Out)
	{
		if (bSent && X == SentX && Z == SentZ && Yaw == SentYaw && Ack == SentAck)
		{
			return false;
		}

		bSent = true;
		SentX = X;
		SentZ = Z;
		SentYaw = Yaw;
		SentAck = Ack;
		Out.set_x(X);
		Out.set_z(Z);
		Out.set_yaw(Yaw);
		Out.set_ack(Ack);
		return true;
	}
}
