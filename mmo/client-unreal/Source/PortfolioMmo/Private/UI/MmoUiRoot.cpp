#include "UI/MmoUiRoot.h"

#include "Blueprint/WidgetTree.h"
#include "Components/Overlay.h"
#include "Components/OverlaySlot.h"
#include "UI/MmoNameTagLayer.h"

namespace
{
	void Fill(UOverlaySlot& Slot)
	{
		Slot.SetHorizontalAlignment(HAlign_Fill);
		Slot.SetVerticalAlignment(VAlign_Fill);
	}
}

void UMmoUiRoot::AddToLayer(MmoScreen::ELayer Layer, UUserWidget& Widget)
{
	Widget.RemoveFromParent();
	Fill(*Layers[static_cast<int32>(Layer)]->AddChildToOverlay(&Widget));
}

void UMmoUiRoot::AddNotice(UUserWidget& Widget)
{
	Widget.RemoveFromParent();
	Fill(*Notices->AddChildToOverlay(&Widget));
}

TSharedRef<SWidget> UMmoUiRoot::RebuildWidget()
{
	if (WidgetTree && !WidgetTree->RootWidget)
	{
		UOverlay* Root = WidgetTree->ConstructWidget<UOverlay>(UOverlay::StaticClass(), TEXT("Root"));
		Root->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
		WidgetTree->RootWidget = Root;

		NameTags = WidgetTree->ConstructWidget<UMmoNameTagLayer>(UMmoNameTagLayer::StaticClass(), TEXT("NameTags"));
		Fill(*Root->AddChildToOverlay(NameTags));
		Layers = { AddLayer(*Root, TEXT("Hud")), AddLayer(*Root, TEXT("Window")), AddLayer(*Root, TEXT("Popup")) };
		Notices = AddLayer(*Root, TEXT("Notice"));
	}
	return Super::RebuildWidget();
}

UOverlay* UMmoUiRoot::AddLayer(UOverlay& Root, const TCHAR* Name)
{
	UOverlay* Layer = WidgetTree->ConstructWidget<UOverlay>(UOverlay::StaticClass(), Name);
	Layer->SetVisibility(ESlateVisibility::SelfHitTestInvisible);
	Fill(*Root.AddChildToOverlay(Layer));
	return Layer;
}
