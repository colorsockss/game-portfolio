#include "Input/MmoKeys.h"

#include "Framework/Application/SlateApplication.h"
#include "Net/MmoConnection.h"
#include "UI/MmoButtonWidget.h"

namespace MmoKeys
{
	TConstArrayView<FMmoKeyRow> Rows()
	{
		// FKey는 InputCore가 시작할 때 채우므로 처음 쓸 때 만든다(전역 초기화 차례에 기대지 않음).
		static const FMmoKeyRow Table[] = {
			{ EMmoAction::MoveForward, EKeys::W },
			{ EMmoAction::MoveBack, EKeys::S },
			{ EMmoAction::MoveLeft, EKeys::A },
			{ EMmoAction::MoveRight, EKeys::D },
			{ EMmoAction::Click, EKeys::LeftMouseButton },
			{ EMmoAction::TargetNearest, EKeys::Tab },
			{ EMmoAction::Back, EKeys::Escape },
			{ EMmoAction::CameraDrag, EKeys::RightMouseButton },
			{ EMmoAction::CameraZoom, EKeys::MouseWheelAxis },
			{ EMmoAction::Slot1, EKeys::One },
			{ EMmoAction::Slot2, EKeys::Two },
			{ EMmoAction::Slot3, EKeys::Three },
			{ EMmoAction::Slot4, EKeys::Four },
			{ EMmoAction::Slot5, EKeys::Five },
			{ EMmoAction::Slot6, EKeys::Six },
			{ EMmoAction::Slot7, EKeys::Seven },
			{ EMmoAction::Slot8, EKeys::Eight },
			{ EMmoAction::Attack, EKeys::F },
			{ EMmoAction::Interact, EKeys::E },
			{ EMmoAction::AutoHunt, EKeys::Z },
			{ EMmoAction::ForceAttack, EKeys::LeftControl },
			{ EMmoAction::Bag, EKeys::I },
			{ EMmoAction::Character, EKeys::C },
			{ EMmoAction::Skills, EKeys::K },
			{ EMmoAction::Quest, EKeys::L },
			{ EMmoAction::Map, EKeys::M },
			{ EMmoAction::Chat, EKeys::Enter },
			{ EMmoAction::HideUi, EKeys::F9 },
			{ EMmoAction::FreeCamera, EKeys::F10 },
			{ EMmoAction::DevOverlay, EKeys::F3 },
		};
		return Table;
	}

	FKey KeyOf(EMmoAction Action)
	{
		for (const FMmoKeyRow& Row : Rows())
		{
			if (Row.Action == Action)
			{
				return Row.Key;
			}
		}
		return EKeys::Invalid;
	}

	FText Hint(EMmoAction Action)
	{
		const FKey Key = KeyOf(Action);
		return UMmoButtonWidget::IsTouchDevice() || !Key.IsValid() ? FText::GetEmpty() : Key.GetDisplayName(false);
	}

	bool IsTyping()
	{
		if (!FSlateApplication::IsInitialized())
		{
			return false;
		}
		const TSharedPtr<SWidget> Focused = FSlateApplication::Get().GetKeyboardFocusedWidget();
		static const FName EditableText(TEXT("SEditableText"));
		static const FName MultiLineText(TEXT("SMultiLineEditableText"));
		return Focused && (Focused->GetType() == EditableText || Focused->GetType() == MultiLineText);
	}

	FKey FromMacKeyCode(uint32 KeyCode)
	{
		// Carbon의 kVK_ANSI_* 값(HIToolbox/Events.h). 미국 배열의 물리 자리라 입력기와 배열이 바뀌어도 같다.
		switch (KeyCode)
		{
		case 0x00: return EKeys::A;
		case 0x01: return EKeys::S;
		case 0x02: return EKeys::D;
		case 0x03: return EKeys::F;
		case 0x04: return EKeys::H;
		case 0x05: return EKeys::G;
		case 0x06: return EKeys::Z;
		case 0x07: return EKeys::X;
		case 0x08: return EKeys::C;
		case 0x09: return EKeys::V;
		case 0x0B: return EKeys::B;
		case 0x0C: return EKeys::Q;
		case 0x0D: return EKeys::W;
		case 0x0E: return EKeys::E;
		case 0x0F: return EKeys::R;
		case 0x10: return EKeys::Y;
		case 0x11: return EKeys::T;
		case 0x12: return EKeys::One;
		case 0x13: return EKeys::Two;
		case 0x14: return EKeys::Three;
		case 0x15: return EKeys::Four;
		case 0x16: return EKeys::Six;
		case 0x17: return EKeys::Five;
		case 0x19: return EKeys::Nine;
		case 0x1A: return EKeys::Seven;
		case 0x1C: return EKeys::Eight;
		case 0x1D: return EKeys::Zero;
		case 0x1F: return EKeys::O;
		case 0x20: return EKeys::U;
		case 0x22: return EKeys::I;
		case 0x23: return EKeys::P;
		case 0x25: return EKeys::L;
		case 0x26: return EKeys::J;
		case 0x28: return EKeys::K;
		case 0x2D: return EKeys::N;
		case 0x2E: return EKeys::M;
		default: return EKeys::Invalid;
		}
	}
}

TOptional<FKeyEvent> FMmoKeyCodeInput::Corrected(const FKeyEvent& Event)
{
#if PLATFORM_MAC
	const FKey Physical = MmoKeys::FromMacKeyCode(Event.GetKeyCode());
	if (!Physical.IsValid() || Physical == Event.GetKey())
	{
		return {};
	}
	if (!Logged.Contains({ Event.GetKeyCode(), Event.GetKey().GetFName() }))
	{
		Logged.Add({ Event.GetKeyCode(), Event.GetKey().GetFName() });
		UE_LOG(LogMmoNet, Display, TEXT("Key code %u (character %u) was read as %s; using %s"), Event.GetKeyCode(), Event.GetCharacter(),
			*Event.GetKey().ToString(), *Physical.ToString());
	}
	return FKeyEvent(Physical, Event.GetModifierKeys(), Event.GetInputDeviceId(), Event.IsRepeat(), Event.GetCharacter(), Event.GetKeyCode(), Event.GetUserIndex());
#else
	return {};
#endif
}

bool FMmoKeyCodeInput::HandleKeyDownEvent(FSlateApplication& SlateApp, const FKeyEvent& Event)
{
	// 고친 이벤트는 다시 여기를 지나지만 키가 맞으므로 그대로 간다.
	if (const TOptional<FKeyEvent> Fixed = Corrected(Event))
	{
		SlateApp.ProcessKeyDownEvent(*Fixed);
		return true;
	}
	return false;
}

bool FMmoKeyCodeInput::HandleKeyUpEvent(FSlateApplication& SlateApp, const FKeyEvent& Event)
{
	if (const TOptional<FKeyEvent> Fixed = Corrected(Event))
	{
		SlateApp.ProcessKeyUpEvent(*Fixed);
		return true;
	}
	return false;
}
