#include "Net/MmoSession.h"

#include "Engine/GameInstance.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSettings.h"
#include "HAL/IConsoleManager.h"
#include "World/DevCommand.h"

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
			StringTable.Load(GameData.Strings);
#if !UE_BUILD_SHIPPING
			// 개발용: -MmoLanguage=en이면 영어로 시작한다(언어 설정 77 전).
			FString Language;
			if (FParse::Value(FCommandLine::Get(), TEXT("MmoLanguage="), Language) && Language == TEXT("en"))
			{
				StringTable.SetLanguage(MmoData::ELanguage::English);
			}
#endif
			FieldMap = MmoWorld::FFieldMap::Make(GameData.Constants.field_size(), GameData.Zones.rows(), GameData.Grid);
			if (!FieldMap)
			{
				UE_LOG(LogMmoNet, Error, TEXT("The field size, a zone id or the map grid size in %s is out of range"), *Folder);
			}
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

void UMmoSession::SetLanguage(MmoData::ELanguage Language)
{
	if (StringTable.SetLanguage(Language))
	{
		OnLanguageChanged.Broadcast();
	}
}

#if !UE_BUILD_SHIPPING
namespace
{
	/** 개발 빌드의 콘솔 명령: 언어를 바꾼다(ko, en). 열린 화면의 글이 다시 채워지는지 보는 데 쓴다. */
	FAutoConsoleCommandWithWorldAndArgs GMmoLanguageCommand(
		TEXT("Mmo.Language"),
		TEXT("Switch the screen language: 'Mmo.Language en' or 'Mmo.Language ko'."),
		FConsoleCommandWithWorldAndArgsDelegate::CreateStatic([](const TArray<FString>& Args, UWorld* World)
		{
			if (UMmoSession* Session = World && World->GetGameInstance() ? World->GetGameInstance()->GetSubsystem<UMmoSession>() : nullptr)
			{
				Session->SetLanguage(Args.Num() > 0 && Args[0] == TEXT("en") ? MmoData::ELanguage::English : MmoData::ELanguage::Korean);
			}
		}));

	/** 개발 빌드의 콘솔 명령: 글 한 줄을 DevCommand로 보낸다(채팅창 41 전). --dev 서버만 실행한다. 예: Mmo.Dev tp 100 -20 */
	FAutoConsoleCommandWithWorldAndArgs GMmoDevCommand(
		TEXT("Mmo.Dev"),
		TEXT("Send a dev command line to a --dev server, e.g. 'Mmo.Dev tp 100 -20' or 'Mmo.Dev spawn 1'."),
		FConsoleCommandWithWorldAndArgsDelegate::CreateStatic([](const TArray<FString>& Args, UWorld* World)
		{
			UMmoSession* Session = World && World->GetGameInstance() ? World->GetGameInstance()->GetSubsystem<UMmoSession>() : nullptr;
			if (Session && Session->World().InWorld())
			{
				Session->Send(MmoWorld::DevCommandPacket(TCHAR_TO_UTF8(*FString::Join(Args, TEXT(" ")))));
			}
		}));
}
#endif

void UMmoSession::LeaveWorld()
{
	portfolio::mmo::Packet Packet;
	Packet.mutable_leave_world();
	Connection().Send(Packet);
	WorldState.Reset();
	CombatState.Reset();
	InventoryState.Reset();
	QuickslotPotions.Reset();
}

bool UMmoSession::PlacePotion(uint32 ItemId)
{
	const MmoWorld::FEntity* Me = WorldState.SelfEntity();
	if (!Me)
	{
		return false;
	}
	QuickslotPotions.SetNumZeroed(portfolio::mmo::CONSTANT_QUICKSLOT_COUNT);
	if (QuickslotPotions.Contains(ItemId))
	{
		return true;
	}
	const int32 Skills = static_cast<int32>(MmoWorld::FCombatState::Quickslots(GameData, Me->Info.character_class()).size());
	for (int32 Index = Skills; Index < QuickslotPotions.Num(); ++Index)
	{
		if (QuickslotPotions[Index] == 0)
		{
			QuickslotPotions[Index] = ItemId;
			return true;
		}
	}
	return false;
}

void UMmoSession::Send(const portfolio::mmo::Packet& Packet)
{
	if (Connection().IsConnected())
	{
		Connection().Send(Packet);
	}
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
	const double Now = FPlatformTime::Seconds();
	WorldState.Apply(Packet, Now);
	InventoryState.Apply(Packet);
	if (const std::optional<portfolio::mmo::Packet> Stop = CombatState.Apply(Packet, WorldState, GameData, Now))
	{
		Send(*Stop);
	}
	OnPacket.Broadcast(Packet);
}

void UMmoSession::HandleClosed(const FString& Reason)
{
	// 보이던 개체(내 캐릭터 포함)가 모두 나간 것으로 큐에 들어가 화면이 지운다.
	WorldState.Reset();
	CombatState.Reset();
	InventoryState.Reset();
	QuickslotPotions.Reset();
	OnClosed.Broadcast(Reason);
}

UMmoConnection& UMmoSession::Connection() const
{
	return *GetGameInstance()->GetSubsystem<UMmoConnection>();
}
