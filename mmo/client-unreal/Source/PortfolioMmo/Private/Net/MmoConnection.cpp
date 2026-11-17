#include "Net/MmoConnection.h"

#include <atomic>
#include <vector>

#include "HAL/Runnable.h"
#include "HAL/RunnableThread.h"
#include "Protocol/PacketFrames.h"
#include "SocketSubsystem.h"
#include "Sockets.h"

DEFINE_LOG_CATEGORY(LogMmoNet);

namespace
{
	/** 수신 스레드가 멈추라는 요청을 확인하는 간격. 받을 바이트가 있으면 기다리지 않고 바로 깬다. */
	const FTimespan PollInterval = FTimespan::FromMilliseconds(100);

	/** 연결을 기다리는 최대 시간. */
	const FTimespan ConnectTimeout = FTimespan::FromSeconds(5);
}

/** 이름을 풀고 조회 결과를 차례로 연결해 본 뒤, 받은 바이트를 프레임으로 잘라 Packet을 큐에 넣는다. 끝날 때는 항상 Closed를 넣는다. */
class FMmoReceiveWorker : public FRunnable
{
public:
	FMmoReceiveWorker(UMmoConnection& InOwner, FString InHost, int32 InPort)
		: Owner(InOwner), Host(MoveTemp(InHost)), Port(InPort)
	{
	}

	virtual uint32 Run() override
	{
		Owner.Inbox.Enqueue({ UMmoConnection::FInbound::EKind::Closed, nullptr, Receive() });
		return 0;
	}

	virtual void Stop() override
	{
		bStopping = true;
	}

private:
	/** 연결이 끝날 때까지 받는다. 끝난 까닭을 돌려준다. */
	FString Receive()
	{
		ISocketSubsystem* Sockets = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM);
		// IPv4와 IPv6를 모두 받아 조회 결과의 차례대로 시도한다(IPv6만 되는 망에서는 DNS64가 만든 IPv6 주소, localhost는 ::1 다음 127.0.0.1).
		// OnlyUsableAddresses(AI_ADDRCONFIG): 이 기기에 그 종류의 주소가 없으면 그 종류는 받지 않는다.
		FAddressInfoResult Resolved = Sockets->GetAddressInfo(*Host, nullptr, EAddressInfoFlags::OnlyUsableAddresses, NAME_None, SOCKTYPE_Streaming);
		if (Resolved.ReturnCode != SE_NO_ERROR || Resolved.Results.IsEmpty())
		{
			return FString::Printf(TEXT("Cannot resolve %s"), *Host);
		}
		FSocket* Socket = nullptr;
		for (const FAddressInfoResultData& Result : Resolved.Results)
		{
			Result.Address->SetPort(Port);
			Socket = TryConnect(*Sockets, *Result.Address);
			if (Socket || bStopping)
			{
				break;
			}
			UE_LOG(LogMmoNet, Log, TEXT("Cannot connect to %s"), *Result.Address->ToString(true));
		}
		if (!Socket)
		{
			return bStopping ? TEXT("Closed") : FString::Printf(TEXT("Cannot connect to %s:%d"), *Host, Port);
		}
		// 게임 스레드는 Connected를 꺼낸 뒤(Send)나 이 스레드가 끝난 뒤(Shutdown)에만 Socket을 본다.
		Owner.Socket = Socket;
		Owner.Inbox.Enqueue({ UMmoConnection::FInbound::EKind::Connected, nullptr, FString() });

		MmoProtocol::FFrameReader Reader;
		uint8 Buffer[16 * 1024];
		while (!bStopping)
		{
			if (!Socket->Wait(ESocketWaitConditions::WaitForRead, PollInterval))
			{
				continue;
			}
			int32 BytesRead = 0;
			if (!Socket->Recv(Buffer, sizeof(Buffer), BytesRead))
			{
				return TEXT("Server closed the connection");
			}
			Reader.Append(Buffer, static_cast<size_t>(BytesRead));
			for (;;)
			{
				auto Packet = MakeUnique<portfolio::mmo::Packet>();
				const MmoProtocol::EReadResult Result = Reader.Read(*Packet);
				if (Result == MmoProtocol::EReadResult::NeedMore)
				{
					break;
				}
				if (Result == MmoProtocol::EReadResult::Malformed)
				{
					return TEXT("Malformed frame from server");
				}
				Owner.Inbox.Enqueue({ UMmoConnection::FInbound::EKind::Packet, MoveTemp(Packet), FString() });
			}
		}
		return TEXT("Closed");
	}

	/** 주소 하나에 연결한다. 연결되면 소켓을, 거절되거나 시간이 지나거나 멈추라고 하면 소켓을 닫고 nullptr를 낸다. */
	FSocket* TryConnect(ISocketSubsystem& Sockets, const FInternetAddr& Address)
	{
		FSocket* Socket = Sockets.CreateSocket(NAME_Stream, TEXT("MmoConnection"), Address.GetProtocolType());
		if (!Socket)
		{
			return nullptr;
		}
		// 수신 스레드가 Wait로 기다리다 멈춤 요청을 확인할 수 있게 논블로킹으로 쓴다.
		Socket->SetNonBlocking(true);
		Socket->SetNoDelay(true);
		bool bOk = Socket->Connect(Address);
		const FDateTime Deadline = FDateTime::UtcNow() + ConnectTimeout;
		// 연결이 끝나면 붙은 것은 쓸 수 있게, 거절된 것은 읽을 수 있게(macOS는 POLLIN|POLLHUP) 된다. 서버는 로그인 전에 보내지 않는다.
		while (bOk && !Socket->Wait(ESocketWaitConditions::WaitForWrite, PollInterval) && !Socket->Wait(ESocketWaitConditions::WaitForRead, FTimespan::Zero()))
		{
			bOk = !bStopping && FDateTime::UtcNow() <= Deadline;
		}
		// 상대 주소가 있어야 붙은 것이다. GetConnectionState는 Connect 뒤 5초 동안 오류가 없으면 붙었다고 해 거절을 놓친다.
		const TSharedRef<FInternetAddr> Peer = Sockets.CreateInternetAddr(Address.GetProtocolType());
		if (!bOk || bStopping || !Socket->GetPeerAddress(*Peer))
		{
			Socket->Close();
			Sockets.DestroySocket(Socket);
			return nullptr;
		}
		return Socket;
	}

	UMmoConnection& Owner;
	FString Host;
	int32 Port;
	std::atomic<bool> bStopping = false;
};

void UMmoConnection::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	TickHandle = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateUObject(this, &UMmoConnection::Tick));
#if !UE_BUILD_SHIPPING
	double LagMs = 0.0;
	FParse::Value(FCommandLine::Get(), TEXT("MmoLag="), LagMs);
	FParse::Value(FCommandLine::Get(), TEXT("MmoLoss="), LossChance);
	LagSeconds = FMath::Max(0.0, LagMs) / 1000.0;
	LossChance = FMath::Clamp(LossChance, 0.0, 1.0);
	if (LagSeconds > 0.0 || LossChance > 0.0)
	{
		UE_LOG(LogMmoNet, Display, TEXT("Injecting %.0f ms lag and %.2f stalls per second into received packets"), LagSeconds * 1000.0, LossChance);
	}
#endif
}

void UMmoConnection::Deinitialize()
{
	FTSTicker::GetCoreTicker().RemoveTicker(TickHandle);
	Shutdown();
	Super::Deinitialize();
}

void UMmoConnection::Connect(const FString& Host, int32 Port)
{
	Shutdown();
	// 소켓은 수신 스레드가 이름을 푼 뒤 그 주소의 종류(IPv4, IPv6)로 만든다.
	Worker = MakeUnique<FMmoReceiveWorker>(*this, Host, Port);
	Thread.Reset(FRunnableThread::Create(Worker.Get(), TEXT("MmoReceive")));
	UE_LOG(LogMmoNet, Log, TEXT("Connecting to %s:%d"), *Host, Port);
}

void UMmoConnection::Close()
{
	Shutdown();
}

void UMmoConnection::Send(const portfolio::mmo::Packet& Packet)
{
	if (!bConnected)
	{
		return;
	}
	std::vector<uint8_t> Frame;
	MmoProtocol::AppendFrame(Packet, Frame);
	int32 Offset = 0;
	while (Offset < static_cast<int32>(Frame.size()))
	{
		int32 BytesSent = 0;
		// 논블로킹 소켓이라 보낼 버퍼가 가득 차도 실패한다. 패킷이 작아 서버가 오래 읽지 않을 때만 그렇게 되므로 끊는다.
		if (!Socket->Send(Frame.data() + Offset, static_cast<int32>(Frame.size()) - Offset, BytesSent))
		{
			CloseWithReason(TEXT("Send failed"));
			return;
		}
		Offset += BytesSent;
	}
}

bool UMmoConnection::Handle(FInbound& Item, double Now)
{
	LastReceivedSeconds = Now;
	switch (Item.Kind)
	{
	case FInbound::EKind::Connected:
		bConnected = true;
		LastPingSeconds = Now;
		LatencyMeter.Reset();
		OnConnected.Broadcast();
		break;
	case FInbound::EKind::Packet:
		if (Item.Packet->has_pong())
		{
			LatencyMeter.Received(Now);
		}
		OnPacket.Broadcast(*Item.Packet);
		break;
	case FInbound::EKind::Closed:
		CloseWithReason(Item.Reason);
		// 델리게이트가 다시 연결했을 수 있으므로 새 연결의 일은 다음 틱에 처리한다.
		return false;
	}
	return true;
}

bool UMmoConnection::Tick(float DeltaTime)
{
	const double Now = FPlatformTime::Seconds();
	FInbound Item;
	if (LagSeconds <= 0.0 && LossChance <= 0.0)
	{
		while (Inbox.Dequeue(Item))
		{
			if (!Handle(Item, Now))
			{
				return true;
			}
		}
	}
	else
	{
		// 넣는 지연: 받은 차례를 지키며 늦춰 넘긴다. 멈추는 동안 받은 것과 이미 기다리던 것은 멈춤이 끝날 때 몰아서 넘긴다.
		if (LossChance > 0.0 && Now >= NextLossCheck)
		{
			NextLossCheck = Now + 1.0;
			if (FMath::FRand() < LossChance)
			{
				StallUntil = Now + 0.5;
				for (FDelayed& Waiting : Delayed)
				{
					Waiting.At = FMath::Max(Waiting.At, StallUntil);
				}
			}
		}
		while (Inbox.Dequeue(Item))
		{
			LastReleaseSeconds = FMath::Max3(LastReleaseSeconds, Now + LagSeconds, StallUntil);
			Delayed.Add({ LastReleaseSeconds, MoveTemp(Item) });
		}
		int32 Released = 0;
		while (Released < Delayed.Num() && Delayed[Released].At <= Now)
		{
			const bool bOpen = Handle(Delayed[Released].Item, Now);
			++Released;
			if (!bOpen)
			{
				break;
			}
		}
		Delayed.RemoveAt(0, Released);
	}

	// 쌓인 것을 다 꺼낸 뒤에 잰다. 게임 스레드가 오래 멈췄다 돌아와도 그동안 받은 것이 있으면 살아 있는 연결이다.
	if (bConnected)
	{
		if (Now - LastReceivedSeconds > portfolio::mmo::CONSTANT_IDLE_TIMEOUT_SECONDS)
		{
			CloseWithReason(TEXT("No response from server"));
		}
		else if (Now - LastPingSeconds >= portfolio::mmo::CONSTANT_PING_INTERVAL_SECONDS)
		{
			LastPingSeconds = Now;
			portfolio::mmo::Packet Ping;
			Ping.mutable_ping();
			LatencyMeter.Sent(Now);
			Send(Ping);
		}
	}
	return true;
}

void UMmoConnection::Shutdown()
{
	if (Thread)
	{
		Thread->Kill(true);
		Thread.Reset();
	}
	Worker.Reset();
	if (Socket)
	{
		Socket->Close();
		ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->DestroySocket(Socket);
		Socket = nullptr;
	}
	Inbox.Empty();
	Delayed.Empty();
	LastReleaseSeconds = 0.0;
	StallUntil = 0.0;
	bConnected = false;
}

void UMmoConnection::CloseWithReason(const FString& Reason)
{
	Shutdown();
	UE_LOG(LogMmoNet, Log, TEXT("Connection closed: %s"), *Reason);
	OnClosed.Broadcast(Reason);
}
