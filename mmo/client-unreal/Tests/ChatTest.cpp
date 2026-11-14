// 채팅 기록과 채팅 입력(World/ChatLog, 41)을 UE 없이 본다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <string>

#include "World/ChatLog.h"

namespace
{
	using portfolio::mmo::Packet;

	int Failures = 0;

	void Expect(bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	}

	Packet Received(portfolio::mmo::ChatChannel Channel, uint32_t SenderId, const std::string& Text)
	{
		Packet Packet;
		portfolio::mmo::ChatReceived* Chat = Packet.mutable_chat_received();
		Chat->set_channel(Channel);
		Chat->set_sender_id(SenderId);
		Chat->set_sender_name("hero" + std::to_string(SenderId));
		Chat->set_text(Text);
		return Packet;
	}

	/** 개체 7(플레이어)만 받은 월드. */
	MmoWorld::FWorldState SeenSeven()
	{
		MmoWorld::FWorldState World;
		Packet Enter;
		portfolio::mmo::EntityEnter* Entity = Enter.mutable_entities_enter()->add_entities();
		Entity->set_id(7);
		Entity->set_kind(portfolio::mmo::ENTITY_KIND_PLAYER);
		World.Apply(Enter, 0);
		return World;
	}

	/** /로 시작하는 입력은 앞의 /를 뺀 DevCommand, 나머지는 Chat이고 받는 사람은 귓속말에만 싣는다. 빈칸뿐인 입력은 보내지 않는다. */
	void SlashInputsBecomeDevCommands()
	{
		const auto Dev = MmoWorld::ChatInputPacket(" /tp 10 -20 ", portfolio::mmo::CHAT_CHANNEL_NEARBY, "", 180);
		Expect(Dev && Dev->has_dev_command() && Dev->dev_command().line() == "tp 10 -20", "a slash line is a dev command");
		const auto Whisper = MmoWorld::ChatInputPacket("안녕", portfolio::mmo::CHAT_CHANNEL_WHISPER, "hero02", 180);
		Expect(Whisper && Whisper->has_chat() && Whisper->chat().to() == "hero02" && Whisper->chat().text() == "안녕", "a whisper carries the recipient");
		const auto Nearby = MmoWorld::ChatInputPacket("안녕", portfolio::mmo::CHAT_CHANNEL_NEARBY, "hero02", 180);
		Expect(Nearby && Nearby->chat().to().empty() && Nearby->chat().channel() == portfolio::mmo::CHAT_CHANNEL_NEARBY, "only whispers carry the recipient");
		Expect(!MmoWorld::ChatInputPacket("   ", portfolio::mmo::CHAT_CHANNEL_WORLD, "", 180), "a blank line is not sent");
	}

	/** 아는 개체의 주변 채팅만 말풍선을 만들고, 모르는 번호나 다른 채널은 줄만 만든다. */
	void BubblesNeedASeenNearbySender()
	{
		const MmoWorld::FWorldState World = SeenSeven();
		MmoWorld::FChatLog Log;
		Log.Apply(Received(portfolio::mmo::CHAT_CHANNEL_NEARBY, 7, "보임"), World);
		Log.Apply(Received(portfolio::mmo::CHAT_CHANNEL_NEARBY, 9, "안 보임"), World);
		Log.Apply(Received(portfolio::mmo::CHAT_CHANNEL_WORLD, 7, "전체"), World);
		const std::vector<MmoWorld::FChatBubble> Bubbles = Log.TakeBubbles();
		Expect(Bubbles.size() == 1 && Bubbles[0].EntityId == 7 && Bubbles[0].Text == "보임", "only the seen nearby sender gets a bubble");
		Expect(Log.TakeBubbles().empty(), "taking bubbles empties them");
		Expect(Log.Lines().size() == 3 && Log.Lines()[1].Sender == "hero9" && Log.Lines()[2].Kind == MmoWorld::EChatKind::World, "every chat is a line");
	}

	/** 100줄을 넘으면 가장 오래된 줄부터 버리고, 시스템 줄도 들어간다. */
	void TheRingDropsTheOldestLine()
	{
		const MmoWorld::FWorldState World;
		MmoWorld::FChatLog Log;
		for (int Index = 0; Index < 105; ++Index)
		{
			Log.Apply(Received(portfolio::mmo::CHAT_CHANNEL_WORLD, 1, std::to_string(Index)), World);
		}
		Expect(Log.Lines().size() == MmoWorld::FChatLog::MaxLines && Log.Lines().front().Text == "5", "the oldest lines are dropped");
		const uint64_t Before = Log.Revision();
		Log.AddSystem("보스가 나타났습니다");
		Expect(Log.Lines().back().Kind == MmoWorld::EChatKind::System && Log.Lines().back().Text == "보스가 나타났습니다", "a system line goes in");
		Expect(Log.Revision() > Before, "a new line raises the revision");
	}

	/** 자르기는 한글의 가운데를 자르지 않는다. */
	void TrimmingKeepsWholeCharacters()
	{
		Expect(MmoWorld::TrimUtf8("가나다", 9) == "가나다", "a short text stays");
		Expect(MmoWorld::TrimUtf8("가나다", 8) == "가나", "a cut inside a syllable drops the syllable");
		Expect(MmoWorld::TrimUtf8("a가", 2) == "a", "a cut after one byte of a syllable drops it");
		const auto Long = MmoWorld::ChatInputPacket(std::string(61 * 3, 'x').replace(0, 3, "가"), portfolio::mmo::CHAT_CHANNEL_NEARBY, "", 180);
		Expect(Long && Long->chat().text().size() == 180, "the input is trimmed to the limit");
	}
}

int main()
{
	SlashInputsBecomeDevCommands();
	BubblesNeedASeenNearbySender();
	TheRingDropsTheOldestLine();
	TrimmingKeepsWholeCharacters();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Chat tests passed\n");
	return EXIT_SUCCESS;
}
