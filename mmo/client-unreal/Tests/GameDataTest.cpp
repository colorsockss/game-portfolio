// Data/의 엔진 없는 로더를 UE 없이 컴파일해 확인한다. run.mjs가 빌드하고 실행한다.
// 커밋된 생성물(mmo/shared/data/files/)이 실제로 읽히는지도 본다(run.mjs가 폴더를 넘김).
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <set>
#include <sstream>
#include <string>

#include "Data/GameData.h"
#include "Data/Strings.h"
#include "World/FailMessages.h"
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
		Expect(Data->Monsters.rows_size() == 11 && Data->Monster(6) && Data->Monster(6)->aggressive() && !Data->Monster(12), "eleven monster rows by id");
		Expect(Data->Monster(10) && Data->Monster(10)->kind() == portfolio::mmo::data::MONSTER_KIND_BOSS && Data->Monster(10)->has_skill(), "the tenth is the boss with its area attack");
		Expect(Data->Monster(11) && Data->Monster(11)->kind() == portfolio::mmo::data::MONSTER_KIND_GUARD && Data->Npc(3) && Data->Npc(3)->role() == portfolio::mmo::data::NPC_ROLE_GUARD,
			"the eleventh row holds the guards' numbers and the guards are NPCs");
		const portfolio::mmo::data::ZonesRow& Town = Data->Zones.rows(0);
		Expect(Town.name_key() == "zone.town" && Town.kind() == portfolio::mmo::data::ZONE_KIND_TOWN && Town.safe(), "the first zone is the safe town");
		Expect(Town.min_x() == -40 && Town.max_x() == 40 && Town.respawn_x() == 0 && Town.respawn_z() == -10, "the town keeps its rectangle and respawn point");
		Expect(!Data->Zones.rows(1).has_respawn_x(), "only the town has a respawn point");

		// 맵 생성기의 격자가 서버와 같은 크기로 읽히고 FFieldMap이 받아들인다.
		Expect(Data->Grid.width() == 600 && Data->Grid.depth() == 600 && Data->Grid.origin_x() == -300 && Data->Grid.origin_z() == -300
			&& Data->Grid.cells().size() == 360000, "the map grid matches the field");
		const std::optional<MmoWorld::FFieldMap> Field = MmoWorld::FFieldMap::Make(Data->Constants.field_size(), Data->Zones.rows(), Data->Grid);
		Expect(Field && !Field->CanWalk(-300 * 32, 0) && Field->CanWalk(Town.respawn_x() * 32, Town.respawn_z() * 32), "the border is a wall and the respawn point is open");

		// 문자열(74): 모든 줄의 두 열이 차 있고, 테이블의 이름 열과 실패 이유가 가리키는 키가 모두 있다.
		MmoData::FStrings Strings;
		Strings.Load(Data->Strings);
		for (const portfolio::mmo::data::StringsRow& Row : Data->Strings.rows())
		{
			if (Row.ko().empty() || Row.en().empty())
			{
				std::printf("FAIL: string %s is missing a language\n", Row.id().c_str());
				++Failures;
			}
		}
		auto ExpectKey = [&Strings](const std::string& Key)
		{
			if (!Strings.Has(Key))
			{
				std::printf("FAIL: %s is not in Strings\n", Key.c_str());
				++Failures;
			}
		};
		for (const auto& Row : Data->Zones.rows()) { ExpectKey(Row.name_key()); }
		for (const auto& Row : Data->Monsters.rows()) { ExpectKey(Row.name_key()); }
		for (const auto& Row : Data->Skills.rows()) { ExpectKey(Row.name_key()); }
		// 아이템(32)은 이름과 설명(item.desc.<번호>)이 모두 있다.
		for (const auto& Row : Data->Items.rows()) { ExpectKey(Row.name_key()); ExpectKey("item.desc." + std::to_string(Row.id())); }
		for (int Value = portfolio::mmo::FailReason_MIN; Value <= portfolio::mmo::FailReason_MAX; ++Value)
		{
			if (portfolio::mmo::FailReason_IsValid(Value) && Value != portfolio::mmo::FAIL_REASON_NONE)
			{
				const std::string Key = MmoWorld::FailKey(static_cast<portfolio::mmo::FailReason>(Value));
				Expect(Key != "fail.other", "every FailReason has its own key");
				ExpectKey(Key);
			}
		}
		ExpectKey("fail.other");

		// 글자 아이콘(73): 아이콘 표에 줄이 없는 스킬은 이름의 첫 글자로 그리므로, 한 직업의 스킬은 두 언어 모두 첫 글자가 다르다.
		auto FirstLetter = [](const std::string& Text)
		{
			const unsigned char Lead = Text.empty() ? 0 : static_cast<unsigned char>(Text[0]);
			return Text.substr(0, Lead < 0x80 ? 1 : Lead < 0xE0 ? 2 : Lead < 0xF0 ? 3 : 4);
		};
		for (const MmoData::ELanguage Language : { MmoData::ELanguage::Korean, MmoData::ELanguage::English })
		{
			Strings.SetLanguage(Language);
			std::set<std::pair<uint32_t, std::string>> Letters;
			for (const auto& Row : Data->Skills.rows())
			{
				if (!Letters.insert({ Row.class_(), FirstLetter(Strings.Get(Row.name_key())) }).second)
				{
					std::printf("FAIL: skill %u starts with the same letter as another skill of its class\n", Row.id());
					++Failures;
				}
			}
		}
	}

	/** 고른 언어의 열을 답하고, {0}·{1}을 채우며(없는 번호와 숫자가 아닌 중괄호는 그대로), 없는 키는 키 그대로다. */
	void StringsFollowTheLanguage()
	{
		portfolio::mmo::data::Strings Table;
		auto Add = [&Table](const char* Id, const char* Ko, const char* En)
		{
			portfolio::mmo::data::StringsRow* Row = Table.add_rows();
			Row->set_id(Id);
			Row->set_ko(Ko);
			Row->set_en(En);
		};
		Add("hello", "안녕 {0}, {1}", "Hi {0}, {1}");
		Add("brace", "{a} {2}", "{a} {2}");
		MmoData::FStrings Strings;
		Strings.Load(Table);
		Expect(Strings.Get("hello") == "안녕 {0}, {1}", "Korean is the first language");
		Expect(Strings.Format("hello", { "A", "B" }) == "안녕 A, B", "slots are filled in order");
		Expect(Strings.Format("brace", { "x" }) == "{a} {2}", "unknown slots and other braces stay");
		Expect(Strings.Get("missing.key") == "missing.key", "a missing key shows the key");
		const uint32_t Version = Strings.Version();
		Expect(Strings.SetLanguage(MmoData::ELanguage::English) && Strings.Version() == Version + 1, "changing the language bumps the version");
		Expect(!Strings.SetLanguage(MmoData::ELanguage::English) && Strings.Version() == Version + 1, "the same language changes nothing");
		Expect(Strings.Format("hello", { "A", "B" }) == "Hi A, B", "English uses its own column");
	}
}

int main(int ArgumentCount, char** Arguments)
{
	ParsesTheHash();
	LoadNeedsTheHashFile();
	StringsFollowTheLanguage();
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
