#pragma once

// 필드 보스(엔진 없는 코드, 43): 예고된 범위의 목록(AreaWarning)과 나와 있는 보스의 목록(FieldNotice). 등장과 죽음은 채팅의 시스템 줄로 쌓고,
// 등장은 화면이 꺼내 갈 알림 사건으로도 쌓는다. "보스가 나와 있음"(들어올 때)은 목록에만 넣는다.
#include <cstdint>
#include <utility>
#include <vector>

#include "Data/GameData.h"
#include "Data/Strings.h"
#include "Protocol/MmoPackets.h"
#include "World/ChatLog.h"
#include "World/WorldState.h"

namespace MmoWorld
{
	/** 예고된 범위 하나. 중심은 고정이고 HitTick에 피해가 난다. ShownTick은 받은 때의 어림한 서버 틱이다(차오르는 비율의 시작). */
	struct FAreaWarning
	{
		uint32_t CasterId = 0;
		uint32_t SkillId = 0;
		int32_t X = 0;
		int32_t Z = 0;
		uint32_t HitTick = 0;
		double ShownTick = 0;
	};

	/** 나와 있는 보스 하나(템플릿 번호와 놓인 점). */
	struct FBossSpot
	{
		uint32_t TemplateId = 0;
		int32_t X = 0;
		int32_t Z = 0;
	};

	class FBossWatch
	{
	public:
		/** 로그아웃하거나 끊겼을 때 비운다. */
		void Reset();

		/** AreaWarning과 FieldNotice를 반영한다. 등장과 죽음은 Chat에 시스템 줄(Strings의 글)을 넣는다. 다른 패킷은 무시한다. */
		void Apply(const portfolio::mmo::Packet& Packet, double ServerTick, FChatLog& Chat, const MmoData::FGameData& Data, const MmoData::FStrings& Strings);

		/** 피해를 주는 틱이 지났거나 쏜 개체가 죽거나 나간 예고를 뺀다. */
		void Expire(double ServerTick, const FWorldState& World);

		const std::vector<FAreaWarning>& Warnings() const { return Areas; }
		const std::vector<FBossSpot>& Bosses() const { return Spots; }

		/** 지도의 보스 자리. */
		std::vector<std::pair<int32_t, int32_t>> Positions() const;

		/** 쌓인 등장 알림(보스의 템플릿 번호)을 꺼내고 비운다. */
		std::vector<uint32_t> TakeAppeared();

		/** 받은 개체 가운데 살아 있는 보스의 개체 번호(보스 체력 바). 없으면 0. */
		static uint32_t BossInView(const FWorldState& World, const MmoData::FGameData& Data);

	private:
		std::vector<FAreaWarning> Areas;
		std::vector<FBossSpot> Spots;
		std::vector<uint32_t> Appeared;
	};
}
