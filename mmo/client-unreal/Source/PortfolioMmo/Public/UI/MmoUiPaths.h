#pragma once

#include "CoreMinimal.h"
#include "UObject/SoftObjectPath.h"

/**
 * 위젯 블루프린트의 패키지 경로. 에디터 모듈의 생성기(UMmoCreateWidgetsCommandlet)가 여기에 만들고, 게임은 여기서 불러온다.
 * /Game/UI는 코드만 참조하므로 DefaultGame.ini에서 늘 쿠킹한다.
 */
namespace MmoUiPaths
{
	inline const TCHAR* const Login = TEXT("/Game/UI/WBP_Login");
	inline const TCHAR* const CharacterSelect = TEXT("/Game/UI/WBP_CharacterSelect");
	inline const TCHAR* const CharacterCreate = TEXT("/Game/UI/WBP_CharacterCreate");
	inline const TCHAR* const Hud = TEXT("/Game/UI/WBP_Hud");
	inline const TCHAR* const Joystick = TEXT("/Game/UI/WBP_Joystick");
	inline const TCHAR* const Settings = TEXT("/Game/UI/WBP_Settings");
	inline const TCHAR* const Confirm = TEXT("/Game/UI/WBP_Confirm");
	inline const TCHAR* const Quantity = TEXT("/Game/UI/WBP_Quantity");
	inline const TCHAR* const Death = TEXT("/Game/UI/WBP_Death");
	inline const TCHAR* const Character = TEXT("/Game/UI/WBP_Character");
	inline const TCHAR* const Inventory = TEXT("/Game/UI/WBP_Inventory");
	inline const TCHAR* const ItemDetail = TEXT("/Game/UI/WBP_ItemDetail");
	inline const TCHAR* const ItemSlot = TEXT("/Game/UI/WBP_ItemSlot");
	inline const TCHAR* const Enchant = TEXT("/Game/UI/WBP_Enchant");
	inline const TCHAR* const Skills = TEXT("/Game/UI/WBP_Skills");
	inline const TCHAR* const Shop = TEXT("/Game/UI/WBP_Shop");
	inline const TCHAR* const Craft = TEXT("/Game/UI/WBP_Craft");
	inline const TCHAR* const Quest = TEXT("/Game/UI/WBP_Quest");
	inline const TCHAR* const Storage = TEXT("/Game/UI/WBP_Storage");
	inline const TCHAR* const Map = TEXT("/Game/UI/WBP_Map");
	inline const TCHAR* const QuickslotBar = TEXT("/Game/UI/WBP_QuickslotBar");
	inline const TCHAR* const Button = TEXT("/Game/UI/WBP_Button");
	inline const TCHAR* const Notice = TEXT("/Game/UI/WBP_Notice");
	inline const TCHAR* const NameTag = TEXT("/Game/UI/WBP_NameTag");
	inline const TCHAR* const Chat = TEXT("/Game/UI/WBP_Chat");
	inline const TCHAR* const Party = TEXT("/Game/UI/WBP_Party");

	/** 패키지 경로 → 그 위젯 블루프린트가 만든 클래스(…/WBP_X.WBP_X_C). */
	inline FSoftClassPath ClassOf(const TCHAR* Package)
	{
		const FString Path(Package);
		return FSoftClassPath(FString::Printf(TEXT("%s.%s_C"), *Path, *FPaths::GetBaseFilename(Path)));
	}
}
