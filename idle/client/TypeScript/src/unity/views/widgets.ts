import type { ConfirmViewModel } from "../../presentation/widgets/confirm.js";
import type { Currency, CurrencyBarViewModel } from "../../presentation/widgets/currency.js";
import type { LoadingViewModel } from "../../presentation/widgets/loading.js";
import type { RewardViewModel } from "../../presentation/widgets/reward.js";
import type { ToastViewModel } from "../../presentation/widgets/toast.js";
import { bigNumber, button, icon, label, list, text, toast, view } from "../binding/view.js";

// 공용 위젯의 뷰. 프리팹은 Tools/UI/Build Widget Prefabs(Assets/Editor/UI/WidgetPrefabs.cs)가 만든다.

export const confirmView = view<ConfirmViewModel>("UI/ConfirmPopup", {
  messageText: text(vm => vm.message),
  okButton: button(vm => vm.ok()),
  cancelButton: button(vm => vm.cancel()),
  okLabel: label("common.ok"),
  cancelLabel: label("common.cancel"),
}, "popup");

export const rewardView = view<RewardViewModel>("UI/RewardPopup", {
  durationText: text(vm => vm.duration),
  levelText: text(vm => vm.level),
  itemsText: text(vm => vm.items),
  okButton: button(vm => vm.close()),
  titleLabel: label("reward.title"),
  okLabel: label("reward.claim"),
}, "popup");

export const toastView = view<ToastViewModel>("UI/Toast", {
  toast: toast(vm => vm.notices),
}, "overlay");

export const loadingView = view<LoadingViewModel>("UI/Loading", {
  messageText: text(vm => vm.message),
}, "overlay");

/** 재화 바의 한 칸. 재화 바의 ViewList가 틀로 복제한다. */
export const currencyView = view<Currency>("UI/CurrencySlot", {
  nameText: text(vm => vm.name),
  icon: icon(vm => vm.icon),
  amountText: bigNumber(vm => vm.amount),
});

/** 다른 화면의 프리팹에 중첩해 `nested`로 바인딩한다(메인 화면 위쪽 막대). */
export const currencyBarView = view<CurrencyBarViewModel>("UI/CurrencyBar", {
  currencies: list(vm => vm.currencies, currencyView),
});
