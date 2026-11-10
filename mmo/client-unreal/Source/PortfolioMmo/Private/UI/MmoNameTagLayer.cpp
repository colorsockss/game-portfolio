#include "UI/MmoNameTagLayer.h"

#include "Blueprint/WidgetLayoutLibrary.h"
#include "Blueprint/WidgetTree.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Game/MmoEntitySubsystem.h"
#include "Net/MmoSession.h"
#include "UI/MmoNameTagWidget.h"
#include "UI/MmoUiPaths.h"

namespace
{
	/** 이름표를 놓는 높이(언리얼 단위). 몸통 위다. shortcut: 바닥이 평평하다고 보고 높이를 고정한다. 지형이 생기면 액터의 경계 상자 위로 바꾼다. */
	constexpr double TagHeight = 210.0;
}

TSharedRef<SWidget> UMmoNameTagLayer::RebuildWidget()
{
	if (WidgetTree && !WidgetTree->RootWidget)
	{
		Canvas = WidgetTree->ConstructWidget<UCanvasPanel>(UCanvasPanel::StaticClass(), TEXT("Canvas"));
		Canvas->SetVisibility(ESlateVisibility::HitTestInvisible);
		WidgetTree->RootWidget = Canvas;
	}
	return Super::RebuildWidget();
}

void UMmoNameTagLayer::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	// 작은 위젯 하나라 처음에 한 번 바로 불러온다.
	TagClass = MmoUiPaths::ClassOf(MmoUiPaths::NameTag).TryLoadClass<UMmoNameTagWidget>();
}

void UMmoNameTagLayer::NativeTick(const FGeometry& Geometry, float DeltaTime)
{
	Super::NativeTick(Geometry, DeltaTime);
	APlayerController* Controller = GetOwningPlayer();
	const UMmoEntitySubsystem* Actors = GetWorld()->GetSubsystem<UMmoEntitySubsystem>();
	if (!TagClass || !Controller || !Actors)
	{
		return;
	}

	TSet<uint32> Shown;
	for (const auto& [Id, Entity] : GetGameInstance()->GetSubsystem<UMmoSession>()->World().Entities())
	{
		const AActor* Actor = Actors->FindActor(Id);
		if (!Actor)
		{
			continue;
		}
		const FVector Location = Actor->GetActorLocation();
		FVector2D Position;
		if (!UWidgetLayoutLibrary::ProjectWorldLocationToWidgetPosition(Controller, FVector(Location.X, Location.Y, TagHeight), Position, false))
		{
			continue;
		}
		UMmoNameTagWidget& Tag = Acquire(Id, UTF8_TO_TCHAR(Entity.Name.c_str()));
		Cast<UCanvasPanelSlot>(Tag.Slot)->SetPosition(Position);
		Shown.Add(Id);
	}

	// 나갔거나 화면 밖의 개체는 이름표를 풀로 돌린다.
	for (auto It = Active.CreateIterator(); It; ++It)
	{
		if (!Shown.Contains(It.Key()))
		{
			It.Value()->SetVisibility(ESlateVisibility::Collapsed);
			Pool.Add(It.Value());
			It.RemoveCurrent();
		}
	}
}

UMmoNameTagWidget& UMmoNameTagLayer::Acquire(uint32 Id, const FString& Name)
{
	if (UMmoNameTagWidget* Tag = Active.FindRef(Id))
	{
		return *Tag;
	}
	UMmoNameTagWidget* Tag = Pool.Num() > 0 ? Pool.Pop().Get() : nullptr;
	if (!Tag)
	{
		Tag = CreateWidget<UMmoNameTagWidget>(this, TagClass);
		UCanvasPanelSlot* Slot = Canvas->AddChildToCanvas(Tag);
		Slot->SetAutoSize(true);
		// 이름표의 아래 가운데를 머리 위 자리에 맞춘다.
		Slot->SetAlignment(FVector2D(0.5, 1.0));
	}
	Tag->SetName(Name);
	Tag->SetVisibility(ESlateVisibility::HitTestInvisible);
	Active.Add(Id, Tag);
	return *Tag;
}
