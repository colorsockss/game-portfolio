#include "UI/MmoText.h"

#include "Engine/Engine.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Net/MmoSession.h"

#include <string>
#include <vector>

namespace
{
	const MmoData::FStrings* StringsOf(const UObject* Context)
	{
		const UWorld* World = Context && GEngine ? GEngine->GetWorldFromContextObject(Context, EGetWorldErrorMode::ReturnNull) : nullptr;
		const UMmoSession* Session = World && World->GetGameInstance() ? World->GetGameInstance()->GetSubsystem<UMmoSession>() : nullptr;
		return Session ? &Session->Strings() : nullptr;
	}
}

namespace MmoText
{
	FText Get(const UObject* Context, const FString& Key)
	{
		const MmoData::FStrings* Strings = StringsOf(Context);
		return FText::FromString(Strings ? FString(UTF8_TO_TCHAR(Strings->Get(TCHAR_TO_UTF8(*Key)).c_str())) : Key);
	}

	FText Format(const UObject* Context, const FString& Key, std::initializer_list<FString> Args)
	{
		const MmoData::FStrings* Strings = StringsOf(Context);
		if (!Strings)
		{
			return FText::FromString(Key);
		}
		// FStrings는 UTF-8을 받으므로 인자를 한 번 바꿔 둔다(string_view가 가리킬 곳).
		std::vector<std::string> Values;
		for (const FString& Arg : Args)
		{
			Values.emplace_back(TCHAR_TO_UTF8(*Arg));
		}
		std::vector<std::string_view> Views(Values.begin(), Values.end());
		std::string Pattern = Strings->Get(TCHAR_TO_UTF8(*Key));
		// initializer_list는 실행 중에 만들 수 없어 자리를 하나씩 채운다.
		for (size_t Slot = 0; Slot < Views.size(); ++Slot)
		{
			const std::string Mark = "{" + std::to_string(Slot) + "}";
			for (size_t At = Pattern.find(Mark); At != std::string::npos; At = Pattern.find(Mark, At + Views[Slot].size()))
			{
				Pattern.replace(At, Mark.size(), Views[Slot]);
			}
		}
		return FText::FromString(UTF8_TO_TCHAR(Pattern.c_str()));
	}
}
