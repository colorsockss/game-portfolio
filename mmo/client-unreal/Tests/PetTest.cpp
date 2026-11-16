// 펫의 그리는 자리(World/PetFollow, 96)를 UE 없이 본다. run.mjs가 빌드하고 실행한다.
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <string>

#include "World/PetFollow.h"

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

	constexpr int32_t M = 32;

	/** 빈 Size m 필드. Walls의 x 칸(m)들은 z 전체가 벽이다. */
	MmoWorld::FFieldMap Field(uint32_t Size, int32_t Wall = 1000)
	{
		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(Size);
		Grid.set_depth(Size);
		const int32_t Min = -static_cast<int32_t>(Size) / 2;
		Grid.set_origin_x(Min);
		Grid.set_origin_z(Min);
		std::string Cells(static_cast<size_t>(Size) * Size, '\0');
		if (Wall < static_cast<int32_t>(Size) / 2)
		{
			for (uint32_t Row = 0; Row < Size; ++Row)
			{
				Cells[Row * Size + static_cast<uint32_t>(Wall - Min)] = 1;
			}
		}
		Grid.set_cells(Cells);
		google::protobuf::RepeatedPtrField<portfolio::mmo::data::ZonesRow> Zones;
		return *MmoWorld::FFieldMap::Make(Size, Zones, Grid);
	}

	double Distance(MmoWorld::FPoint A, MmoWorld::FPoint B)
	{
		return std::sqrt(std::pow(A.X - B.X, 2.0) + std::pow(A.Z - B.Z, 2.0));
	}

	/** 펫은 주인(+z를 봄)의 뒤 1.5 m로 걷고, 6 m 넘게 떨어지거나 주인까지 벽에 막히면 주인의 뒤에 다시 놓이며, 향할 드롭이 있으면 그쪽으로 간다. */
	void PetsFollowBehindTheirOwner()
	{
		const MmoWorld::FFieldMap Open = Field(64);
		MmoWorld::FPetStep Step{ 0, 0, 0, { 3 * M, 0 }, 0.1, std::nullopt };
		const MmoWorld::FPoint Next = MmoWorld::NextPetPosition(Open, Step);
		const MmoWorld::FPoint Behind{ 0, -48 };
		Expect(Distance(Next, Behind) < Distance(Step.Last, Behind) && Distance(Next, Step.Last) <= 0.7 * M + 1, "it walks toward the spot behind the owner at its speed");
		Step.Seconds = 10;
		Expect(MmoWorld::NextPetPosition(Open, Step).X == Behind.X && MmoWorld::NextPetPosition(Open, Step).Z == Behind.Z, "it stops behind the owner");

		Step.Last = { 7 * M, 0 };
		Step.Seconds = 0.1;
		const MmoWorld::FPoint Far = MmoWorld::NextPetPosition(Open, Step);
		Expect(Far.X == Behind.X && Far.Z == Behind.Z, "beyond 6 m it is placed behind the owner");

		const MmoWorld::FFieldMap Walled = Field(64, 2);
		Step.Last = { 4 * M, 0 };
		const MmoWorld::FPoint Blocked = MmoWorld::NextPetPosition(Walled, Step);
		Expect(Blocked.X == Behind.X && Blocked.Z == Behind.Z, "a wall between them places it behind the owner");

		Step.Last = Behind;
		Step.Lure = MmoWorld::FPoint{ 2 * M, 0 };
		const MmoWorld::FPoint Lured = MmoWorld::NextPetPosition(Open, Step);
		Expect(Distance(Lured, *Step.Lure) < Distance(Behind, *Step.Lure), "it heads for a drop it can pick up");
	}
}

int main()
{
	PetsFollowBehindTheirOwner();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Pet tests passed\n");
	return EXIT_SUCCESS;
}
