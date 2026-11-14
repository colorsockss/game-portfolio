#pragma once

#include "CoreMinimal.h"
#include "World/MapView.h"

class UBorder;
class UCanvasPanel;
class UObject;
class UTexture2D;

/**
 * 미니맵과 지도(76)가 함께 쓰는 그리기: 격자에서 한 번 만드는 바탕 텍스처(구역마다의 색 위에 막힌 칸을 어둡게. 화면을 찍지 않음)와 점을 캔버스에 놓기.
 */
namespace MmoMapDrawing
{
	/** 바탕 텍스처를 만든다(필드의 칸마다 픽셀 하나, 가까운 점으로 확대). */
	PORTFOLIOMMO_API UTexture2D* MakeTexture(UObject* Outer, const MmoWorld::FFieldMap& Field);

	/**
	 * 지도 좌표의 사각형(MinU, MinV에서 한 변 Span)에 든 점을 Size 픽셀의 캔버스에 놓는다. 점 위젯은 Pool에서 다시 쓰고 모자라면 만든다.
	 * 내 점은 그리지 않는다(화살표가 따로 있음).
	 */
	void PlaceDots(UCanvasPanel& Canvas, TArray<TObjectPtr<UBorder>>& Pool, const std::vector<MmoWorld::FMapPoint>& Points, double MinU, double MinV, double Span, float Size);
}
