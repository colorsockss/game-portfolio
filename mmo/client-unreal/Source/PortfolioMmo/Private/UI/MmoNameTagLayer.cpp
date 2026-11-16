#include "UI/MmoNameTagLayer.h"

#include "UI/MmoItemSlotWidget.h"
#include "World/Interaction.h"

#include "UI/MmoText.h"
#include "Blueprint/WidgetLayoutLibrary.h"
#include "Blueprint/WidgetTree.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Game/MmoEntitySubsystem.h"
#include "HAL/PlatformTime.h"
#include "Net/MmoSession.h"
#include "UI/MmoNameTagWidget.h"
#include "UI/MmoUiPaths.h"

namespace
{
	/** 이름표를 놓는 높이(언리얼 단위). 몸통 위다. shortcut: 바닥이 평평하다고 보고 높이를 고정한다. 지형이 생기면 액터의 경계 상자 위로 바꾼다. */
	constexpr double TagHeight = 210.0;
	/** 바닥 아이템의 이름표 높이(33). */
	constexpr double GroundTagHeight = 60.0;

	/** 피해 숫자가 떠 있는 시간(초)과 그동안 오르는 거리(화면 픽셀). */
	constexpr float NumberLife = 1.0f;
	constexpr float NumberRise = 60.0f;
	/** 말풍선이 떠 있는 시간(초. 41). */
	constexpr double BubbleSeconds = 5.0;

	/** 선공 몬스터의 이름 색, 내가 받은 피해의 색, 치명타의 색. */
	const FLinearColor AggressiveColor(1.0f, 0.45f, 0.3f);
	const FLinearColor ReceivedColor(1.0f, 0.3f, 0.25f);
	const FLinearColor CriticalColor(1.0f, 0.85f, 0.2f);
	/** NPC의 이름 색(37). */
	const FLinearColor NpcColor(0.55f, 0.9f, 0.6f);
	/** 플레이어의 이름 색(44): 선공 표시는 보라색, 무법자는 빨간색. */
	const FLinearColor AggressorColor(0.75f, 0.45f, 1.0f);
	const FLinearColor OutlawColor(1.0f, 0.25f, 0.25f);

	/** NPC 역할의 글 키(37). */
	const TCHAR* RoleKey(int32 Role)
	{
		switch (Role)
		{
		case portfolio::mmo::data::NPC_ROLE_STORAGE: return TEXT("npcRole.storage");
		case portfolio::mmo::data::NPC_ROLE_CRAFT: return TEXT("npcRole.craft");
		case portfolio::mmo::data::NPC_ROLE_QUEST: return TEXT("npcRole.quest");
		default: return TEXT("npcRole.shop");
		}
	}
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
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FWorldState& World = Session->World();
	// 주변 채팅의 말풍선(41): 그 액터가 있을 때만 띄우고, 같은 개체의 새 채팅이 옛 말풍선을 바꾼다.
	const double Now = FPlatformTime::Seconds();
	for (const MmoWorld::FChatBubble& Bubble : Session->Chat().TakeBubbles())
	{
		if (Actors->FindActor(Bubble.EntityId))
		{
			Bubbles.Add(Bubble.EntityId, { UTF8_TO_TCHAR(Bubble.Text.c_str()), Now + BubbleSeconds });
		}
	}
	for (auto It = Bubbles.CreateIterator(); It; ++It)
	{
		if (It.Value().Value <= Now || !World.Entities().contains(It.Key()))
		{
			It.RemoveCurrent();
		}
	}
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
		// 바닥 아이템의 이름은 바닥 가까이에 둔다(33).
		const double Height = Entity.Info.kind() == portfolio::mmo::ENTITY_KIND_GROUND_ITEM ? GroundTagHeight : TagHeight;
		if (!UWidgetLayoutLibrary::ProjectWorldLocationToWidgetPosition(Controller, FVector(Location.X, Location.Y, Height), Position, false))
		{
			continue;
		}
		UMmoNameTagWidget& Tag = Acquire(Id);
		const portfolio::mmo::EntityEnter& Info = Entity.Info;
		float Hp = -1.0f;
		if (Info.kind() == portfolio::mmo::ENTITY_KIND_MONSTER)
		{
			const portfolio::mmo::data::MonstersRow* Row = Session->Data().Monster(Info.template_id());
			Tag.SetName(Row ? MmoText::Format(this, TEXT("hud.level"), { MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString(), FString::FromInt(Row->level()) }).ToString() : FString(),
				Row && Row->aggressive() ? AggressiveColor : FLinearColor::White);
			Hp = Info.max_hp() > 0 ? static_cast<float>(Info.hp()) / Info.max_hp() : -1.0f;
		}
		else if (Info.kind() == portfolio::mmo::ENTITY_KIND_SUMMON)
		{
			// 소환수(95): 주인의 이름과 소환수의 이름, 체력 바.
			const portfolio::mmo::data::MonstersRow* Row = Session->Data().Monster(Info.template_id());
			const FString Name = Row ? MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString() : FString();
			const auto Owner = World.Entities().find(Info.summon_owner_id());
			Tag.SetName(Owner == World.Entities().end() ? Name
				: MmoText::Format(this, TEXT("summon.owner"), { UTF8_TO_TCHAR(Owner->second.Info.name().c_str()), Name }).ToString(), FLinearColor::White);
			Hp = Info.max_hp() > 0 ? static_cast<float>(Info.hp()) / Info.max_hp() : -1.0f;
		}
		else if (Info.kind() == portfolio::mmo::ENTITY_KIND_NPC)
		{
			// 이름과 역할(37). 경비병(44)은 말하는 NPC가 아니라 이름만 둔다.
			const portfolio::mmo::data::NpcsRow* Row = Session->Data().Npc(Info.template_id());
			const FString Name = Row ? MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())).ToString() : FString();
			Tag.SetName(!Row || Row->role() == portfolio::mmo::data::NPC_ROLE_GUARD ? Name : FString::Printf(TEXT("%s [%s]"), *Name, *MmoText::Get(this, RoleKey(Row->role())).ToString()),
				NpcColor);
		}
		else if (Info.kind() == portfolio::mmo::ENTITY_KIND_GROUND_ITEM)
		{
			// 이름(골드는 금액, 겹친 것은 수)과 등급의 색. 내가 아직 주울 수 없는 것은 흐리게(33).
			const portfolio::mmo::data::ItemsRow* Item = Session->Data().Item(Info.item_id());
			const bool bGold = Item && Item->kind() == portfolio::mmo::data::ITEM_KIND_GOLD;
			FString Name = !Item ? FString() : bGold ? MmoText::Format(this, TEXT("inventory.gold"), { FText::AsNumber(Info.count()).ToString() }).ToString()
				: MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString();
			if (Item && !bGold && Info.count() > 1)
			{
				Name += TEXT(" ") + MmoText::Format(this, TEXT("detail.count"), { FString::FromInt(Info.count()) }).ToString();
			}
			FLinearColor Color = Item ? UMmoItemSlotWidget::GradeColor(Item->grade()) : FLinearColor::White;
			Color.A = MmoWorld::FInteraction::CanPickUp(Info, World.SelfId(), World.Clock().Now(FPlatformTime::Seconds()), Session->Party().Id()) ? 1.0f : 0.45f;
			Tag.SetName(Name, Color);
		}
		else
		{
			// 플레이어는 이름 색(44)으로 그린다.
			Tag.SetName(UTF8_TO_TCHAR(Info.name().c_str()), Info.name_color() == portfolio::mmo::NAME_COLOR_OUTLAW ? OutlawColor
				: Info.name_color() == portfolio::mmo::NAME_COLOR_AGGRESSOR ? AggressorColor : FLinearColor::White);
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
		// 상태 이상은 효과 목록에서, 진행 바는 진행 중인 일에서 그린다(끝나는 틱이 지난 것은 월드가 이미 뺐다).
		FString Status;
		for (const portfolio::mmo::EffectState& Effect : Info.effects())
		{
			const portfolio::mmo::data::EffectsRow* Row = Session->Data().Effect(Effect.effect_id());
			if (Row && Row->kind() == portfolio::mmo::data::EFFECT_KIND_STUN)
			{
				Status += TEXT("[") + MmoText::Get(this, TEXT("effect.stun")).ToString() + TEXT("]");
			}
			else if (Row && Row->kind() == portfolio::mmo::data::EFFECT_KIND_SLOW)
			{
				Status += TEXT("[") + MmoText::Get(this, TEXT("effect.slow")).ToString() + TEXT("]");
			}
		}
		Tag.SetStatus(Status);
		const std::optional<double> Progress = World.ProgressRatio(Entity, Session->Data(), FPlatformTime::Seconds());
		Tag.SetProgress(Progress ? static_cast<float>(*Progress) : -1.0f);
		const TPair<FString, double>* Bubble = Bubbles.Find(Id);
		Tag.SetBubble(Bubble ? Bubble->Key : FString());
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
