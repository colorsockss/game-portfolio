#pragma once

// UE 타입 없이 표준 C++과 protobuf만 쓴다(Protocol/과 같다). Unity 클라이언트가 같은 구조를 C#으로 옮긴다.
#include <cstdint>
#include <string>
#include <unordered_map>
#include <vector>

#include "Protocol/MmoPackets.h"

namespace MmoWorld
{
	/**
	 * 서버의 지금 틱을 어림한다. 받은 틱 번호(LoginResult, Pong, EntityMoves)와 받은 때로 "서버 틱 - 내 시간 × 틱 수"를 구하고,
	 * 가장 빨리 도착한(지연이 가장 작은) 값을 따른다. 늦게 온 패킷 쪽으로는 천천히만 내려가 TCP가 몰아 전해도 시계가 흔들리지 않는다.
	 */
	class FServerClock
	{
	public:
		void Reset() { bKnown = false; }

		/** 서버 틱 번호를 받았다. NowSeconds는 단조 증가하는 내 시간(초)이다. */
		void Observe(uint32_t Tick, double NowSeconds);

		/** 서버의 지금 틱(소수). 아직 받은 틱이 없으면 0. */
		double Now(double NowSeconds) const;

		bool IsKnown() const { return bKnown; }

	private:
		bool bKnown = false;
		/** 서버 틱 - 내 시간 × 초당 틱 수. */
		double Offset = 0;
	};

	/** 개체가 어떤 틱에 있던 자리. 좌표와 방향은 패킷의 단위다. */
	struct FTrackSample
	{
		int64_t Tick = 0;
		int32_t X = 0;
		int32_t Z = 0;
		uint32_t Yaw = 0;
	};

	/** 보간한 자리. 좌표와 방향은 패킷의 단위이고 소수다. Yaw는 0 이상 YawSteps 미만이다. */
	struct FPose
	{
		double X = 0;
		double Z = 0;
		double Yaw = 0;
	};

	/** 개체의 최근 자리 기록(틱 번호 차례). 다른 개체를 서버 틱 사이에서 매끄럽게 그리는 데 쓴다. */
	class FEntityTrack
	{
	public:
		/** 기록은 이만큼만 둔다. 그리는 틱은 받은 틱보다 2틱 뒤라 몇 개면 넉넉하다. */
		static constexpr size_t Capacity = 8;

		/** 멈춰 있던 개체가 다시 움직였다고 볼 틱 간격. 계속 걷는 개체도 패킷이 몰리거나 프레임이 낮으면 한두 틱이 빠진다. */
		static constexpr int64_t RestartGapTicks = 4;

		/**
		 * 기록을 더한다. 앞 기록보다 RestartGapTicks 넘게 뒤면 한 틱 앞에 옛 자리를 끼워, 오래 서 있던 개체가 출발할 때 미끄러지지 않게 한다.
		 * 앞 기록과 틱이 같거나 앞이면 마지막 기록을 고친다.
		 */
		void Push(const FTrackSample& Sample);

		/** RenderTick의 자리. 앞뒤 두 기록 사이를 선형으로, 방향은 가까운 쪽으로 보간한다. 기록 밖이면 끝의 기록에 세운다(앞질러 그리지 않는다). */
		FPose Sample(double RenderTick) const;

		void Clear() { Samples.clear(); }
		const std::vector<FTrackSample>& History() const { return Samples; }

	private:
		std::vector<FTrackSample> Samples;
	};

	/** 시야 안의 개체 하나. 좌표와 방향은 패킷의 단위 그대로다(packets.proto의 Constant). */
	struct FEntity
	{
		uint32_t Id = 0;
		int32_t X = 0;
		int32_t Z = 0;
		uint32_t Yaw = 0;
		std::string Name;
		/** 받은 자리의 기록. 화면은 Sample(RenderTick)로 그린다. */
		FEntityTrack Track;
	};

	/**
	 * 서버가 알려 준 월드: 내 개체 번호, 서버 시계, 시야 안의 개체들. 연결과 수명이 같고, 화면(위젯·액터)은 이것을 읽기만 한다.
	 * 화면이 아직 없을 때 온 패킷(로그인한 틱의 EntitiesEnter 등)도 여기에 남는다.
	 */
	class FWorldState
	{
	public:
		/** 다른 개체를 그리는 틱은 서버의 지금 틱보다 이만큼 뒤다. 그 사이에 다음 기록이 도착해 보간할 앞뒤가 생긴다. */
		static constexpr double InterpolationDelayTicks = 2;

		/** 새 연결을 시작할 때 비운다. 보이던 개체는 모두 나간 목록에 들어간다. */
		void Reset();

		/** 서버가 보낸 패킷 하나를 반영한다. 월드와 무관한 패킷은 무시한다. NowSeconds는 받은 때(단조 증가하는 내 시간, 초)다. */
		void Apply(const portfolio::mmo::Packet& Packet, double NowSeconds);

		/** 내 개체 번호. 로그인 전이면 0. */
		uint32_t SelfId() const { return Self; }

		/** 내 개체. 로그인 전이거나 아직 EntitiesEnter를 받지 못했으면 nullptr. */
		const FEntity* SelfEntity() const;

		/** 다음 Move에 실을 ack(마지막으로 받은 PositionReset의 값). */
		uint32_t Ack() const { return LastAck; }

		/** 시야 안의 개체. 내 개체도 들어 있다. */
		const std::unordered_map<uint32_t, FEntity>& Entities() const { return Visible; }

		const FServerClock& Clock() const { return ServerClock; }

		/** 다른 개체를 그릴 틱. FEntityTrack::Sample에 넘긴다. */
		double RenderTick(double NowSeconds) const { return ServerClock.Now(NowSeconds) - InterpolationDelayTicks; }

		/**
		 * 지난번에 꺼낸 뒤로 나간 개체와 들어온 개체의 번호를 꺼낸다(내 개체 포함). 화면은 나간 것을 먼저 지우고 들어온 것을 만든다.
		 * 들어왔다가 꺼내기 전에 나간 번호도 들어 있으므로, 들어온 번호는 Entities()에 있을 때만 만든다.
		 */
		std::vector<uint32_t> TakeLeft();
		std::vector<uint32_t> TakeEntered();

	private:
		/** 받은 틱 번호를 시계와 들어온 개체의 기록에 쓴다. */
		void ObserveTick(uint32_t Tick, double NowSeconds);

		uint32_t Self = 0;
		uint32_t LastAck = 0;
		/** 마지막으로 받은 서버 틱 번호. EntityEnter에는 틱이 없어 들어온 개체의 첫 기록에 쓴다. */
		uint32_t LastTick = 0;
		FServerClock ServerClock;
		std::unordered_map<uint32_t, FEntity> Visible;
		std::vector<uint32_t> Left;
		std::vector<uint32_t> Entered;
	};
}
