#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameUserSettings.h"

#include "MmoGameUserSettings.generated.h"

/**
 * 기기에 남기는 설정(77). 서버에는 남기지 않는다. 엔진의 GameUserSettings.ini에 함께 쓰고(DefaultEngine.ini의 GameUserSettingsClassName), 바꿀 때마다 Apply로
 * 바로 적용한 뒤 저장한다. 그래픽 품질은 단계마다 바꾸는 값을 표 하나(Levels)로 둔다. 그릴 캐릭터 수와 거리별 그림자의 적용은 59가 잇는다(지금은 값만 둠).
 */
UCLASS(config = GameUserSettings)
class PORTFOLIOMMO_API UMmoGameUserSettings : public UGameUserSettings
{
	GENERATED_BODY()

public:
	/** 그래픽 품질 한 단계의 값(재지 않은 처음 값. 59가 재서 고침). */
	struct FLevel
	{
		/** 해상도 배율(%). */
		float ScreenPercentage;
		/** 그림자: 0 끔, 1 내 캐릭터만, 2 가까운 캐릭터까지(r.ShadowQuality로 어림. 거리별 적용은 59). */
		int32 Shadows;
		/** 동시에 켜는 이펙트 수의 상한(27의 풀). */
		int32 MaxEffects;
		/** 그릴 캐릭터 수(59가 씀). */
		int32 DrawCharacters;
	};

	static const FLevel Levels[3];

	static UMmoGameUserSettings& Get();

	/** 효과음과 배경음의 크기(0–1). */
	UPROPERTY(config)
	float EffectVolume = 1.0f;

	UPROPERTY(config)
	float MusicVolume = 0.7f;

	/** 그래픽 품질(0 낮음, 1 중간, 2 높음). 음수면 아직 정하지 않았다(Android는 낮음, 그 밖은 높음으로 시작). */
	UPROPERTY(config)
	int32 Quality = -1;

	/** 프레임 상한(30, 60, 0 제한 없음. 제한 없음은 PC만). */
	UPROPERTY(config)
	int32 FrameCap = 60;

	/** 언어("ko", "en"). 비면 기기의 언어가 한국어면 한국어, 아니면 영어다. */
	UPROPERTY(config)
	FString Language;

	/** 맞았을 때 카메라 흔들림(92). */
	UPROPERTY(config)
	bool bCameraShake = true;

	/** 마지막으로 쓴 ID. 로그인 화면이 채워 둔다. */
	UPROPERTY(config)
	FString LastLoginId;

	/** 조작 안내(94)를 본 캐릭터("서버 주소|캐릭터 번호"). */
	UPROPERTY(config)
	TArray<FString> GuideSeen;

	/** 정하지 않은 값을 기기에 맞춰 채운 품질 단계. */
	int32 QualityLevel() const;

	/** 정하지 않았으면 기기의 언어로 고른 언어("ko"나 "en"). */
	FString LanguageCode() const;

	/** 지금 값을 엔진(프레임 상한, 해상도 배율, 그림자, 카메라 흔들림)과 World의 연출(소리의 두 크기, 이펙트 상한)에 적용한다. World가 없으면 연출은 건너뛴다. */
	void ApplyMmo(UWorld* World);
};
