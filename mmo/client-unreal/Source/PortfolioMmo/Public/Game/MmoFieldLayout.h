#pragma once

#include "CoreMinimal.h"

/**
 * 에디터 도구(MmoBuildMap)가 맵을 꾸밀 때(102: 땅의 마스크, 나무의 모양, 풀과 덤불) 읽는 필드의 배치. 기획 데이터의 생성물을
 * 게임과 같은 로더로 읽어 엔진 타입으로 옮긴다(에디터 모듈은 libprotobuf를 링크하지 않음). 좌표는 m이고 칸은 행이 z다.
 */
struct PORTFOLIOMMO_API FMmoFieldLayout
{
	struct FZone
	{
		/** 덮는 칸(Max는 바로 앞까지). */
		FIntRect Rect;
		/** ZoneKind의 값(1 마을, 2 사냥터, 3 채집지, 4 보스 자리). */
		int32 Kind = 0;
	};

	/** 가장 작은 칸 번호(-필드의 크기/2)와 한 변의 칸 수. */
	int32 Min = 0;
	int32 Size = 0;

	/** Zones의 줄(차례 그대로. 겹치면 뒤 줄이 이김). */
	TArray<FZone> Zones;

	/** NPC의 자리. */
	TArray<FIntPoint> Npcs;

	/** 칸의 구역 종류(어느 구역에도 들지 않거나 격자 밖이면 0). */
	int32 KindAt(int32 X, int32 Z) const;

	/** 칸을 걸을 수 있다(맵 생성기의 격자. 막는 것이 놓인 칸과 격자 밖은 아님). */
	bool IsOpen(int32 X, int32 Z) const;

	/** 저장소의 생성물(mmo/shared/data/files)을 읽는다. 없거나 틀리면 빈 값. */
	static TOptional<FMmoFieldLayout> Load();

private:
	TArray<uint8> Kinds;
	TArray<bool> Open;
};
