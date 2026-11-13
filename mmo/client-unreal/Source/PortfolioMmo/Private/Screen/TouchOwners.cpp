#include "Screen/TouchOwners.h"

namespace MmoScreen
{
	namespace
	{
		bool Valid(int32_t Finger)
		{
			return Finger >= 0 && Finger < FTouchOwners::MaxFingers;
		}
	}

	bool FTouchOwners::Claim(int32_t Finger, ETouchOwner Owner)
	{
		if (!Valid(Finger) || Owner == ETouchOwner::None)
		{
			return false;
		}
		if (Owners[Finger] == ETouchOwner::None)
		{
			Owners[Finger] = Owner;
		}
		return Owners[Finger] == Owner;
	}

	void FTouchOwners::Release(int32_t Finger)
	{
		if (Valid(Finger))
		{
			Owners[Finger] = ETouchOwner::None;
		}
	}

	ETouchOwner FTouchOwners::OwnerOf(int32_t Finger) const
	{
		return Valid(Finger) ? Owners[Finger] : ETouchOwner::None;
	}
}
