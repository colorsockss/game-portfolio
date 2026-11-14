#pragma once

// 카메라가 가진 손가락의 탭과 끌기를 가른다(엔진 없는 코드). 누른 자리에서 TapPixels 넘게 움직이면 끌기(카메라를 돌림)가 되고, 끌기가 되지 않은 채
// TapSeconds 안에 떼면 탭(그 자리의 개체나 땅을 누름)이다. 두 손가락 벌리기에 쓰인 손가락은 끌기로 친다. UE 타입 없이 표준 C++만 쓴다.
#include <array>
#include <cstdint>

#include "Screen/TouchOwners.h"

namespace MmoScreen
{
	class FTouchGestures
	{
	public:
		/** 탭으로 치는 가장 긴 누름(초). */
		static constexpr double TapSeconds = 0.3;
		/** 탭으로 치는 가장 큰 움직임(뷰포트 픽셀). 이만큼 넘게 움직이면 끌기다. */
		static constexpr double TapPixels = 20.0;

		/** 손가락이 닿았다. */
		void Down(int32_t Finger, double X, double Y, double NowSeconds);

		/** 손가락이 (X, Y)에 있다. 끌기면(이번에 넘었거나 이미 넘음) true다. */
		bool Move(int32_t Finger, double X, double Y);

		/** 끌기로 친다(두 손가락 벌리기). */
		void MarkDrag(int32_t Finger);

		/** 손가락을 뗐다. 탭이면 true이고, 탭의 자리는 누른 자리다. */
		bool Up(int32_t Finger, double NowSeconds, double& OutX, double& OutY);

	private:
		struct FFinger
		{
			bool bDown = false;
			bool bDragging = false;
			double DownX = 0;
			double DownY = 0;
			double DownSeconds = 0;
		};
		std::array<FFinger, FTouchOwners::MaxFingers> Fingers{};
	};
}
