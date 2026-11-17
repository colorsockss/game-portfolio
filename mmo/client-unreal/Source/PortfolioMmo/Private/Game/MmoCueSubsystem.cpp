#include "Game/MmoCueSubsystem.h"

#include "Components/AudioComponent.h"
#include "Engine/GameInstance.h"
#include "Engine/World.h"
#include "Game/MmoCharacter.h"
#include "Game/MmoCoordinates.h"
#include "Game/MmoEntitySubsystem.h"
#include "Game/MmoFxActor.h"
#include "HAL/PlatformTime.h"
#include "Net/MmoConnection.h"
#include "Kismet/GameplayStatics.h"
#include "Net/MmoSession.h"
#include "NiagaraComponent.h"
#include "NiagaraFunctionLibrary.h"
#include "NiagaraSystem.h"
#include "Sound/SoundBase.h"
#include "Sound/SoundClass.h"
#include "Sound/SoundConcurrency.h"
#include "Sound/SoundMix.h"

namespace
{
	/** 배경음을 바꿀 때 줄이고 키우는 시간(초). */
	constexpr float MusicFadeSeconds = 1.5f;
}

bool UMmoCueSubsystem::DoesSupportWorldType(const EWorldType::Type WorldType) const
{
	return WorldType == EWorldType::Game || WorldType == EWorldType::PIE;
}

TStatId UMmoCueSubsystem::GetStatId() const
{
	RETURN_QUICK_DECLARE_CYCLE_STAT(UMmoCueSubsystem, STATGROUP_Tickables);
}

UMaterialInterface* UMmoCueSubsystem::HitFlashMaterial()
{
	if (!Cues)
	{
		Cues = LoadObject<UMmoCues>(nullptr, UMmoCues::Path);
	}
	return Cues ? Cues->HitFlash.Get() : nullptr;
}

const FMmoCueRow* UMmoCueSubsystem::Row(EMmoCue Cue, int32 Kind, int32 Key)
{
	if (!Cues)
	{
		Cues = LoadObject<UMmoCues>(nullptr, UMmoCues::Path);
		if (!Cues)
		{
			return nullptr;
		}
		// 104: 배경음 말고 모든 줄의 에셋을 미리 불러온다(처음 쓰는 스킬의 연출이 불러오는 동안 빠지지 않게. 이펙트 그림과 효과음뿐이라 작음).
		TArray<FSoftObjectPath> All;
		for (const FMmoCueRow& Each : Cues->Rows)
		{
			if (Each.Cue == EMmoCue::Music)
			{
				continue;
			}
			All.Add(Each.Effect.ToSoftObjectPath());
			All.Add(Each.Sound.ToSoftObjectPath());
			for (const FMmoFxLayer& Layer : Each.Layers)
			{
				All.Add(Layer.Mesh.ToSoftObjectPath());
				All.Add(Layer.Material.ToSoftObjectPath());
			}
		}
		All.RemoveAll([this](const FSoftObjectPath& Path) { return Path.IsNull() || Requested.Contains(Path); });
		Requested.Append(All);
		Loads.Add(Streamable.RequestAsyncLoad(All));
	}
	const FMmoCueRow* Found = Cues->Find(Cue, Kind, Key);
	if (!Found)
	{
		return nullptr;
	}
	TArray<FSoftObjectPath> Missing;
	TArray<FSoftObjectPath> Paths = { Found->Effect.ToSoftObjectPath(), Found->Sound.ToSoftObjectPath() };
	for (const FMmoFxLayer& Layer : Found->Layers)
	{
		Paths.Add(Layer.Mesh.ToSoftObjectPath());
		Paths.Add(Layer.Material.ToSoftObjectPath());
	}
	for (const FSoftObjectPath& Path : Paths)
	{
		if (!Path.IsNull() && !Path.ResolveObject() && !Requested.Contains(Path))
		{
			Requested.Add(Path);
			Missing.Add(Path);
		}
	}
	if (!Missing.IsEmpty())
	{
		Loads.Add(Streamable.RequestAsyncLoad(Missing));
	}
	return Found;
}

USoundConcurrency* UMmoCueSubsystem::ConcurrencyFor(USoundBase* Sound)
{
	TObjectPtr<USoundConcurrency>& Concurrency = Concurrencies.FindOrAdd(Sound);
	if (!Concurrency)
	{
		Concurrency = NewObject<USoundConcurrency>(this);
		Concurrency->Concurrency.MaxCount = MaxSameSound;
		Concurrency->Concurrency.ResolutionRule = EMaxConcurrentResolutionRule::StopOldest;
	}
	return Concurrency;
}

int32 UMmoCueSubsystem::ActiveEffects()
{
	Active.RemoveAll([](const UNiagaraComponent* Effect) { return !IsValid(Effect) || !Effect->IsActive(); });
	Shapes.RemoveAll([](const TWeakObjectPtr<AMmoFxActor>& Shape) { return !Shape.IsValid(); });
	return Active.Num() + Shapes.Num();
}

AMmoFxActor* UMmoCueSubsystem::Play(EMmoCue Cue, int32 Kind, int32 Key, const FVector& Location, const FRotator& Facing, float Hold)
{
	const FMmoCueRow* Found = Row(Cue, Kind, Key);
	if (!Found)
	{
		return nullptr;
	}
	if (UNiagaraSystem* System = Found->Effect.Get(); System && ActiveEffects() < MaxActiveEffects)
	{
		Active.Add(UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), System, Location, FRotator::ZeroRotator, FVector::OneVector, true, true, ENCPoolMethod::AutoRelease));
	}
	if (USoundBase* Sound = Found->Sound.Get())
	{
		UGameplayStatics::PlaySoundAtLocation(GetWorld(), Sound, Location, FRotator::ZeroRotator, 1.0f, 1.0f, 0.0f, nullptr, ConcurrencyFor(Sound));
	}
	if (AMmoCharacter* Self = Found->Shake > 0.0f ? Cast<AMmoCharacter>(UGameplayStatics::GetPlayerPawn(this, 0)) : nullptr;
		Self && FVector::DistSquared2D(Self->GetActorLocation(), Location) < FMath::Square(ShakeRange))
	{
		Self->Shake(Found->Shake);
	}
	if (Found->Layers.IsEmpty() || ActiveEffects() >= MaxActiveEffects)
	{
		return nullptr;
	}
	AMmoFxActor* Shape = GetWorld()->SpawnActor<AMmoFxActor>(Location, FRotator(0.0, Facing.Yaw, 0.0));
	if (!Shape)
	{
		return nullptr;
	}
	Shape->Start(Found->Layers, Hold, Found->Light);
	if (!IsValid(Shape))
	{
		// 겹의 에셋을 아직 불러오지 않아 그릴 것이 없었다.
		return nullptr;
	}
	Shapes.Add(Shape);
	return Shape;
}

UNiagaraComponent* UMmoCueSubsystem::StartLoop(EMmoCue Cue, int32 Kind, int32 Key, const FVector& Location)
{
	const FMmoCueRow* Found = Row(Cue, Kind, Key);
	UNiagaraSystem* System = Found ? Found->Effect.Get() : nullptr;
	if (!System || ActiveEffects() >= MaxActiveEffects)
	{
		return nullptr;
	}
	UNiagaraComponent* Effect = UNiagaraFunctionLibrary::SpawnSystemAtLocation(GetWorld(), System, Location, FRotator::ZeroRotator, FVector::OneVector, false, true, ENCPoolMethod::ManualRelease);
	Active.Add(Effect);
	return Effect;
}

void UMmoCueSubsystem::StopLoop(UNiagaraComponent* Effect)
{
	if (IsValid(Effect))
	{
		// 끝까지 그린 뒤 풀로 돌아간다(남은 입자가 한꺼번에 사라지지 않음).
		Effect->Deactivate();
		Effect->ReleaseToPool();
	}
}

void UMmoCueSubsystem::PlayUi(EMmoCue Cue)
{
	const FMmoCueRow* Found = Row(Cue, 0, 0);
	if (USoundBase* Sound = Found ? Found->Sound.Get() : nullptr)
	{
		UGameplayStatics::PlaySound2D(GetWorld(), Sound, 1.0f, 1.0f, 0.0f, ConcurrencyFor(Sound));
	}
}

void UMmoCueSubsystem::Walk(uint32 Id, int32 Kind, int32 Key, const FVector& Location, double Distance)
{
	double& Since = Walked.FindOrAdd(Id);
	Since += Distance;
	if (Since < StepLength)
	{
		return;
	}
	Since = 0.0;
	const FMmoCueRow* Found = Row(EMmoCue::Footstep, Kind, Key);
	if (USoundBase* Sound = Found ? Found->Sound.Get() : nullptr)
	{
		UGameplayStatics::PlaySoundAtLocation(GetWorld(), Sound, Location, FRotator::ZeroRotator, 1.0f, 1.0f, 0.0f, nullptr, ConcurrencyFor(Sound));
	}
}

void UMmoCueSubsystem::SetVolume(EMmoSoundGroup Group, float Volume)
{
	if (!Cues && !Row(EMmoCue::UiClick, 0, 0))
	{
		return;
	}
	USoundClass* Class = Group == EMmoSoundGroup::Music ? Cues->MusicClass : Cues->EffectsClass;
	if (!Class)
	{
		return;
	}
	if (!Mix)
	{
		Mix = NewObject<USoundMix>(this);
		UGameplayStatics::PushSoundMixModifier(this, Mix);
	}
	UGameplayStatics::SetSoundMixClassOverride(this, Mix, Class, FMath::Clamp(Volume, 0.0f, 1.0f), 1.0f, 0.0f, true);
}

int32 UMmoCueSubsystem::MyZoneKind() const
{
	const UMmoSession* Session = GetWorld()->GetGameInstance()->GetSubsystem<UMmoSession>();
	const UMmoEntitySubsystem* Entities = GetWorld()->GetSubsystem<UMmoEntitySubsystem>();
	const AActor* Self = Entities && Session ? Entities->FindActor(Session->World().SelfId()) : nullptr;
	const MmoWorld::FFieldMap* Field = Session ? Session->Field() : nullptr;
	if (!Self || !Field || Session->World().SelfId() == 0)
	{
		return 0;
	}
	const FVector Location = Self->GetActorLocation();
	const uint32 Zone = Field->ZoneAt(MmoCoordinates::ToX(Location), MmoCoordinates::ToZ(Location));
	for (const portfolio::mmo::data::ZonesRow& Row : Session->Data().Zones.rows())
	{
		if (Row.id() == Zone)
		{
			return static_cast<int32>(Row.kind());
		}
	}
	return 0;
}

void UMmoCueSubsystem::Tick(float DeltaTime)
{
	if (const double Now = FPlatformTime::Seconds(); Now >= NextLog)
	{
		NextLog = Now + LogSeconds;
		UE_LOG(LogMmoNet, Display, TEXT("Cues: %d active effects (limit %d)"), ActiveEffects(), MaxActiveEffects);
	}

	const int32 Kind = MyZoneKind();
	if (Kind == MusicZoneKind)
	{
		return;
	}
	USoundBase* Sound = nullptr;
	if (Kind != 0)
	{
		const FMmoCueRow* Found = Row(EMmoCue::Music, 0, Kind);
		if (Found && !Found->Sound.IsNull() && !Found->Sound.Get())
		{
			// 불러오는 중이면 다음 틱에 다시 본다.
			return;
		}
		Sound = Found ? Found->Sound.Get() : nullptr;
	}
	if (Music)
	{
		Music->FadeOut(MusicFadeSeconds, 0.0f);
		Music = nullptr;
	}
	MusicZoneKind = Kind;
	UE_LOG(LogMmoNet, Display, TEXT("Music: zone kind %d, %s"), Kind, Sound ? *Sound->GetName() : TEXT("none"));
	if (Sound)
	{
		Music = UGameplayStatics::SpawnSound2D(GetWorld(), Sound, 1.0f, 1.0f, 0.0f, nullptr, false, true);
		if (Music)
		{
			Music->FadeIn(MusicFadeSeconds);
		}
	}
}
