#include "World/ReconnectPolicy.h"

#include <algorithm>
#include <cmath>

namespace MmoWorld
{
	void FReconnectPolicy::Note(const portfolio::mmo::Packet& Packet)
	{
		switch (Packet.body_case())
		{
		case portfolio::mmo::Packet::kKicked:
			Kick = Packet.kicked().reason();
			break;
		case portfolio::mmo::Packet::kLoginResult:
			bLoginRejected = Packet.login_result().result() != portfolio::mmo::LOGIN_RESULT_CODE_OK;
			break;
		case portfolio::mmo::Packet::kEnterWorldResult:
			// 거절되면 캐릭터 선택에 있으므로 다시 붙어도 들어가지 않는다.
			if (Packet.enter_world_result().result() != portfolio::mmo::ENTER_WORLD_RESULT_CODE_OK)
			{
				Character = 0;
			}
			break;
		default:
			break;
		}
	}

	bool FReconnectPolicy::Recoverable() const
	{
		if (bLoginRejected)
		{
			return false;
		}
		if (!Kick)
		{
			return true;
		}
		switch (*Kick)
		{
		case portfolio::mmo::KICK_REASON_IDLE_TIMEOUT:
		case portfolio::mmo::KICK_REASON_SERVER_SHUTDOWN:
		case portfolio::mmo::KICK_REASON_SERVER_ERROR:
			return true;
		default:
			return false;
		}
	}

	std::optional<double> FReconnectPolicy::Closed(bool bMine, double NowSeconds)
	{
		const bool bRecoverable = !bMine && Recoverable();
		Kick.reset();
		bLoginRejected = false;
		if (!bRecoverable || (Since && NowSeconds - *Since >= GiveUpSeconds))
		{
			Finish();
			Character = 0;
			return std::nullopt;
		}
		if (!Since)
		{
			Since = NowSeconds;
		}
		const double Delay = std::min(MaxDelaySeconds, FirstDelaySeconds * std::pow(2.0, Attempts));
		++Attempts;
		// 마지막 시도는 2분 한도 안에서 한다.
		return std::min(Delay, std::max(0.0, *Since + GiveUpSeconds - NowSeconds));
	}

	void FReconnectPolicy::Finish()
	{
		Since.reset();
		Attempts = 0;
	}
}
