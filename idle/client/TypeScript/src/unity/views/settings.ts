import type { ChannelSettings, SettingsViewModel } from "../../presentation/view-models/settings.js";
import { button, label, list, slider, tabBar, text, toggle, view } from "../binding/view.js";

// 프리팹은 Tools/UI/Build Settings Prefabs(Assets/Editor/UI/SettingsPrefabs.cs)가 만든다.

/** 채널 한 줄. 설정 화면의 ViewList가 틀로 복제한다. 끄는 동안은 바로 듣고, 놓을 때 저장한다. */
export const channelSettingsView = view<ChannelSettings>("UI/SettingsChannel", {
  nameText: text(vm => vm.name),
  volumeSlider: slider(vm => vm.volume, (vm, volume) => vm.previewVolume(volume), (vm, volume) => vm.setVolume(volume)),
  muteToggle: toggle(vm => vm.muted, (vm, muted) => vm.setMuted(muted)),
  muteLabel: label("settings.mute"),
});

export const settingsView = view<SettingsViewModel>("UI/SettingsScreen", {
  channels: list(vm => vm.channels, channelSettingsView),
  frameRates: tabBar(vm => vm.frameRates),
  languages: tabBar(vm => vm.languages),
  logoutButton: button(vm => vm.logout()),
  closeButton: button(vm => vm.close()),
  titleLabel: label("menu.settings"),
  logoutLabel: label("menu.logout"),
  frameRateLabel: label("settings.frameRate"),
  languageLabel: label("settings.language"),
}, "popup");
