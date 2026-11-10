#pragma once

// UE 타입 없이 표준 C++과 protobuf만 쓴다. 엔진 없이 컴파일해 확인하고, Unity 클라이언트가 같은 규칙을 C#으로 옮긴다.
#include <cstddef>
#include <cstdint>
#include <vector>

#include "Protocol/MmoPackets.h"

namespace MmoProtocol
{
	/** 서버가 보내는 프레임 하나의 최대 길이. 넘으면 연결이 깨졌거나 상대가 서버가 아니라고 본다. */
	inline constexpr uint32_t MaxFrameBytes = 1 << 20;

	/** Packet 하나를 protobuf의 길이 구분 형식(varint 길이 + 메시지)으로 Out 끝에 붙인다. */
	void AppendFrame(const portfolio::mmo::Packet& Packet, std::vector<uint8_t>& Out);

	enum class EReadResult
	{
		/** Packet 하나를 꺼냈다. */
		Packet,
		/** 프레임이 아직 다 오지 않았다. */
		NeedMore,
		/** 길이가 상한을 넘거나 메시지를 해석할 수 없다. 연결을 끊어야 한다. */
		Malformed,
	};

	/** TCP로 받은 바이트를 모아 프레임 단위로 Packet을 꺼낸다. 수신 스레드 하나만 쓴다. */
	class FFrameReader
	{
	public:
		void Append(const uint8_t* Data, size_t Size);

		/** 프레임 하나를 꺼내 Out에 채운다. Malformed를 돌려준 뒤에는 다시 부르지 않는다. */
		EReadResult Read(portfolio::mmo::Packet& Out);

	private:
		std::vector<uint8_t> Buffer;
		/** Buffer에서 아직 읽지 않은 첫 바이트. */
		size_t Offset = 0;
	};
}
