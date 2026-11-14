#include "World/ChatLog.h"

#include <utility>

#include "World/DevCommand.h"

namespace MmoWorld
{
	namespace
	{
		EChatKind KindOf(portfolio::mmo::ChatChannel Channel)
		{
			switch (Channel)
			{
			case portfolio::mmo::CHAT_CHANNEL_PARTY: return EChatKind::Party;
			case portfolio::mmo::CHAT_CHANNEL_WORLD: return EChatKind::World;
			case portfolio::mmo::CHAT_CHANNEL_WHISPER: return EChatKind::Whisper;
			default: return EChatKind::Nearby;
			}
		}
	}

	void FChatLog::Reset()
	{
		Entries.clear();
		Bubbles.clear();
		++Changes;
	}

	void FChatLog::Apply(const portfolio::mmo::Packet& Packet, const FWorldState& World)
	{
		if (Packet.body_case() != portfolio::mmo::Packet::kChatReceived)
		{
			return;
		}

		const portfolio::mmo::ChatReceived& Chat = Packet.chat_received();
		if ((Chat.channel() == portfolio::mmo::CHAT_CHANNEL_NEARBY) && World.Entities().contains(Chat.sender_id()))
		{
			Bubbles.push_back({ Chat.sender_id(), Chat.text() });
		}
		Push({ KindOf(Chat.channel()), Chat.sender_name(), Chat.to(), Chat.text() });
	}

	void FChatLog::AddSystem(std::string Text)
	{
		Push({ EChatKind::System, {}, {}, std::move(Text) });
	}

	std::vector<FChatBubble> FChatLog::TakeBubbles()
	{
		return std::exchange(Bubbles, {});
	}

	void FChatLog::Push(FChatLine Line)
	{
		Entries.push_back(std::move(Line));
		while (Entries.size() > MaxLines)
		{
			Entries.pop_front();
		}
		++Changes;
	}

	std::optional<portfolio::mmo::Packet> ChatInputPacket(const std::string& Text, portfolio::mmo::ChatChannel Channel, const std::string& To, size_t MaxBytes)
	{
		if (Text.find_first_not_of(" \t") == std::string::npos)
		{
			return std::nullopt;
		}

		if (Text[Text.find_first_not_of(" \t")] == '/')
		{
			return DevCommandPacket(Text.substr(Text.find('/') + 1));
		}

		portfolio::mmo::Packet Packet;
		portfolio::mmo::Chat* Chat = Packet.mutable_chat();
		Chat->set_channel(Channel);
		Chat->set_text(TrimUtf8(Text, MaxBytes));
		if (Channel == portfolio::mmo::CHAT_CHANNEL_WHISPER)
		{
			Chat->set_to(To);
		}
		return Packet;
	}

	std::string TrimUtf8(const std::string& Text, size_t MaxBytes)
	{
		if (Text.size() <= MaxBytes)
		{
			return Text;
		}

		// 자르는 자리가 이어지는 바이트(10xxxxxx)면 그 글자의 첫 바이트까지 물러난다.
		size_t End = MaxBytes;
		while ((End > 0) && ((static_cast<unsigned char>(Text[End]) & 0xC0) == 0x80))
		{
			--End;
		}
		return Text.substr(0, End);
	}
}
