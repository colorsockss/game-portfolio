#pragma once

#include "CoreMinimal.h"
#include "Engine/DataAsset.h"

#include "MmoIcons.generated.h"

class UTexture2D;

/** 아이콘이 있는 것의 종류. 번호는 그 테이블의 id다. */
UENUM()
enum class EMmoIconKind : uint8
{
	Skill,
	Effect,
	Item,
};

/** 아이콘 표의 줄 하나: (종류, 번호) → 그림. */
USTRUCT()
struct FMmoIcon
{
	GENERATED_BODY()

	UPROPERTY(EditAnywhere)
	EMmoIconKind Kind = EMmoIconKind::Skill;

	/** Skills, Effects, Items의 id. */
	UPROPERTY(EditAnywhere)
	int32 Id = 0;

	UPROPERTY(EditAnywhere)
	TSoftObjectPtr<UTexture2D> Texture;
};

/**
 * 아이콘 표(73). 클라이언트의 표현 표라 데이터 테이블에는 아이콘의 키를 두지 않는다(UMmoEntityVisuals와 같은 방식).
 * 에셋은 위젯 생성기(MmoCreateWidgets)가 만들고, 그림이 생기면(91) 생성기에 줄을 더한다. 줄이 없는 것은 이름의 첫 글자를 쓴
 * 글자 아이콘으로 그린다(UMmoButtonWidget::SetIcon).
 */
UCLASS()
class PORTFOLIOMMO_API UMmoIcons : public UDataAsset
{
	GENERATED_BODY()

public:
	/** 표의 경로. /Game/UI는 늘 쿠킹한다. */
	static constexpr const TCHAR* Path = TEXT("/Game/UI/DA_Icons.DA_Icons");

	UPROPERTY(EditAnywhere)
	TArray<FMmoIcon> Rows;

	/**
	 * (종류, 번호)의 그림. 줄이 없으면 nullptr.
	 * shortcut: 게임 스레드에서 바로 불러온다. 그림이 많아지면(91) UMmoEntitySubsystem처럼 비동기로 불러온다.
	 */
	UTexture2D* Load(EMmoIconKind Kind, int32 Id) const;
};
