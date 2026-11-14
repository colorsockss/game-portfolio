#pragma once

// 개발 명령(68. 엔진 없는 코드): 글 한 줄을 DevCommand로 보낸다. 채팅 입력의 /로 시작하는 줄(41, ChatInputPacket)과 개발 빌드의 콘솔 명령
// Mmo.Dev가 부른다. --dev 서버만 실행하고, 실패는 다른 실패처럼 알림 층에 뜬다(28).
#include <string>

#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	/** 앞뒤의 빈칸을 뺀 글 한 줄의 DevCommand. 빈 줄은 빈 글을 싣는다(서버가 "쓸 수 없는 명령"으로 답함). */
	portfolio::mmo::Packet DevCommandPacket(const std::string& Line);
}
