#pragma once

// 생성된 기획 데이터의 C++(mmo/shared/data/generated/)은 이 헤더로만 include한다. MmoPackets.h처럼 UE의 verify·check 매크로를
// 그동안만 치운다. 테이블을 더하는 항목이 여기에 그 테이블의 헤더를, Private/Data/에 그 .pb.cc를 감싸는 Data<테이블>.cpp를 더한다.
#pragma push_macro("verify")
#pragma push_macro("check")
#undef verify
#undef check
#include "Constants.pb.h"
#include "Zones.pb.h"
#pragma pop_macro("check")
#pragma pop_macro("verify")
