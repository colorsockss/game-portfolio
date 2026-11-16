#include "UI/MmoMapDrawing.h"

#include "Components/Border.h"
#include "Components/CanvasPanel.h"
#include "Components/CanvasPanelSlot.h"
#include "Engine/Texture2D.h"

namespace
{
	/** 클라이언트의 표현 표: 구역 번호 → 색(0 구역 없음, 1 마을, 2–4 사냥터, 5 채집지, 6 보스 자리). 막힌 칸은 어둡다. */
	FColor ColorOf(uint8 Pixel)
	{
		static const FColor Zones[] = {
			FColor(74, 92, 64), FColor(196, 176, 128), FColor(112, 158, 88), FColor(96, 140, 112), FColor(84, 112, 72), FColor(150, 156, 80), FColor(150, 80, 76),
		};
		if (Pixel == MmoWorld::FMapView::Blocked)
		{
			return FColor(30, 30, 32);
		}
		return Pixel < UE_ARRAY_COUNT(Zones) ? Zones[Pixel] : Zones[0];
	}

	/** NPC 역할의 점 색. */
	/** 파티원의 점 색(42). */
	const FLinearColor MemberColor(0.3f, 0.95f, 0.45f);
	/** 나와 있는 보스의 점 색(43). */
	const FLinearColor BossColor(1.0f, 0.2f, 0.6f);
	/** 퀘스트 목표의 색(50). */
	const FLinearColor GoalColor(1.0f, 0.9f, 0.2f);

	FLinearColor DotColor(int32 Role)
	{
		return Role == portfolio::mmo::data::NPC_ROLE_GUARD ? FLinearColor(0.9f, 0.3f, 0.25f) : FLinearColor(0.35f, 0.6f, 1.0f);
	}
}

UTexture2D* MmoMapDrawing::MakeTexture(UObject* Outer, const MmoWorld::FFieldMap& Field)
{
	const std::vector<uint8_t> Pixels = MmoWorld::FMapView::Pixels(Field);
	const int32 Size = Field.GridSize();
	UTexture2D* Texture = UTexture2D::CreateTransient(Size, Size, PF_B8G8R8A8);
	Texture->Filter = TF_Nearest;
	Texture->SRGB = true;
	FTexture2DMipMap& Mip = Texture->GetPlatformData()->Mips[0];
	FColor* Data = static_cast<FColor*>(Mip.BulkData.Lock(LOCK_READ_WRITE));
	for (int32 Index = 0; Index < Size * Size; ++Index)
	{
		Data[Index] = ColorOf(Pixels[Index]);
	}
	Mip.BulkData.Unlock();
	Texture->UpdateResource();
	return Texture;
}

void MmoMapDrawing::PlaceDots(UCanvasPanel& Canvas, TArray<TObjectPtr<UBorder>>& Pool, const std::vector<MmoWorld::FMapPoint>& Points, double MinU, double MinV, double Span, float Size)
{
	constexpr float DotSize = 8.0f;
	int32 Used = 0;
	for (const MmoWorld::FMapPoint& Point : Points)
	{
		const double X = (Point.U - MinU) / Span;
		const double Y = (Point.V - MinV) / Span;
		if (Point.Kind == MmoWorld::FMapPoint::EKind::Self || X < 0 || X > 1 || Y < 0 || Y > 1)
		{
			continue;
		}
		if (Used == Pool.Num())
		{
			UBorder* Dot = NewObject<UBorder>(&Canvas);
			Dot->SetVisibility(ESlateVisibility::HitTestInvisible);
			UCanvasPanelSlot* Slot = Canvas.AddChildToCanvas(Dot);
			Slot->SetSize(FVector2D(DotSize, DotSize));
			Slot->SetAlignment(FVector2D(0.5, 0.5));
			Pool.Add(Dot);
		}
		UBorder* Dot = Pool[Used++];
		Dot->SetBrushColor(Point.Kind == MmoWorld::FMapPoint::EKind::Member ? MemberColor : Point.Kind == MmoWorld::FMapPoint::EKind::Boss ? BossColor
			: Point.Kind == MmoWorld::FMapPoint::EKind::Goal ? GoalColor : DotColor(Point.Role));
		Dot->SetVisibility(ESlateVisibility::HitTestInvisible);
		Cast<UCanvasPanelSlot>(Dot->Slot)->SetPosition(FVector2D(X * Size, Y * Size));
	}
	for (int32 Index = Used; Index < Pool.Num(); ++Index)
	{
		Pool[Index]->SetVisibility(ESlateVisibility::Collapsed);
	}
}
