#pragma once

// 터치 나눔(엔진 없는 코드). 손가락마다 주인이 하나다(조이스틱, 버튼, 카메라). 누른 순간 닿은 것이 그 손가락의 주인이 되고 뗄 때까지
// 바뀌지 않는다. 그래서 조이스틱을 쥔 채 스킬 버튼을 누르고 다른 손가락으로 카메라를 돌릴 수 있고, 카메라를 돌리던 손가락이 버튼 위로
// 지나가도 버튼이 가져가지 않는다. UMmoUiManager가 하나를 가지고, 위젯과 컨트롤러가 묻는다. UE 타입 없이 표준 C++만 쓴다.
#include <array>
#include <cstdint>

namespace MmoScreen
{
	enum class ETouchOwner : uint8_t
	{
		None,
		Joystick,
		Button,
		Camera,
	};

	class FTouchOwners
	{
	public:
		/** 손가락 번호의 상한(엔진의 터치 인덱스 수). 그 밖의 번호는 주인을 가질 수 없다. */
		static constexpr int32_t MaxFingers = 10;

		/** 주인이 없는 손가락이면 Owner가 가진다. 이미 주인이 있으면 바꾸지 않는다. 그 손가락의 주인이 Owner면 true. */
		bool Claim(int32_t Finger, ETouchOwner Owner);

		/** 손가락을 뗐다. 주인이 없어진다. */
		void Release(int32_t Finger);

		ETouchOwner OwnerOf(int32_t Finger) const;

	private:
		std::array<ETouchOwner, MaxFingers> Owners{};
	};
}
