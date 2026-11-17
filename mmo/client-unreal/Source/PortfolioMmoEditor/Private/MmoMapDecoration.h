#pragma once

#include "CoreMinimal.h"

struct FMmoFieldLayout;
class UStaticMesh;
class UWorld;

/**
 * Field 레벨의 꾸밈(102). 맵 데이터(구역, 막힌 칸, 놓인 것)에서 정해지는 겉모습만 만들고 게임의 규칙(막힘, 구역)은 바꾸지 않는다.
 * 같은 데이터면 같은 결과다(칸의 자리로 뽑는 해시).
 *   - 땅의 마스크: 길(흙), 마을의 광장과 길(돌길), 보스 자리(그을린 땅), 나무가 모인 곳(숲 바닥)의 무게를 텍스처(T_GroundMask)로 굽고
 *     땅 머티리얼의 인스턴스(MI_Ground)에 끼워 바닥에 입힌다. 길은 마을의 가운데에서 다른 구역의 가운데로 간다.
 *   - 모양 고르기: 나무·바위·산·풀·꽃은 같은 종류라도 칸의 해시로 메시(원본의 변형)와 방향, 크기를 고른다. 보스 자리의 나무는 죽은 나무다.
 *   - 풀과 덤불: 막히지 않은 칸에 구역의 종류마다 다른 빈도로 풀, 꽃, 덤불, 그루터기, 통나무, 돌을 흩는다(충돌 없음. 인스턴스 메시).
 */
namespace MmoMapDecoration
{
	/** 나무가 놓인 자리(m. 숲 바닥의 무게). */
	struct FTreeSpot
	{
		double X = 0.0;
		double Z = 0.0;
	};

	/** 그 칸의 메시의 변형. 변형이 없는 키면 /Game/Environment/<키>다. 없으면 nullptr. */
	UStaticMesh* VariantOf(const FString& MeshKey, int32 ZoneKind, uint32 Hash);

	/** 나무·바위처럼 방향과 크기를 칸마다 흔드는 키인지. */
	bool Jitters(const FString& MeshKey);

	/** 칸의 해시(같은 자리면 같은 값). */
	uint32 Hash(int32 X, int32 Z, uint32 Salt);

	/** 땅의 마스크와 바닥의 머티리얼, 풀과 덤불을 다시 만든다. 실패하면 까닭을 남기고 false. */
	bool Decorate(UWorld& World, const FMmoFieldLayout& Layout, const TArray<FTreeSpot>& Trees);
}
