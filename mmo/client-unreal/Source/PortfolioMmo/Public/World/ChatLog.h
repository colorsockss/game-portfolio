#pragma once

// 채팅 기록(엔진 없는 코드, 41). 서버의 ChatReceived와 클라이언트가 알림 패킷으로 만든 시스템 줄을 링 버퍼에 모으고, 화면에 있는 개체의 주변 채팅은
// 화면이 꺼내 갈 말풍선 사건으로도 쌓는다. 채팅 입력 한 줄을 보낼 패킷(채팅 또는 /로 시작하면 개발 명령)으로 바꾸는 것도 여기에 둔다.
#include <cstdint>
#include <deque>
#include <optional>
#include <string>
#include <vector>

#include "Protocol/MmoPackets.h"
#include "World/WorldState.h"

namespace MmoWorld
{
	/** 채팅 줄의 종류: 채널 넷과 시스템 줄. */
	enum class EChatKind : uint8_t
	{
		Nearby,
		Party,
		World,
		Whisper,
		System,
	};

	/** 채팅창의 줄 하나. 시스템 줄은 Text만 쓴다. To는 귓속말의 받는 사람이다. */
	struct FChatLine
	{
		EChatKind Kind = EChatKind::System;
		std::string Sender;
		std::string To;
		std::string Text;
	};

	/** 머리 위에 띄울 말풍선 하나(주변 채팅). */
	struct FChatBubble
	{
		uint32_t EntityId = 0;
		std::string Text;
	};

	class FChatLog
	{
	public:
		/** 남기는 줄 수. 넘으면 가장 오래된 줄부터 버린다. */
		static constexpr size_t MaxLines = 100;

		/** 로그아웃하거나 끊겼을 때 비운다. */
		void Reset();

		/** ChatReceived를 줄로 넣는다. 보낸 사람이 World에 있는 개체이고 채널이 주변이면 말풍선 사건도 쌓는다. 다른 패킷은 무시한다. */
		void Apply(const portfolio::mmo::Packet& Packet, const FWorldState& World);

		/** 시스템 줄을 넣는다(보스 등장 43 같은 알림 패킷의 글). */
		void AddSystem(std::string Text);

		/** 오래된 줄이 앞이다. */
		const std::deque<FChatLine>& Lines() const { return Entries; }

		/** 줄이 들어올 때마다 오른다(화면이 다시 그릴지 본다). */
		uint64_t Revision() const { return Changes; }

		/** 쌓인 말풍선 사건을 꺼내고 비운다. */
		std::vector<FChatBubble> TakeBubbles();

	private:
		void Push(FChatLine Line);

		std::deque<FChatLine> Entries;
		std::vector<FChatBubble> Bubbles;
		uint64_t Changes = 0;
	};

	/**
	 * 채팅 입력 한 줄의 패킷. /로 시작하면 Chat이 아니라 앞의 /를 뺀 글의 DevCommand다(68). 빈칸뿐인 줄은 보내지 않는다(nullopt).
	 * 글은 MaxBytes(Constants.chatMaxBytes) 안으로 자른다. To는 귓속말에만 싣는다.
	 */
	std::optional<portfolio::mmo::Packet> ChatInputPacket(const std::string& Text, portfolio::mmo::ChatChannel Channel, const std::string& To, size_t MaxBytes);

	/** UTF-8 글을 MaxBytes 바이트 안으로 글자 단위로 자른다(글자의 가운데를 자르지 않음). */
	std::string TrimUtf8(const std::string& Text, size_t MaxBytes);
}
