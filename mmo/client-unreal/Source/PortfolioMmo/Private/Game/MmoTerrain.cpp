#include "Game/MmoTerrain.h"

TWeakObjectPtr<const AMmoTerrain> AMmoTerrain::Current;

AMmoTerrain::AMmoTerrain()
{
	PrimaryActorTick.bCanEverTick = false;
	USceneComponent* Root = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
	Root->SetMobility(EComponentMobility::Static);
	SetRootComponent(Root);
}

void AMmoTerrain::SetHeights(const FVector2D& InOrigin, float InSpacing, int32 InCountX, int32 InCountY, TArray<float> InHeights)
{
	check(InHeights.Num() == InCountX * InCountY && InCountX >= 2 && InCountY >= 2);
	Origin = InOrigin;
	Spacing = InSpacing;
	CountX = InCountX;
	CountY = InCountY;
	Heights = MoveTemp(InHeights);
}

double AMmoTerrain::HeightAt(double X, double Y) const
{
	const double U = (X - Origin.X) / Spacing;
	const double V = (Y - Origin.Y) / Spacing;
	if (Heights.IsEmpty() || U < 0.0 || V < 0.0 || U > CountX - 1 || V > CountY - 1)
	{
		return 0.0;
	}
	const int32 I = FMath::Min(FMath::FloorToInt32(U), CountX - 2);
	const int32 J = FMath::Min(FMath::FloorToInt32(V), CountY - 2);
	const double A = U - I;
	const double B = V - J;
	const auto H = [this](int32 Row, int32 Column) { return static_cast<double>(Heights[Row * CountY + Column]); };
	// 칸을 (I, J)–(I+1, J+1)의 대각선으로 나눈 두 삼각형(땅의 메시와 같음).
	return A >= B
		? H(I, J) + A * (H(I + 1, J) - H(I, J)) + B * (H(I + 1, J + 1) - H(I + 1, J))
		: H(I, J) + B * (H(I, J + 1) - H(I, J)) + A * (H(I + 1, J + 1) - H(I, J + 1));
}

FVector AMmoTerrain::NormalAt(double X, double Y) const
{
	const double Step = Spacing;
	const double DX = HeightAt(X + Step, Y) - HeightAt(X - Step, Y);
	const double DY = HeightAt(X, Y + Step) - HeightAt(X, Y - Step);
	return FVector(-DX, -DY, 2.0 * Step).GetSafeNormal();
}

double AMmoTerrain::GroundZ(double X, double Y)
{
	const AMmoTerrain* Terrain = Current.Get();
	return Terrain ? Terrain->HeightAt(X, Y) : 0.0;
}

FVector AMmoTerrain::GroundNormal(double X, double Y)
{
	const AMmoTerrain* Terrain = Current.Get();
	return Terrain ? Terrain->NormalAt(X, Y) : FVector::UpVector;
}

void AMmoTerrain::BeginPlay()
{
	Super::BeginPlay();
	Current = this;
}

void AMmoTerrain::EndPlay(const EEndPlayReason::Type Reason)
{
	if (Current.Get() == this)
	{
		Current.Reset();
	}
	Super::EndPlay(Reason);
}
