#pragma once

// UE 타입 없이 표준 C++만 쓴다(World/와 같다). 어떤 화면이 열려 있고, 뒤로 가기가 무엇을 닫고, 입력을 어디로 보낼지를 정한다.
// 위젯을 만들고 붙이는 일은 UMmoUiManager가 이 판단을 따라 한다. Unity 클라이언트가 같은 구조를 C#으로 옮긴다.
#include <cstdint>
#include <optional>
#include <vector>

namespace MmoScreen
{
	/** 스택에 오르는 화면. 알림과 이름표는 스택 밖의 층이다. */
	enum class EScreen : uint8_t
	{
		Login,
		CharacterSelect,
		CharacterCreate,
		Hud,
		Settings,
		Confirm,
		Quantity,
		/** 사망 화면(부활 버튼). 뒤로 가기로 닫히지 않고 손 조작을 막는다. */
		Death,
		/** 캐릭터 창(31). */
		Character,
	};

	/** 화면이 올라가는 층. 아래에서 위로 그린다. */
	enum class ELayer : uint8_t
	{
		Hud,
		Window,
		Popup,
	};

	/** 열린 화면들이 정하는 입력. */
	enum class EInputMode : uint8_t
	{
		/** 화면만 입력을 받는다(로그인, 캐릭터 선택과 만들기). */
		Ui,
		/** 게임이 입력을 받는다. */
		Game,
		/** 창이 열려 있다. 카메라는 돌지만 캐릭터는 움직이지 않는다. */
		Window,
	};

	struct FScreenRule
	{
		ELayer Layer;
		/** 뒤로 가기(Esc, Android 뒤로 버튼)로 닫히는가. */
		bool bBackCloses;
		EInputMode Mode;
	};

	/** 화면마다 정해진 층, 뒤로 가기, 입력. */
	const FScreenRule& RuleOf(EScreen Screen);

	/** 열린 화면들과 연 차례. */
	class FScreenStack
	{
	public:
		/** 연다. 이미 열려 있으면 그 층의 맨 위로 올린다. */
		void Open(EScreen Screen);

		/** 닫는다. 열려 있지 않으면 아무것도 하지 않는다. */
		void Close(EScreen Screen);

		bool IsOpen(EScreen Screen) const;

		/** 뒤로 가기가 닫을 화면: 뒤로 닫히는 화면 중 가장 위 층(팝업 → 창)에서 마지막으로 연 것. 없으면 비어 있다. */
		std::optional<EScreen> BackTarget() const;

		/** 뒤로 가기(Esc, Android의 뒤로 버튼)가 할 일. */
		enum class EBack : uint8_t
		{
			/** BackTarget을 닫는다. */
			Close,
			/** 내 대상을 푼다. */
			ReleaseTarget,
			/** 설정 창을 연다. */
			OpenSettings,
			/** 아무것도 하지 않는다(로그인, 캐릭터 선택). */
			None,
		};

		/** 열린 창이 있으면 맨 위 창을 닫고, 없으면(HUD에서) 대상을 풀고, 대상도 없으면 설정 창을 연다. */
		EBack Back(bool bHasTarget) const;

		/** 하나라도 Ui면 Ui, 아니면 하나라도 Window면 Window, 아니면 Game. */
		EInputMode InputMode() const;

		/** 열린 차례(먼저 연 것이 앞). */
		const std::vector<EScreen>& Opened() const { return Order; }

	private:
		std::vector<EScreen> Order;
	};
}
