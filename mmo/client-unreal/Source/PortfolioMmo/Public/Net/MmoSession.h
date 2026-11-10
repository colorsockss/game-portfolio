#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "Protocol/MmoPackets.h"
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
	void HandleClosed(const FString& Reason);
	UMmoConnection& Connection() const;

	/** 연결할 서버. UMmoSettings의 값이고, 명령줄의 -MmoServer=호스트:포트가 이긴다. */
	FString Host;
	int32 Port = 0;
	FString CurrentLoginId;
	MmoWorld::FWorldState WorldState;
};
