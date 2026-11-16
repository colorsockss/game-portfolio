#pragma once

// 조작 안내(94)를 본 캐릭터의 목록(엔진 없는 코드). 키는 "서버 주소|캐릭터 번호"이고, 화면이 기기의 설정(77)에 남긴다.
#include <algorithm>
#include <cstdint>
#include <string>
#include <vector>

namespace MmoWorld
{
	class FGuideSeen
	{
	public:
		explicit FGuideSeen(std::vector<std::string> Keys = {}) : Seen(std::move(Keys)) {}

		static std::string Key(const std::string& Server, uint64_t CharacterId) { return Server + "|" + std::to_string(CharacterId); }

		/** 그 서버의 그 캐릭터가 조작 안내를 봤는가. */
		bool Has(const std::string& Server, uint64_t CharacterId) const { return std::find(Seen.begin(), Seen.end(), Key(Server, CharacterId)) != Seen.end(); }

		/** 본 것으로 더한다. 이미 있으면 그대로이고 바뀌었으면 true다. */
		bool Add(const std::string& Server, uint64_t CharacterId)
		{
			if (Has(Server, CharacterId))
			{
				return false;
			}
			Seen.push_back(Key(Server, CharacterId));
			return true;
		}

		const std::vector<std::string>& Keys() const { return Seen; }

	private:
		std::vector<std::string> Seen;
	};
}
