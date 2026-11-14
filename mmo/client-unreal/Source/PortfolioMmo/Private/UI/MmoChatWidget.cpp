#include "UI/MmoChatWidget.h"

#include "Blueprint/WidgetTree.h"
#include "Components/EditableTextBox.h"
#include "Components/ScrollBox.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Framework/Application/SlateApplication.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoText.h"
#include "Protocol/MmoPackets.h"
#include "World/ChatLog.h"

namespace
{
	/** 줄의 종류(채널)의 이름 키. */
	const TCHAR* KindKey(MmoWorld::EChatKind Kind)
	{
		switch (Kind)
		{
		case MmoWorld::EChatKind::Nearby: return TEXT("chat.nearby");
		case MmoWorld::EChatKind::Party: return TEXT("chat.party");
		case MmoWorld::EChatKind::World: return TEXT("chat.world");
		case MmoWorld::EChatKind::Whisper: return TEXT("chat.whisper");
		default: return TEXT("chat.system");
		}
	}

	/** 채널 버튼이 도는 차례. */
	portfolio::mmo::ChatChannel NextChannel(portfolio::mmo::ChatChannel Channel)
	{
		switch (Channel)
		{
		case portfolio::mmo::CHAT_CHANNEL_NEARBY: return portfolio::mmo::CHAT_CHANNEL_PARTY;
		case portfolio::mmo::CHAT_CHANNEL_PARTY: return portfolio::mmo::CHAT_CHANNEL_WORLD;
		case portfolio::mmo::CHAT_CHANNEL_WORLD: return portfolio::mmo::CHAT_CHANNEL_WHISPER;
		default: return portfolio::mmo::CHAT_CHANNEL_NEARBY;
		}
	}

	MmoWorld::EChatKind KindOf(portfolio::mmo::ChatChannel Channel)
	{
		switch (Channel)
		{
		case portfolio::mmo::CHAT_CHANNEL_PARTY: return MmoWorld::EChatKind::Party;
		case portfolio::mmo::CHAT_CHANNEL_WORLD: return MmoWorld::EChatKind::World;
		case portfolio::mmo::CHAT_CHANNEL_WHISPER: return MmoWorld::EChatKind::Whisper;
		default: return MmoWorld::EChatKind::Nearby;
		}
	}
}

void UMmoChatWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	ChannelButton->OnClickedNative.AddWeakLambda(this, [this]
	{
		Channel = NextChannel(static_cast<portfolio::mmo::ChatChannel>(Channel));
		ShowChannel();
	});
	SendButton->OnClickedNative.AddWeakLambda(this, [this] { Send(); });
	InputBox->OnTextCommitted.AddDynamic(this, &UMmoChatWidget::HandleCommitted);
	InputBox->OnTextChanged.AddDynamic(this, &UMmoChatWidget::HandleChanged);
	ShowChannel();
}

void UMmoChatWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	ShowLines();
}

void UMmoChatWidget::Focus()
{
	InputBox->SetKeyboardFocus();
}

void UMmoChatWidget::StartWhisper(const FString& Name)
{
	Channel = portfolio::mmo::CHAT_CHANNEL_WHISPER;
	ShowChannel();
	ToBox->SetText(FText::FromString(Name));
	Focus();
}

void UMmoChatWidget::ShowChannel()
{
	ChannelButton->SetLabel(MmoText::Get(this, KindKey(KindOf(static_cast<portfolio::mmo::ChatChannel>(Channel)))));
	ToBox->SetVisibility(Channel == portfolio::mmo::CHAT_CHANNEL_WHISPER ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	InputBox->SetHintText(MmoText::Get(this, TEXT("chat.hint")));
	ToBox->SetHintText(MmoText::Get(this, TEXT("chat.to")));
}

void UMmoChatWidget::ShowLines()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FChatLog& Log = Session->Chat();
	if (Log.Revision() == ShownRevision && Session->Strings().Version() == ShownLanguage)
	{
		return;
	}
	if (Session->Strings().Version() != ShownLanguage)
	{
		ShownLanguage = Session->Strings().Version();
		ShowChannel();
	}
	ShownRevision = Log.Revision();

	const MmoWorld::FEntity* Self = Session->World().SelfEntity();
	const std::string MyName = Self ? Self->Info.name() : std::string();
	int32 Index = 0;
	for (const MmoWorld::FChatLine& Line : Log.Lines())
	{
		if (Index >= LineTexts.Num())
		{
			UTextBlock* Text = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
			FSlateFontInfo Font = Text->GetFont();
			Font.Size = LineSize;
			Text->SetFont(Font);
			Text->SetAutoWrapText(true);
			Text->SetShadowOffset(FVector2D(1.0, 1.0));
			Text->SetShadowColorAndOpacity(FLinearColor(0.0f, 0.0f, 0.0f, 0.8f));
			LinesBox->AddChild(Text);
			LineTexts.Add(Text);
		}
		UTextBlock* Text = LineTexts[Index++];
		const FString Kind = MmoText::Get(this, KindKey(Line.Kind)).ToString();
		const FString Body = UTF8_TO_TCHAR(Line.Text.c_str());
		// 내가 보낸 귓속말은 받는 사람을, 나머지는 보낸 사람을 앞에 둔다.
		const FText Shown = Line.Kind == MmoWorld::EChatKind::System ? MmoText::Format(this, TEXT("chat.systemLine"), { Kind, Body })
			: Line.Kind == MmoWorld::EChatKind::Whisper && Line.Sender == MyName ? MmoText::Format(this, TEXT("chat.whisperTo"), { Kind, UTF8_TO_TCHAR(Line.To.c_str()), Body })
			: MmoText::Format(this, TEXT("chat.line"), { Kind, UTF8_TO_TCHAR(Line.Sender.c_str()), Body });
		Text->SetText(Shown);
		const int32 Color = static_cast<int32>(Line.Kind);
		Text->SetColorAndOpacity(FSlateColor(KindColors.IsValidIndex(Color) ? KindColors[Color] : FLinearColor::White));
		Text->SetVisibility(ESlateVisibility::HitTestInvisible);
	}
	for (; Index < LineTexts.Num(); ++Index)
	{
		LineTexts[Index]->SetVisibility(ESlateVisibility::Collapsed);
	}
	LinesBox->ScrollToEnd();
}

void UMmoChatWidget::Send()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const std::optional<portfolio::mmo::Packet> Packet = MmoWorld::ChatInputPacket(TCHAR_TO_UTF8(*InputBox->GetText().ToString()), static_cast<portfolio::mmo::ChatChannel>(Channel),
		TCHAR_TO_UTF8(*ToBox->GetText().ToString()), Session->Data().Constants.chat_max_bytes());
	if (Packet)
	{
		Session->Send(*Packet);
	}
	InputBox->SetText(FText::GetEmpty());
}

void UMmoChatWidget::HandleCommitted(const FText& Text, ETextCommit::Type CommitMethod)
{
	// Enter는 보내고, Esc는 버린다. 어느 쪽이든 초점을 게임으로 돌려 키가 다시 이동과 단축키로 간다.
	if (CommitMethod == ETextCommit::OnEnter)
	{
		Send();
	}
	else if (CommitMethod == ETextCommit::OnCleared)
	{
		InputBox->SetText(FText::GetEmpty());
	}
	else
	{
		return;
	}
	FSlateApplication::Get().SetAllUserFocusToGameViewport();
}

void UMmoChatWidget::HandleChanged(const FText& Text)
{
	const UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const std::string Typed = TCHAR_TO_UTF8(*Text.ToString());
	const std::string Trimmed = MmoWorld::TrimUtf8(Typed, Session->Data().Constants.chat_max_bytes());
	if (Trimmed.size() != Typed.size())
	{
		InputBox->SetText(FText::FromString(UTF8_TO_TCHAR(Trimmed.c_str())));
	}
}
