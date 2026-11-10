#include "UI/MmoLoginWidget.h"

#include "Components/Button.h"
#include "Components/EditableTextBox.h"
#include "Components/TextBlock.h"
#include "Misc/CommandLine.h"
#include "Net/MmoConnection.h"
#include "Net/MmoSession.h"

#define LOCTEXT_NAMESPACE "MmoLogin"

void UMmoLoginWidget::LogIn(const FString& LoginId)
{
	bExplained = false;
	LoginIdBox->SetText(FText::FromString(LoginId));
	LogInButton->SetIsEnabled(false);
	SetStatus(LOCTEXT("Connecting", "서버에 연결하는 중…"));
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
	SetStatus(LOCTEXT("LoggingIn", "로그인하는 중…"));
}

void UMmoLoginWidget::HandlePacket(const portfolio::mmo::Packet& Packet)
{
	if (Packet.body_case() == portfolio::mmo::Packet::kLoginResult)
	{
		const portfolio::mmo::LoginResult& Result = Packet.login_result();
		UE_LOG(LogMmoNet, Display, TEXT("LoginResult %s (self id %u)"),
			UTF8_TO_TCHAR(portfolio::mmo::LoginResultCode_Name(Result.result()).c_str()), Result.self_id());
		switch (Result.result())
		{
		case portfolio::mmo::LOGIN_RESULT_CODE_OK:
			SetStatus(FText::Format(LOCTEXT("LoggedIn", "{0}(으)로 로그인했습니다. 개체 번호 {1}"), FText::FromString(Session().LoginId()), Session().World().SelfId()));
			return;
		case portfolio::mmo::LOGIN_RESULT_CODE_INVALID_LOGIN_ID:
			SetStatus(LOCTEXT("InvalidLoginId", "아이디 형식이 맞지 않습니다. 영문 소문자, 숫자, _로 4–16자입니다."));
			break;
		case portfolio::mmo::LOGIN_RESULT_CODE_VERSION_MISMATCH:
			SetStatus(LOCTEXT("VersionMismatch", "서버와 버전이 다릅니다. 클라이언트를 업데이트해 주세요."));
			break;
		case portfolio::mmo::LOGIN_RESULT_CODE_SERVER_FULL:
			SetStatus(LOCTEXT("ServerFull", "서버가 가득 찼습니다. 잠시 뒤에 다시 시도해 주세요."));
			break;
		default:
			SetStatus(LOCTEXT("LoginFailed", "로그인하지 못했습니다."));
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
			SetStatus(LOCTEXT("DuplicateLogin", "다른 곳에서 같은 아이디로 로그인해 연결이 끊겼습니다."));
			break;
		case portfolio::mmo::KICK_REASON_SERVER_SHUTDOWN:
			SetStatus(LOCTEXT("ServerShutdown", "서버가 내려가 연결이 끊겼습니다."));
			break;
		case portfolio::mmo::KICK_REASON_IDLE_TIMEOUT:
			SetStatus(LOCTEXT("IdleTimeout", "오랫동안 응답이 없어 서버가 연결을 끊었습니다."));
			break;
		case portfolio::mmo::KICK_REASON_MALFORMED_PACKET:
			SetStatus(LOCTEXT("MalformedPacket", "서버가 읽을 수 없는 패킷을 보내 연결이 끊겼습니다."));
			break;
		default:
			SetStatus(LOCTEXT("Kicked", "서버가 연결을 끊었습니다."));
			break;
		}
		bExplained = true;
	}
}

void UMmoLoginWidget::HandleClosed(const FString& Reason)
{
	if (Reason == UMmoSession::LoggedOutReason)
	{
		SetStatus(LOCTEXT("LoggedOut", "로그아웃했습니다."));
	}
	else if (!bExplained)
	{
		SetStatus(LOCTEXT("Disconnected", "서버와 연결이 끊겼습니다."));
	}
	LogInButton->SetIsEnabled(true);
}

void UMmoLoginWidget::SetStatus(const FText& Status)
{
	StatusText->SetText(Status);
}

UMmoSession& UMmoLoginWidget::Session() const
{
	return *GetGameInstance()->GetSubsystem<UMmoSession>();
}

#undef LOCTEXT_NAMESPACE
