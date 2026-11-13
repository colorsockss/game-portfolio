#include "UI/MmoNameTagLayer.h"

#include "Blueprint/WidgetLayoutLibrary.h"
#include "Blueprint/WidgetTree.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/TextBlock.h"
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

	/** 피해 숫자가 떠 있는 시간(초)과 그동안 오르는 거리(화면 픽셀). */
	constexpr float NumberLife = 1.0f;
	constexpr float NumberRise = 60.0f;

	/** 선공 몬스터의 이름 색, 내가 받은 피해의 색, 치명타의 색. */
	const FLinearColor AggressiveColor(1.0f, 0.45f, 0.3f);
	const FLinearColor ReceivedColor(1.0f, 0.3f, 0.25f);
	const FLinearColor CriticalColor(1.0f, 0.85f, 0.2f);
}

void UMmoNameTagLayer::NativeConstruct()
{
	Super::NativeConstruct();
	if (UMmoEntitySubsystem* Entities = GetWorld()->GetSubsystem<UMmoEntitySubsystem>())
	{
		CombatHandle = Entities->OnCombatEvent.AddUObject(this, &UMmoNameTagLayer::HandleCombatEvent);
	}
}

void UMmoNameTagLayer::NativeDestruct()
{
	if (UMmoEntitySubsystem* Entities = GetWorld() ? GetWorld()->GetSubsystem<UMmoEntitySubsystem>() : nullptr)
	{
		Entities->OnCombatEvent.Remove(CombatHandle);
	}
	Super::NativeDestruct();
}

void UMmoNameTagLayer::HandleCombatEvent(const MmoWorld::FCombatEvent& Event)
{
	if (Event.Kind != MmoWorld::ECombatEventKind::Damage || !Event.bMine || !Canvas)
	{
		return;
	}
	UTextBlock* Text = NumberPool.Num() > 0 ? NumberPool.Pop().Get() : nullptr;
	if (!Text)
	{
		Text = WidgetTree->ConstructWidget<UTextBlock>(UTextBlock::StaticClass());
		UCanvasPanelSlot* Slot = Canvas->AddChildToCanvas(Text);
		Slot->SetAutoSize(true);
		Slot->SetAlignment(FVector2D(0.5, 1.0));
		Text->SetShadowOffset(FVector2D(1.0, 1.0));
		Text->SetShadowColorAndOpacity(FLinearColor(0.0f, 0.0f, 0.0f, 0.8f));
	}
	const bool bReceived = Event.Target == GetGameInstance()->GetSubsystem<UMmoSession>()->World().SelfId();
	FSlateFontInfo Font = Text->GetFont();
	Font.Size = Event.bCritical ? 30 : 20;
	Text->SetFont(Font);
	Text->SetColorAndOpacity(FSlateColor(Event.bCritical ? CriticalColor : bReceived ? ReceivedColor : FLinearColor::White));
	Text->SetText(FText::AsNumber(Event.Damage));
	Text->SetRenderOpacity(1.0f);
	Text->SetVisibility(ESlateVisibility::Hidden);
	Numbers.Add({ Text, Event.Target, 0.0f });
}

void UMmoNameTagLayer::UpdateNumbers(float DeltaTime)
{
	APlayerController* Controller = GetOwningPlayer();
	const UMmoEntitySubsystem* Actors = GetWorld()->GetSubsystem<UMmoEntitySubsystem>();
	for (int32 Index = Numbers.Num() - 1; Index >= 0; --Index)
	{
		FNumber& Number = Numbers[Index];
		Number.Age += DeltaTime;
		const AActor* Actor = Actors ? Actors->FindActor(Number.Target) : nullptr;
		FVector2D Position;
		if (Number.Age >= NumberLife || !Actor || !Controller
			|| !UWidgetLayoutLibrary::ProjectWorldLocationToWidgetPosition(Controller, Actor->GetActorLocation() + FVector(0.0, 0.0, TagHeight), Position, false))
		{
			Number.Text->SetVisibility(ESlateVisibility::Collapsed);
			NumberPool.Add(Number.Text);
			Numbers.RemoveAt(Index);
			continue;
		}
		const float Progress = Number.Age / NumberLife;
		Cast<UCanvasPanelSlot>(Number.Text->Slot)->SetPosition(Position - FVector2D(0.0, 20.0 + NumberRise * Progress));
		Number.Text->SetRenderOpacity(1.0f - Progress * Progress);
		Number.Text->SetVisibility(ESlateVisibility::HitTestInvisible);
	}
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

	UpdateNumbers(DeltaTime);
	const UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FWorldState& World = Session->World();
	TSet<uint32> Shown;
	for (const auto& [Id, Entity] : World.Entities())
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
		UMmoNameTagWidget& Tag = Acquire(Id);
		const portfolio::mmo::EntityEnter& Info = Entity.Info;
		float Hp = -1.0f;
		if (Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER)
		{
			// shortcut: 이름은 Strings의 키를 그대로 보인다. 문자열 테이블(backlog 74)이 생기면 그 글로 바꾼다.
			const portfolio::mmo::data::MonstersRow* Row = Session->Data().Monster(Info.template_id());
			Tag.SetName(Row ? FString::Printf(TEXT("%s  Lv %u"), UTF8_TO_TCHAR(Row->name_key().c_str()), Row->level()) : FString(),
				Row && Row->aggressive() ? AggressiveColor : FLinearColor::White);
			Hp = Info.max_hp() > 0 ? static_cast<float>(Info.hp()) / Info.max_hp() : -1.0f;
		}
		else
		{
			Tag.SetName(UTF8_TO_TCHAR(Info.name().c_str()), FLinearColor::White);
			if (Info.kind() == portfolio::mmo::ENTITY_KIND_PLAYER)
			{
				// 내 체력은 SelfVitals가 따로 오므로 내 상태에서 읽는다.
				const MmoWorld::FSelfState& Mine = World.SelfState();
				const bool bSelf = Id == World.SelfId();
				const uint32 Value = bSelf ? Mine.Hp : Info.hp();
				const uint32 Max = bSelf ? Mine.MaxHp : Info.max_hp();
				Hp = Max > 0 ? static_cast<float>(Value) / Max : -1.0f;
			}
		}
		Tag.SetHp(Hp);
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

UMmoNameTagWidget& UMmoNameTagLayer::Acquire(uint32 Id)
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
	Tag->SetVisibility(ESlateVisibility::HitTestInvisible);
	Active.Add(Id, Tag);
	return *Tag;
}
