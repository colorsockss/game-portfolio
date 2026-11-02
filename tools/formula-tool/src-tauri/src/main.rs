// 릴리스 빌드에서 Windows에 콘솔 창이 추가로 뜨는 것을 막는다. 지우지 말 것!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    bf_scaffold_lib::run()
}
