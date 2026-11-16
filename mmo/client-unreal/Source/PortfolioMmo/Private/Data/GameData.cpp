#include "Data/GameData.h"

namespace MmoData
{
	std::optional<uint64_t> ParseHash(std::string_view Text)
	{
		while (!Text.empty() && (Text.back() == '\n' || Text.back() == '\r'))
		{
			Text.remove_suffix(1);
		}

		if (Text.size() != 16)
		{
			return std::nullopt;
		}

		uint64_t Hash = 0;
		for (const char Digit : Text)
		{
			const int Value = (Digit >= '0' && Digit <= '9') ? Digit - '0' : (Digit >= 'a' && Digit <= 'f') ? Digit - 'a' + 10 : -1;
			if (Value < 0)
			{
				return std::nullopt;
			}

			Hash = (Hash << 4) | static_cast<uint64_t>(Value);
		}

		return Hash;
	}

	const portfolio::mmo::data::ClassesRow* FGameData::Class(uint32_t Id) const
	{
		for (const portfolio::mmo::data::ClassesRow& Row : Classes.rows())
		{
			if (Row.id() == Id)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::EnchantsRow* FGameData::Enchant(uint32_t Level) const
	{
		for (const portfolio::mmo::data::EnchantsRow& Row : Enchants.rows())
		{
			if (Row.id() == Level)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::PetsRow* FGameData::Pet(uint32_t Id) const
	{
		for (const portfolio::mmo::data::PetsRow& Row : Pets.rows())
		{
			if (Row.id() == Id)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::NpcsRow* FGameData::Npc(uint32_t Id) const
	{
		for (const portfolio::mmo::data::NpcsRow& Row : Npcs.rows())
		{
			if (Row.id() == Id)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::ShopsRow* FGameData::ShopItem(uint32_t ItemId) const
	{
		for (const portfolio::mmo::data::ShopsRow& Row : Shops.rows())
		{
			if (Row.item_id() == ItemId)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::ItemsRow* FGameData::Item(uint32_t Id) const
	{
		for (const portfolio::mmo::data::ItemsRow& Row : Items.rows())
		{
			if (Row.id() == Id)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::LevelsRow* FGameData::Level(uint32_t Class, uint32_t Level) const
	{
		for (const portfolio::mmo::data::LevelsRow& Row : Levels.rows())
		{
			if (Row.class_() == Class && Row.level() == Level)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::MonstersRow* FGameData::Monster(uint32_t Id) const
	{
		for (const portfolio::mmo::data::MonstersRow& Row : Monsters.rows())
		{
			if (Row.id() == Id)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::SkillsRow* FGameData::Skill(uint32_t Id) const
	{
		for (const portfolio::mmo::data::SkillsRow& Row : Skills.rows())
		{
			if (Row.id() == Id)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	const portfolio::mmo::data::EffectsRow* FGameData::Effect(uint32_t Id) const
	{
		for (const portfolio::mmo::data::EffectsRow& Row : Effects.rows())
		{
			if (Row.id() == Id)
			{
				return &Row;
			}
		}
		return nullptr;
	}

	std::optional<FGameData> Load(const FFileReader& Read)
	{
		const std::optional<std::string> HashText = Read(HashFile);
		const std::optional<uint64_t> Hash = HashText ? ParseHash(*HashText) : std::nullopt;
		if (!Hash)
		{
			return std::nullopt;
		}

		FGameData Data;
		Data.Hash = *Hash;
		const std::optional<std::string> Constants = Read("Constants.bytes");
		const std::optional<std::string> Zones = Read("Zones.bytes");
		const std::optional<std::string> Grid = Read("MapGrid.bytes");
		const std::optional<std::string> Classes = Read("Classes.bytes");
		const std::optional<std::string> Monsters = Read("Monsters.bytes");
		const std::optional<std::string> Skills = Read("Skills.bytes");
		const std::optional<std::string> Effects = Read("Effects.bytes");
		const std::optional<std::string> Strings = Read("Strings.bytes");
		const std::optional<std::string> Levels = Read("Levels.bytes");
		const std::optional<std::string> Items = Read("Items.bytes");
		const std::optional<std::string> Enchants = Read("Enchants.bytes");
		const std::optional<std::string> Npcs = Read("Npcs.bytes");
		const std::optional<std::string> Shops = Read("Shops.bytes");
		const std::optional<std::string> Pets = Read("Pets.bytes");
		if (!Constants || !Zones || !Grid || !Classes || !Monsters || !Skills || !Effects || !Strings || !Data.Strings.ParseFromString(*Strings)
			|| !Levels || !Data.Levels.ParseFromString(*Levels) || !Items || !Data.Items.ParseFromString(*Items) || !Enchants || !Data.Enchants.ParseFromString(*Enchants)
			|| !Npcs || !Data.Npcs.ParseFromString(*Npcs) || !Shops || !Data.Shops.ParseFromString(*Shops) || !Pets || !Data.Pets.ParseFromString(*Pets)
			|| !Data.Constants.ParseFromString(*Constants)
			|| !Data.Zones.ParseFromString(*Zones) || !Data.Grid.ParseFromString(*Grid) || !Data.Classes.ParseFromString(*Classes)
			|| !Data.Monsters.ParseFromString(*Monsters) || !Data.Skills.ParseFromString(*Skills) || !Data.Effects.ParseFromString(*Effects))
		{
			return std::nullopt;
		}

		return Data;
	}
}
