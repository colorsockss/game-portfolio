// Screen/의 엔진 없는 코드(화면 스택, 터치 나눔)를 UE 없이 컴파일해 확인한다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>

#include "Screen/ScreenStack.h"
#include "Screen/TouchOwners.h"

namespace
{
	int Failures = 0;

	void Expect(bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	}

	using MmoScreen::EInputMode;
	using MmoScreen::EScreen;

	void LoginThenGame()
	{
		MmoScreen::FScreenStack Stack;
		Expect(Stack.InputMode() == EInputMode::Game && !Stack.BackTarget(), "an empty stack is the game with nothing to close");

		Stack.Open(EScreen::Login);
		Expect(Stack.InputMode() == EInputMode::Ui, "the login screen takes all input");
		Expect(!Stack.BackTarget(), "back does not close the login screen");

		Stack.Close(EScreen::Login);
		Stack.Open(EScreen::Hud);
		Expect(Stack.InputMode() == EInputMode::Game && !Stack.BackTarget(), "the HUD leaves input to the game and is not closed by back");
	}

	void BackClosesTheTopFirst()
	{
		MmoScreen::FScreenStack Stack;
		Stack.Open(EScreen::Hud);
		Stack.Open(EScreen::Settings);
		Expect(Stack.InputMode() == EInputMode::Window, "an open window stops the character");
		Stack.Open(EScreen::Confirm);
		Expect(Stack.BackTarget() == EScreen::Confirm, "back closes the popup first");

		Stack.Close(*Stack.BackTarget());
		Expect(Stack.BackTarget() == EScreen::Settings, "then the window under it");

		Stack.Close(*Stack.BackTarget());
		Expect(!Stack.BackTarget() && Stack.InputMode() == EInputMode::Game, "then nothing, and the game has input again");
	}

	void PopupWinsOverALaterWindow()
	{
		MmoScreen::FScreenStack Stack;
		Stack.Open(EScreen::Confirm);
		Stack.Open(EScreen::Settings);
		Expect(Stack.BackTarget() == EScreen::Confirm, "a popup is above a window opened after it");
	}

	void OpeningAgainMovesToTheTop()
	{
		MmoScreen::FScreenStack Stack;
		Stack.Open(EScreen::Hud);
		Stack.Open(EScreen::Settings);
		Stack.Open(EScreen::Hud);
		Expect(Stack.Opened().size() == 2 && Stack.Opened().back() == EScreen::Hud, "opening an open screen does not duplicate it and moves it last");

		Stack.Close(EScreen::Confirm);
		Expect(Stack.Opened().size() == 2, "closing a closed screen does nothing");
		Expect(Stack.IsOpen(EScreen::Settings) && !Stack.IsOpen(EScreen::Confirm), "IsOpen follows the stack");
	}

	void CharacterSelectionTakesInputAndCreateClosesWithBack()
	{
		MmoScreen::FScreenStack Stack;
		Stack.Open(EScreen::CharacterSelect);
		Expect(Stack.InputMode() == EInputMode::Ui && !Stack.BackTarget(), "character selection takes input and back does not close it");
		Stack.Open(EScreen::CharacterCreate);
		Expect(Stack.BackTarget() == EScreen::CharacterCreate, "back closes character creation");
		Stack.Close(EScreen::CharacterCreate);
		Expect(Stack.InputMode() == EInputMode::Ui, "closing creation keeps the selection screen's input");
	}

	void QuantityIsAPopupClosedByBack()
	{
		MmoScreen::FScreenStack Stack;
		Stack.Open(EScreen::Hud);
		Stack.Open(EScreen::Quantity);
		Expect(Stack.InputMode() == EInputMode::Window && Stack.BackTarget() == EScreen::Quantity, "the quantity popup stops the hands and closes with back");
	}

	// 누른 순간 정해진 주인은 뗄 때까지 바뀌지 않고, 세 손가락이 저마다 다른 주인을 가진다.
	void FingersKeepTheirOwnerUntilReleased()
	{
		using MmoScreen::ETouchOwner;
		MmoScreen::FTouchOwners Owners;
		Expect(Owners.Claim(0, ETouchOwner::Joystick), "the joystick takes the first finger");
		Expect(Owners.Claim(1, ETouchOwner::Button), "a button takes the second finger");
		Expect(Owners.Claim(2, ETouchOwner::Camera), "the camera takes the third finger");
		Expect(Owners.OwnerOf(0) == ETouchOwner::Joystick && Owners.OwnerOf(1) == ETouchOwner::Button && Owners.OwnerOf(2) == ETouchOwner::Camera,
			"three fingers have three owners");

		Expect(!Owners.Claim(2, ETouchOwner::Button) && Owners.OwnerOf(2) == ETouchOwner::Camera, "a camera finger sliding over a button stays the camera's");
		Expect(Owners.Claim(0, ETouchOwner::Joystick), "claiming again by the same owner keeps it");

		Owners.Release(2);
		Expect(Owners.OwnerOf(2) == ETouchOwner::None, "lifting a finger frees it");
		Expect(Owners.Claim(2, ETouchOwner::Button) && Owners.OwnerOf(2) == ETouchOwner::Button, "the next press decides the new owner");
		Expect(!Owners.Claim(10, ETouchOwner::Camera) && !Owners.Claim(-1, ETouchOwner::Camera), "fingers outside the range have no owner");
	}

	void LoginWinsOverWindows()
	{
		MmoScreen::FScreenStack Stack;
		Stack.Open(EScreen::Settings);
		Stack.Open(EScreen::Login);
		Expect(Stack.InputMode() == EInputMode::Ui, "the login screen takes input even over a window");
	}
}

int main()
{
	LoginThenGame();
	BackClosesTheTopFirst();
	PopupWinsOverALaterWindow();
	OpeningAgainMovesToTheTop();
	LoginWinsOverWindows();
	CharacterSelectionTakesInputAndCreateClosesWithBack();
	QuantityIsAPopupClosedByBack();
	FingersKeepTheirOwnerUntilReleased();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Screen tests passed\n");
	return EXIT_SUCCESS;
}
