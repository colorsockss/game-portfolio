#include "UI/MmoQuickslotBarWidget.h"

#include "Blueprint/WidgetTree.h"
#include "Engine/GameInstance.h"
#include "Input/MmoKeys.h"
#include "Net/MmoSession.h"
#include "UI/MmoButtonWidget.h"
#include "UI/MmoIcons.h"
#include "UI/MmoText.h"

void UMmoQuickslotBarWidget::NativeOnInitialized()
{
	Super::NativeOnInitialized();
	Icons = LoadObject<UMmoIcons>(nullptr, UMmoIcons::Path);
	for (int32 Index = 0; Index < portfolio::mmo::CONSTANT_QUICKSLOT_COUNT; ++Index)
	{
		UMmoButtonWidget* Slot = WidgetTree->FindWidget<UMmoButtonWidget>(*SlotName(Index));
		if (!Slot)
		{
			break;
		}
		Slot->OnClickedNative.AddWeakLambda(this, [this, Index] { OnPicked.Broadcast(Index); });
		Slots.Add(Slot);
	}
}

void UMmoQuickslotBarWidget::NativeConstruct()
{
	Super::NativeConstruct();
	Shown = MAX_uint64;
}

void UMmoQuickslotBarWidget::NativeTick(const FGeometry& MyGeometry, float InDeltaTime)
{
	Super::NativeTick(MyGeometry, InDeltaTime);
	const UMmoSession* Session = GetGameInstance()->GetSubsystem<UMmoSession>();
	const uint64 Now = static_cast<uint64>(Session->Skills().Version()) << 32 | Session->Strings().Version();
	if (Now == Shown)
	{
		return;
	}
	Shown = Now;

	const std::vector<portfolio::mmo::Quickslot>& Bar = Session->Skills().Slots();
	for (int32 Index = 0; Index < Slots.Num() && Index < static_cast<int32>(Bar.size()); ++Index)
	{
		const portfolio::mmo::Quickslot& Slot = Bar[Index];
		const portfolio::mmo::data::SkillsRow* Skill = Slot.kind() == portfolio::mmo::QUICKSLOT_KIND_SKILL ? Session->Data().Skill(Slot.id()) : nullptr;
		const portfolio::mmo::data::ItemsRow* Item = Slot.kind() == portfolio::mmo::QUICKSLOT_KIND_ITEM ? Session->Data().Item(Slot.id()) : nullptr;
		const std::string* NameKey = Skill ? &Skill->name_key() : Item ? &Item->name_key() : nullptr;
		UTexture2D* Icon = !Icons ? nullptr : Skill ? Icons->Load(EMmoIconKind::Skill, Skill->id()) : Item ? Icons->Load(EMmoIconKind::Item, Item->id()) : nullptr;
		Slots[Index]->SetIcon(Icon, NameKey ? MmoText::Get(this, UTF8_TO_TCHAR(NameKey->c_str())) : FText::GetEmpty());
		// 자리의 번호는 HUD의 키와 같다(PC만 보임).
		Slots[Index]->SetKeyHint(MmoKeys::Hint(MmoKeys::Slot(Index)));
	}
}
