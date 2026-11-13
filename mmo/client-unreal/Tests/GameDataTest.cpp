// Data/의 엔진 없는 로더를 UE 없이 컴파일해 확인한다. run.mjs가 빌드하고 실행한다.
// 커밋된 생성물(mmo/shared/data/files/)이 실제로 읽히는지도 본다(run.mjs가 폴더를 넘김).
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>

#include "Data/GameData.h"

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

	void ParsesTheHash()
	{
		Expect(MmoData::ParseHash("e3b0c44298fc1c14\n") == 0xe3b0c44298fc1c14ULL, "a hash with a newline");
		Expect(MmoData::ParseHash("0000000000000001") == 1ULL, "leading zeros");
		Expect(!MmoData::ParseHash("e3b0c442"), "too short");
		Expect(!MmoData::ParseHash("e3b0c44298fc1c140"), "too long");
		Expect(!MmoData::ParseHash("E3B0C44298FC1C14"), "upper case is not what data-tool writes");
		Expect(!MmoData::ParseHash("e3b0c44298fc1c1g"), "not hex");
	}

	void LoadNeedsTheHashFile()
	{
		const auto Missing = MmoData::Load([](std::string_view) { return std::optional<std::string>(); });
		Expect(!Missing, "no hash file is no data");
		const auto Broken = MmoData::Load([](std::string_view) { return std::optional<std::string>("nope"); });
		Expect(!Broken, "a broken hash file is no data");
	}

	// 커밋된 생성물을 읽는다. 서버의 GameDataTests가 같은 파일을 같은 값으로 읽는다.
	void LoadsTheGeneratedFiles(const char* Folder)
	{
		const auto Data = MmoData::Load([Folder](std::string_view Name) -> std::optional<std::string>
		{
			std::ifstream File(std::string(Folder) + "/" + std::string(Name), std::ios::binary);
			if (!File)
			{
				return std::nullopt;
			}

			std::ostringstream Bytes;
			Bytes << File.rdbuf();
			return Bytes.str();
		});
		Expect(Data.has_value(), "the generated files load");
	}
}

int main(int ArgumentCount, char** Arguments)
{
	ParsesTheHash();
	LoadNeedsTheHashFile();
	if (ArgumentCount < 2)
	{
		std::printf("FAIL: run.mjs passes the generated data folder\n");
		return EXIT_FAILURE;
	}

	LoadsTheGeneratedFiles(Arguments[1]);
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}

	std::printf("GameData tests passed\n");
	return EXIT_SUCCESS;
}
