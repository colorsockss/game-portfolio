#include "Game/MmoFxActor.h"

#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Game/MmoTerrain.h"
#include "Materials/MaterialInterface.h"

AMmoFxActor::AMmoFxActor()
{
	PrimaryActorTick.bCanEverTick = true;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
}

void AMmoFxActor::Start(const TArray<FMmoFxLayer>& Layers, float Hold, const FMmoFxLight& InLight)
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
		return;
	}
	const FVector Location = GetActorLocation();
	const FQuat Facing = GetActorQuat();
	GroundTilt = Facing.Inverse() * FQuat::FindBetweenNormals(FVector::UpVector, AMmoTerrain::GroundNormal(Location.X, Location.Y)) * Facing;
	if (InLight.Intensity > 0.0f)
	{
		Light = InLight;
		LightComponent = NewObject<UPointLightComponent>(this);
		LightComponent->SetMobility(EComponentMobility::Movable);
		LightComponent->SetIntensityUnits(ELightUnits::Unitless);
		LightComponent->bUseInverseSquaredFalloff = false;
		LightComponent->LightFalloffExponent = 2.0f;
		LightComponent->SetIntensity(0.0f);
		LightComponent->SetLightColor(Light.Color);
		LightComponent->SetAttenuationRadius(Light.Radius * 100.0f);
		LightComponent->SetCastShadows(false);
		LightComponent->SetupAttachment(GetRootComponent());
		LightComponent->RegisterComponent();
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
	if (LightComponent)
	{
		// 0.05초에 켜지고 남은 시간의 제곱으로 꺼진다.
		const float Local = Age - Light.Delay;
		const float Left = Local < 0.0f ? 0.0f : 1.0f - Local / Light.Duration;
		const float Glow = Left <= 0.0f ? 0.0f : FMath::Min(Local / 0.05f, 1.0f) * FMath::Square(Left) * FMath::Max(Ending, 0.0f);
		LightComponent->SetIntensity(Light.Intensity * Glow);
		bAny |= Left > 0.0f && Ending > 0.0f;
	}
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
		const FQuat Turn(FRotator(Layer.Rotation.Pitch, Layer.Rotation.Yaw + Layer.Spin * Local, Layer.Rotation.Roll));
		Item.Mesh->SetRelativeRotation(Layer.bGround ? GroundTilt * Turn : Turn);
		Item.Mesh->SetRelativeScale3D(FMath::Lerp(Layer.StartScale, Layer.EndScale, Grow));
		Item.Mesh->SetCustomPrimitiveDataVector4(0, FVector4(Layer.Color.R, Layer.Color.G, Layer.Color.B, Opacity));
		Item.Mesh->SetCustomPrimitiveDataFloat(4, T);
	}
	if (!bAny)
	{
		Destroy();
	}
}
