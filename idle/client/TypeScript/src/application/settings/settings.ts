import { SoundChannel, type StringsRow } from "@idle/data-schema";
import { signal, type ReadonlySignal } from "@preact/signals-core";
import type { DeviceStorage, Display, Logger } from "../ports.js";

/** 소리의 채널(Enums 테이블의 SoundChannel). 설정의 키이자 Sounds 테이블의 `channel` 값이다. */
export const CHANNELS: readonly SoundChannel[] = Object.values(SoundChannel);

/** 화면 문장의 언어: Strings 테이블의 언어 열(ISO 639-1). 열을 더하면 언어가 는다. */
export type Language = Exclude<keyof StringsRow, "id">;

/** 고를 수 있는 초당 프레임. */
export const FRAME_RATES = [30, 60] as const;
export type FrameRate = (typeof FRAME_RATES)[number];

/** 이 기기에 남기는 설정. 진행 데이터는 서버에 있다. */
export interface Settings {
  /** 채널마다 0~1. */
  readonly volume: Readonly<Record<SoundChannel, number>>;
  /** 뮤트해도 볼륨은 남아서, 풀면 그 볼륨으로 돌아온다. */
  readonly muted: Readonly<Record<SoundChannel, boolean>>;
  readonly frameRate: FrameRate;
  readonly language: Language;
}

/** 새 기기의 설정. 언어는 기기 언어가 고를 수 있는 언어이면 그것이고, 아니면 기본 언어(한국어)다. */
export const DEFAULT_SETTINGS: Settings = {
  volume: { bgm: 0.7, sfx: 1 },
  muted: { bgm: false, sfx: false },
  frameRate: 60,
  language: "ko",
};

/** 설정을 JSON 하나로 두는 DeviceStorage 키. 한 번에 쓰므로 일부만 저장되는 일이 없다. */
export const SETTINGS_KEY = "settings";

/** 설정: 지금 값과 바꾸는 방법. 바꾸면 바로 저장하고 엔진에 적용한다. 소리는 오디오가 값을 따라간다. */
export interface SettingsService {
  readonly value: ReadonlySignal<Settings>;
  /**
   * 볼륨을 바꾸되 저장하지 않는다(슬라이더를 끄는 동안 바로 듣는 값). 저장은 다음 `setVolume`이나 다른 변경이 함께 한다.
   * 0~1을 벗어난 값은 그 끝으로 자른다.
   */
  previewVolume(channel: SoundChannel, volume: number): void;
  /** 0~1을 벗어난 값은 그 끝으로 자른다. */
  setVolume(channel: SoundChannel, volume: number): void;
  setMuted(channel: SoundChannel, muted: boolean): void;
  setFrameRate(frameRate: FrameRate): void;
  /** 화면의 문장이 이 언어로 다시 그려진다(presentation/text.ts). */
  setLanguage(language: Language): void;
}

export interface SettingsOptions {
  readonly storage: DeviceStorage;
  /** 초당 프레임을 적용하고 기기 언어를 읽는다. */
  readonly display: Display;
  /** 고를 수 있는 언어(Strings의 언어 열). 저장된 언어와 기기 언어가 이 안에 있어야 쓴다. */
  readonly languages: readonly Language[];
  readonly logger: Logger;
}

const isVolume = (value: unknown): value is number => typeof value === "number" && value >= 0 && value <= 1;
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isFrameRate = (value: unknown): value is FrameRate => FRAME_RATES.includes(value as FrameRate);

// 채널마다 저장된 값이 맞으면 그것을, 아니면 기본값을 쓴다.
function channels<T>(saved: unknown, defaults: Readonly<Record<SoundChannel, T>>, valid: (value: unknown) => value is T): Record<SoundChannel, T> {
  const values = (saved ?? {}) as Partial<Record<SoundChannel, unknown>>;
  return Object.fromEntries(CHANNELS.map(channel => {
    const value = values[channel];
    return [channel, valid(value) ? value : defaults[channel]];
  })) as Record<SoundChannel, T>;
}

/**
 * 기기에 저장한 설정을 읽어 시작하고, 프레임 목표를 바로 적용한다. 저장된 값은 필드마다 검사해서 틀리거나
 * 없는 필드만 기본값으로 둔다. 그래서 필드를 더해도 버전이나 마이그레이션이 필요 없다.
 */
export function createSettings({ storage, display, languages, logger }: SettingsOptions): SettingsService {
  const isLanguage = (value: unknown): value is Language => languages.includes(value as Language);
  const device = display.language();
  const defaults: Settings = { ...DEFAULT_SETTINGS, language: isLanguage(device) ? device : DEFAULT_SETTINGS.language };
  const value = signal(read());
  display.setFrameRate(value.value.frameRate);

  function read(): Settings {
    const text = storage.get(SETTINGS_KEY);
    if (text === null) return defaults;
    let saved: Partial<Record<keyof Settings, unknown>>;
    try {
      saved = (JSON.parse(text) ?? {}) as typeof saved;
    } catch (error) {
      logger.warn("The saved settings are not JSON; using the defaults:", error);
      return defaults;
    }
    return {
      volume: channels(saved.volume, defaults.volume, isVolume),
      muted: channels(saved.muted, defaults.muted, isBoolean),
      frameRate: isFrameRate(saved.frameRate) ? saved.frameRate : defaults.frameRate,
      language: isLanguage(saved.language) ? saved.language : defaults.language,
    };
  }

  // 마지막으로 저장한 값. 미리 들은 볼륨은 이것과 달라 다음 저장이 함께 쓴다.
  let saved = value.value;
  function save(): void {
    if (value.value === saved) return;
    saved = value.value;
    storage.set(SETTINGS_KEY, JSON.stringify(saved));
  }

  function previewVolume(channel: SoundChannel, volume: number): void {
    const clamped = Math.min(1, Math.max(0, volume));
    const current = value.value;
    if (current.volume[channel] !== clamped) value.value = { ...current, volume: { ...current.volume, [channel]: clamped } };
  }

  return {
    value,
    previewVolume,
    setVolume(channel, volume) {
      previewVolume(channel, volume);
      save();
    },
    setMuted(channel, muted) {
      const current = value.value;
      if (current.muted[channel] !== muted) value.value = { ...current, muted: { ...current.muted, [channel]: muted } };
      save();
    },
    setFrameRate(frameRate) {
      if (value.value.frameRate !== frameRate) {
        value.value = { ...value.value, frameRate };
        display.setFrameRate(frameRate);
      }
      save();
    },
    setLanguage(language) {
      if (value.value.language !== language) value.value = { ...value.value, language };
      save();
    },
  };
}
