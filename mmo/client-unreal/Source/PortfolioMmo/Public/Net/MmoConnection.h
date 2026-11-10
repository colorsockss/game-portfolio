#pragma once

#include "CoreMinimal.h"
#include "Containers/Queue.h"
#include "Containers/Ticker.h"
#include "HAL/Runnable.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Protocol/MmoPackets.h"

#include "MmoConnection.generated.h"

class FSocket;
class FRunnableThread;
class FMmoReceiveWorker;

DECLARE_LOG_CATEGORY_EXTERN(LogMmoNet, Log, All);

/**
 * 서버와의 TCP 연결 하나. 서버의 구조(수신 태스크 → 큐 → 틱 스레드)와 같게, 수신 스레드가 프레임을 읽어 큐에 넣고
 * 게임 스레드가 프레임마다 꺼내 델리게이트로 알린다. 보내기와 델리게이트는 모두 게임 스레드에서만 일어난다.
 * 연결된 동안 Ping을 보내고, 서버에서 오랫동안 아무것도 오지 않으면 끊긴 것으로 보고 닫는다.
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
};
