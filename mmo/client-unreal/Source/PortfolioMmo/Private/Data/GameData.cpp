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
		return Data;
	}
}
