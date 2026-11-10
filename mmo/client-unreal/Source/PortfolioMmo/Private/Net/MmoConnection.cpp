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

/** 이름을 풀고 연결한 뒤, 받은 바이트를 프레임으로 잘라 Packet을 큐에 넣는다. 끝날 때는 항상 Closed를 넣는다. */
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
		// 소켓을 IPv4로 만들었으므로 IPv4 주소만 받는다(localhost가 IPv6로 먼저 풀리는 것을 막는다).
		FAddressInfoResult Resolved = Sockets->GetAddressInfo(*Host, nullptr, EAddressInfoFlags::Default, FNetworkProtocolTypes::IPv4, SOCKTYPE_Streaming);
		if (Resolved.ReturnCode != SE_NO_ERROR || Resolved.Results.IsEmpty())
		{
			return FString::Printf(TEXT("Cannot resolve %s"), *Host);
		}
		TSharedRef<FInternetAddr> Address = Resolved.Results[0].Address;
		Address->SetPort(Port);

		FSocket* Socket = Owner.Socket;
		Socket->Connect(*Address);
		const FDateTime Deadline = FDateTime::UtcNow() + ConnectTimeout;
		while (Socket->GetConnectionState() != SCS_Connected)
		{
			if (bStopping)
			{
				return TEXT("Closed");
			}
			if (Socket->GetConnectionState() == SCS_ConnectionError || FDateTime::UtcNow() > Deadline)
			{
				return FString::Printf(TEXT("Cannot connect to %s:%d"), *Host, Port);
			}
			Socket->Wait(ESocketWaitConditions::WaitForWrite, PollInterval);
		}
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

	UMmoConnection& Owner;
	FString Host;
	int32 Port;
	std::atomic<bool> bStopping = false;
};

void UMmoConnection::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	TickHandle = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateUObject(this, &UMmoConnection::Tick));
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
	// 수신 스레드가 Wait로 기다리다 멈춤 요청을 확인할 수 있게 논블로킹으로 쓴다.
	Socket = ISocketSubsystem::Get(PLATFORM_SOCKETSUBSYSTEM)->CreateSocket(NAME_Stream, TEXT("MmoConnection"), FNetworkProtocolTypes::IPv4);
	Socket->SetNonBlocking(true);
	Socket->SetNoDelay(true);
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

bool UMmoConnection::Tick(float DeltaTime)
{
	const double Now = FPlatformTime::Seconds();
	FInbound Item;
	while (Inbox.Dequeue(Item))
	{
		LastReceivedSeconds = Now;
		switch (Item.Kind)
		{
		case FInbound::EKind::Connected:
			bConnected = true;
			LastPingSeconds = Now;
			OnConnected.Broadcast();
			break;
		case FInbound::EKind::Packet:
			OnPacket.Broadcast(*Item.Packet);
			break;
		case FInbound::EKind::Closed:
			CloseWithReason(Item.Reason);
			// 델리게이트가 다시 연결했을 수 있으므로 새 연결의 일은 다음 틱에 처리한다.
			return true;
		}
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
	bConnected = false;
}

void UMmoConnection::CloseWithReason(const FString& Reason)
{
	Shutdown();
	UE_LOG(LogMmoNet, Log, TEXT("Connection closed: %s"), *Reason);
	OnClosed.Broadcast(Reason);
}
