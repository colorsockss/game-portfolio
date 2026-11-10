#include "Net/MmoSession.h"

#include "Engine/GameInstance.h"
#include "Misc/CommandLine.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSettings.h"

void UMmoSession::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UMmoConnection* Net = Collection.InitializeDependency<UMmoConnection>();
	Net->OnConnected.AddUObject(this, &UMmoSession::HandleConnected);
	Net->OnPacket.AddUObject(this, &UMmoSession::HandlePacket);
	Net->OnClosed.AddUObject(this, &UMmoSession::HandleClosed);

	const UMmoSettings* Settings = GetDefault<UMmoSettings>();
	Host = Settings->ServerHost;
	Port = Settings->ServerPort;
	FString Server;
	if (FParse::Value(FCommandLine::Get(), TEXT("MmoServer="), Server))
	{
		FString PortText;
		if (Server.Split(TEXT(":"), &Host, &PortText))
		{
			Port = FCString::Atoi(*PortText);
		}
		else
		{
			Host = Server;
		}
	}
}

void UMmoSession::Deinitialize()
{
	if (UMmoConnection* Net = GetGameInstance()->GetSubsystem<UMmoConnection>())
	{
		Net->OnConnected.RemoveAll(this);
		Net->OnPacket.RemoveAll(this);
		Net->OnClosed.RemoveAll(this);
	}
	Super::Deinitialize();
}

void UMmoSession::LogIn(const FString& InLoginId)
{
	CurrentLoginId = InLoginId;
	WorldState.Reset();
	Connection().Connect(Host, Port);
}

void UMmoSession::LogOut()
{
	// 직접 닫으면 연결은 OnClosed를 보내지 않으므로 끊김을 여기서 처리한다.
	Connection().Close();
	HandleClosed(LoggedOutReason);
}

void UMmoSession::HandleConnected()
{
	portfolio::mmo::Packet Packet;
	portfolio::mmo::Login* Login = Packet.mutable_login();
	Login->set_protocol_version(portfolio::mmo::PROTOCOL_VERSION_CURRENT);
	const FTCHARToUTF8 Utf8(*CurrentLoginId);
	Login->set_login_id(Utf8.Get(), Utf8.Length());
	Connection().Send(Packet);
	OnConnected.Broadcast();
}

void UMmoSession::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	WorldState.Apply(Packet, FPlatformTime::Seconds());
	OnPacket.Broadcast(Packet);
}

void UMmoSession::HandleClosed(const FString& Reason)
{
	// 보이던 개체(내 캐릭터 포함)가 모두 나간 것으로 큐에 들어가 화면이 지운다.
	WorldState.Reset();
	OnClosed.Broadcast(Reason);
}

UMmoConnection& UMmoSession::Connection() const
{
	return *GetGameInstance()->GetSubsystem<UMmoConnection>();
}
