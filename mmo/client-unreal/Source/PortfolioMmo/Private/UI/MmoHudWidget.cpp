#include "UI/MmoHudWidget.h"

#include "Components/ProgressBar.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Framework/Application/SlateApplication.h"
#include "Game/MmoCoordinates.h"
#include "GameFramework/Pawn.h"
#include "Net/MmoSession.h"
#include "UI/MmoJoystickWidget.h"

void UMmoHudWidget::NativeConstruct()
{
	Super::NativeConstruct();
	// 조이스틱은 터치 기기(와 Mac에서 -faketouches로 시험할 때)에만 보인다.
	const bool bTouch = FPlatformMisc::SupportsTouchInput() || FSlateApplication::Get().IsFakingTouchEvents();
	Joystick->SetVisibility(bTouch ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
	ShownZone = MAX_uint32;
	ShownHp = MAX_uint64;
	ShownMp = MAX_uint64;
}

void UMmoHudWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FSelfState& Vitals = Session->World().SelfState();
	ShowBar(*HpBar, *HpText, Vitals.Hp, Vitals.MaxHp, ShownHp);
	ShowBar(*MpBar, *MpText, Vitals.Mp, Vitals.MaxMp, ShownMp);

	const MmoWorld::FFieldMap* Field = Session->Field();
	const APawn* Self = GetOwningPlayerPawn();
	if (!Field || !Self)
	{
		ShowZone(0);
		return;
	}

	// 내 캐릭터는 이동 컴포넌트가 옮기므로 월드 모델이 아니라 액터의 자리로 구역을 구한다.
	const FVector Location = Self->GetActorLocation();
	ShowZone(Field->ZoneAt(MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location)));
}

void UMmoHudWidget::ShowBar(UProgressBar& Bar, UTextBlock& Text, uint32 Value, uint32 Max, uint64& Shown)
{
	const uint64 Pair = (static_cast<uint64>(Value) << 32) | Max;
	if (Pair == Shown)
	{
		return;
	}

	Shown = Pair;
	Bar.SetPercent(Max == 0 ? 0.0f : static_cast<float>(Value) / Max);
	Text.SetText(FText::FromString(FString::Printf(TEXT("%u / %u"), Value, Max)));
}

void UMmoHudWidget::ShowZone(uint32 Zone)
{
	if (Zone == ShownZone)
	{
		return;
	}

	ShownZone = Zone;
	const portfolio::mmo::data::ZonesRow* Row = nullptr;
	for (const portfolio::mmo::data::ZonesRow& Candidate : GetGameInstance()->GetSubsystem<UMmoSession>()->Data().Zones.rows())
	{
		Row = Candidate.id() == Zone ? &Candidate : Row;
	}

	if (!Row)
	{
		ZoneText->SetText(FText::GetEmpty());
		SafeZoneText->SetVisibility(ESlateVisibility::Collapsed);
		return;
	}

	// shortcut: 이름은 Strings의 키를 그대로 보인다. 문자열 테이블(backlog 74)이 생기면 그 글로 바꾼다.
	FString Text = UTF8_TO_TCHAR(Row->name_key().c_str());
	if (Row->has_min_level() && Row->has_max_level())
	{
		Text += FString::Printf(TEXT("  Lv %u–%u"), Row->min_level(), Row->max_level());
	}
	ZoneText->SetText(FText::FromString(Text));
	SafeZoneText->SetVisibility(Row->safe() ? ESlateVisibility::HitTestInvisible : ESlateVisibility::Collapsed);
}
