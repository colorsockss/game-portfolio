// 조작 안내를 본 캐릭터의 목록(World/GuideSeen, 94)을 UE 없이 본다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>

#include "World/GuideSeen.h"

int main()
{
	int Failures = 0;
	const auto Expect = [&Failures](bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	};

	MmoWorld::FGuideSeen Seen({ "live:7777|3" });
	Expect(Seen.Has("live:7777", 3) && !Seen.Has("live:7777", 4) && !Seen.Has("local:7777", 3), "a character is seen only on its own server");
	Expect(Seen.Add("live:7777", 4) && !Seen.Add("live:7777", 4) && Seen.Has("live:7777", 4), "adding marks it once");
	Expect(Seen.Keys().size() == 2, "the keys are what the device keeps");
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Guide tests passed\n");
	return EXIT_SUCCESS;
}
