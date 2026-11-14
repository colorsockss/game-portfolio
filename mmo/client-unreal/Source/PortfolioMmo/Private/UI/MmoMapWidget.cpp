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
		MmoCoordinates::ToYaw(Self->GetActorRotation()));
	MmoMapDrawing::PlaceDots(*MapDots, Dots, Points, 0, 0, 1, MapSize);
	SelfArrow->SetRenderTransformAngle(static_cast<float>(Points[0].YawDegrees));
	if (UCanvasPanelSlot* Slot = Cast<UCanvasPanelSlot>(SelfArrow->Slot))
	{
		Slot->SetPosition(FVector2D(Points[0].U * MapSize, Points[0].V * MapSize));
	}
}

void UMmoMapWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Map);
}
