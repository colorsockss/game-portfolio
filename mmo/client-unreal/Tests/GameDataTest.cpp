// Data/의 엔진 없는 로더를 UE 없이 컴파일해 확인한다. run.mjs가 빌드하고 실행한다.
// 커밋된 생성물(mmo/shared/data/files/)이 실제로 읽히는지도 본다(run.mjs가 폴더를 넘김).
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <sstream>

#include "Data/GameData.h"
#include "World/FieldMap.h"

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
		if (!Data)
		{
			return;
		}

		// 서버의 GameDataTests가 같은 생성물에서 같은 값을 읽는다.
		Expect(Data->Constants.field_size() == 600, "the field size comes from Constants");
		Expect(Data->Zones.rows_size() == 6 && Data->Zones.rows(5).id() == 6, "Zones has six rows");
		Expect(Data->Class(2) && Data->Class(2)->has_projectile_speed() && !Data->Class(1)->has_projectile_speed(), "only the mage shoots projectiles");
		Expect(Data->Monsters.rows_size() == 9 && Data->Monster(6) && Data->Monster(6)->aggressive() && !Data->Monster(10), "nine monsters by id");
		const portfolio::mmo::data::ZonesRow& Town = Data->Zones.rows(0);
		Expect(Town.name_key() == "zone.town" && Town.kind() == portfolio::mmo::data::ZONE_KIND_TOWN && Town.safe(), "the first zone is the safe town");
		Expect(Town.min_x() == -40 && Town.max_x() == 40 && Town.respawn_x() == 0 && Town.respawn_z() == -10, "the town keeps its rectangle and respawn point");
		Expect(!Data->Zones.rows(1).has_respawn_x(), "only the town has a respawn point");

		// 맵 생성기의 격자가 서버와 같은 크기로 읽히고 FFieldMap이 받아들인다.
		Expect(Data->Grid.width() == 600 && Data->Grid.depth() == 600 && Data->Grid.origin_x() == -300 && Data->Grid.origin_z() == -300
			&& Data->Grid.cells().size() == 360000, "the map grid matches the field");
		const std::optional<MmoWorld::FFieldMap> Field = MmoWorld::FFieldMap::Make(Data->Constants.field_size(), Data->Zones.rows(), Data->Grid);
		Expect(Field && !Field->CanWalk(-300 * 32, 0) && Field->CanWalk(Town.respawn_x() * 32, Town.respawn_z() * 32), "the border is a wall and the respawn point is open");
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
