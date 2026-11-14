#pragma once

#include "CoreMinimal.h"
#include "Framework/Application/IInputProcessor.h"
#include "InputCoreTypes.h"

/**
 * PC의 키 표(액션 → 키). 컨트롤러가 이 표로 입력 매핑을 만들고, HUD 버튼의 키 표시도 이 표의 키를 읽는다. 키를 바꾸려면 Rows()의 줄 하나를 고친다.
 * 아직 기능이 없는 액션은 줄만 있고 컨트롤러가 묶지 않는다(그 기능의 항목이 잇는다).
 */
enum class EMmoAction : uint8
{
	MoveForward,
	MoveBack,
	MoveLeft,
	MoveRight,
	/** 개체와 땅 누르기. */
	Click,
	/** 가장 가까운 적 고르기. */
	TargetNearest,
	/** 창 닫기·대상 풀기·설정 창(차례는 화면 관리자의 Back). */
	Back,
	/** 누르고 있는 동안 마우스로 카메라를 돌린다. */
	CameraDrag,
	CameraZoom,
	Slot1,
	Slot2,
	Slot3,
	Slot4,
	Slot5,
	Slot6,
	Slot7,
	Slot8,
	Attack,
	Interact,
	/** 자동 사냥(40). */
	AutoHunt,
	/** 강제 공격, 누르고 있는 동안(44). */
	ForceAttack,
	/** 가방(32). */
	Bag,
	/** 캐릭터(31). */
	Character,
	/** 스킬(36). */
	Skills,
	/** 퀘스트(50). */
	Quest,
	/** 지도(76). */
	Map,
	/** 채팅(41). */
	Chat,
};

struct FMmoKeyRow
{
	EMmoAction Action;
	FKey Key;
};

namespace MmoKeys
{
	/** 키 표의 줄(액션마다 하나). */
	PORTFOLIOMMO_API TConstArrayView<FMmoKeyRow> Rows();

	/** 액션의 키. 표에 없으면 EKeys::Invalid다. */
	PORTFOLIOMMO_API FKey KeyOf(EMmoAction Action);

	/** 퀵슬롯 칸(0부터)의 액션. */
	inline EMmoAction Slot(int32 Index) { return static_cast<EMmoAction>(static_cast<int32>(EMmoAction::Slot1) + Index); }

	/** 버튼에 붙일 키 표시. 터치 기기에서는 빈 글이다. */
	PORTFOLIOMMO_API FText Hint(EMmoAction Action);

	/** 글 상자(한 줄, 여러 줄)에 키보드 초점이 있다. 그동안 이동과 단축키를 막는다. */
	PORTFOLIOMMO_API bool IsTyping();

	/**
	 * Mac의 가상 키 코드(물리 자리, kVK_ANSI_*) → 글자·숫자 키. 그 밖의 코드는 EKeys::Invalid다. 엔진은 글자 키를 입력기가 낸 문자로 읽어
	 * 입력기에 따라 다른 키가 되므로, 단축키는 이 코드로 다시 읽는다.
	 */
	PORTFOLIOMMO_API FKey FromMacKeyCode(uint32 KeyCode);
}

/**
 * 글자·숫자 키를 문자가 아니라 키 코드로 읽게 고친다(Mac). 엔진이 읽은 키가 키 코드의 키와 다르면 원래 이벤트를 먹고 키 코드의 키로 다시 보낸다.
 * 한글 입력기가 켜져 있어도 WASD와 단축키가 같은 키로 동작한다. 다른 플랫폼에서는 아무것도 하지 않는다.
 */
class FMmoKeyCodeInput : public IInputProcessor
{
public:
	virtual void Tick(const float DeltaTime, FSlateApplication& SlateApp, TSharedRef<ICursor> Cursor) override {}
	virtual bool HandleKeyDownEvent(FSlateApplication& SlateApp, const FKeyEvent& Event) override;
	virtual bool HandleKeyUpEvent(FSlateApplication& SlateApp, const FKeyEvent& Event) override;
	virtual const TCHAR* GetDebugName() const override { return TEXT("MmoKeyCodeInput"); }

private:
	/** 고칠 키면 고친 이벤트. 아니면 unset. */
	TOptional<FKeyEvent> Corrected(const FKeyEvent& Event);

	/** 이미 로그를 남긴 (키 코드, 엔진이 읽은 키). 같은 어긋남은 한 번만 남긴다. */
	TSet<TPair<uint32, FName>> Logged;
};
