#pragma once

// 기획 데이터의 엔진 없는 로더. data-tool과 맵 생성기가 mmo/data/에서 낸 mmo/shared/data/files/(Protobuf 바이너리와 데이터 해시)를
// 서버와 같은 생성물로 읽는다. 파일을 읽는 것은 엔진 쪽(UMmoSession)이 하고, 여기는 이름으로 바이트를 받기만 한다.
// 테이블은 그것을 쓰는 항목이 FGameData에 더한다(protoc가 만든 mmo/shared/data/generated/의 C++로 읽음).
// UE 타입 없이 표준 C++만 쓴다.
#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <string_view>

#include "Data/MmoDataTables.h"

namespace MmoData
{
	/** 데이터 해시 파일의 이름(data-tool의 proto 출력). */
	inline constexpr std::string_view HashFile = "data.hash";

	/** 이름 → 그 파일의 바이트. 없으면 nullopt. */
	using FFileReader = std::function<std::optional<std::string>(std::string_view Name)>;

	/** 읽은 기획 데이터. 한 번 읽고 바꾸지 않는다. */
	struct FGameData
	{
		/** 생성물 전체의 해시. Login.data_hash에 실어 서버의 것과 맞춘다. */
		uint64_t Hash = 0;

		/** 밸런스의 수(키-값 테이블). */
		portfolio::mmo::data::Constants Constants;

		/** 구역의 사각형. 줄의 차례가 겹친 곳을 정한다(뒤 줄이 이김). */
		portfolio::mmo::data::Zones Zones;

		/** 맵 생성기가 낸 1 m 칸 격자(칸마다 막힘). 크기는 Constants의 필드의 크기와 같다. */
		portfolio::mmo::data::MapGrid Grid;

		/** 직업마다의 기본 공격(사거리, 타격까지의 시간, 발사체). id가 CharacterClass의 값이다. */
		portfolio::mmo::data::Classes Classes;

		/** 아이템(32: 이름의 키, 종류, 등급, 겹침, 쓰는 종류와 값, 쿨다운). */
		portfolio::mmo::data::Items Items;

		/** 강화 단계(+1–+9)의 성공 확률과 능력치 비율(35). */
		portfolio::mmo::data::Enchants Enchants;

		/** 직업과 레벨마다의 필요 경험치와 기본 능력치(31: 경험치 바의 비율). */
		portfolio::mmo::data::Levels Levels;

		/** 몬스터(이름의 키, 레벨, 선공인지, 기본 공격). id가 EntityEnter.template_id다. */
		portfolio::mmo::data::Monsters Monsters;

		/** 플레이어의 스킬(직업 × 100 + 차례. 종류, 사거리, 범위, 쿨다운, 시전 시간, 마나, 거는 효과). */
		portfolio::mmo::data::Skills Skills;

		/** 효과(종류, 값, 지속 시간). id가 EffectState.effect_id다. */
		portfolio::mmo::data::Effects Effects;

		/** 화면의 이름과 문장(키, 한국어, 영어). 조회와 언어는 MmoData::FStrings가 한다. */
		portfolio::mmo::data::Strings Strings;

		/** 직업의 줄. 없으면 nullptr. */
		const portfolio::mmo::data::ClassesRow* Class(uint32_t Id) const;

		/** 강화 단계의 줄. 없으면 nullptr(더 올릴 수 없음). */
		const portfolio::mmo::data::EnchantsRow* Enchant(uint32_t Level) const;

		/** 아이템의 줄. 없으면 nullptr. */
		const portfolio::mmo::data::ItemsRow* Item(uint32_t Id) const;

		/** 직업과 레벨의 줄. 없으면 nullptr(그 직업의 최대 레벨보다 높음). */
		const portfolio::mmo::data::LevelsRow* Level(uint32_t Class, uint32_t Level) const;

		/** 몬스터의 줄. 없으면 nullptr. */
		const portfolio::mmo::data::MonstersRow* Monster(uint32_t Id) const;

		/** 스킬의 줄. 없으면 nullptr. */
		const portfolio::mmo::data::SkillsRow* Skill(uint32_t Id) const;

		/** 효과의 줄. 없으면 nullptr. */
		const portfolio::mmo::data::EffectsRow* Effect(uint32_t Id) const;
	};

	/** 데이터 해시 파일의 내용(16진수 16자, 끝의 줄바꿈은 무시)을 수로 읽는다. 형식이 틀리면 nullopt. */
	std::optional<uint64_t> ParseHash(std::string_view Text);

	/** 모든 파일을 읽는다. 하나라도 없거나 읽을 수 없으면 nullopt. */
	std::optional<FGameData> Load(const FFileReader& Read);
}
