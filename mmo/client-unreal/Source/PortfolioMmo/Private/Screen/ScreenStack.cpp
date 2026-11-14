#include "Screen/ScreenStack.h"

#include <algorithm>

namespace MmoScreen
{
	const FScreenRule& RuleOf(EScreen Screen)
	{
		// EScreen의 차례와 같다.
		static const FScreenRule Rules[] = {
			{ ELayer::Window, false, EInputMode::Ui },    // Login: 뒤로 가기로 닫으면 갈 곳이 없다.
			{ ELayer::Window, false, EInputMode::Ui },    // CharacterSelect: 로그인 화면과 같다.
			{ ELayer::Popup, true, EInputMode::Ui },      // CharacterCreate: 닫으면 캐릭터 선택으로 돌아간다.
			{ ELayer::Hud, false, EInputMode::Game },     // Hud
			{ ELayer::Window, true, EInputMode::Window }, // Settings
			{ ELayer::Popup, true, EInputMode::Window },  // Confirm
			{ ELayer::Popup, true, EInputMode::Window },  // Quantity
			{ ELayer::Window, false, EInputMode::Window }, // Death: 부활로만 닫힌다.
			{ ELayer::Window, true, EInputMode::Window }, // Character
			{ ELayer::Window, true, EInputMode::Window }, // Inventory
			{ ELayer::Popup, true, EInputMode::Window },  // ItemDetail
			{ ELayer::Window, true, EInputMode::Window }, // Enchant
			{ ELayer::Window, true, EInputMode::Window }, // Skills
		};
		return Rules[static_cast<size_t>(Screen)];
	}

	void FScreenStack::Open(EScreen Screen)
	{
		Close(Screen);
		Order.push_back(Screen);
	}

	void FScreenStack::Close(EScreen Screen)
	{
		Order.erase(std::remove(Order.begin(), Order.end(), Screen), Order.end());
	}

	bool FScreenStack::IsOpen(EScreen Screen) const
	{
		return std::find(Order.begin(), Order.end(), Screen) != Order.end();
	}

	std::optional<EScreen> FScreenStack::BackTarget() const
	{
		std::optional<EScreen> Target;
		for (const EScreen Screen : Order)
		{
			const FScreenRule& Rule = RuleOf(Screen);
			// 같은 층이면 나중에 연 것이, 다른 층이면 위 층이 이긴다.
			if (Rule.bBackCloses && (!Target || Rule.Layer >= RuleOf(*Target).Layer))
			{
				Target = Screen;
			}
		}
		return Target;
	}

	FScreenStack::EBack FScreenStack::Back(bool bHasTarget) const
	{
		if (BackTarget())
		{
			return EBack::Close;
		}
		if (!IsOpen(EScreen::Hud))
		{
			return EBack::None;
		}
		return bHasTarget ? EBack::ReleaseTarget : EBack::OpenSettings;
	}

	EInputMode FScreenStack::InputMode() const
	{
		EInputMode Mode = EInputMode::Game;
		for (const EScreen Screen : Order)
		{
			const EInputMode Wanted = RuleOf(Screen).Mode;
			if (Wanted == EInputMode::Ui)
			{
				return EInputMode::Ui;
			}
			if (Wanted == EInputMode::Window)
			{
				Mode = EInputMode::Window;
			}
		}
		return Mode;
	}
}
