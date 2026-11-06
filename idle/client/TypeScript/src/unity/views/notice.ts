import type { ConfirmViewModel, NoticeViewModel } from "../../presentation/widgets/confirm.js";
import { button, label, text, view } from "../binding/view.js";

// 부트의 알림 팝업. 프리팹은 Tools/UI/Build Widget Prefabs(Assets/Editor/UI/WidgetPrefabs.cs)가 앱에 드는 Resources에
// 만든다. 부트에는 전환 화면 아래에 화면이 없으므로 전환 화면과 같은 오버레이에 그 위로 연다.
export const noticeView = view<NoticeViewModel>("UI/NoticePopup", {
  messageText: text(vm => vm.message),
  okButton: button(vm => vm.ok()),
  okLabel: label("common.ok"),
}, "overlay");

// 부트의 확인 팝업(새 앱의 설치 페이지를 열지 물음). 게임의 confirmView와 같은 프리팹을 알림 팝업처럼 오버레이에 연다.
export const bootConfirmView = view<ConfirmViewModel>("UI/ConfirmPopup", {
  messageText: text(vm => vm.message),
  okButton: button(vm => vm.ok()),
  cancelButton: button(vm => vm.cancel()),
  okLabel: label("common.ok"),
  cancelLabel: label("common.cancel"),
}, "overlay");
