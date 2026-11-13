#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Protocol/MmoPackets.h"
#include "Data/GameData.h"
#include "World/WorldState.h"

#include "MmoSession.generated.h"

class UMmoConnection;

/**
 * 로그인한 세션 하나: 서버 주소, 로그인 ID, 서버가 알려 준 월드(FWorldState). 게임 인스턴스와 수명이 같아 화면이 바뀌어도 남는다.
 * 패킷은 늘 월드에 먼저 반영한 뒤 알리므로, 화면은 연결(UMmoConnection)이 아니라 이 세션의 델리게이트를 듣는다.
 */
UCLASS()
class UMmoSession : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	DECLARE_MULTICAST_DELEGATE(FOnConnected);
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnPacket, const portfolio::mmo::Packet&);
	DECLARE_MULTICAST_DELEGATE_OneParam(FOnClosed, const FString& /* Reason */);

	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** 서버에 연결해 LoginId로 로그인한다. 결과는 OnPacket의 LoginResult로, 실패는 OnClosed로도 온다. */
	void LogIn(const FString& InLoginId);

	/** 연결을 닫는다. OnClosed가 LoggedOutReason으로 온다. */
	void LogOut();

	/** 캐릭터를 만든다(캐릭터 선택 중). 결과는 OnPacket의 CreateCharacterResult와 바뀐 CharacterList로 온다. */
	void CreateCharacter(const FString& Name, portfolio::mmo::CharacterClass Class);

	/** 이 캐릭터로 월드에 들어간다(캐릭터 선택 중). 결과는 OnPacket의 EnterWorldResult로 온다. */
	void EnterWorld(uint64 CharacterId);

	/** 캐릭터 선택으로 돌아간다. 월드를 바로 비우고(액터가 지워짐), 서버는 CharacterList로 답한다. */
	void LeaveWorld();

	/** 이 계정의 캐릭터들. 마지막으로 받은 CharacterList다. */
	const portfolio::mmo::CharacterList& Characters() const { return CharacterList; }

	/** 스스로 로그아웃해 닫혔을 때 OnClosed의 까닭. */
	static inline const FString LoggedOutReason = TEXT("Logged out");

	const FString& LoginId() const { return CurrentLoginId; }
	const MmoWorld::FWorldState& World() const { return WorldState; }
	/** 들어오고 나간 개체의 큐를 꺼내는 화면(UMmoEntitySubsystem)만 쓴다. */
	MmoWorld::FWorldState& World() { return WorldState; }

	/** 연결되어 Login을 보냈다. */
	FOnConnected OnConnected;
	/** 서버가 보낸 패킷. 월드에는 이미 반영되어 있다. */
	FOnPacket OnPacket;
	/** 연결하지 못했거나 끊겼다. */
	FOnClosed OnClosed;

private:
	void HandleConnected();
	void HandlePacket(const portfolio::mmo::Packet& Packet);
	/** 기획 데이터를 읽는다. 개발 중(에디터, -game)에는 저장소의 생성물을, 패키지에서는 package.mjs가 실은 Content/Data를 읽는다. */
	void LoadData();
	void HandleClosed(const FString& Reason);
	UMmoConnection& Connection() const;

	/** 연결할 서버. UMmoSettings의 값이고, 명령줄의 -MmoServer=호스트:포트가 이긴다. */
	FString Host;
	int32 Port = 0;
	FString CurrentLoginId;
	MmoWorld::FWorldState WorldState;
	portfolio::mmo::CharacterList CharacterList;
	/** 시작할 때 한 번 읽은 기획 데이터. 읽지 못하면 해시가 0이라 서버가 DATA_MISMATCH로 거절한다. */
	MmoData::FGameData GameData;
};
