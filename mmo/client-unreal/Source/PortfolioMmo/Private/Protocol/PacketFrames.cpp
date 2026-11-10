#include "Protocol/PacketFrames.h"

#include <google/protobuf/io/coded_stream.h>

namespace MmoProtocol
{
	/** varint로 쓴 uint32의 최대 바이트 수. */
	static constexpr size_t MaxVarintBytes = 5;

	void AppendFrame(const portfolio::mmo::Packet& Packet, std::vector<uint8_t>& Out)
	{
		const size_t Size = Packet.ByteSizeLong();
		const size_t Start = Out.size();
		Out.resize(Start + MaxVarintBytes + Size);
		uint8_t* Body = google::protobuf::io::CodedOutputStream::WriteVarint32ToArray(static_cast<uint32_t>(Size), Out.data() + Start);
		const uint8_t* End = Packet.SerializeWithCachedSizesToArray(Body);
		Out.resize(static_cast<size_t>(End - Out.data()));
	}

	void FFrameReader::Append(const uint8_t* Data, size_t Size)
	{
		// 앞쪽의 읽은 바이트가 남은 바이트보다 많아지면 당겨서, 버퍼가 받은 양만큼 계속 커지지 않게 한다.
		if (Offset > 0 && Offset >= Buffer.size() - Offset)
		{
			Buffer.erase(Buffer.begin(), Buffer.begin() + static_cast<std::ptrdiff_t>(Offset));
			Offset = 0;
		}
		Buffer.insert(Buffer.end(), Data, Data + Size);
	}

	EReadResult FFrameReader::Read(portfolio::mmo::Packet& Out)
	{
		uint32_t Length = 0;
		size_t Header = 0;
		for (;;)
		{
			if (Offset + Header >= Buffer.size())
			{
				return EReadResult::NeedMore;
			}
			const uint8_t Byte = Buffer[Offset + Header];
			Length |= static_cast<uint32_t>(Byte & 0x7F) << (7 * Header);
			++Header;
			if ((Byte & 0x80) == 0)
			{
				break;
			}
			if (Header == MaxVarintBytes)
			{
				return EReadResult::Malformed;
			}
		}

		if (Length > MaxFrameBytes)
		{
			return EReadResult::Malformed;
		}
		if (Buffer.size() - Offset - Header < Length)
		{
			return EReadResult::NeedMore;
		}
		if (!Out.ParseFromArray(Buffer.data() + Offset + Header, static_cast<int>(Length)))
		{
			return EReadResult::Malformed;
		}
		Offset += Header + Length;
		return EReadResult::Packet;
	}
}
