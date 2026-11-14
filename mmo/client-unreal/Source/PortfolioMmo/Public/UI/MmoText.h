#pragma once

#include "CoreMinimal.h"

#include <initializer_list>

/**
 * 화면의 글을 Strings 테이블의 키로 꺼내는 도우미(74). 세션의 MmoData::FStrings가 고른 언어의 문장을 답하고, 없는 키는 키 그대로다.
 * Context는 게임 인스턴스를 찾을 수 있는 UObject(위젯, 액터)다. 에디터의 디자인 화면처럼 세션이 없으면 키를 그대로 보인다.
 */
namespace MmoText
{
	PORTFOLIOMMO_API FText Get(const UObject* Context, const FString& Key);

	/** 키의 문장의 {0}, {1}…을 Args로 채운다. */
	PORTFOLIOMMO_API FText Format(const UObject* Context, const FString& Key, std::initializer_list<FString> Args);
}
