import type { NoticeViewModel } from "../../presentation/widgets/confirm.js";
import { button, label, text, view } from "../binding/view.js";

// 부트의 알림 팝업. 프리팹은 Tools/UI/Build Widget Prefabs(Assets/Editor/UI/WidgetPrefabs.cs)가 앱에 드는 Resources에
// 만든다. 부트에는 전환 화면 아래에 화면이 없으므로 전환 화면과 같은 오버레이에 그 위로 연다.
export const noticeView = view<NoticeViewModel>("UI/NoticePopup", {
  messageText: text(vm => vm.message),
  okButton: button(vm => vm.ok()),
  okLabel: label("common.ok"),
}, "overlay");
