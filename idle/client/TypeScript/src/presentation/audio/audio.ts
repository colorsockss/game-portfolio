import { SoundChannel, type GameData, type SoundsId, type SoundsRow } from "@idle/data-schema";
import type { ReadonlySignal } from "@preact/signals-core";
import type { Logger } from "../../application/ports.js";
import type { Scope } from "../../application/scope.js";
import type { Settings } from "../../application/settings/settings.js";
import type { AssetHandle, ResourceBridge } from "../ui/ports.js";
import type { AudioBridge } from "./ports.js";

/** 테이블 키(Sounds의 id)로 소리를 낸다. 크기는 테이블의 `volume` × 설정의 채널 볼륨이고, 뮤트면 0이다. */
export interface Audio {
  /** 키의 BGM을 `scope`가 닫힐 때까지 반복해서 튼다. 다른 BGM이 돌고 있으면 바꾼다. */
  playBgm(key: SoundsId, scope: Scope): void;
  /** 키의 효과음을 한 번 낸다. 처음 쓰는 클립은 불러온 뒤에 난다. */
  play(key: SoundsId): void;
}

export interface AudioOptions {
  readonly bridge: AudioBridge;
  readonly resources: Pick<ResourceBridge, "load">;
  readonly data: GameData;
  /** 채널마다 볼륨과 뮤트(설정 서비스의 `value`). */
  readonly settings: ReadonlySignal<Settings>;
  readonly logger: Logger;
}

export function createAudio({ bridge, resources, data, settings, logger }: AudioOptions): Audio {
  // shortcut: 클립은 처음 쓸 때 불러와 앱이 끝날 때까지 쥔다(지금 모두 합쳐 0.5MB). 소리가 많아지면 화면의
  // 스코프에 묶는다. 재시작하면 C#이 모두 놓는다.
  const clips = new Map<string, Promise<AssetHandle>>();
  // 지금 틀어 달라고 한 BGM. 불러오는 사이 바뀌거나 스코프가 닫혔으면 늦게 온 클립은 틀지 않는다.
  let bgm: { readonly row: SoundsRow; clip?: AssetHandle } | undefined;

  const volume = (channel: SoundChannel, row: SoundsRow, { volume, muted } = settings.value): number =>
    muted[channel] ? 0 : volume[channel] * row.volume;

  // 앱이 사는 동안 따라간다.
  settings.subscribe(value => {
    if (bgm?.clip) bridge.setBgmVolume(volume(SoundChannel.Bgm, bgm.row, value));
  });

  function find(key: SoundsId, channel: SoundChannel): SoundsRow | undefined {
    const row = data.sounds.get(key);
    if (row?.channel === channel) return row;
    logger.warn(`There is no ${channel} sound ${key}.`);
    return undefined;
  }

  // 못 불러온 클립은 한 번만 알리고, 그 뒤로는 소리 없이 지나간다.
  function load(row: SoundsRow): Promise<AssetHandle> {
    let clip = clips.get(row.clip);
    if (!clip) {
      clip = resources.load(row.clip);
      clip.catch(error => logger.error(`${row.clip} did not load:`, error));
      clips.set(row.clip, clip);
    }
    return clip;
  }

  return {
    playBgm(key, scope) {
      const row = find(key, SoundChannel.Bgm);
      if (!row) return;
      const playing: { readonly row: SoundsRow; clip?: AssetHandle } = { row };
      bgm = playing;
      scope.add(() => {
        if (bgm !== playing) return;
        bgm = undefined;
        if (playing.clip) bridge.stopBgm();
      });
      load(row).then(clip => {
        if (bgm !== playing) return;
        playing.clip = clip;
        bridge.playBgm(clip, volume(SoundChannel.Bgm, row));
      }, () => {});
    },

    play(key) {
      const row = find(key, SoundChannel.Sfx);
      if (!row) return;
      load(row).then(clip => {
        const level = volume(SoundChannel.Sfx, row);
        if (level > 0) bridge.playSfx(clip, level);
      }, () => {});
    },
  };
}
