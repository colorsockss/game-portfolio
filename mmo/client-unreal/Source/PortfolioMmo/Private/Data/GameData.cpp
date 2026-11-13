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
		if (!Constants || !Zones || !Grid || !Classes || !Monsters || !Data.Constants.ParseFromString(*Constants) || !Data.Zones.ParseFromString(*Zones)
			|| !Data.Grid.ParseFromString(*Grid) || !Data.Classes.ParseFromString(*Classes) || !Data.Monsters.ParseFromString(*Monsters))
		{
			return std::nullopt;
		}

		return Data;
	}
}
