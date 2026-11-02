import { existsSync, readFileSync } from "node:fs";
import { SoundChannel, loadGameData, type SoundsId } from "@idle/data-schema";
import { signal } from "@preact/signals-core";
import { expect, test, vi } from "vitest";
import { createScope } from "../src/application/scope.js";
import { CHANNELS, DEFAULT_SETTINGS, type Settings } from "../src/application/settings/settings.js";
import { createAudio } from "../src/presentation/audio/audio.js";
import type { AudioBridge } from "../src/presentation/audio/ports.js";
import type { AssetHandle } from "../src/presentation/ui/ports.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));
// 첫 스테이지의 BGM.
const MAIN_BGM = data.stages.get(3001)!.bgm;
const bgm = data.sounds.get(MAIN_BGM)!;
const hit = data.sounds.get("sfx.hit")!;

// 클립은 테스트가 `finish()`를 부를 때 불러와진다. 클립은 경로를 이름으로 가진다.
function setUp(missing: readonly string[] = []) {
  const loads: { key: string; resolve(): void }[] = [];
  const resources = {
    load: vi.fn((key: string) => new Promise<AssetHandle>((resolve, reject) => {
      loads.push({ key, resolve: () => (missing.includes(key) ? reject(new Error("missing")) : resolve({ key, release() {} } as AssetHandle)) });
    })),
  };
  const calls: unknown[][] = [];
  const bridge: AudioBridge = {
    playBgm: (clip, volume) => void calls.push(["playBgm", (clip as unknown as { key: string }).key, volume]),
    setBgmVolume: volume => void calls.push(["setBgmVolume", volume]),
    stopBgm: () => void calls.push(["stopBgm"]),
    playSfx: (clip, volume) => void calls.push(["playSfx", (clip as unknown as { key: string }).key, volume]),
  };
  const settings = signal<Settings>(DEFAULT_SETTINGS);
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const audio = createAudio({ bridge, resources, data, settings, logger });
  return {
    audio, resources, calls, settings, logger,
    /** 기다리는 클립을 모두 불러오고 그 뒤의 일이 끝나기를 기다린다. */
    async finish() {
      for (const load of loads.splice(0)) load.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    },
  };
}

test("background music plays at the table's volume times the channel's, follows the settings and stops with its scope", async () => {
  const t = setUp();
  const scope = createScope();
  t.audio.playBgm(MAIN_BGM, scope);
  await t.finish();
  expect(t.calls).toEqual([["playBgm", bgm.clip, bgm.volume * DEFAULT_SETTINGS.volume.bgm]]);

  t.settings.value = { ...DEFAULT_SETTINGS, volume: { bgm: 0.5, sfx: 1 } };
  t.settings.value = { ...DEFAULT_SETTINGS, muted: { bgm: true, sfx: false } };
  scope.dispose();
  expect(t.calls.slice(1)).toEqual([["setBgmVolume", bgm.volume * 0.5], ["setBgmVolume", 0], ["stopBgm"]]);
});

test("music asked for again before its clip loads plays only the last, and an older scope does not stop it", async () => {
  const t = setUp();
  const first = createScope();
  const second = createScope();
  t.audio.playBgm(MAIN_BGM, first);
  t.audio.playBgm(MAIN_BGM, second);
  first.dispose();
  await t.finish();
  expect(t.calls).toEqual([["playBgm", bgm.clip, expect.any(Number)]]);
  // 스코프가 먼저 닫힌 음악은 틀지 않는다.
  const closed = createScope();
  closed.dispose();
  t.audio.playBgm(MAIN_BGM, closed);
  await t.finish();
  expect(t.calls).toHaveLength(1);
});

test("effects load their clip once, play at their volume and stay silent when muted", async () => {
  const t = setUp();
  t.audio.play("sfx.hit");
  t.audio.play("sfx.hit");
  await t.finish();
  expect(t.resources.load).toHaveBeenCalledOnce();
  expect(t.calls).toEqual([["playSfx", hit.clip, hit.volume], ["playSfx", hit.clip, hit.volume]]);
  t.settings.value = { ...DEFAULT_SETTINGS, muted: { bgm: false, sfx: true } };
  t.audio.play("sfx.hit");
  await t.finish();
  expect(t.calls).toHaveLength(2);
});

test("unknown keys, keys of the other channel and missing clips are reported once and make no sound", async () => {
  const t = setUp([hit.clip]);
  t.audio.play("sfx.none" as SoundsId);
  t.audio.play(MAIN_BGM);
  t.audio.playBgm("sfx.hit", createScope());
  expect(t.logger.warn).toHaveBeenCalledTimes(3);
  t.audio.play("sfx.hit");
  t.audio.play("sfx.hit");
  await t.finish();
  expect(t.logger.error).toHaveBeenCalledOnce();
  expect(t.calls).toEqual([]);
});

test("every sound in the table is on a known channel and has its clip in the remote content", () => {
  expect(bgm.channel).toBe("bgm");
  for (const row of data.sounds.values()) {
    expect(CHANNELS).toContain(row.channel);
    expect(existsSync(new URL(`../../Assets/Remote/${row.clip}.wav`, import.meta.url)), row.clip).toBe(true);
  }
});

// 변환은 소리 키가 Sounds에 있는지만 본다. 채널이 틀리면 오디오가 경고하고 소리를 내지 않는다.
test("the shipped stages pick a background music, and Constants and skills pick effects", () => {
  for (const stage of data.stages.values()) expect(data.sounds.get(stage.bgm)?.channel, `stage ${stage.id}`).toBe(SoundChannel.Bgm);
  const { hitSfx, critSfx, killSfx, bossSfx, clearSfx, levelUpSfx, clickSfx } = data.constants;
  for (const key of [hitSfx, critSfx, killSfx, bossSfx, clearSfx, levelUpSfx, clickSfx]) expect(data.sounds.get(key)?.channel, key).toBe(SoundChannel.Sfx);
  for (const skill of data.skills.values()) if (skill.sfx) expect(data.sounds.get(skill.sfx)?.channel, `skill ${skill.id}`).toBe(SoundChannel.Sfx);
});
