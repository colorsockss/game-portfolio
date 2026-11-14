// 생성된 Enchants.pb.cc를 이 모듈에서 컴파일한다(Protocol/Packets.cpp와 같은 까닭과 방법). protoc의 .pb.cc는 파일 안의 정적 이름이
// 같아 한 파일에 둘을 넣을 수 없으므로 생성 파일마다 감싸는 파일을 하나씩 둔다(모듈의 유니티 빌드도 꺼 둠. PortfolioMmo.Build.cs).
#include "Data/MmoDataTables.h"

#pragma push_macro("verify")
#pragma push_macro("check")
#undef verify
#undef check
#include "Enchants.pb.cc"
#pragma pop_macro("check")
#pragma pop_macro("verify")
