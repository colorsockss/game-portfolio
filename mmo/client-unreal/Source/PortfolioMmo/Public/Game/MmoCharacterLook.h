#pragma once

#include "CoreMinimal.h"
#include "Protocol/MmoPackets.h"

class USkeletalMeshComponent;

/**
 * 직업마다 캐릭터의 모습: 스켈레탈 메시와 대기·달리기 블렌드 스페이스(Scripts/import_characters.py가 /Game/Characters에 만듦).
 * 내 캐릭터와 다른 캐릭터가 같은 것을 쓴다.
 * shortcut: 직업 → 에셋 경로를 코드에 둔다. 개체 종류와 템플릿이 생기면(backlog 18) 데이터 에셋 UMmoEntityVisuals로 옮긴다.
 */
namespace MmoCharacterLook
{
	/** 메시 컴포넌트에 직업의 메시와 블렌드 스페이스를 입힌다. 모르는 직업은 기사로 그린다. */
	void Apply(USkeletalMeshComponent& Mesh, portfolio::mmo::CharacterClass Class);

	/** 속도(언리얼 단위/초)로 대기와 달리기를 섞는다. 0이 대기, 600(6 m/s)이 달리기다. */
	void SetSpeed(USkeletalMeshComponent& Mesh, double Speed);
}
