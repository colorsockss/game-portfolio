#include "UI/MmoCraftWidget.h"

#include "Components/TextBlock.h"
#include "Components/TileView.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoItemSlotWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"
#include "World/Crafting.h"

namespace
{
	/** 모자란 줄의 색. */
	const FLinearColor ShortColor(1.0f, 0.4f, 0.35f);

	void ShowLine(UTextBlock& Text, const FText& Value, bool bEnough)
	{
		Text.SetText(Value);
		Text.SetColorAndOpacity(FSlateColor(bEnough ? FLinearColor::White : ShortColor));
		Text.SetVisibility(ESlateVisibility::HitTestInvisible);
	}
}

void UMmoCraftWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	for (int32 Index = 0; Index < Session->Data().Recipes.rows_size(); ++Index)
	{
		const portfolio::mmo::data::ItemsRow* Item = Session->Data().RecipeItem(Session->Data().Recipes.rows(Index));
		UMmoItemSlotEntry* Entry = NewObject<UMmoItemSlotEntry>(this);
		Entry->ItemId = Item ? Item->id() : 0;
		Entry->SlotIndex = Index;
		Entries.Add(Entry);
	}
	RecipeGrid->SetListItems(Entries);
	RecipeGrid->OnItemClicked().AddUObject(this, &UMmoCraftWidget::HandleRecipeClicked);
	ActButton->OnClicked.AddDynamic(this, &UMmoCraftWidget::HandleActClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoCraftWidget::HandleCloseClicked);
}

void UMmoCraftWidget::NativeConstruct()
{
	Super::NativeConstruct();
	Selected = -1;
	PendingRequest = 0;
	ShownVersion = MAX_uint32;
}

void UMmoCraftWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	const bool bBusy = Me && Me->Info.progress().kind() == portfolio::mmo::PROGRESS_KIND_CRAFT;
	if (PendingRequest != 0 && !Session->Inventory().IsWaiting(PendingRequest))
	{
		PendingRequest = 0;
		ActButton->SetWaiting(false);
		ShownVersion = MAX_uint32;
	}
	const uint32 Level = Me ? Me->Info.level() : 0;
	if (Session->Inventory().Version() == ShownVersion && Session->Strings().Version() == ShownLanguage && Level == ShownLevel && bBusy == bShownBusy)
	{
		return;
	}
	ShownVersion = Session->Inventory().Version();
	ShownLanguage = Session->Strings().Version();
	ShownLevel = Level;
	bShownBusy = bBusy;
	RecipeGrid->RegenerateAllEntries();
	Refresh();
}

void UMmoCraftWidget::HandleRecipeClicked(UObject* Item)
{
	if (const UMmoItemSlotEntry* Entry = Cast<UMmoItemSlotEntry>(Item))
	{
		Selected = Entry->SlotIndex;
		Refresh();
	}
}

void UMmoCraftWidget::Refresh()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoData::FGameData& Data = Session->Data();
	TArray<UTextBlock*> Materials{ Material0Text, Material1Text, Material2Text };
	for (UTextBlock* Line : TArray<UTextBlock*>{ LevelText, Material0Text, Material1Text, Material2Text, GoldText, GradesText, RoomText })
	{
		Line->SetVisibility(ESlateVisibility::Collapsed);
	}
	if (Selected < 0 || Selected >= Data.Recipes.rows_size())
	{
		ResultText->SetText(MmoText::Get(this, TEXT("craft.pick")));
		ActButton->SetIsEnabled(false);
		return;
	}

	const portfolio::mmo::data::RecipesRow& Recipe = Data.Recipes.rows(Selected);
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	const MmoWorld::FCraftCheck Check = MmoWorld::CheckCraft(Recipe, Session->Inventory(), Data, Me ? Me->Info.level() : 0);
	const auto NameOf = [this, &Data](uint32 ItemId)
	{
		const portfolio::mmo::data::ItemsRow* Item = Data.Item(ItemId);
		return Item ? MmoText::Get(this, UTF8_TO_TCHAR(Item->name_key().c_str())).ToString() : FString();
	};
	const portfolio::mmo::data::ItemsRow* Result = Data.RecipeItem(Recipe);
	ResultText->SetText(MmoText::Format(this, TEXT("craft.result"), { Result ? NameOf(Result->id()) : FString(),
		FString::FromInt(Recipe.kind() == portfolio::mmo::data::RECIPE_KIND_ITEM ? Recipe.count() : 1) }));
	ShowLine(*LevelText, MmoText::Format(this, TEXT("craft.level"), { FString::FromInt(Recipe.level()) }), Check.bLevel);
	for (int32 Index = 0; Index < FMath::Min(Recipe.materials_size(), MaterialLines); ++Index)
	{
		ShowLine(*Materials[Index], MmoText::Format(this, TEXT("craft.material"), { NameOf(Recipe.materials(Index)), FString::FromInt(Check.Have[Index]),
			FString::FromInt(Index < Recipe.material_counts_size() ? Recipe.material_counts(Index) : 0) }), Check.Materials[Index]);
	}
	ShowLine(*GoldText, MmoText::Format(this, TEXT("craft.gold"), { FText::AsNumber(static_cast<uint64>(Session->Inventory().Gold())).ToString(),
		FText::AsNumber(Recipe.gold()).ToString() }), Check.bGold);
	if (Recipe.kind() == portfolio::mmo::data::RECIPE_KIND_EQUIPMENT && Recipe.grade_chances_size() == 4)
	{
		TArray<FString> Percents;
		for (const double Chance : Recipe.grade_chances())
		{
			Percents.Add(FString::SanitizeFloat(FMath::RoundToDouble(Chance * 1000.0) / 10.0, 0));
		}
		ShowLine(*GradesText, MmoText::Format(this, TEXT("craft.grades"), { Percents[0], Percents[1], Percents[2], Percents[3] }), true);
	}
	if (!Check.bRoom)
	{
		ShowLine(*RoomText, MmoText::Get(this, TEXT("craft.noRoom")), false);
	}
	ActButton->SetIsEnabled(Check.CanCraft() && PendingRequest == 0 && !bShownBusy);
}

void UMmoCraftWidget::HandleActClicked()
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (Selected < 0 || Selected >= Session->Data().Recipes.rows_size() || PendingRequest != 0)
	{
		return;
	}
	Session->Send(Session->Inventory().Craft(Session->Data().Recipes.rows(Selected).id()));
	PendingRequest = Session->Inventory().RequestId();
	ActButton->SetWaiting(true);
}

void UMmoCraftWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Craft);
}
