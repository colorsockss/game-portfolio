#pragma once

// 내 대상과 기본 공격, 스킬 쓰기와 쿨다운, 화면이 꺼내 갈 전투 사건, 따라가는 발사체와 서버가 옮기는 직선 발사체(엔진 없는 코드). Unity 클라이언트가 같은 구조를 C#으로 옮긴다.
// 서버의 패킷은 FWorldState에 먼저 반영(체력, 죽음, 효과, 진행 중인 일)한 뒤 여기에 넘긴다. 보낼 요청(AttackStart, AttackStop, UseSkill)은
// 함수가 돌려주고 부르는 쪽이 보낸다.
#include <cstdint>
#include <optional>
#include <vector>

#include "Data/GameData.h"
#include "Protocol/MmoPackets.h"
#include "World/Cooldowns.h"
#include "World/FieldMap.h"
#include "World/MoveSender.h"
#include "World/PathFinder.h"
#include "World/WorldState.h"

namespace MmoWorld
{
	enum class ECombatEventKind : uint8_t
	{
		/** 공격 동작의 시작(AttackSwing, 또는 내 첫 공격의 예측). */
		Swing,
		/** 피해(Damaged). 체력은 이미 개체에 반영했다. */
		Damage,
		/** 죽음(Died). 죽음 표시는 이미 개체에 반영했다. */
		Death,
		/** 부활(Revived). 체력과 죽음 표시는 이미 개체에 반영했다. */
		Revive,
		/** 스킬 동작의 시작(SkillUsed, 또는 내 스킬의 예측). Skill이 스킬이고 Attacker가 시전자다. */
		Skill,
		/** 진행 중인 일의 시작(Progress). Target이 그 개체, Skill이 종류에 따른 번호(시전은 Skills)다. 끝나는 틱이 지나면 화면이 끝낸다. */
		ProgressStart,
		/** 진행 중인 일이나 내 스킬의 예측이 끊김(ProgressCancelled, 기다리던 스킬의 실패). Target이 그 개체다. */
		Interrupt,
	};

	/** 화면이 받은 순서대로 그릴 사건. 공격자 번호 0은 받지 않은 개체다(개체를 찾지 않고 대상 쪽만 그린다). */
	struct FCombatEvent
	{
		ECombatEventKind Kind = ECombatEventKind::Swing;
		uint32_t Attacker = 0;
		uint32_t Target = 0;
		uint32_t Damage = 0;
		bool bCritical = false;
		/** 내가 주거나 받은 것(피해 숫자는 이것만 띄운다). */
		bool bMine = false;
		/** Skill, ProgressStart의 번호. */
		uint32_t Skill = 0;
	};

	/** 누른 스킬을 지금 할 일. Approach면 Goal(대상의 자리)까지 걷고, Fire면 FireSkill로 보낸다. */
	struct FSkillStep
	{
		enum class EKind : uint8_t { None, Approach, Fire };
		EKind Kind = EKind::None;
		FPoint Goal;
	};

	/** 스킬을 보낼 때의 패킷(차례대로 보냄). bStop이면 보내기 전에 걷던 경로를 버리고 캐릭터를 세운다(시전 시간이 있는 스킬). */
	struct FSkillFire
	{
		bool bStop = false;
		std::vector<portfolio::mmo::Packet> Packets;
	};

	/** 대상을 따라가는 발사체 하나(마법사의 기본 공격, 원거리 몬스터). 좌표는 패킷의 단위다. */
	struct FProjectile
	{
		/** 이 연결 안에서 발사체마다 다른 번호(화면이 이펙트를 이어 붙임). 서버에는 없는 번호다. */
		uint32_t Id = 0;
		uint32_t Attacker = 0;
		uint32_t Target = 0;
		/** 나가는 때(내 시간, 초): AttackSwing을 받은 때 + 타격까지의 시간. */
		double LaunchSeconds = 0;
		bool bLaunched = false;
		double X = 0;
		double Z = 0;
		double LastSeconds = 0;
		/** 속도(단위/초). */
		double Speed = 0;
	};

	/** 서버가 옮기는 직선 발사체 하나(83). ProjectileLaunched가 실은 나간 자리와 틱에서 계산하고, 쏜 쪽을 그린 자리나 받은 때로 어림하지 않는다. */
	struct FLineProjectile
	{
		/** 서버가 매긴 번호(ProjectileEnded가 가리킴). 따라가는 발사체의 번호와는 다른 공간이다. */
		uint32_t Id = 0;
		uint32_t Caster = 0;
		int32_t X = 0;
		int32_t Z = 0;
		uint32_t Tick = 0;
		uint32_t Yaw = 0;
		/** 속도(좌표 단위/초). */
		uint32_t Speed = 0;

		/** 서버 틱 ServerTick(어림한 소수 틱)에 그릴 자리: 나간 자리 + 방향 × 속도 × (ServerTick − 나간 틱). 나간 틱 전이면 나간 자리다. */
		FPose At(double ServerTick) const;
	};

	class FCombatState
	{
	public:
		/** 내 대상(0이면 없음). 고르는 것은 클라이언트 안의 일이다. */
		uint32_t Target() const { return TargetId; }

		/** 서버에 AttackStart를 보낸 뒤 공격 중이다(AttackStop, 공격의 ActionFailed, 대상을 풀거나 바꿈으로 끝남). */
		bool IsAttacking() const { return bAttacking; }

		/** 내 첫 공격의 동작을 AttackStart를 보낼 때 미리 시작했고 그 공격의 AttackSwing을 아직 받지 않았다. */
		bool IsPredicted() const { return bPredicted; }

		/** 대상을 고른다(0이면 푼다). 공격 중에 풀거나 다른 대상으로 바꾸면 공격을 끝내고 AttackStop을 돌려준다. */
		std::optional<portfolio::mmo::Packet> SetTarget(uint32_t Id);

		/** 대상을 공격하기 시작한다(다가간 뒤, 밀린 위치를 보낸 뒤). 이미 공격 중이거나 내가 죽어 있으면 nullopt. 첫 공격이면 내 공격 동작을 미리 쌓는다. */
		std::optional<portfolio::mmo::Packet> StartAttack(uint32_t SelfId);

		/** 공격을 멈춘다. 공격 중이 아니었으면 nullopt. */
		std::optional<portfolio::mmo::Packet> StopAttack();

		/**
		 * 서버의 패킷 하나를 반영한다(FWorldState에 먼저 반영한 뒤). 사건을 쌓고, 따라가는 발사체를 만들고, 대상이 죽거나 나가면 대상을 푼다
		 * (공격 중이었으면 AttackStop을 돌려줌). NowSeconds는 받은 때(단조 증가하는 내 시간, 초)다.
		 */
		std::optional<portfolio::mmo::Packet> Apply(const portfolio::mmo::Packet& Packet, const FWorldState& World, const MmoData::FGameData& Data, double NowSeconds);

		/** 지난번에 꺼낸 뒤로 쌓인 사건(받은 순서). */
		std::vector<FCombatEvent> TakeEvents();

		/**
		 * 발사체를 NowSeconds까지 옮긴다: 나갈 때가 된 것은 화면이 공격자를 그리는 자리(FWorldState::DrawnPose)에서 나가고, 나간 것은 대상을 그리는
		 * 자리 쪽으로 간다. 닿거나 대상이 없으면 지운다.
		 */
		void UpdateProjectiles(const FWorldState& World, double NowSeconds);

		const std::vector<FProjectile>& Projectiles() const { return Flying; }

		/** 날고 있는 직선 발사체(ProjectileLaunched부터 ProjectileEnded나 쏜 쪽의 나감까지). */
		const std::vector<FLineProjectile>& LineProjectiles() const { return Lines; }

		/** 퀵슬롯의 스킬(앞 칸부터, 최대 CONSTANT_QUICKSLOT_COUNT). 임시: 스킬 배우기(36) 전에는 그 직업의 스킬을 모두 번호 차례로 둔다. */
		static std::vector<uint32_t> Quickslots(const MmoData::FGameData& Data, uint32_t CharacterClass);

		/** 대상에게 쓰는 스킬인가(단일 피해, 상태 이상, 대상 중심의 범위 피해). 아니면 그 자리에서 쓴다(대상이 있어도 다가가지 않음). */
		static bool TargetsOther(const portfolio::mmo::data::SkillsRow& Skill);

		/** 서버가 옮기는 직선 발사체로 나가는 스킬인가(발사체의 속도가 있음, 83). 대상이 없어도 쓰고, 있으면 다른 대상 스킬처럼 다가간다. */
		static bool Launches(const portfolio::mmo::data::SkillsRow& Skill);

		/**
		 * 퀵슬롯의 스킬을 누른다: 죽음, 기절, 진행 중, 쿨다운, 마나, 대상(직선 발사체가 아닌 대상 스킬)을 먼저 보고, 통과하면 그 스킬을 기다리게 둔다
		 * (UpdateSkill이 이어 감). 어긋나면 그 이유이고 아무것도 보내지 않는다.
		 */
		portfolio::mmo::FailReason PressSkill(uint32_t SkillId, const FWorldState& World, const MmoData::FGameData& Data, double NowSeconds);

		/** 누른 스킬이 기다리는가(다가가는 중 포함). */
		uint32_t PendingSkill() const { return Pending; }

		/** 누른 스킬을 그만둔다(손 이동 입력, 대상을 바꿈). */
		void CancelSkill() { Pending = 0; }

		/**
		 * 누른 스킬을 (X, Z)에서 할 일: 그 자리에서 쓰는 스킬은 Fire. 대상에게 쓰는 스킬은 지금 자리에서 칠 수 있으면(사거리, 선, 몬스터면 안전 지대 밖)
		 * Fire, 아니면 Approach. 대상이 없어지거나 죽었으면 그만두고 None이다. 직선 발사체의 스킬은 살아 있는 대상이 없으면 바로 Fire다.
		 */
		FSkillStep UpdateSkill(const FWorldState& World, const FFieldMap& Field, const MmoData::FGameData& Data, int32_t X, int32_t Z);

		/**
		 * 누른 스킬을 보낸다: 시전 시간이 있으면 캐릭터를 세우고 밀린 위치를 먼저 보내며(Sender.Flush), 쥐고 있던 이동 입력을 놓을 때까지 무시한다.
		 * 직선 발사체의 스킬도 밀린 위치와 방향을 먼저 보낸다(대상이 없으면 서버가 보는 쪽으로 쏨). 대상은 살아 있을 때만 싣는다.
		 * 시전 시간이 없으면 쿨다운을 미리 돌린다. 내 동작(시전이면 ProgressStart, 아니면 Skill)을 미리 쌓고 답을 기다린다.
		 */
		FSkillFire FireSkill(const FWorldState& World, const MmoData::FGameData& Data, FMoveSender& Sender, int32_t X, int32_t Z, uint32_t Yaw, double NowSeconds);

		/** 이번 프레임의 이동 입력을 써도 되는가. 시전 시간이 있는 스킬을 보낼 때 쥐고 있던 입력은 한 번 없어질 때까지 막는다. */
		bool AllowMove(bool bHasInput);

		/** 내 스킬의 쿨다운. */
		const FCooldowns& Cooldowns() const { return SkillCooldowns; }

		/** 월드를 떠날 때 비운다. */
		void Reset();

		/** 받은 개체 가운데 살아 있는 몬스터에서 (X, Z)에 직선거리가 가장 가까운 것. 없으면 0. */
		static uint32_t NearestEnemy(const FWorldState& World, int32_t X, int32_t Z);

		/** (X, Z)에서 대상을 칠 수 있는가: 사거리 안이고 선이 트였으며, 대상이 몬스터면 내 자리가 안전 지대 밖이다(안에서는 CanAttack이 거짓). */
		static bool CanStrikeFrom(const FFieldMap& Field, int32_t X, int32_t Z, const FEntity& Target, double RangeMeters);

		/** 개체의 기본 공격(사거리 m, 타격까지의 시간 ms, 발사체 속도 m/s. 없으면 0). 플레이어는 Classes, 몬스터는 Monsters. 모르는 개체면 nullopt. */
		struct FAttack
		{
			double RangeMeters = 0;
			uint32_t HitDelayMs = 0;
			double ProjectileSpeed = 0;
		};
		static std::optional<FAttack> AttackOf(const portfolio::mmo::EntityEnter& Info, const MmoData::FGameData& Data);

	private:
		void Release(std::optional<portfolio::mmo::Packet>& Stop);

		uint32_t TargetId = 0;
		bool bAttacking = false;
		bool bPredicted = false;
		/** 내가 죽어 있다(Died부터 Revived까지). */
		bool bSelfDead = false;
		uint32_t Self = 0;
		/** 누른 스킬(0이면 없음)과, 보내고 답(SkillUsed, Progress, 실패)을 기다리는 스킬. */
		uint32_t Pending = 0;
		uint32_t Awaiting = 0;
		/** 마지막으로 준 발사체 번호. */
		uint32_t LastProjectile = 0;
		/** 시전 시간이 있는 스킬을 보낼 때 쥐고 있던 이동 입력을 놓을 때까지 막는다. */
		bool bHoldMove = false;
		FCooldowns SkillCooldowns;
		std::vector<FCombatEvent> Events;
		std::vector<FProjectile> Flying;
		std::vector<FLineProjectile> Lines;
	};
}
