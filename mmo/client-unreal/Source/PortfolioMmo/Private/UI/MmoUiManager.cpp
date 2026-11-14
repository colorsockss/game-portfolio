#include "UI/MmoUiManager.h"

#include "World/DevCommand.h"

#include "UI/MmoText.h"
#include "Blueprint/UserWidget.h"
#include "Engine/AssetManager.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Framework/Application/IInputProcessor.h"
#include "Framework/Application/SlateApplication.h"
#include "Game/MmoCueSubsystem.h"
#include "Game/MmoPlayerController.h"
#include "GameFramework/PlayerController.h"
#include "Input/MmoKeys.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoConfirmWidget.h"
#include "UI/MmoNoticeWidget.h"
#include "UI/MmoQuantityWidget.h"
#include "UI/MmoTextBlock.h"
#include "UI/MmoUiPaths.h"
#include "UI/MmoUiRoot.h"


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
		case EScreen::CharacterSelect:
			return MmoUiPaths::ClassOf(MmoUiPaths::CharacterSelect);
		case EScreen::CharacterCreate:
			return MmoUiPaths::ClassOf(MmoUiPaths::CharacterCreate);
		case EScreen::Hud:
			return MmoUiPaths::ClassOf(MmoUiPaths::Hud);
		case EScreen::Settings:
			return MmoUiPaths::ClassOf(MmoUiPaths::Settings);
		case EScreen::Confirm:
			return MmoUiPaths::ClassOf(MmoUiPaths::Confirm);
		case EScreen::Quantity:
			return MmoUiPaths::ClassOf(MmoUiPaths::Quantity);
		case EScreen::Death:
			return MmoUiPaths::ClassOf(MmoUiPaths::Death);
		case EScreen::Character:
			return MmoUiPaths::ClassOf(MmoUiPaths::Character);
		}
		checkNoEntry();
		return {};
	}
}

/** 터치를 떼면(위젯이 잡았든 뷰포트든) 그 손가락의 주인을 놓는다. 이벤트는 먹지 않는다. */
class FMmoTouchReleaser : public IInputProcessor
{
public:
	explicit FMmoTouchReleaser(MmoScreen::FTouchOwners& InOwners) : Owners(InOwners) {}

	virtual void Tick(const float DeltaTime, FSlateApplication& SlateApp, TSharedRef<ICursor> Cursor) override {}

	virtual bool HandleMouseButtonUpEvent(FSlateApplication& SlateApp, const FPointerEvent& Event) override
	{
		if (Event.IsTouchEvent())
		{
			Owners.Release(Event.GetPointerIndex());
		}
		return false;
	}

	virtual const TCHAR* GetDebugName() const override { return TEXT("MmoTouchReleaser"); }

private:
	MmoScreen::FTouchOwners& Owners;
};

void UMmoUiManager::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	if (FSlateApplication::IsInitialized())
	{
		TouchReleaser = MakeShared<FMmoTouchReleaser>(Touches);
		FSlateApplication::Get().RegisterInputPreProcessor(TouchReleaser);
		KeyCodeInput = MakeShared<FMmoKeyCodeInput>();
#if !UE_BUILD_SHIPPING
		// 개발용: -MmoStats면 시연 표시를 켠 채 시작한다(클릭 없이 확인하고 영상을 찍는 데 씀).
		bShowStats = FParse::Param(FCommandLine::Get(), TEXT("MmoStats"));
#endif
		FSlateApplication::Get().RegisterInputPreProcessor(KeyCodeInput);
	}
	UMmoSession& Net = Session();
	PacketHandle = Net.OnPacket.AddUObject(this, &UMmoUiManager::HandlePacket);
	LanguageHandle = Net.OnLanguageChanged.AddUObject(this, &UMmoUiManager::RefreshTexts);
	ClosedHandle = Net.OnClosed.AddUObject(this, &UMmoUiManager::HandleClosed);
}

void UMmoUiManager::Deinitialize()
{
	if (TouchReleaser && FSlateApplication::IsInitialized())
	{
		FSlateApplication::Get().UnregisterInputPreProcessor(TouchReleaser);
	}
	if (KeyCodeInput && FSlateApplication::IsInitialized())
	{
		FSlateApplication::Get().UnregisterInputPreProcessor(KeyCodeInput);
	}
	if (UMmoSession* Net = GetLocalPlayer()->GetGameInstance()->GetSubsystem<UMmoSession>())
	{
		Net->OnPacket.Remove(PacketHandle);
		Net->OnClosed.Remove(ClosedHandle);
		Net->OnLanguageChanged.Remove(LanguageHandle);
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
	UMmoSession* Session = GetLocalPlayer()->GetGameInstance()->GetSubsystem<UMmoSession>();
	switch (Stack.Back(Session->Combat().Target() != 0))
	{
	case MmoScreen::FScreenStack::EBack::Close:
		Close(*Stack.BackTarget());
		break;
	case MmoScreen::FScreenStack::EBack::ReleaseTarget:
		if (const std::optional<portfolio::mmo::Packet> Stop = Session->Combat().SetTarget(0))
		{
			Session->Send(*Stop);
		}
		break;
	case MmoScreen::FScreenStack::EBack::OpenSettings:
		Open(EScreen::Settings);
		break;
	case MmoScreen::FScreenStack::EBack::None:
		break;
	}
}

void UMmoUiManager::RefreshTexts()
{
	// 키로 채운 버튼과 글 상자를 다시 채운다. 코드가 채우는 글(상태 줄, HUD)은 화면이 Strings의 Version을 보고 다시 채운다.
	for (TObjectIterator<UMmoButtonWidget> It; It; ++It)
	{
		if (It->GetWorld() == GetLocalPlayer()->GetWorld())
		{
			It->RefreshText();
		}
	}
	for (TObjectIterator<UMmoTextBlock> It; It; ++It)
	{
		if (It->GetWorld() == GetLocalPlayer()->GetWorld())
		{
			It->RefreshText();
		}
	}
}

void UMmoUiManager::ToggleHidden()
{
	if (Root)
	{
		Root->SetVisibility(Root->GetVisibility() == ESlateVisibility::Collapsed ? ESlateVisibility::SelfHitTestInvisible : ESlateVisibility::Collapsed);
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

void UMmoUiManager::Quantity(const FText& Title, int32 Max, TFunction<void(int32)> OnChosen)
{
	Open(EScreen::Quantity, [Title, Max, OnChosen = MoveTemp(OnChosen)](UUserWidget& Widget)
	{
		CastChecked<UMmoQuantityWidget>(&Widget)->SetUp(Title, Max, OnChosen);
	});
}

void UMmoUiManager::LogOut()
{
	Confirm(MmoText::Get(GetLocalPlayer(), TEXT("settings.logOutQuestion")), [this]
	{
		Session().LogOut();
	});
}

void UMmoUiManager::ReturnToCharacterSelect()
{
	Session().LeaveWorld();
	Close(EScreen::Confirm);
	Close(EScreen::Settings);
	Close(EScreen::Character);
	Close(EScreen::Hud);
	Open(EScreen::CharacterSelect);
}

void UMmoUiManager::Show(EScreen Screen, UUserWidget& Widget, const FOnShown& OnShown)
{
	Root->AddToLayer(MmoScreen::RuleOf(Screen).Layer, Widget);
	UMmoCueSubsystem* Cues = Widget.GetWorld() ? Widget.GetWorld()->GetSubsystem<UMmoCueSubsystem>() : nullptr;
	if (Cues && MmoScreen::RuleOf(Screen).Layer != MmoScreen::ELayer::Hud)
	{
		Cues->PlayUi(EMmoCue::UiWindow);
	}
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

	// 창이 열린 동안은 손 조작(WASD, 조이스틱, 땅 누르기)으로 걷지 않는다(카메라는 돌고, 따라가던 경로는 이어 걷는다).
	if (AMmoPlayerController* Mmo = Cast<AMmoPlayerController>(Controller))
	{
		Mmo->SetManualMoveBlocked(Mode != MmoScreen::EInputMode::Game);
	}
}

void UMmoUiManager::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (Packet.body_case() == portfolio::mmo::Packet::kLoginResult
		&& Packet.login_result().result() == portfolio::mmo::LOGIN_RESULT_CODE_OK)
	{
		Close(EScreen::Login);
		Open(EScreen::CharacterSelect);
	}
	else if (Packet.body_case() == portfolio::mmo::Packet::kEnterWorldResult
		&& Packet.enter_world_result().result() == portfolio::mmo::ENTER_WORLD_RESULT_CODE_OK)
	{
		Close(EScreen::CharacterCreate);
		Close(EScreen::CharacterSelect);
		Open(EScreen::Hud);
		OpenFromCommandLine();
#if !UE_BUILD_SHIPPING
		// 개발용: -MmoDevCommand="level 5"면 처음 월드에 들어간 뒤 한 번 그 개발 명령을 보낸다(콘솔을 열지 않고 확인과 시연을 맞춤. --dev 서버만 실행).
		static bool bSentDevCommand = false;
		FString DevLine;
		if (!bSentDevCommand && FParse::Value(FCommandLine::Get(), TEXT("MmoDevCommand="), DevLine, false))
		{
			bSentDevCommand = true;
			Session().Send(MmoWorld::DevCommandPacket(TCHAR_TO_UTF8(*DevLine)));
		}
#endif
	}
	else if (Packet.body_case() == portfolio::mmo::Packet::kDied && Packet.died().id() == Session().World().SelfId())
	{
		// 내가 죽으면 열린 창을 닫고 사망 화면을 띄운다(대상은 전투 모델이 이미 풀었다. 자동 사냥을 끄는 것은 40).
		Close(EScreen::Settings);
		Close(EScreen::Character);
		Close(EScreen::Confirm);
		Close(EScreen::Quantity);
		Open(EScreen::Death);
	}
	else if (Packet.body_case() == portfolio::mmo::Packet::kRevived && Packet.revived().id() == Session().World().SelfId())
	{
		Close(EScreen::Death);
	}
}

void UMmoUiManager::ToggleCharacter()
{
	if (Stack.IsOpen(EScreen::Character))
	{
		Close(EScreen::Character);
	}
	else if (Stack.IsOpen(EScreen::Hud) && !Stack.IsOpen(EScreen::Death))
	{
		Open(EScreen::Character);
	}
}

void UMmoUiManager::OpenFromCommandLine()
{
	// 개발용: -MmoOpen=Settings|Character|Confirm|Quantity|Notice면 처음 월드에 들어간 뒤 한 번 그 화면을 연다(화면 크기마다의 배치를 클릭 없이 봄).
	static bool bOpened = false;
	FString Screen;
	if (bOpened || !FParse::Value(FCommandLine::Get(), TEXT("MmoOpen="), Screen))
	{
		return;
	}
	bOpened = true;
	if (Screen == TEXT("Settings"))
	{
		Open(EScreen::Settings);
	}
	else if (Screen == TEXT("Character"))
	{
		Open(EScreen::Character);
	}
	else if (Screen == TEXT("Confirm"))
	{
		Confirm(MmoText::Get(GetLocalPlayer(), TEXT("dev.previewConfirm")), nullptr);
	}
	else if (Screen == TEXT("Quantity"))
	{
		Quantity(MmoText::Get(GetLocalPlayer(), TEXT("dev.previewQuantity")), 99, nullptr);
	}
	else if (Screen == TEXT("Notice"))
	{
		// 줄이 이어 와 쌓이고 3초 뒤에 사라지는 것을 보도록 1초마다 한 줄을 더한다.
		FTimerHandle Timer;
		PlayerController()->GetWorldTimerManager().SetTimer(Timer, FTimerDelegate::CreateWeakLambda(this, [this, Count = 0]() mutable
		{
			ShowNotice(MmoText::Format(GetLocalPlayer(), TEXT("dev.previewNotice"), { FString::FromInt(++Count) }));
		}), 1.0f, true);
	}
}

void UMmoUiManager::HandleClosed(const FString& Reason)
{
	const bool bWasPlaying = Stack.IsOpen(EScreen::Hud);
	Close(EScreen::Confirm);
	Close(EScreen::Settings);
	Close(EScreen::Character);
	Close(EScreen::Hud);
	Close(EScreen::CharacterCreate);
	Close(EScreen::CharacterSelect);
	Open(EScreen::Login);
	if (bWasPlaying && Reason != UMmoSession::LoggedOutReason)
	{
		ShowNotice(MmoText::Get(GetLocalPlayer(), TEXT("common.disconnected")));
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

