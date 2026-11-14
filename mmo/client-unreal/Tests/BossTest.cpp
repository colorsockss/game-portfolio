// 필드 보스의 모델(World/BossWatch, 43)과 지도의 보스 자리를 UE 없이 본다. run.mjs가 빌드하고 실행한다.
#include <cstdio>
#include <cstdlib>
#include <string>

#include "World/BossWatch.h"
#include "World/MapView.h"

namespace
{
	using portfolio::mmo::Packet;

	int Failures = 0;

	void Expect(bool bCondition, const char* What)
	{
		if (!bCondition)
		{
			std::printf("FAIL: %s\n", What);
			++Failures;
		}
	}

	/** 보스(템플릿 10, 이름 "바위 거인")와 알림의 글. */
	struct FScene
	{
		MmoData::FGameData Data;
		MmoData::FStrings Strings;
		MmoWorld::FChatLog Chat;
		MmoWorld::FBossWatch Watch;
		MmoWorld::FWorldState World;

		FScene()
		{
			portfolio::mmo::data::MonstersRow* Boss = Data.Monsters.add_rows();
			Boss->set_id(10);
			Boss->set_kind(portfolio::mmo::data::MONSTER_KIND_BOSS);
			Boss->set_name_key("monster.stoneGiant");
			portfolio::mmo::data::Strings Table;
			for (const auto& [Key, Text] : { std::pair<const char*, const char*>{ "monster.stoneGiant", "바위 거인" }, { "notice.bossAppeared", "{0}이(가) 나타났습니다." },
				{ "notice.bossDied", "{0}이(가) 쓰러졌습니다." } })
			{
				portfolio::mmo::data::StringsRow* Row = Table.add_rows();
				Row->set_id(Key);
				Row->set_ko(Text);
				Row->set_en(Text);
			}
			Strings.Load(Table);
		}

		void Notice(portfolio::mmo::FieldNoticeKind Kind)
		{
			Packet Packet;
			Packet.mutable_field_notice()->set_kind(Kind);
			Packet.mutable_field_notice()->set_template_id(10);
			Packet.mutable_field_notice()->set_x(0);
			Packet.mutable_field_notice()->set_z(250 * 32);
			Watch.Apply(Packet, 0, Chat, Data, Strings);
		}
	};

	/** 피해를 주는 틱이 지났거나 쏜 개체가 없으면 예고가 빠진다. */
	void WarningsExpire()
	{
		FScene Scene;
		Packet Enter;
		portfolio::mmo::EntityEnter* Boss = Enter.mutable_entities_enter()->add_entities();
		Boss->set_id(5);
		Boss->set_kind(portfolio::mmo::ENTITY_KIND_MONSTER);
		Boss->set_template_id(10);
		Scene.World.Apply(Enter, 0);
		Packet Warning;
		Warning.mutable_area_warning()->set_caster_id(5);
		Warning.mutable_area_warning()->set_hit_tick(130);
		Scene.Watch.Apply(Warning, 100, Scene.Chat, Scene.Data, Scene.Strings);
		Scene.Watch.Expire(129, Scene.World);
		Expect(Scene.Watch.Warnings().size() == 1 && Scene.Watch.Warnings()[0].ShownTick == 100, "a warning stays until its hit tick");
		Expect(MmoWorld::FBossWatch::BossInView(Scene.World, Scene.Data) == 5, "the seen boss gets the health bar");
		Scene.Watch.Expire(130, Scene.World);
		Expect(Scene.Watch.Warnings().empty(), "a warning past its hit tick is dropped");

		Warning.mutable_area_warning()->set_caster_id(6);
		Scene.Watch.Apply(Warning, 100, Scene.Chat, Scene.Data, Scene.Strings);
		Scene.Watch.Expire(101, Scene.World);
		Expect(Scene.Watch.Warnings().empty(), "a warning from an unseen caster is dropped");
	}

	/** 등장과 죽음은 지도의 보스 자리를 만들고 없애며 시스템 줄을 만들고, 등장만 알림을 쌓는다. "나와 있음"은 자리만 만든다. */
	void NoticesFollowTheBoss()
	{
		FScene Scene;
		Scene.Notice(portfolio::mmo::FIELD_NOTICE_KIND_BOSS_PRESENT);
		Expect(Scene.Watch.Bosses().size() == 1 && Scene.Chat.Lines().empty() && Scene.Watch.TakeAppeared().empty(), "a present boss only marks the map");
		Scene.Notice(portfolio::mmo::FIELD_NOTICE_KIND_BOSS_DIED);
		Expect(Scene.Watch.Bosses().empty() && Scene.Chat.Lines().back().Text == "바위 거인이(가) 쓰러졌습니다.", "a death clears the spot with a system line");
		Scene.Notice(portfolio::mmo::FIELD_NOTICE_KIND_BOSS_APPEARED);
		Expect(Scene.Watch.Bosses().size() == 1 && Scene.Chat.Lines().back().Kind == MmoWorld::EChatKind::System
			&& Scene.Chat.Lines().back().Text == "바위 거인이(가) 나타났습니다.", "an appearance marks the map with a system line");
		const std::vector<uint32_t> Appeared = Scene.Watch.TakeAppeared();
		Expect(Appeared.size() == 1 && Appeared[0] == 10, "an appearance raises a notice");

		portfolio::mmo::data::MapGrid Grid;
		Grid.set_width(600);
		Grid.set_depth(600);
		Grid.set_origin_x(-300);
		Grid.set_origin_z(-300);
		Grid.set_cells(std::string(600 * 600, '\0'));
		const auto Field = MmoWorld::FFieldMap::Make(600, {}, Grid);
		const std::vector<MmoWorld::FMapPoint> Points = MmoWorld::FMapView::Points(*Field, Scene.Data, 0, 0, 0, {}, Scene.Watch.Positions());
		Expect(Points.back().Kind == MmoWorld::FMapPoint::EKind::Boss && Points.back().V < 0.1, "the map draws the boss in the north");
	}
}

int main()
{
	WarningsExpire();
	NoticesFollowTheBoss();
	if (Failures > 0)
	{
		return EXIT_FAILURE;
	}
	std::printf("Boss tests passed\n");
	return EXIT_SUCCESS;
}
