#pragma once

#include "CoreMinimal.h"
#include "Containers/Queue.h"
#include "Containers/Ticker.h"
#include "HAL/Runnable.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Protocol/MmoPackets.h"
#include "World/Latency.h"

#include "MmoConnection.generated.h"

class FSocket;
class FRunnableThread;
class FMmoReceiveWorker;

DECLARE_LOG_CATEGORY_EXTERN(LogMmoNet, Log, All);

/**
 * 서버와의 TCP 연결 하나. 서버의 구조(수신 태스크 → 큐 → 틱 스레드)와 같게, 수신 스레드가 프레임을 읽어 큐에 넣고
 * 게임 스레드가 프레임마다 꺼내 델리게이트로 알린다. 보내기와 델리게이트는 모두 게임 스레드에서만 일어난다.
 * 연결된 동안 Ping을 보내고(Pong까지의 시간이 지연), 서버에서 오랫동안 아무것도 오지 않으면 끊긴 것으로 보고 닫는다.
 * 개발 빌드에서는 명령줄의 -MmoLag=ms(받은 것을 그만큼 늦춤)와 -MmoLoss=확률(1초마다 그 확률로 0.5초 멈췄다가 몰아서 넘김.
 * TCP에서 손실은 재전송을 기다리는 멈춤으로 나타남)로 나쁜 망을 흉내 낸다.
 * 화면은 이 델리게이트가 아니라 UMmoSession의 것을 듣는다.
 */
UCLASS()
class UMmoConnection : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	DECLARE_MULTICAST_DELEGATE(FOnConnected);
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnPacket, const portfolio::mmo::Packet&);
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnClosed, const FString& /* Reason */);

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Host(이름이나 IP):Port로 연결을 시작한다. 연결되면 OnConnected, 실패하거나 끊기면 OnClosed가 온다. */
	void Connect(const FString& Host, int32 Port);

	/** 연결을 닫는다. 직접 닫으면 OnClosed는 오지 않는다. */
	void Close();

	/** 연결된 동안만 보낸다. 보내지 못하면 연결을 닫고 OnClosed를 알린다. */
	void Send(const portfolio::mmo::Packet& Packet);

	bool IsConnected() const { return bConnected; }

	/** Ping을 보내고 Pong을 받기까지의 지연(시연 표시). 넣는 지연도 그대로 들어간다. */
	const MmoWorld::FLatency& Latency() const { return LatencyMeter; }

	/** 넣는 지연(ms)과 손실의 확률(개발용 표시). 넣지 않았으면 0. */
	double InjectedLagMs() const { return LagSeconds * 1000.0; }
	double InjectedLoss() const { return LossChance; }

	FOnConnected OnConnected;
	FOnPacket OnPacket;
	FOnClosed OnClosed;

private:
	/** 수신 스레드가 게임 스레드로 넘기는 일. */
	struct FInbound
	{
		enum class EKind : uint8
		{
			Connected,
			Packet,
			Closed,
		};

		EKind Kind = EKind::Closed;
		TUniquePtr<portfolio::mmo::Packet> Packet;
		FString Reason;
	};

	bool Tick(float DeltaTime);
	/** 받은 일 하나를 처리한다. 연결이 닫혔으면(Closed) false라 그 틱의 나머지는 다음 틱에 처리한다. */
	bool Handle(FInbound& Item, double Now);
	void Shutdown();
	void CloseWithReason(const FString& Reason);

	friend class FMmoReceiveWorker;

	FSocket* Socket = nullptr;
	/** FMmoReceiveWorker. 정의가 .cpp에 있어 기반 타입으로 가진다. */
	TUniquePtr<FRunnable> Worker;
	TUniquePtr<FRunnableThread> Thread;
	TQueue<FInbound, EQueueMode::Spsc> Inbox;
	FTSTicker::FDelegateHandle TickHandle;
	bool bConnected = false;
	/** 마지막으로 서버에서 무엇이든 받은 때와 Ping을 보낸 때(FPlatformTime::Seconds). */
	double LastReceivedSeconds = 0.0;
	double LastPingSeconds = 0.0;
	MmoWorld::FLatency LatencyMeter;

	/** 넣는 지연(개발 빌드의 명령줄): 늦출 시간, 1초마다 멈출 확률, 멈춤이 끝나는 때, 다음에 멈춤을 볼 때, 마지막으로 넘길 때(순서를 지킴). */
	double LagSeconds = 0.0;
	double LossChance = 0.0;
	double StallUntil = 0.0;
	double NextLossCheck = 0.0;
	double LastReleaseSeconds = 0.0;
	struct FDelayed
	{
		double At = 0.0;
		FInbound Item;
	};
	TArray<FDelayed> Delayed;
};
