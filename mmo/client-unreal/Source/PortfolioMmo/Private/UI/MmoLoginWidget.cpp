#include "UI/MmoLoginWidget.h"

#include "UI/MmoText.h"
#include "UI/MmoButtonWidget.h"
#include "Components/EditableTextBox.h"
#include "Components/TextBlock.h"
#include "Misc/CommandLine.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"
#include "Net/MmoSettings.h"


void UMmoLoginWidget::LogIn(const FString& LoginId)
{
	bExplained = false;
	LoginIdBox->SetText(FText::FromString(LoginId));
	LogInButton->SetWaiting(true);
	SetStatus(MmoText::Get(this, TEXT("login.connecting")));
	Session().LogIn(LoginId);
}

void UMmoLoginWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	LoginIdBox->OnTextCommitted.AddDynamic(this, &UMmoLoginWidget::HandleLoginIdCommitted);
	LogInButton->OnClicked.AddDynamic(this, &UMmoLoginWidget::HandleLogInClicked);

	// 닫혀 있는 동안에도 세션을 듣는다. AddUObject는 이 위젯이 사라지면 저절로 건너뛴다.
	UMmoSession& Net = Session();
	Net.OnConnected.AddUObject(this, &UMmoLoginWidget::HandleConnected);
	Net.OnPacket.AddUObject(this, &UMmoLoginWidget::HandlePacket);
	Net.OnClosed.AddUObject(this, &UMmoLoginWidget::HandleClosed);

	// 명령줄의 -MmoLogin=아이디는 처음 한 번만 쓴다(로그아웃 뒤에 다시 로그인하지 않게).
	static bool bUsedCommandLine = false;
	FString LoginId;
	if (!bUsedCommandLine && FParse::Value(FCommandLine::Get(), TEXT("MmoLogin="), LoginId))
	{
		bUsedCommandLine = true;
		LogIn(LoginId);
	}
}

void UMmoLoginWidget::NativeConstruct()
{
	Super::NativeConstruct();
	LoginIdBox->SetHintText(MmoText::Get(this, TEXT("login.idHint")));
	// 화면이 뜨면 바로 아이디를 칠 수 있게 한다.
	LoginIdBox->SetKeyboardFocus();
}

void UMmoLoginWidget::HandleLogInClicked()
{
	LogIn(LoginIdBox->GetText().ToString().TrimStartAndEnd());
}

void UMmoLoginWidget::HandleLoginIdCommitted(const FText& Text, ETextCommit::Type CommitMethod)
{
	if (CommitMethod == ETextCommit::OnEnter && LogInButton->GetIsEnabled())
	{
		HandleLogInClicked();
	}
}

void UMmoLoginWidget::HandleConnected()
{
	SetStatus(MmoText::Get(this, TEXT("login.loggingIn")));
}

void UMmoLoginWidget::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (Packet.body_case() == portfolio::mmo::Packet::kLoginResult)
	{
		const portfolio::mmo::LoginResult& Result = Packet.login_result();
		UE_LOG(LogMmoNet, Display, TEXT("LoginResult %s"), UTF8_TO_TCHAR(portfolio::mmo::LoginResultCode_Name(Result.result()).c_str()));
		switch (Result.result())
		{
		case portfolio::mmo::LOGIN_RESULT_CODE_OK:
			SetStatus(MmoText::Format(this, TEXT("login.loggedIn"), { Session().LoginId() }));
			return;
		case portfolio::mmo::LOGIN_RESULT_CODE_INVALID_LOGIN_ID:
			SetStatus(MmoText::Get(this, TEXT("login.invalidId")));
			break;
		case portfolio::mmo::LOGIN_RESULT_CODE_VERSION_MISMATCH:
		case portfolio::mmo::LOGIN_RESULT_CODE_DATA_MISMATCH:
			// 버전(패킷)이나 데이터(테이블, 맵)가 서버와 다르면 다시 붙어도 같으므로 새 빌드를 받는 곳을 보인다.
			SetStatus(MmoText::Format(this, Result.result() == portfolio::mmo::LOGIN_RESULT_CODE_VERSION_MISMATCH ? TEXT("login.versionMismatch") : TEXT("login.dataMismatch"),
				{ GetDefault<UMmoSettings>()->ReleasesUrl }));
			break;
		case portfolio::mmo::LOGIN_RESULT_CODE_SERVER_FULL:
			SetStatus(MmoText::Get(this, TEXT("login.serverFull")));
			break;
		default:
			SetStatus(MmoText::Get(this, TEXT("login.failed")));
			break;
		}
		// 서버가 이어서 연결을 끊으므로 끊김 메시지로 덮지 않는다.
		bExplained = true;
	}
	else if (Packet.body_case() == portfolio::mmo::Packet::kKicked)
	{
		const portfolio::mmo::KickReason Reason = Packet.kicked().reason();
		UE_LOG(LogMmoNet, Display, TEXT("Kicked %s"), UTF8_TO_TCHAR(portfolio::mmo::KickReason_Name(Reason).c_str()));
		switch (Reason)
		{
		case portfolio::mmo::KICK_REASON_DUPLICATE_LOGIN:
			SetStatus(MmoText::Get(this, TEXT("kick.duplicateLogin")));
			break;
		case portfolio::mmo::KICK_REASON_SERVER_SHUTDOWN:
			SetStatus(MmoText::Get(this, TEXT("kick.serverShutdown")));
			break;
		case portfolio::mmo::KICK_REASON_IDLE_TIMEOUT:
			SetStatus(MmoText::Get(this, TEXT("kick.idleTimeout")));
			break;
		case portfolio::mmo::KICK_REASON_MALFORMED_PACKET:
			SetStatus(MmoText::Get(this, TEXT("kick.malformedPacket")));
			break;
		case portfolio::mmo::KICK_REASON_RATE_LIMITED:
			SetStatus(MmoText::Get(this, TEXT("kick.rateLimited")));
			break;
		default:
			SetStatus(MmoText::Get(this, TEXT("kick.other")));
			break;
		}
		bExplained = true;
	}
}

void UMmoLoginWidget::HandleClosed(const FString& Reason)
{
	if (Reason == UMmoSession::LoggedOutReason)
	{
		SetStatus(MmoText::Get(this, TEXT("login.loggedOut")));
	}
	else if (!bExplained)
	{
		SetStatus(MmoText::Get(this, TEXT("common.disconnected")));
	}
	LogInButton->SetWaiting(false);
}

void UMmoLoginWidget::SetStatus(const FText& Status)
{
	StatusText->SetText(Status);
}

UMmoSession& UMmoLoginWidget::Session() const
{
	return *GetGameInstance()->GetSubsystem<UMmoSession>();
}

