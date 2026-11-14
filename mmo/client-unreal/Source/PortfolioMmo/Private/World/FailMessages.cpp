#include "World/FailMessages.h"

namespace MmoWorld
{
	const char* FailKey(portfolio::mmo::FailReason Reason)
	{
		switch (Reason)
		{
		case portfolio::mmo::FAIL_REASON_NONE: return "";
		case portfolio::mmo::FAIL_REASON_NO_TARGET: return "fail.noTarget";
		case portfolio::mmo::FAIL_REASON_INVALID_TARGET: return "fail.invalidTarget";
		case portfolio::mmo::FAIL_REASON_DEAD: return "fail.dead";
		case portfolio::mmo::FAIL_REASON_NOT_DEAD: return "fail.notDead";
		case portfolio::mmo::FAIL_REASON_NOT_LEARNED: return "fail.notLearned";
		case portfolio::mmo::FAIL_REASON_COOLDOWN: return "fail.cooldown";
		case portfolio::mmo::FAIL_REASON_NOT_ENOUGH_MP: return "fail.notEnoughMp";
		case portfolio::mmo::FAIL_REASON_OUT_OF_RANGE: return "fail.outOfRange";
		case portfolio::mmo::FAIL_REASON_BLOCKED: return "fail.blocked";
		case portfolio::mmo::FAIL_REASON_BUSY: return "fail.busy";
		case portfolio::mmo::FAIL_REASON_STUNNED: return "fail.stunned";
		case portfolio::mmo::FAIL_REASON_CANCELLED: return "fail.cancelled";
		case portfolio::mmo::FAIL_REASON_INVALID_COMMAND: return "fail.invalidCommand";
		default: return "fail.other";
		}
	}
}
