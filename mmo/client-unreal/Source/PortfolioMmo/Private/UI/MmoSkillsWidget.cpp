#include "UI/MmoSkillsWidget.h"

#include "Blueprint/WidgetTree.h"
#include "Components/TextBlock.h"
#include "Engine/GameInstance.h"
#include "Engine/LocalPlayer.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoQuickslotBarWidget.h"
#include "UI/MmoText.h"
#include "UI/MmoUiManager.h"

void UMmoSkillsWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	for (int32 Index = 0; Index < MaxSkills; ++Index)
	{
		UMmoButtonWidget* Button = WidgetTree->FindWidget<UMmoButtonWidget>(*SkillName(Index));
		if (!Button)
		{
			break;
		}
		Button->OnClickedNative.AddWeakLambda(this, [this, Index]
		{
			Selected = Index;
			bClearing = false;
		});
		SkillButtons.Add(Button);
	}
	SlotBar->OnPicked.AddUObject(this, &UMmoSkillsWidget::HandlePicked);
	ClearButton->OnClicked.AddDynamic(this, &UMmoSkillsWidget::HandleClearClicked);
	CloseButton->OnClicked.AddDynamic(this, &UMmoSkillsWidget::HandleCloseClicked);
}

void UMmoSkillsWidget::NativeConstruct()
{
	Super::NativeConstruct();
	Selected = 0;
	bClearing = false;
	Shown.Reset();
}

void UMmoSkillsWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	const UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const MmoWorld::FEntity* Me = Session->World().SelfEntity();
	const uint32 Class = Me ? static_cast<uint32>(Me->Info.character_class()) : 0;
	const uint32 Level = Me ? Me->Info.level() : 0;
	const TArray<uint32> Now = { Class, Level, Session->Skills().Version(), Session->Strings().Version(), static_cast<uint32>(Selected), bClearing ? 1u : 0u };
	if (Now == Shown)
	{
		return;
	}
	Shown = Now;

	SkillIds.Reset();
	for (const portfolio::mmo::data::SkillsRow* Row : MmoWorld::FSkillBook::ClassSkills(Session->Data(), Class))
	{
		SkillIds.Add(Row->id());
	}
	for (int32 Index = 0; Index < SkillButtons.Num(); ++Index)
	{
		const portfolio::mmo::data::SkillsRow* Row = Index < SkillIds.Num() ? Session->Data().Skill(SkillIds[Index]) : nullptr;
		SkillButtons[Index]->SetVisibility(Row ? ESlateVisibility::Visible : ESlateVisibility::Collapsed);
		if (Row)
		{
			SkillButtons[Index]->SetLabel(MmoText::Get(this, UTF8_TO_TCHAR(Row->name_key().c_str())));
			SkillButtons[Index]->SetSelected(Index == Selected);
		}
	}

	const portfolio::mmo::data::SkillsRow* Skill = SkillIds.IsValidIndex(Selected) ? Session->Data().Skill(SkillIds[Selected]) : nullptr;
	if (!Skill)
	{
		DetailText->SetText(FText::GetEmpty());
		HintText->SetText(FText::GetEmpty());
		return;
	}
	const bool bLearned = Session->Skills().IsLearned(Skill->id());
	const FString Lines[] = {
		MmoText::Get(this, UTF8_TO_TCHAR(Skill->name_key().c_str())).ToString(),
		MmoText::Get(this, *FString::Printf(TEXT("skill.desc.%u"), Skill->id())).ToString(),
		MmoText::Format(this, TEXT("skills.level"), { FString::FromInt(Skill->level()) }).ToString(),
		MmoText::Format(this, TEXT("skills.cost"), { FString::FromInt(Skill->mp()), FString::SanitizeFloat(Skill->cooldown_ms() / 1000.0, 0) }).ToString(),
		MmoText::Get(this, bLearned ? TEXT("skills.learned") : TEXT("skills.notLearned")).ToString(),
	};
	DetailText->SetText(FText::FromString(FString::Join(Lines, TEXT("\n"))));
	HintText->SetText(MmoText::Get(this, bClearing ? TEXT("skills.pickClear") : bLearned ? TEXT("skills.pick") : TEXT("fail.notLearned")));
}

void UMmoSkillsWidget::HandlePicked(int32 Index)
{
	UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	if (bClearing)
	{
		bClearing = false;
		Session->Send(MmoWorld::FSkillBook::SetQuickslot(Index, portfolio::mmo::QUICKSLOT_KIND_EMPTY, 0));
		return;
	}
	// 배우지 않은 스킬은 보내지 않는다(안내 글이 이미 "배우지 않은 스킬"이다).
	if (SkillIds.IsValidIndex(Selected) && Session->Skills().IsLearned(SkillIds[Selected]))
	{
		Session->Send(MmoWorld::FSkillBook::SetQuickslot(Index, portfolio::mmo::QUICKSLOT_KIND_SKILL, SkillIds[Selected]));
	}
}

void UMmoSkillsWidget::HandleClearClicked()
{
	bClearing = !bClearing;
}

void UMmoSkillsWidget::HandleCloseClicked()
{
	GetOwningLocalPlayer()->GetSubsystem<UMmoUiManager>()->Close(MmoScreen::EScreen::Skills);
}
