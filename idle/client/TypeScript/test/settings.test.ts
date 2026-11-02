import { readFileSync } from "node:fs";
import { loadGameData, SoundChannel } from "@idle/data-schema";
import { expect, test, vi } from "vitest";
import type { DeviceStorage } from "../src/application/ports.js";
import { DEFAULT_SETTINGS, SETTINGS_KEY, createSettings } from "../src/application/settings/settings.js";
import { languageNames } from "../src/presentation/text.js";
import { createSettingsViewModel } from "../src/presentation/view-models/settings.js";
import { texts } from "./support/text.js";

const data = await loadGameData(table => readFileSync(new URL(`../../../shared/data-schema/data/${table}.bytes`, import.meta.url)));

function setUp(saved?: string, device = "ko") {
  const values = new Map<string, string>(saved === undefined ? [] : [[SETTINGS_KEY, saved]]);
  const storage: DeviceStorage = {
    get: key => values.get(key) ?? null,
    set: vi.fn((key: string, value: string) => void values.set(key, value)),
    delete: key => void values.delete(key),
  };
  const display = { setFrameRate: vi.fn(), language: () => device };
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const settings = createSettings({ storage, display, languages: ["ko", "en"], logger });
  return { settings, storage, display, logger, saved: () => JSON.parse(values.get(SETTINGS_KEY)!) };
}

test("settings start from the defaults on a new device and apply the frame rate", () => {
  const t = setUp();
  expect(t.settings.value.value).toEqual(DEFAULT_SETTINGS);
  expect(t.display.setFrameRate).toHaveBeenCalledExactlyOnceWith(60);
  expect(t.storage.set).not.toHaveBeenCalled();
});

test("saved settings keep each valid field and fall back field by field", () => {
  const t = setUp(JSON.stringify({ volume: { bgm: 0.2, sfx: 3 }, muted: { sfx: true }, frameRate: 45, extra: 1 }));
  expect(t.settings.value.value).toEqual({ volume: { bgm: 0.2, sfx: 1 }, muted: { bgm: false, sfx: true }, frameRate: 60, language: "ko" });

  const broken = setUp("{");
  expect(broken.settings.value.value).toEqual(DEFAULT_SETTINGS);
  expect(broken.logger.warn).toHaveBeenCalledOnce();
  expect(setUp("null").settings.value.value).toEqual(DEFAULT_SETTINGS);
});

test("changes are saved at once as one JSON value, and unchanged ones are not written", () => {
  const t = setUp();
  t.settings.setVolume(SoundChannel.Bgm, 0.5);
  t.settings.setMuted(SoundChannel.Sfx, true);
  t.settings.setFrameRate(30);
  t.settings.setLanguage("en");
  expect(t.saved()).toEqual({ volume: { bgm: 0.5, sfx: 1 }, muted: { bgm: false, sfx: true }, frameRate: 30, language: "en" });
  expect(t.display.setFrameRate).toHaveBeenLastCalledWith(30);
  expect(t.storage.set).toHaveBeenCalledTimes(4);

  t.settings.setVolume(SoundChannel.Bgm, 0.5);
  t.settings.setMuted(SoundChannel.Sfx, true);
  t.settings.setFrameRate(30);
  t.settings.setLanguage("en");
  expect(t.storage.set).toHaveBeenCalledTimes(4);
  expect(t.display.setFrameRate).toHaveBeenCalledTimes(2);

  t.settings.setVolume(SoundChannel.Sfx, -1);
  expect(t.settings.value.value.volume.sfx).toBe(0);
  // 다음 실행은 저장한 값에서 시작한다.
  expect(setUp(JSON.stringify(t.saved())).settings.value.value).toEqual(t.settings.value.value);
});

test("a previewed volume changes at once but is saved only with the next change", () => {
  const t = setUp();
  t.settings.previewVolume(SoundChannel.Bgm, 0.3);
  t.settings.previewVolume(SoundChannel.Bgm, 2);
  expect(t.settings.value.value.volume.bgm).toBe(1);
  expect(t.storage.set).not.toHaveBeenCalled();

  // 놓을 때 같은 값으로 setVolume이 오면, 값은 그대로라도 저장한다.
  t.settings.setVolume(SoundChannel.Bgm, 1);
  expect(t.storage.set).toHaveBeenCalledOnce();
  t.settings.setVolume(SoundChannel.Bgm, 1);
  expect(t.storage.set).toHaveBeenCalledOnce();

  // 다른 변경은 미리 들은 볼륨도 함께 저장한다.
  t.settings.previewVolume(SoundChannel.Sfx, 0.2);
  t.settings.setMuted(SoundChannel.Bgm, true);
  expect(t.saved()).toEqual({ volume: { bgm: 1, sfx: 0.2 }, muted: { bgm: true, sfx: false }, frameRate: 60, language: "ko" });
});

test("the language starts as the device's when the game has it, else Korean, and a saved one wins while it is still offered", () => {
  expect(setUp(undefined, "en").settings.value.value.language).toBe("en");
  expect(setUp(undefined, "ja").settings.value.value.language).toBe("ko");
  expect(setUp(undefined, "").settings.value.value.language).toBe("ko");
  expect(setUp(JSON.stringify({ language: "ko" }), "en").settings.value.value.language).toBe("ko");
  // 더는 없는 언어나 틀린 값은 그 필드만 기본값(기기 언어)이다.
  expect(setUp(JSON.stringify({ language: "fr", frameRate: 30 }), "en").settings.value.value).toMatchObject({ language: "en", frameRate: 30 });
});

test("the settings view model shows each channel in order and changes it, keeping the volume through a mute", () => {
  const { settings } = setUp();
  const close = vi.fn();
  const vm = createSettingsViewModel({
    settings, t: texts(data).t, languageNames: languageNames(data.strings), account: { logout: vi.fn() }, confirm: async () => true, close,
  });
  const [bgm, sfx] = vm.channels;
  expect(vm.channels.map(channel => channel.name.value)).toEqual(["배경음", "효과음"]);
  bgm.setVolume(0.4);
  bgm.setMuted(true);
  expect([bgm.volume.value, bgm.muted.value, sfx.muted.value]).toEqual([0.4, true, false]);
  bgm.setMuted(false);
  expect([bgm.volume.value, bgm.muted.value]).toEqual([0.4, false]);

  expect(vm.frameRates.tabs.map(tab => tab.label.value)).toEqual(["30 FPS", "60 FPS"]);
  expect(vm.frameRates.selected.value).toBe(60);
  vm.frameRates.select(30);
  expect([vm.frameRates.selected.value, settings.value.value.frameRate]).toEqual([30, 30]);
  expect(vm.languages.tabs.map(tab => [tab.key, tab.label.value])).toEqual([["ko", "한국어"], ["en", "English"]]);
  vm.languages.select("en");
  expect([vm.languages.selected.value, settings.value.value.language]).toEqual(["en", "en"]);
  vm.close();
  expect(close).toHaveBeenCalledOnce();
});
