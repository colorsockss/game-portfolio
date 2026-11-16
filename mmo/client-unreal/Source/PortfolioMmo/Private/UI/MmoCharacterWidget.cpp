#include "UI/MmoCharacterWidget.h"

#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

void UMmoCharacterWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	CloseButton->OnClicked.AddDynamic(this, &UMmoCharacterWidget::HandleCloseClicked);
}

void UMmoCharacterWidget::NativeConstruct()
{
	Super::NativeConstruct();
	Shown.Reset();
}

void UMmoCharacterWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	const MmoWorld::FSelfState& Self = Session->World().SelfState();
	const uint32 Level = Me ? Me->Info.level() : 0;
	const TArray<uint32> Now = { Level, Self.Exp, Self.MaxHp, Self.MaxMp, Self.Attack, Self.Defense, static_cast<uint32>(Self.Karma), Session->Strings().Version() };
	if (Now == Shown)
	{
		return;
	}
	Shown = Now;

	LevelText->SetText(MmoText::Format(this, TEXT("character.level"), { FString::FromInt(Level) }));
	const portfolio::mmo::data::LevelsRow* Row = Me ? Session->Data().Level(static_cast<uint32>(Me->Info.character_class()), Level) : nullptr;
	const bool bMax = !Me || !Session->Data().Level(static_cast<uint32>(Me->Info.character_class()), Level + 1);
	ExpText->SetText(bMax || !Row
		? MmoText::Get(this, TEXT("character.expMax"))
		: MmoText::Format(this, TEXT("character.exp"), { FString::FromInt(Self.Exp), FString::FromInt(Row->exp()) }));
	// 능력치 아래에 성향(44)을 둔다.
	StatsText->SetText(FText::FromString(MmoText::Format(this, TEXT("character.stats"),
		{ FString::FromInt(Self.MaxHp), FString::FromInt(Self.MaxMp), FString::FromInt(Self.Attack), FString::FromInt(Self.Defense) }).ToString()
		+ TEXT("\n") + MmoText::Format(this, TEXT("character.karma"), { FString::FromInt(Self.Karma) }).ToString()));
}

void UMmoCharacterWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Character);
}
