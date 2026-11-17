#include "Game/MmoFxActor.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"

AMmoFxActor::AMmoFxActor()
{
	PrimaryActorTick.bCanEverTick = true;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
}

void AMmoFxActor::Start(const TArray<FMmoFxLayer>& Layers, float Hold)
{
	for (const FMmoFxLayer& Layer : Layers)
	{
		UStaticMesh* Mesh = Layer.Mesh.Get();
		UMaterialInterface* Material = Layer.Material.Get();
		if (!Mesh || !Material)
		{
			continue;
		}
		UStaticMeshComponent* Component = NewObject<UStaticMeshComponent>(this);
		Component->SetStaticMesh(Mesh);
		Component->SetMaterial(0, Material);
		Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
		Component->SetCastShadow(false);
		Component->SetReceivesDecals(false);
		Component->SetupAttachment(GetRootComponent());
		Component->SetVisibility(false);
		Component->RegisterComponent();
		Live.Add({ Layer, Layer.bHold ? FMath::Max(Layer.Duration, Hold) : Layer.Duration, Component });
	}
	if (Live.IsEmpty())
	{
		Destroy();
	}
}

void AMmoFxActor::Finish()
{
	if (FinishedAt < 0.0f)
	{
		FinishedAt = Age;
	}
}

void AMmoFxActor::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	Age += DeltaSeconds;
	const float Ending = FinishedAt < 0.0f ? 1.0f : 1.0f - (Age - FinishedAt) / FinishSeconds;
	bool bAny = false;
	for (FLive& Item : Live)
	{
		const FMmoFxLayer& Layer = Item.Layer;
		const float Local = Age - Layer.Delay;
		if (Local < 0.0f && Ending > 0.0f)
		{
			// 아직 나타나지 않음(끝내는 중이면 나타나지 않고 끝남).
			bAny = true;
			continue;
		}
		if (Local >= Item.Duration || Ending <= 0.0f)
		{
			Item.Mesh->SetVisibility(false);
			continue;
		}
		bAny = true;
		const float T = Local / Item.Duration;
		const float Grow = 1.0f - FMath::Square(1.0f - T);
		const float Opacity = FMath::Clamp(FMath::Min(Layer.FadeIn > 0.0f ? Local / Layer.FadeIn : 1.0f,
			Layer.FadeOut > 0.0f ? (Item.Duration - Local) / Layer.FadeOut : 1.0f), 0.0f, 1.0f) * FMath::Max(Ending, 0.0f);
		Item.Mesh->SetVisibility(true);
		Item.Mesh->SetRelativeLocation(FMath::Lerp(Layer.From, Layer.To, T * T));
		Item.Mesh->SetRelativeRotation(FRotator(Layer.Rotation.Pitch, Layer.Rotation.Yaw + Layer.Spin * Local, Layer.Rotation.Roll));
		Item.Mesh->SetRelativeScale3D(FMath::Lerp(Layer.StartScale, Layer.EndScale, Grow));
		Item.Mesh->SetCustomPrimitiveDataVector4(0, FVector4(Layer.Color.R, Layer.Color.G, Layer.Color.B, Opacity));
	}
	if (!bAny)
	{
		Destroy();
	}
}
