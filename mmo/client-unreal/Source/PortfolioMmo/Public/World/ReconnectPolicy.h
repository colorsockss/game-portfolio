#pragma once

// 다시 연결(엔진 없는 코드, 64): 끊긴 뒤 다시 붙을지, 언제 다시 시도할지를 정한다. UMmoSession은 그 답대로 연결만 한다.
#include <cstdint>
#include <optional>

#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	/**
	 * 받은 Kicked와 LoginResult를 기억해 두었다가, 연결이 닫히면 다시 붙을지 정한다. 다시 붙는 것은 망이 끊긴 것(서버가 아무 이유 없이 닫음, 15초 무응답으로
	 * 내가 닫음), 무응답·서버 내려감·서버 오류로 끊긴 것이고, 다시 붙지 않는 것은 내가 닫은 것(로그아웃, 게임 종료), 중복 로그인·잘못된 패킷·빈도 제한 같은
	 * 그 밖의 끊긴 이유, 로그인이 거절된 것이다. 간격은 1초부터 두 배씩 30초까지이고 첫 끊김부터 2분이 지나면 그만둔다.
	 */
	class FReconnectPolicy
	{
	public:
		static constexpr double FirstDelaySeconds = 1.0;
		static constexpr double MaxDelaySeconds = 30.0;
		static constexpr double GiveUpSeconds = 120.0;

		/** 백그라운드에서 돌아왔을 때 이만큼 받은 것이 없으면 기다리지 않고 닫고 다시 붙는다(서버의 무응답 끊기와 같은 15초). */
		static constexpr double StaleSeconds = 15.0;

		/** 받은 패킷에서 끊긴 이유(Kicked)와 로그인 결과를 기억하고, 월드에 들어간 캐릭터(EnterWorldResult)를 기억한다. */
		void Note(const portfolio::mmo::Packet& Packet);

		/** 월드에 들어가려고 보낸 캐릭터. 다시 붙은 뒤 이 캐릭터로 EnterWorld를 보낸다. 캐릭터 선택으로 나가면 0으로 둔다. */
		void SetCharacter(uint64_t CharacterId) { Character = CharacterId; }

		/**
		 * 연결이 닫혔다. bMine이면 내가 닫은 것(로그아웃, 게임 종료)이다. 다시 붙으면 첫 시도까지 기다릴 시간을 내고(다시 붙는 중이면 다음 간격),
		 * 다시 붙지 않거나 2분이 지났으면 nullopt를 내고 처음 상태로 돌아간다.
		 */
		std::optional<double> Closed(bool bMine, double NowSeconds);

		/** 다시 붙어 로그인이 됐다. 월드에 들어가 있었으면 다시 들어갈 캐릭터를, 아니면(캐릭터 선택) 0을 낸다. */
		uint64_t LoggedIn() const { return Character; }

		/** 다시 들어갔거나(EnterWorldResult) 다시 붙는 것을 그만뒀다. 처음 상태로 돌아간다. */
		void Finish();

		/** 다시 붙는 중이다(첫 끊김부터 다시 들어갈 때까지). */
		bool Reconnecting() const { return Since.has_value(); }

		/** 백그라운드에서 돌아온 때에, 마지막으로 받은 때부터 15초가 지났으면 바로 닫고 다시 붙어야 한다. */
		static bool StaleAfterBackground(double LastReceivedSeconds, double NowSeconds) { return NowSeconds - LastReceivedSeconds >= StaleSeconds; }

	private:
		/** 다시 붙을 수 있는 끊김인가(마지막으로 받은 이유로). */
		bool Recoverable() const;

		std::optional<portfolio::mmo::KickReason> Kick;
		bool bLoginRejected = false;
		uint64_t Character = 0;

		/** 첫 끊김의 때와 지금까지의 시도 수. */
		std::optional<double> Since;
		int32_t Attempts = 0;
	};
}
