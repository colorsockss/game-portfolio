import { computed, signal, type ReadonlySignal } from "@preact/signals-core";
import type { SoundChannel } from "@idle/data-schema";
import type { Account } from "../../application/account/account.js";
import { CHANNELS, FRAME_RATES, type FrameRate, type Language, type SettingsService } from "../../application/settings/settings.js";
import type { TextKey, Translate } from "../text.js";
import type { Tabs } from "./tabs.js";

/** 채널마다 설정 화면에 보이는 이름. 채널(Enums의 SoundChannel)이 늘면 여기에 이름이 없어 타입 검사가 실패한다. */
const CHANNEL_NAMES: Readonly<Record<SoundChannel, TextKey>> = { bgm: "settings.bgm", sfx: "settings.sfx" };

/** 설정 화면의 채널 한 줄: 이름, 볼륨 슬라이더와 뮤트 토글. */
export interface ChannelSettings {
  readonly name: ReadonlySignal<string>;
  /** 0~1. */
  readonly volume: ReadonlySignal<number>;
  readonly muted: ReadonlySignal<boolean>;
  /** 슬라이더를 끄는 동안: 바로 들리게 바꾸고 저장하지 않는다. */
  previewVolume(volume: number): void;
  /** 슬라이더를 놓을 때: 바꾸고 저장한다. */
  setVolume(volume: number): void;
  /** 뮤트해도 볼륨은 남아서, 풀면 그 볼륨으로 돌아온다. */
  setMuted(muted: boolean): void;
}

/** 설정 화면(팝업): 채널마다 볼륨과 뮤트, 초당 프레임, 언어, 로그아웃. 바꾼 것은 설정 서비스가 저장하고 엔진에 적용한다. */
export interface SettingsViewModel {
  /** 채널마다 한 줄을 Enums의 SoundChannel 순서로. */
  readonly channels: readonly ChannelSettings[];
  /** 초당 프레임 탭. 고른 값은 설정 서비스가 쥔다. */
  readonly frameRates: Tabs<FrameRate>;
  /** 언어 탭. 탭의 이름은 그 언어로 쓴 이름이고, 고르면 화면 전체가 그 언어로 다시 그려진다. */
  readonly languages: Tabs<Language>;
  /** 물어본 뒤 로그아웃한다. 로그아웃하면 메인 화면과 함께 이 화면도 닫힌다. */
  logout(): Promise<void>;
  close(): void;
}

export interface SettingsViewModelOptions {
  readonly settings: SettingsService;
  readonly t: Translate;
  /** 고를 수 있는 언어와 그 언어로 쓴 이름(presentation/text.ts의 languageNames). */
  readonly languageNames: Readonly<Record<Language, string>>;
  readonly account: Pick<Account, "logout">;
  /** 확인 팝업으로 묻고 플레이어의 답으로 이행한다(presentation/widgets/confirm.ts). */
  readonly confirm: (message: string) => Promise<boolean>;
  readonly close: () => void;
}

export function createSettingsViewModel({ settings, t, languageNames, account, confirm, close }: SettingsViewModelOptions): SettingsViewModel {
  const channel = (channel: SoundChannel): ChannelSettings => ({
    name: computed(() => t(CHANNEL_NAMES[channel])),
    volume: computed(() => settings.value.value.volume[channel]),
    muted: computed(() => settings.value.value.muted[channel]),
    previewVolume: volume => settings.previewVolume(channel, volume),
    setVolume: volume => settings.setVolume(channel, volume),
    setMuted: muted => settings.setMuted(channel, muted),
  });
  return {
    channels: CHANNELS.map(channel),
    frameRates: {
      tabs: FRAME_RATES.map(frameRate => ({ key: frameRate, label: computed(() => t("settings.fps", { rate: frameRate })) })),
      selected: computed(() => settings.value.value.frameRate),
      select: frameRate => settings.setFrameRate(frameRate),
    },
    languages: {
      tabs: (Object.keys(languageNames) as Language[]).map(language => ({ key: language, label: signal(languageNames[language]) })),
      selected: computed(() => settings.value.value.language),
      select: language => settings.setLanguage(language),
    },
    logout: async () => {
      if (await confirm(t("main.logoutConfirm"))) account.logout();
    },
    close,
  };
}
