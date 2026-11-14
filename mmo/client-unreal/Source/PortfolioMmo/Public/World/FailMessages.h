#pragma once

// 실패한 요청의 이유(FailReason)마다 알림 층에 띄울 짧은 글(엔진 없는 코드, UTF-8). 화면은 FCombatState::TakeNotices로 꺼낸 이유를 이 글로 띄운다.
// shortcut: 문자열 테이블(Strings, backlog 74) 전이라 글을 여기에 둔다. 74가 생기면 값마다 Strings의 키를 두고 이 표를 그 키로 바꾼다.
#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	/** 이유의 글. 모르는 값이면 일반적인 글이다. FAIL_REASON_NONE은 빈 글이다. */
	const char* FailMessage(portfolio::mmo::FailReason Reason);
}
