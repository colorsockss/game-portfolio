#pragma once

// 화면의 글(엔진 없는 코드): Strings 테이블의 키 → 고른 언어의 문장. 자리 채우기({0}, {1}…)를 하고, 없는 키는 키 그대로 답해 눈에 띄게 한다.
// 언어를 바꾸면 Version이 올라, 화면이 글을 다시 채울 때를 안다. 언어를 고르는 설정과 처음 값(기기의 언어), 기기에 남기는 것은 backlog 77이다.
#include <cstdint>
#include <initializer_list>
#include <string>
#include <string_view>
#include <unordered_map>

#include "Data/MmoDataTables.h"

namespace MmoData
{
	enum class ELanguage : uint8_t
	{
		Korean,
		English,
	};

	class FStrings
	{
	public:
		/** 테이블의 줄을 읽는다(앞의 것은 버림). */
		void Load(const portfolio::mmo::data::Strings& Table);

		ELanguage Language() const { return Current; }

		/** 언어를 바꾼다. 바뀌었으면 Version을 올리고 true다. */
		bool SetLanguage(ELanguage Language);

		/** 언어를 바꿀 때마다 오르는 수. */
		uint32_t Version() const { return Changes; }

		/** 키의 문장(UTF-8). 없는 키는 키 그대로다. */
		std::string Get(std::string_view Key) const;

		/** 키의 문장에서 {0}, {1}…을 차례대로 Args로 채운다. 없는 번호의 자리는 그대로 둔다. */
		std::string Format(std::string_view Key, std::initializer_list<std::string_view> Args) const;

		/** 키가 테이블에 있다. */
		bool Has(std::string_view Key) const;

	private:
		struct FLine
		{
			std::string Korean;
			std::string English;
		};
		std::unordered_map<std::string, FLine> Lines;
		ELanguage Current = ELanguage::Korean;
		uint32_t Changes = 0;
	};
}
