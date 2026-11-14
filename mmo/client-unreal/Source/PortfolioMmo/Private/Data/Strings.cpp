#include "Data/Strings.h"

#include <vector>

namespace MmoData
{
	void FStrings::Load(const portfolio::mmo::data::Strings& Table)
	{
		Lines.clear();
		for (const portfolio::mmo::data::StringsRow& Row : Table.rows())
		{
			Lines[Row.id()] = { Row.ko(), Row.en() };
		}
	}

	bool FStrings::SetLanguage(ELanguage Language)
	{
		if (Language == Current)
		{
			return false;
		}
		Current = Language;
		++Changes;
		return true;
	}

	bool FStrings::Has(std::string_view Key) const
	{
		return Lines.contains(std::string(Key));
	}

	std::string FStrings::Get(std::string_view Key) const
	{
		const auto Found = Lines.find(std::string(Key));
		if (Found == Lines.end())
		{
			return std::string(Key);
		}
		return Current == ELanguage::English ? Found->second.English : Found->second.Korean;
	}

	std::string FStrings::Format(std::string_view Key, std::initializer_list<std::string_view> Args) const
	{
		const std::string Pattern = Get(Key);
		const std::vector<std::string_view> Values(Args);
		std::string Result;
		Result.reserve(Pattern.size());
		for (size_t Index = 0; Index < Pattern.size(); ++Index)
		{
			// {숫자}만 채운다. 그 밖의 중괄호는 그대로 둔다.
			if (Pattern[Index] == '{')
			{
				const size_t Close = Pattern.find('}', Index + 1);
				if (Close != std::string::npos && Close > Index + 1)
				{
					const std::string Number = Pattern.substr(Index + 1, Close - Index - 1);
					if (Number.find_first_not_of("0123456789") == std::string::npos)
					{
						const size_t Slot = std::stoul(Number);
						if (Slot < Values.size())
						{
							Result.append(Values[Slot]);
							Index = Close;
							continue;
						}
					}
				}
			}
			Result.push_back(Pattern[Index]);
		}
		return Result;
	}
}
