#include "Game/MmoEntityActor.h"

#include "Components/SkeletalMeshComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Game/MmoCharacterLook.h"

AMmoEntityActor::AMmoEntityActor()
{
	PrimaryActorTick.bCanEverTick = false;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
	Body = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(GetRootComponent());
	MmoCharacterLook::SetUpBody(*Body, FVector::ZeroVector);
	Body->SetCanEverAffectNavigation(false);
	// 화면에 보이지 않는 캐릭터는 포즈를 계산하지 않는다(시야 안의 캐릭터가 수백일 수 있다).
	Body->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
	Placeholder = CreateDefaultSubobject<UStaticMeshComponent>(TEXT("Placeholder"));
	Placeholder->SetupAttachment(GetRootComponent());
	// 루트가 지면이라 원기둥의 가운데는 0.9 m 위다.
	MmoCharacterLook::SetUpPlaceholder(*Placeholder, FVector(0.0, 0.0, 90.0));
}
