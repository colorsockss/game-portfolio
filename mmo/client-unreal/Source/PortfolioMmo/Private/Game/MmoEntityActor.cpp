#include "Game/MmoEntityActor.h"

#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInterface.h"
#include "UObject/ConstructorHelpers.h"

AMmoEntityActor::AMmoEntityActor()
{
	PrimaryActorTick.bCanEverTick = false;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
	AddPlaceholderBody(*this, *GetRootComponent());
}

void AMmoEntityActor::BeginPlay()
{
	Super::BeginPlay();
	TintPlaceholderBody(*this, FLinearColor(0.9f, 0.45f, 0.1f));
}

void AMmoEntityActor::AddPlaceholderBody(AActor& Owner, USceneComponent& Parent)
{
	// 엔진의 기본 도형은 지름·높이가 100 단위(1 m)이고 가운데가 원점이다. 머티리얼은 Scripts/create_content.py가 만든다.
	// 코드만 참조하는 에셋이라 두 폴더를 DefaultGame.ini에서 늘 쿠킹한다.
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cylinder(TEXT("/Engine/BasicShapes/Cylinder.Cylinder"));
	static ConstructorHelpers::FObjectFinder<UStaticMesh> Cube(TEXT("/Engine/BasicShapes/Cube.Cube"));
	static ConstructorHelpers::FObjectFinder<UMaterialInterface> Material(TEXT("/Game/Materials/M_Placeholder.M_Placeholder"));

	UStaticMeshComponent* Body = Owner.CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(&Parent);
	Body->SetStaticMesh(Cylinder.Object);
	Body->SetMaterial(0, Material.Object);
	Body->SetRelativeLocation(FVector(0.0, 0.0, 90.0));
	Body->SetRelativeScale3D(FVector(0.6, 0.6, 1.8));
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->SetCanEverAffectNavigation(false);

	UStaticMeshComponent* Nose = Owner.CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Nose"));
	Nose->SetupAttachment(&Parent);
	Nose->SetStaticMesh(Cube.Object);
	Nose->SetMaterial(0, Material.Object);
	Nose->SetRelativeLocation(FVector(40.0, 0.0, 150.0));
	Nose->SetRelativeScale3D(FVector(0.4, 0.2, 0.2));
	Nose->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Nose->SetCanEverAffectNavigation(false);
}

void AMmoEntityActor::TintPlaceholderBody(AActor& Owner, const FLinearColor& Color)
{
	// M_Placeholder의 Color 파라미터. 동적 머티리얼 인스턴스를 만드므로 생성자(CDO)가 아니라 BeginPlay에서 부른다. 코는 어둡게 해 보는 쪽을 드러낸다.
	Owner.ForEachComponent<UStaticMeshComponent>(false, [&Color](UStaticMeshComponent* Mesh)
	{
		const FLinearColor Tint = Mesh->GetFName() == TEXT("Nose") ? Color * 0.25f : Color;
		Mesh->SetVectorParameterValueOnMaterials(TEXT("Color"), FVector(Tint));
	});
}
