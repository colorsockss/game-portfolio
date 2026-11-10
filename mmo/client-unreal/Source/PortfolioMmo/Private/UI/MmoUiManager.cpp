#include "UI/MmoUiManager.h"

#include "Blueprint/UserWidget.h"
#include "Engine/AssetManager.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Framework/Application/SlateApplication.h"
#include "GameFramework/PlayerController.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"
#include "UI/MmoConfirmWidget.h"
#include "UI/MmoNoticeWidget.h"
#include "UI/MmoUiPaths.h"
#include "UI/MmoUiRoot.h"

#define LOCTEXT_NAMESPACE "MmoUi"

using MmoScreen::EScreen;

namespace
{
	uint8 Key(EScreen Screen)
	{
		return static_cast<uint8>(Screen);
	}

	FSoftClassPath ClassOf(EScreen Screen)
	{
		switch (Screen)
		{
		case EScreen::Login:
			return MmoUiPaths::ClassOf(MmoUiPaths::Login);
		case EScreen::Hud:
			return MmoUiPaths::ClassOf(MmoUiPaths::Hud);
		case EScreen::Settings:
			return MmoUiPaths::ClassOf(MmoUiPaths::Settings);
		case EScreen::Confirm:
			return MmoUiPaths::ClassOf(MmoUiPaths::Confirm);
		}
		checkNoEntry();
		return {};
	}
}

void UMmoUiManager::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	UMmoSession& Net = Session();
	PacketHandle = Net.OnPacket.AddUObject(this, &UMmoUiManager::HandlePacket);
	ClosedHandle = Net.OnClosed.AddUObject(this, &UMmoUiManager::HandleClosed);
}

void UMmoUiManager::Deinitialize()
{
	if (UMmoSession* Net = GetLocalPlayer()->GetGameInstance()->GetSubsystem<UMmoSession>())
	{
		Net->OnPacket.Remove(PacketHandle);
		Net->OnClosed.Remove(ClosedHandle);
	}
	Super::Deinitialize();
}

void UMmoUiManager::PlayerControllerChanged(APlayerController* NewPlayerController)
{
	Super::PlayerControllerChanged(NewPlayerController);
	if (!NewPlayerController || Root)
	{
		return;
	}
	// 레벨이 하나라 컨트롤러가 처음 생길 때 한 번 뿌리를 만들고 로그인 화면을 연다.
	Root = CreateWidget<UMmoUiRoot>(NewPlayerController, UMmoUiRoot::StaticClass());
	Root->AddToViewport();
	Open(EScreen::Login);
}

void UMmoUiManager::Open(EScreen Screen, FOnShown OnShown)
{
	Stack.Open(Screen);
	ApplyInputMode();
	if (UUserWidget* Widget = Widgets.FindRef(Key(Screen)))
	{
		Show(Screen, *Widget, OnShown);
		return;
	}

	const FSoftClassPath Path = ClassOf(Screen);
	UAssetManager::GetStreamableManager().RequestAsyncLoad(Path, FStreamableDelegate::CreateWeakLambda(this, [this, Screen, Path, OnShown]
	{
		// 불러오는 동안 닫혔으면 만들지 않는다. 같은 화면을 두 번 연 경우 먼저 끝난 쪽이 만든 위젯을 쓴다.
		if (!Stack.IsOpen(Screen) || !Root)
		{
			return;
		}
		UUserWidget* Widget = Widgets.FindRef(Key(Screen));
		if (!Widget)
		{
			UClass* Class = Path.ResolveClass();
			if (!Class)
			{
				UE_LOG(LogMmoNet, Error, TEXT("Widget class %s is missing. Run the MmoCreateWidgets commandlet."), *Path.ToString());
				return;
			}
			Widget = CreateWidget<UUserWidget>(PlayerController(), Class);
			Widgets.Add(Key(Screen), Widget);
		}
		Show(Screen, *Widget, OnShown);
	}));
}

void UMmoUiManager::Close(EScreen Screen)
{
	Stack.Close(Screen);
	if (UUserWidget* Widget = Widgets.FindRef(Key(Screen)))
	{
		Widget->RemoveFromParent();
	}
	ApplyInputMode();
}

void UMmoUiManager::Back()
{
	if (const std::optional<EScreen> Target = Stack.BackTarget())
	{
		Close(*Target);
	}
	else if (Stack.IsOpen(EScreen::Hud))
	{
		Open(EScreen::Settings);
	}
}

void UMmoUiManager::ShowNotice(const FText& Message)
{
	if (Notice)
	{
		Notice->Show(Message);
		return;
	}
	const FSoftClassPath Path = MmoUiPaths::ClassOf(MmoUiPaths::Notice);
	UAssetManager::GetStreamableManager().RequestAsyncLoad(Path, FStreamableDelegate::CreateWeakLambda(this, [this, Path, Message]
	{
		if (!Root)
		{
			return;
		}
		if (!Notice)
		{
			Notice = CreateWidget<UMmoNoticeWidget>(PlayerController(), Path.ResolveClass());
			Root->AddNotice(*Notice);
		}
		Notice->Show(Message);
	}));
}

void UMmoUiManager::Confirm(const FText& Message, TFunction<void()> OnYes)
{
	Open(EScreen::Confirm, [Message, OnYes = MoveTemp(OnYes)](UUserWidget& Widget)
	{
		CastChecked<UMmoConfirmWidget>(&Widget)->SetUp(Message, OnYes);
	});
}

void UMmoUiManager::LogOut()
{
	Confirm(LOCTEXT("LogOutQuestion", "로그아웃할까요?"), [this]
	{
		Session().LogOut();
	});
}

void UMmoUiManager::Show(EScreen Screen, UUserWidget& Widget, const FOnShown& OnShown)
{
	Root->AddToLayer(MmoScreen::RuleOf(Screen).Layer, Widget);
	if (OnShown)
	{
		OnShown(Widget);
	}
}

void UMmoUiManager::ApplyInputMode()
{
	APlayerController* Controller = PlayerController();
	if (!Controller)
	{
		return;
	}
	const MmoScreen::EInputMode Mode = Stack.InputMode();
	if (Mode == MmoScreen::EInputMode::Ui)
	{
		Controller->SetInputMode(FInputModeUIOnly());
	}
	else
	{
		// 커서는 보이고, 마우스 버튼을 누른 동안만 뷰포트가 마우스를 잡는다(오른쪽 끌기로 카메라를 돌린다).
		// 잡는 동안 커서를 감추면 포인터가 제자리에 묶여 터치의 끄는 자리가 갱신되지 않으므로 감추지 않는다.
		Controller->SetInputMode(FInputModeGameAndUI().SetHideCursorDuringCapture(false));
		// 입력 모드는 따로 정한 위젯이 없으면 초점을 옮기지 않는다. 로그인 화면의 글 상자에 남은 초점을 게임으로 돌려야 키가 컨트롤러에 간다.
		FSlateApplication::Get().SetAllUserFocusToGameViewport();
	}

	// 창이 열린 동안은 캐릭터가 걷지 않는다(카메라는 돈다).
	const bool bIgnore = Mode != MmoScreen::EInputMode::Game;
	if (bIgnore != bMoveIgnored)
	{
		Controller->SetIgnoreMoveInput(bIgnore);
		bMoveIgnored = bIgnore;
	}
}

void UMmoUiManager::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (Packet.body_case() == portfolio::mmo::Packet::kLoginResult
		&& Packet.login_result().result() == portfolio::mmo::LOGIN_RESULT_CODE_OK)
	{
		Close(EScreen::Login);
		Open(EScreen::Hud);
	}
}

void UMmoUiManager::HandleClosed(const FString& Reason)
{
	const bool bWasPlaying = Stack.IsOpen(EScreen::Hud);
	Close(EScreen::Confirm);
	Close(EScreen::Settings);
	Close(EScreen::Hud);
	Open(EScreen::Login);
	if (bWasPlaying && Reason != UMmoSession::LoggedOutReason)
	{
		ShowNotice(LOCTEXT("Disconnected", "서버와 연결이 끊겼습니다."));
	}
}

APlayerController* UMmoUiManager::PlayerController() const
{
	return GetLocalPlayer()->GetPlayerController(GetLocalPlayer()->GetWorld());
}

UMmoSession& UMmoUiManager::Session() const
{
	return *GetLocalPlayer()->GetGameInstance()->GetSubsystem<UMmoSession>();
}

#undef LOCTEXT_NAMESPACE
