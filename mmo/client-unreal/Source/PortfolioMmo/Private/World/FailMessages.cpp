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
		case portfolio::mmo::FAIL_REASON_INVENTORY_FULL: return "fail.inventoryFull";
		case portfolio::mmo::FAIL_REASON_NO_ITEM: return "fail.noItem";
		case portfolio::mmo::FAIL_REASON_UNUSABLE_ITEM: return "fail.unusableItem";
		case portfolio::mmo::FAIL_REASON_IN_COMBAT: return "fail.inCombat";
		case portfolio::mmo::FAIL_REASON_TOO_FAST: return "fail.tooFast";
		case portfolio::mmo::FAIL_REASON_ALREADY_GONE: return "fail.alreadyGone";
		case portfolio::mmo::FAIL_REASON_NOT_YOURS: return "fail.notYours";
		case portfolio::mmo::FAIL_REASON_LEVEL_TOO_LOW: return "fail.levelTooLow";
		case portfolio::mmo::FAIL_REASON_WRONG_CLASS: return "fail.wrongClass";
		case portfolio::mmo::FAIL_REASON_MAX_ENCHANT: return "fail.maxEnchant";
		case portfolio::mmo::FAIL_REASON_ALREADY_LEARNED: return "fail.alreadyLearned";
		case portfolio::mmo::FAIL_REASON_NOT_ENOUGH_GOLD: return "fail.notEnoughGold";
		case portfolio::mmo::FAIL_REASON_UNSELLABLE: return "fail.unsellable";
		case portfolio::mmo::FAIL_REASON_STORAGE_FULL: return "fail.storageFull";
		case portfolio::mmo::FAIL_REASON_NO_RECIPIENT: return "fail.noRecipient";
		case portfolio::mmo::FAIL_REASON_TEXT_TOO_LONG: return "fail.textTooLong";
		case portfolio::mmo::FAIL_REASON_CHAT_TOO_FAST: return "fail.chatTooFast";
		case portfolio::mmo::FAIL_REASON_NO_PARTY: return "fail.noParty";
		case portfolio::mmo::FAIL_REASON_NOT_LEADER: return "fail.notLeader";
		case portfolio::mmo::FAIL_REASON_PARTY_FULL: return "fail.partyFull";
		case portfolio::mmo::FAIL_REASON_ALREADY_IN_PARTY: return "fail.alreadyInParty";
		case portfolio::mmo::FAIL_REASON_INVITE_PENDING: return "fail.invitePending";
		case portfolio::mmo::FAIL_REASON_NO_INVITE: return "fail.noInvite";
		case portfolio::mmo::FAIL_REASON_INVITE_DECLINED: return "fail.inviteDeclined";
		default: return "fail.other";
		}
	}
}
