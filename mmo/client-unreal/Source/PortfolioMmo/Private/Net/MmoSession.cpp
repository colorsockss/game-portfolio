#include "Net/MmoSession.h"

#include <utility>

#include "Game/MmoGameUserSettings.h"

#include "Engine/GameInstance.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/CommandLine.h"
#include "Misc/CoreDelegates.h"
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
	FCoreDelegates::ApplicationHasEnteredForegroundDelegate.AddUObject(this, &UMmoSession::HandleForeground);

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
			// 기기에 남긴 언어(77. 처음에는 기기의 언어)로 시작한다. 개발용 -MmoLanguage=ko|en이 이긴다.
			FString Language = UMmoGameUserSettings::Get().LanguageCode();
#if !UE_BUILD_SHIPPING
			FParse::Value(FCommandLine::Get(), TEXT("MmoLanguage="), Language);
#endif
			StringTable.SetLanguage(Language == TEXT("en") ? MmoData::ELanguage::English : MmoData::ELanguage::Korean);
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
	FCoreDelegates::ApplicationHasEnteredForegroundDelegate.RemoveAll(this);
	FTSTicker::GetCoreTicker().RemoveTicker(ReconnectTimer);
	Super::Deinitialize();
}

void UMmoSession::LogIn(const FString& InLoginId)
{
	CurrentLoginId = InLoginId;
	Reconnect.SetCharacter(0);
	WorldState.Reset();
	CharacterList.Clear();
	Connection().Connect(Host, Port);
}

void UMmoSession::LogOut()
{
	// 월드 안이면 Logout을 보내고 서버가 저장하고 닫기를 기다린다(77). 닫히면 끊김 알림이 아니라 로그아웃으로 알린다.
	if (WorldState.InWorld() && Connection().IsConnected())
	{
		bLoggingOut = true;
		portfolio::mmo::Packet Packet;
		Packet.mutable_logout();
		Connection().Send(Packet);
		return;
	}
	// 직접 닫으면 연결은 OnClosed를 보내지 않으므로 끊김을 여기서 처리한다.
	Connection().Close();
	HandleClosed(LoggedOutReason);
}

void UMmoSession::CreateCharacter(const FString& Name, portfolio::mmo::CharacterClass Class, bool bDemo)
{
	portfolio::mmo::Packet Packet;
	const FTCHARToUTF8 Utf8(*Name);
	Packet.mutable_create_character()->set_name(Utf8.Get(), Utf8.Length());
	Packet.mutable_create_character()->set_character_class(Class);
	Packet.mutable_create_character()->set_demo(bDemo);
	Connection().Send(Packet);
}

void UMmoSession::EnterWorld(uint64 CharacterId)
{
	LastCharacterId = CharacterId;
	Reconnect.SetCharacter(CharacterId);
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

	/** 개발 빌드의 콘솔 명령: 글 한 줄을 DevCommand로 보낸다(채팅 입력의 /로 시작하는 줄과 같음. 41). --dev 서버만 실행한다. 예: Mmo.Dev tp 100 -20 */
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
	Reconnect.SetCharacter(0);
	WorldState.Reset();
	CombatState.Reset();
	InventoryState.Reset();
	StorageState.Reset();
	SkillBook.Reset();
	// 캐릭터 선택으로 가면 서버가 파티에서 뺀다(42).
	PartyState.Reset();
	QuestModel.Reset();
}

std::optional<MmoWorld::FPoint> UMmoSession::QuestGoal(int32 X, int32 Z) const
{
	const MmoWorld::FEntity* Me = WorldState.SelfEntity();
	return QuestModel.Goal(GameData, InventoryState, Me ? Me->Info.level() : 0, { X, Z });
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
	if (Packet.body_case() == portfolio::mmo::Packet::kLoginResult)
	{
		bDemoAvailable = Packet.login_result().demo_available();
	}
	const double Now = FPlatformTime::Seconds();
	LastReceived = Now;
	const bool bWasReconnecting = Reconnect.Reconnecting();
	Reconnect.Note(Packet);
	if (bWasReconnecting && Packet.body_case() == portfolio::mmo::Packet::kEnterWorldResult)
	{
		// 다시 들어갔으면 끊기기 전의 월드를 비우고 새로 받은 것으로 바꾼다(액터는 나간 큐로 지워지고 새 EntitiesEnter로 다시 생김). 시계는 EnterWorldResult가 다시 맞춘다.
		// 거절됐으면 캐릭터 선택에 있으므로 다시 붙는 것을 그만두고 끊김으로 알린다.
		const bool bEntered = Packet.enter_world_result().result() == portfolio::mmo::ENTER_WORLD_RESULT_CODE_OK;
		ResetModels(!bEntered);
		Reconnect.Finish();
		if (!bEntered)
		{
			Connection().Close();
			OnClosed.Broadcast(TEXT("Could not re-enter the world"));
			return;
		}
		UE_LOG(LogMmoNet, Display, TEXT("Reconnected and re-entered the world as entity %u"), Packet.enter_world_result().self_id());
		OnReconnecting.Broadcast(false);
	}
	WorldState.Apply(Packet, Now, Field());
	InventoryState.Apply(Packet);
	StorageState.Apply(Packet);
	SkillBook.Apply(Packet);
	ChatLog.Apply(Packet, WorldState);
	PartyState.Apply(Packet);
	QuestModel.Apply(Packet);
	BossState.Apply(Packet, WorldState.Clock().Now(Now), ChatLog, GameData, StringTable);
	if (const std::optional<portfolio::mmo::Packet> Stop = CombatState.Apply(Packet, WorldState, GameData, Now))
	{
		Send(*Stop);
	}
	// 다시 붙어 로그인이 되면 월드에 있던 캐릭터로 다시 들어가고(답을 기다리던 요청은 다시 보내지 않음), 캐릭터 선택에 있었으면 거기서 그친다.
	if (bWasReconnecting && Packet.body_case() == portfolio::mmo::Packet::kLoginResult && Packet.login_result().result() == portfolio::mmo::LOGIN_RESULT_CODE_OK)
	{
		if (const uint64 Character = Reconnect.LoggedIn())
		{
			EnterWorld(Character);
			return;
		}
		UE_LOG(LogMmoNet, Display, TEXT("Reconnected at the character list"));
		Reconnect.Finish();
		OnReconnecting.Broadcast(false);
	}
	OnPacket.Broadcast(Packet);
}

void UMmoSession::ResetModels(bool bChat)
{
	WorldState.Reset();
	CombatState.Reset();
	InventoryState.Reset();
	StorageState.Reset();
	SkillBook.Reset();
	if (bChat)
	{
		ChatLog.Reset();
	}
	PartyState.Reset();
	QuestModel.Reset();
	BossState.Reset();
}

void UMmoSession::ScheduleReconnect(double Delay)
{
	FTSTicker::GetCoreTicker().RemoveTicker(ReconnectTimer);
	ReconnectTimer = FTSTicker::GetCoreTicker().AddTicker(FTickerDelegate::CreateWeakLambda(this, [this](float)
	{
		UE_LOG(LogMmoNet, Display, TEXT("Reconnecting to %s:%d"), *Host, Port);
		Connection().Connect(Host, Port);
		return false;
	}), static_cast<float>(Delay));
}

void UMmoSession::HandleForeground()
{
	if (Connection().IsConnected() && MmoWorld::FReconnectPolicy::StaleAfterBackground(LastReceived, FPlatformTime::Seconds()))
	{
		// 서버는 이미 무응답으로 끊었을 것이므로 기다리지 않고 닫은 뒤 다시 붙는다. 2분 한도는 지금부터 센다.
		Connection().Close();
		HandleClosed(TEXT("Stale after the background"));
	}
}

void UMmoSession::HandleClosed(const FString& InReason)
{
	// 내가 로그아웃해 서버가 닫은 것은 끊김이 아니다.
	const FString Reason = std::exchange(bLoggingOut, false) ? LoggedOutReason : InReason;
	if (const std::optional<double> Delay = Reconnect.Closed(Reason == LoggedOutReason, FPlatformTime::Seconds()))
	{
		// 다시 붙는 동안 월드(액터와 HUD)는 그대로 둔다.
		UE_LOG(LogMmoNet, Display, TEXT("Connection lost (%s); reconnecting in %.0f s"), *Reason, *Delay);
		ScheduleReconnect(*Delay);
		OnReconnecting.Broadcast(true);
		return;
	}
	// 다시 붙지 않거나 그만뒀다(OnReconnecting(false)는 다시 붙었을 때만 옴). 보이던 개체(내 캐릭터 포함)가 모두 나간 것으로 큐에 들어가 화면이 지운다.
	ResetModels(true);
	OnClosed.Broadcast(Reason);
}

UMmoConnection& UMmoSession::Connection() const
{
	return *GetGameInstance()->GetSubsystem<UMmoConnection>();
}
