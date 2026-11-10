#pragma once

// 생성된 packets.pb.h는 이 헤더로만 include한다. UE의 verify·check 매크로가 abseil의 멤버 함수(btree의 verify() 등)와
// 이름이 부딪히므로 그동안만 치운다. 표준 pragma라 UE 없이 컴파일해도 그대로 된다.
#pragma push_macro("verify")
#pragma push_macro("check")
#undef verify
#undef check
#include "packets.pb.h"
#pragma pop_macro("check")
#pragma pop_macro("verify")
