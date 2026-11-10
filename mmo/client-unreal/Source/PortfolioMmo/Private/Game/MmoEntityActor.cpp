#include "Game/MmoEntityActor.h"

#include "Components/SkeletalMeshComponent.h"
#include "Game/MmoCharacterLook.h"

AMmoEntityActor::AMmoEntityActor()
{
	PrimaryActorTick.bCanEverTick = false;
	SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Root")));
	Body = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Body"));
	Body->SetupAttachment(GetRootComponent());
	Body->SetCollisionEnabled(ECollisionEnabled::NoCollision);
	Body->SetCanEverAffectNavigation(false);
	// 화면에 보이지 않는 캐릭터는 포즈를 계산하지 않는다(시야 안의 캐릭터가 수백일 수 있다).
	Body->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
}

void AMmoEntityActor::SetClass(portfolio::mmo::CharacterClass Class)
{
	MmoCharacterLook::Apply(*Body, Class);
}
