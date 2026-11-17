#pragma once

#include "CoreMinimal.h"
#include "Engine/StreamableManager.h"
#include "Game/MmoCues.h"
#include "Subsystems/WorldSubsystem.h"

#include "MmoCueSubsystem.generated.h"

class AMmoFxActor;
class UAudioComponent;
class UNiagaraComponent;
class USoundConcurrency;
class USoundMix;

/** 소리의 묶음(사운드 클래스). 묶음마다 크기를 정한다. */
enum class EMmoSoundGroup : uint8
{
	Effects,
	Music,
};

/**
 * 연출(이펙트와 소리)을 트는 곳. 사건에서 연출 표(UMmoCues)의 줄을 찾아 튼다. 표를 처음 읽을 때 배경음 말고 모든 줄의 에셋을 비동기로
 * 불러오고(104), 배경음은 처음 쓰일 때 불러온다. 다 불러오기 전의 사건은 연출 없이 지나간다.
 *   - 이펙트: Niagara의 컴포넌트 풀(ENCPoolMethod)에서 꺼내 쓰고 끝나면 돌려놓는다. 줄에 모양의 겹(104)이 있으면 그것을 그리는 액터
 *     (AMmoFxActor)도 띄운다. 동시에 켠 이펙트(Niagara와 모양 액터)가 MaxActiveEffects면 새 것을 틀지 않는다.
 *   - 소리: 같은 소리는 한 번에 MaxSameSound개까지(넘으면 가장 오래된 것을 끔). 효과와 배경음 두 묶음이고 SetVolume이 묶음의 크기를 바꾼다.
 *   - 배경음: 내 캐릭터가 있는 구역의 종류가 바뀌면 바꾼다(앞의 것은 줄이며 끔).
 */
UCLASS()
class PORTFOLIOMMO_API UMmoCueSubsystem : public UTickableWorldSubsystem
{
	GENERATED_BODY()

public:
	/** 동시에 켜는 이펙트의 상한. shortcut: 한 값이다. 그래픽 품질의 단계(77)가 생기면 그 단계가 정한다. */
	/** 동시에 켜는 이펙트 수의 상한. 그래픽 품질의 단계가 정한다(77). */
	int32 MaxActiveEffects = 32;

	void SetEffectLimit(int32 Limit) { MaxActiveEffects = Limit; }

	/** 같은 소리를 한 번에 트는 수의 상한(처음 값). */
	static constexpr int32 MaxSameSound = 8;

	/** 발소리 하나마다 걷는 거리(언리얼 단위). */
	static constexpr double StepLength = 120.0;

	/**
	 * 한 번 트는 연출(이펙트와 3D 소리)을 Location에 튼다. Facing은 모양 겹의 방향(시전자가 대상을 보는 쪽), Hold는 시전 동안 남는 겹의
	 * 시간(초)이다. 모양 액터를 띄웠으면 그것을(시전의 연출을 끊을 때 Finish), 아니면 nullptr.
	 */
	AMmoFxActor* Play(EMmoCue Cue, int32 Kind, int32 Key, const FVector& Location, const FRotator& Facing = FRotator::ZeroRotator, float Hold = 0.0f);

	/** 되풀이하는 이펙트(발사체)를 켠다. 아직 불러오지 않았거나 상한이면 nullptr. 끝나면 StopLoop로 돌려놓는다. */
	UNiagaraComponent* StartLoop(EMmoCue Cue, int32 Kind, int32 Key, const FVector& Location);
	void StopLoop(UNiagaraComponent* Effect);

	/** UI의 소리(2D)를 튼다. */
	void PlayUi(EMmoCue Cue);

	/** 개체가 Distance만큼 걸었다. StepLength마다 발소리를 낸다. */
	void Walk(uint32 Id, int32 Kind, int32 Key, const FVector& Location, double Distance);

	/** 묶음의 크기(0–1). */
	void SetVolume(EMmoSoundGroup Group, float Volume);

	/** 지금 켜져 있는 이펙트 수. */
	int32 ActiveEffects();

	/** 피격 번쩍임의 머티리얼(연출 표의 HitFlash). 표가 없으면 nullptr. */
	UMaterialInterface* HitFlashMaterial();

	virtual void Tick(float DeltaTime) override;
	virtual TStatId GetStatId() const override;

protected:
	virtual bool DoesSupportWorldType(const EWorldType::Type WorldType) const override;

private:
	/** 줄을 찾고, 줄의 에셋이 아직 없으면 불러오기를 건다. */
	const FMmoCueRow* Row(EMmoCue Cue, int32 Kind, int32 Key);

	/** 같은 소리의 상한을 지키는 설정(소리마다 하나). */
	USoundConcurrency* ConcurrencyFor(USoundBase* Sound);

	/** 내 캐릭터가 있는 구역의 종류(월드에 없으면 0). */
	int32 MyZoneKind() const;

	UPROPERTY()
	TObjectPtr<UMmoCues> Cues;

	UPROPERTY()
	TArray<TObjectPtr<UNiagaraComponent>> Active;

	/** 띄운 모양 액터(스스로 없어짐). */
	TArray<TWeakObjectPtr<AMmoFxActor>> Shapes;

	UPROPERTY()
	TMap<TObjectPtr<USoundBase>, TObjectPtr<USoundConcurrency>> Concurrencies;

	UPROPERTY()
	TObjectPtr<USoundMix> Mix;

	UPROPERTY()
	TObjectPtr<UAudioComponent> Music;

	/** 지금 트는 배경음의 구역 종류(-1이면 아직 정하지 않음). */
	int32 MusicZoneKind = -1;

	/** 켠 이펙트 수를 로그에 남기는 주기(초)와 다음 때. 풀이 늘지 않고 상한을 넘지 않는지 보는 데 쓴다. */
	static constexpr double LogSeconds = 10.0;
	double NextLog = 0.0;

	/** 개체마다 지난 발소리 뒤로 걸은 거리. */
	TMap<uint32, double> Walked;

	FStreamableManager Streamable;

	/** 불러온 에셋을 잡아 두는 핸들. 버리면 아무것도 가리키지 않는 에셋이 GC에 지워지고(Requested에 있어 다시 부르지 않음) 연출이 사라진다(104에서 고침). */
	TArray<TSharedPtr<FStreamableHandle>> Loads;
	TSet<FSoftObjectPath> Requested;
};
