// Protocol/의 엔진 없는 코드를 UE 없이 컴파일해 확인한다. UE 헤더를 include하면 이 테스트가 컴파일되지 않으므로 경계 검사도 된다.
// run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

#include "Protocol/PacketFrames.h"

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

	portfolio::mmo::Packet LoginPacket()
	{
		portfolio::mmo::Packet Packet;
		Packet.mutable_login()->set_protocol_version(portfolio::mmo::PROTOCOL_VERSION_CURRENT);
		Packet.mutable_login()->set_login_id("hero_01");
		return Packet;
	}

	void FrameMatchesTheWireFormatTheServerReads()
	{
		std::vector<uint8_t> Frame;
		MmoProtocol::AppendFrame(LoginPacket(), Frame);
		// 길이 13, Packet.login(필드 1, 길이 11), Login.protocol_version = 1, Login.login_id = "hero_01".
		const std::vector<uint8_t> Expected = { 0x0D, 0x0A, 0x0B, 0x08, 0x01, 0x12, 0x07, 'h', 'e', 'r', 'o', '_', '0', '1' };
		Expect(Frame == Expected, "AppendFrame writes the varint length and the message");
	}

	void FramesSplitAcrossReadsAreJoined()
	{
		std::vector<uint8_t> Bytes;
		MmoProtocol::AppendFrame(LoginPacket(), Bytes);
		MmoProtocol::AppendFrame(LoginPacket(), Bytes);

		MmoProtocol::FFrameReader Reader;
		portfolio::mmo::Packet Packet;
		int Packets = 0;
		for (uint8_t Byte : Bytes)
		{
			Reader.Append(&Byte, 1);
			MmoProtocol::EReadResult Result;
			while ((Result = Reader.Read(Packet)) == MmoProtocol::EReadResult::Packet)
			{
				Expect(Packet.login().login_id() == "hero_01", "a split frame is parsed whole");
				++Packets;
			}
			Expect(Result == MmoProtocol::EReadResult::NeedMore, "an incomplete frame waits for more bytes");
		}
		Expect(Packets == 2, "two frames sent byte by byte give two packets");
	}

	void OversizedOrBrokenFramesAreMalformed()
	{
		MmoProtocol::FFrameReader TooLong;
		// varint 0x100001 = MaxFrameBytes + 1.
		const uint8_t Length[] = { 0x81, 0x80, 0x40 };
		TooLong.Append(Length, sizeof(Length));
		portfolio::mmo::Packet Packet;
		Expect(TooLong.Read(Packet) == MmoProtocol::EReadResult::Malformed, "a length over MaxFrameBytes is malformed");

		MmoProtocol::FFrameReader LongVarint;
		const uint8_t Varint[] = { 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01 };
		LongVarint.Append(Varint, sizeof(Varint));
		Expect(LongVarint.Read(Packet) == MmoProtocol::EReadResult::Malformed, "a varint longer than 5 bytes is malformed");

		MmoProtocol::FFrameReader Garbage;
		// 길이 2, 필드 1의 길이 구분 값이 남은 바이트보다 길다.
		const uint8_t Body[] = { 0x02, 0x0A, 0x05 };
		Garbage.Append(Body, sizeof(Body));
		Expect(Garbage.Read(Packet) == MmoProtocol::EReadResult::Malformed, "a body protobuf cannot parse is malformed");
	}
}

int main()
{
	FrameMatchesTheWireFormatTheServerReads();
	FramesSplitAcrossReadsAreJoined();
	OversizedOrBrokenFramesAreMalformed();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("PacketFrames tests passed\n");
	return EXIT_SUCCESS;
}
