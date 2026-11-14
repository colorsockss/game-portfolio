#include "World/FailMessages.h"

namespace MmoWorld
{
	const char* FailMessage(portfolio::mmo::FailReason Reason)
	{
		switch (Reason)
		{
		case portfolio::mmo::FAIL_REASON_NONE: return "";
		case portfolio::mmo::FAIL_REASON_NO_TARGET: return "대상이 없습니다";
		case portfolio::mmo::FAIL_REASON_INVALID_TARGET: return "공격할 수 없는 대상입니다";
		case portfolio::mmo::FAIL_REASON_DEAD: return "쓰러진 동안에는 할 수 없습니다";
		case portfolio::mmo::FAIL_REASON_NOT_DEAD: return "쓰러지지 않았습니다";
		case portfolio::mmo::FAIL_REASON_NOT_LEARNED: return "배우지 않은 스킬입니다";
		case portfolio::mmo::FAIL_REASON_COOLDOWN: return "아직 쓸 수 없습니다";
		case portfolio::mmo::FAIL_REASON_NOT_ENOUGH_MP: return "마나가 부족합니다";
		case portfolio::mmo::FAIL_REASON_OUT_OF_RANGE: return "너무 멉니다";
		case portfolio::mmo::FAIL_REASON_BLOCKED: return "막혀 있습니다";
		case portfolio::mmo::FAIL_REASON_BUSY: return "다른 일을 하는 중입니다";
		case portfolio::mmo::FAIL_REASON_STUNNED: return "기절한 동안에는 할 수 없습니다";
		case portfolio::mmo::FAIL_REASON_CANCELLED: return "취소되었습니다";
		default: return "할 수 없습니다";
		}
	}
}
