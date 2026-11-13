#pragma once

// 기획 데이터의 엔진 없는 로더. data-tool이 mmo/data/의 xlsx에서 낸 mmo/shared/data/files/(Protobuf 바이너리와 데이터 해시)를
// 서버와 같은 생성물로 읽는다. 파일을 읽는 것은 엔진 쪽(UMmoSession)이 하고, 여기는 이름으로 바이트를 받기만 한다.
// 테이블은 그것을 쓰는 항목이 FGameData에 더한다(protoc가 만든 mmo/shared/data/generated/의 C++로 읽음).
// UE 타입 없이 표준 C++만 쓴다.
#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <string_view>

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
	};

	/** 데이터 해시 파일의 내용(16진수 16자, 끝의 줄바꿈은 무시)을 수로 읽는다. 형식이 틀리면 nullopt. */
	std::optional<uint64_t> ParseHash(std::string_view Text);

	/** 모든 파일을 읽는다. 하나라도 없거나 읽을 수 없으면 nullopt. */
	std::optional<FGameData> Load(const FFileReader& Read);
}
