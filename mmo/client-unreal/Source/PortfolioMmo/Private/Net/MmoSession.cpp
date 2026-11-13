#include "Net/MmoSession.h"

#include "Engine/GameInstance.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
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

	LoadData();
}

void UMmoSession::LoadData()
{
	// 저장소의 생성물을 먼저 본다. 지난 패키징이 남긴 Content/Data가 있어도 개발 중에는 늘 지금 생성물을 읽는다.
	const FString Folders[] = {
		FPaths::ProjectDir() / TEXT("../shared/data/files"),
		FPaths::ProjectContentDir() / TEXT("Data"),
	};
	for (const FString& Folder : Folders)
	{
		if (!FPaths::FileExists(Folder / UTF8_TO_TCHAR(MmoData::HashFile.data())))
		{
			continue;
		}

		const std::optional<MmoData::FGameData> Loaded = MmoData::Load([&Folder](std::string_view Name) -> std::optional<std::string>
		{
			TArray<uint8> Bytes;
			const FString Path = Folder / FString(static_cast<int32>(Name.size()), Name.data());
			if (!FFileHelper::LoadFileToArray(Bytes, *Path, FILEREAD_Silent))
			{
				return std::nullopt;
			}

			return std::string(reinterpret_cast<const char*>(Bytes.GetData()), Bytes.Num());
		});
		if (Loaded)
		{
			GameData = *Loaded;
			UE_LOG(LogMmoNet, Display, TEXT("Loaded game data %016llx from %s"), GameData.Hash, *Folder);
			return;
		}

		UE_LOG(LogMmoNet, Error, TEXT("Could not read the game data in %s"), *Folder);
		return;
	}

	UE_LOG(LogMmoNet, Error, TEXT("No game data found in %s or %s"), *Folders[0], *Folders[1]);
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
	CharacterList.Clear();
	Connection().Connect(Host, Port);
}

void UMmoSession::LogOut()
{
	// 직접 닫으면 연결은 OnClosed를 보내지 않으므로 끊김을 여기서 처리한다.
	Connection().Close();
	HandleClosed(LoggedOutReason);
}

void UMmoSession::CreateCharacter(const FString& Name, portfolio::mmo::CharacterClass Class)
{
	portfolio::mmo::Packet Packet;
	const FTCHARToUTF8 Utf8(*Name);
	Packet.mutable_create_character()->set_name(Utf8.Get(), Utf8.Length());
	Packet.mutable_create_character()->set_character_class(Class);
	Connection().Send(Packet);
}

void UMmoSession::EnterWorld(uint64 CharacterId)
{
	portfolio::mmo::Packet Packet;
	Packet.mutable_enter_world()->set_character_id(CharacterId);
	Connection().Send(Packet);
}

void UMmoSession::LeaveWorld()
{
	portfolio::mmo::Packet Packet;
	Packet.mutable_leave_world();
	Connection().Send(Packet);
	WorldState.Reset();
}

void UMmoSession::HandleConnected()
{
	portfolio::mmo::Packet Packet;
	portfolio::mmo::Login* Login = Packet.mutable_login();
	Login->set_protocol_version(portfolio::mmo::PROTOCOL_VERSION_CURRENT);
	const FTCHARToUTF8 Utf8(*CurrentLoginId);
	Login->set_login_id(Utf8.Get(), Utf8.Length());
	Login->set_data_hash(GameData.Hash);
	Connection().Send(Packet);
	OnConnected.Broadcast();
}

void UMmoSession::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (Packet.body_case() == portfolio::mmo::Packet::kCharacterList)
	{
		CharacterList = Packet.character_list();
	}
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
