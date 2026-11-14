#include "Screen/TouchGestures.h"

namespace MmoScreen
{
	void FTouchGestures::Down(int32_t Finger, double X, double Y, double NowSeconds)
	{
		if (Finger >= 0 && Finger < FTouchOwners::MaxFingers)
		{
			Fingers[Finger] = { true, false, X, Y, NowSeconds };
		}
	}

	bool FTouchGestures::Move(int32_t Finger, double X, double Y)
	{
		if (Finger < 0 || Finger >= FTouchOwners::MaxFingers || !Fingers[Finger].bDown)
		{
			return false;
		}
		FFinger& State = Fingers[Finger];
		const double DX = X - State.DownX;
		const double DY = Y - State.DownY;
		State.bDragging |= DX * DX + DY * DY > TapPixels * TapPixels;
		return State.bDragging;
	}

	void FTouchGestures::MarkDrag(int32_t Finger)
	{
		if (Finger >= 0 && Finger < FTouchOwners::MaxFingers)
		{
			Fingers[Finger].bDragging = true;
		}
	}

	bool FTouchGestures::Up(int32_t Finger, double NowSeconds, double& OutX, double& OutY)
	{
		if (Finger < 0 || Finger >= FTouchOwners::MaxFingers || !Fingers[Finger].bDown)
		{
			return false;
		}
		const FFinger State = Fingers[Finger];
		Fingers[Finger] = {};
		OutX = State.DownX;
		OutY = State.DownY;
		return !State.bDragging && NowSeconds - State.DownSeconds <= TapSeconds;
	}
}
