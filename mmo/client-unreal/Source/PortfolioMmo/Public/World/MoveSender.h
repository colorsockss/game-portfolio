#pragma once

// UE 타입 없이 표준 C++과 protobuf만 쓴다. Unity 클라이언트가 같은 구조를 C#으로 옮긴다.
#include <cstdint>

#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	/**
	 * 내 캐릭터의 Move를 언제 보낼지 정한다. 프레임 시간을 모아 서버 틱 간격(50 ms)이 되면, 마지막으로 보낸 값과 다를 때만 보낸다.
	 * 멈추면 멈춘 자리가 마지막으로 보낸 값과 다르므로 다음 간격에 한 번 더 가고, 그 뒤로는 보내지 않는다.
	 */
	class FMoveSender
	{
	public:
		/** 새 연결을 시작할 때 비운다. */
		void Reset();

		/**
		 * 프레임마다 부른다. 지금의 위치·방향(패킷 단위)과 ack, 지난 프레임 시간(초)을 받아 보낼 Move가 있으면 Out에 채우고 true를 낸다.
		 */
		bool Update(double DeltaSeconds, int32_t X, int32_t Z, uint32_t Yaw, uint32_t Ack, portfolio::mmo::Move& Out);

		/**
		 * 행동 패킷(스킬, 공격, 채집 등)을 보내기 직전에 부른다. 아직 보내지 않은 위치가 있으면 지금 보낼 Move를 채우고 true를 낸다.
		 * 행동 뒤에 도착한 Move가 방금 시작한 시전을 취소하지 않게 하려는 것이다.
		 */
		bool Flush(int32_t X, int32_t Z, uint32_t Yaw, uint32_t Ack, portfolio::mmo::Move& Out);

	private:
		/** 마지막으로 보낸 것과 다르면 Out에 채우고 보낸 것으로 기록한다. */
		bool SendIfChanged(int32_t X, int32_t Z, uint32_t Yaw, uint32_t Ack, portfolio::mmo::Move& Out);

		bool bSent = false;
		int32_t SentX = 0;
		int32_t SentZ = 0;
		uint32_t SentYaw = 0;
		uint32_t SentAck = 0;
		/** 지난 Move 뒤로 모은 시간(초). */
		double Elapsed = 0;
	};
}
