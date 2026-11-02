import type { LoginViewModel } from "../../presentation/view-models/login.js";
import { button, input, label, text, view } from "../binding/view.js";

export const loginView = view<LoginViewModel>("UI/LoginScreen", {
  idInput: input(vm => vm.loginId),
  loginButton: button(vm => vm.login(), { enabled: vm => vm.canLogin }),
  statusText: text(vm => vm.status),
  // 손으로 만든 프리팹의 고정 글자. 항목은 Widget 빌더가 넣는다.
  titleLabel: label("login.title"),
  loginLabel: label("login.button"),
  idPlaceholder: label("login.idPlaceholder"),
});
