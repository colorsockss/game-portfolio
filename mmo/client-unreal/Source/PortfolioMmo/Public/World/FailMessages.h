#pragma once

// 실패한 요청의 이유(FailReason)마다 알림 층에 띄울 글의 Strings 키(엔진 없는 코드). 화면은 FCombatState::TakeNotices로 꺼낸 이유를
// 이 키의 글(MmoData::FStrings)로 띄운다.
#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	/** 이유의 Strings 키. 모르는 값이면 일반적인 글의 키(fail.other)다. FAIL_REASON_NONE은 빈 키다. */
	const char* FailKey(portfolio::mmo::FailReason Reason);
}
