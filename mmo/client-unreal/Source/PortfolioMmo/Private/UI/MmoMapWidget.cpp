#include "UI/MmoMapWidget.h"

#include "Components/Border.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/Image.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Game/MmoCoordinates.h"
#include "GameFramework/Pawn.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoMapDrawing.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"
#include "Game/MmoPlayerController.h"

namespace
{
	/** 퀘스트의 목표(50)를 지도 모델의 (X, Z)로. 없으면 nullopt. */
	std::optional<std::pair<int32_t, int32_t>> GoalOf(const UMmoSession& Session, const FVector& Location)
	{
		const std::optional<MmoWorld::FPoint> Goal = Session.QuestGoal(MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location));
		return Goal ? std::optional<std::pair<int32_t, int32_t>>(std::make_pair(Goal->X, Goal->Z)) : std::nullopt;
	}
}

void UMmoMapWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	CloseButton->OnClicked.AddDynamic(this, &UMmoMapWidget::HandleCloseClicked);
	if (const MmoWorld::FFieldMap* Field = GetGameInstance()->GetSubsystem<UMmoSession>()->Field())
	{
		Texture = MmoMapDrawing::MakeTexture(this, *Field);
		MapImage->SetBrushFromTexture(Texture);
	}
}

void UMmoMapWidget::NativeConstruct()
{
	Super::NativeConstruct();
	NextDraw = 0;
	ShownLanguage = MAX_uint32;
}

void UMmoMapWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FFieldMap* Field = Session->Field();
	const APawn* Self = GetOwningPlayerPawn();
	const double Now = FPlatformTime::Seconds();
	if (!Field || !Self || Now < NextDraw)
	{
		return;
	}
	NextDraw = Now + 0.2;

	// 구역의 이름은 그 사각형의 가운데에 적는다(언어가 바뀌면 다시).
	if (ShownLanguage != Session->Strings().Version())
	{
		ShownLanguage = Session->Strings().Version();
		for (UTextBlock* Name : ZoneNames)
		{
			Name->RemoveFromParent();
		}
		ZoneNames.Reset();
		for (const portfolio::mmo::data::ZonesRow& Zone : Session->Data().Zones.rows())
		{
			const auto [U, V] = MmoWorld::FMapView::ToMap(*Field, (Zone.min_x() + Zone.max_x()) * 0.5 * MmoWorld::Units::PerMeter, (Zone.min_z() + Zone.max_z()) * 0.5 * MmoWorld::Units::PerMeter);
			UTextBlock* Name = NewObject<UTextBlock>(MapDots);
			Name->SetText(MmoText::Get(this, UTF8_TO_TCHAR(Zone.name_key().c_str())));
			Name->SetShadowOffset(FVector2D(1.0, 1.0));
			Name->SetVisibility(ESlateVisibility::HitTestInvisible);
			UCanvasPanelSlot* Slot = MapDots->AddChildToCanvas(Name);
			Slot->SetAutoSize(true);
			Slot->SetAlignment(FVector2D(0.5, 0.5));
			Slot->SetPosition(FVector2D(U * MapSize, V * MapSize));
			ZoneNames.Add(Name);
		}
	}

	const FVector Location = Self->GetActorLocation();
	const std::vector<MmoWorld::FMapPoint> Points = MmoWorld::FMapView::Points(*Field, Session->Data(), MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location),
		MmoCoordinates::ToYaw(Self->GetActorRotation()), Session->Party().Positions(Session->World()), Session->Bosses().Positions(), GoalOf(*Session, Location));
	MmoMapDrawing::PlaceDots(*MapDots, Dots, Points, 0, 0, 1, MapSize);
	SelfArrow->SetRenderTransformAngle(static_cast<float>(Points[0].YawDegrees));
	if (UCanvasPanelSlot* Slot = Cast<UCanvasPanelSlot>(SelfArrow->Slot))
	{
		Slot->SetPosition(FVector2D(Points[0].U * MapSize, Points[0].V * MapSize));
	}
}

FReply UMmoMapWidget::NativeOnMouseButtonDown(const FGeometry& InGeometry, const FPointerEvent& InMouseEvent)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FFieldMap* Field = Session->Field();
	const APawn* Self = GetOwningPlayerPawn();
	const std::optional<std::pair<int32_t, int32_t>> Goal = Self ? GoalOf(*Session, Self->GetActorLocation()) : std::nullopt;
	if (Field && Goal)
	{
		// 지도 좌표의 목표 점에서 이 거리(지도 픽셀) 안을 누르면 목표를 누른 것이다.
		constexpr double PickPixels = 18.0;
		const auto [U, V] = MmoWorld::FMapView::ToMap(*Field, Goal->first, Goal->second);
		const FVector2D Local = MapDots->GetCachedGeometry().AbsoluteToLocal(InMouseEvent.GetScreenSpacePosition());
		if (FVector2D::Distance(Local, FVector2D(U * MapSize, V * MapSize)) <= PickPixels)
		{
			if (AMmoPlayerController* Controller = Cast<AMmoPlayerController>(GetOwningPlayer()); Controller && Controller->WalkToQuestGoal())
			{
				GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Map);
			}
			return FReply::Handled();
		}
	}
	return Super::NativeOnMouseButtonDown(InGeometry, InMouseEvent);
}

void UMmoMapWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Map);
}
