// 다시 연결의 판단(World/ReconnectPolicy, 64)을 UE 없이 본다. run.mjs가 빌드하고 실행한다.
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <optional>
#include <vector>

#include "World/ReconnectPolicy.h"

namespace
{
	int Failures = 0;

	void Expect(bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	}

	portfolio::mmo::Packet Kicked(portfolio::mmo::KickReason Reason)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_kicked()->set_reason(Reason);
		return Packet;
	}

	portfolio::mmo::Packet Login(portfolio::mmo::LoginResultCode Code)
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_login_result()->set_result(Code);
		return Packet;
	}

	/** 간격은 1, 2, 4, 8, 16, 30, 30…초이고, 첫 끊김부터 2분이 지나면 그만둔다(마지막 간격은 한도까지로 줄어듦). */
	void DelaysDoubleToThirtySecondsForTwoMinutes()
	{
		MmoWorld::FReconnectPolicy Policy;
		std::vector<double> Delays;
		double Now = 0.0;
		while (const std::optional<double> Delay = Policy.Closed(false, Now))
		{
			Delays.push_back(*Delay);
			Now += *Delay;
			Expect(Policy.Reconnecting(), "reconnecting while retrying");
		}
		const std::vector<double> Expected{ 1, 2, 4, 8, 16, 30, 30, 29 };
		Expect(Delays == Expected, "1, 2, 4, 8, 16, 30, 30 then the rest of the two minutes");
		Expect(!Policy.Reconnecting(), "gives up after two minutes");
		Expect(Policy.Closed(false, Now + 10) == 1.0, "a later drop starts over from one second");
	}

	/** 망이 끊긴 것과 무응답·서버 내려감·서버 오류로 끊긴 것은 다시 붙고, 내가 닫은 것과 그 밖의 끊긴 이유, 로그인 거절은 다시 붙지 않는다. */
	void OnlyRecoverableDropsReconnect()
	{
		MmoWorld::FReconnectPolicy Policy;
		Expect(Policy.Closed(false, 0).has_value(), "a dropped network reconnects");
		Policy.Finish();
		Expect(!Policy.Closed(true, 0).has_value(), "logging out or quitting does not reconnect");

		for (const portfolio::mmo::KickReason Reason : { portfolio::mmo::KICK_REASON_IDLE_TIMEOUT, portfolio::mmo::KICK_REASON_SERVER_SHUTDOWN, portfolio::mmo::KICK_REASON_SERVER_ERROR })
		{
			Policy.Note(Kicked(Reason));
			Expect(Policy.Closed(false, 0).has_value(), "idle timeout, shutdown and server errors reconnect");
			Policy.Finish();
		}
		for (const portfolio::mmo::KickReason Reason : { portfolio::mmo::KICK_REASON_DUPLICATE_LOGIN, portfolio::mmo::KICK_REASON_MALFORMED_PACKET, portfolio::mmo::KICK_REASON_RATE_LIMITED })
		{
			Policy.Note(Kicked(Reason));
			Expect(!Policy.Closed(false, 0).has_value(), "duplicate logins, malformed packets and rate limits do not reconnect");
		}
		for (const portfolio::mmo::LoginResultCode Code : { portfolio::mmo::LOGIN_RESULT_CODE_SERVER_FULL, portfolio::mmo::LOGIN_RESULT_CODE_VERSION_MISMATCH, portfolio::mmo::LOGIN_RESULT_CODE_DATA_MISMATCH })
		{
			Policy.Note(Login(Code));
			Expect(!Policy.Closed(false, 0).has_value(), "a rejected login does not reconnect");
		}
		Policy.Note(Login(portfolio::mmo::LOGIN_RESULT_CODE_OK));
		Expect(Policy.Closed(false, 0).has_value(), "an accepted login drops back to reconnecting");
	}

	/** 다시 붙은 뒤 월드에 있었으면 그 캐릭터로 들어가고, 캐릭터 선택에 있었거나 들어가기가 거절됐으면 로그인까지만 한다. 백그라운드는 15초. */
	void ReentersOnlyFromTheWorld()
	{
		MmoWorld::FReconnectPolicy Policy;
		Policy.SetCharacter(42);
		Policy.Closed(false, 0);
		Expect(Policy.LoggedIn() == 42, "re-enters the character it was playing");
		Policy.Finish();
		Policy.SetCharacter(0);
		Policy.Closed(false, 0);
		Expect(Policy.LoggedIn() == 0, "stops at the character list when it dropped there");

		Policy.SetCharacter(7);
		portfolio::mmo::Packet Rejected;
		Rejected.mutable_enter_world_result()->set_result(portfolio::mmo::ENTER_WORLD_RESULT_CODE_NO_SUCH_CHARACTER);
		Policy.Note(Rejected);
		Expect(Policy.LoggedIn() == 0, "a rejected EnterWorld leaves it at the character list");

		Expect(!MmoWorld::FReconnectPolicy::StaleAfterBackground(100, 114.9), "under 15 s in the background keeps the connection");
		Expect(MmoWorld::FReconnectPolicy::StaleAfterBackground(100, 115), "15 s without packets closes and reconnects");
	}
}

int main()
{
	DelaysDoubleToThirtySecondsForTwoMinutes();
	OnlyRecoverableDropsReconnect();
	ReentersOnlyFromTheWorld();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Reconnect tests passed\n");
	return EXIT_SUCCESS;
}
