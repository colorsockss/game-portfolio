#pragma once

// 지연(엔진 없는 코드): Ping을 보내고 Pong을 받기까지의 시간. 연결이 Ping을 보낼 때 Sent, Pong을 받을 때 Received를 부른다.
// Ping은 5초마다 하나라 한 번에 하나만 기다린다(기다리는 중에 보낸 Ping은 새로 잼). 시연 표시가 마지막 값을 보인다(backlog 30).
#include <optional>

namespace MmoWorld
{
	class FLatency
	{
	public:
		/** Ping을 보냈다(내 시간, 초). */
		void Sent(double NowSeconds) { PendingSince = NowSeconds; }

		/** Pong을 받았다. 기다리던 Ping이 없으면(연결 직후 등) 버린다. */
		void Received(double NowSeconds)
		{
			if (PendingSince)
			{
				LastMilliseconds = (NowSeconds - *PendingSince) * 1000.0;
				PendingSince.reset();
			}
		}

		/** 마지막으로 잰 지연(ms). 아직 없으면 nullopt. */
		std::optional<double> Milliseconds() const { return LastMilliseconds; }

		void Reset()
		{
			PendingSince.reset();
			LastMilliseconds.reset();
		}

	private:
		std::optional<double> PendingSince;
		std::optional<double> LastMilliseconds;
	};
}
