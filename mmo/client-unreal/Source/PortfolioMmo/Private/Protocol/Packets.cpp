// 생성된 packets.pb.cc를 이 모듈에서 컴파일한다. UBT는 모듈 폴더 밖의 소스를 컴파일하지 않으므로 include로 가져온다.
// .cc가 더 include하는 protobuf 헤더도 UE 매크로와 부딪히므로 MmoPackets.h와 같이 그동안 치운다.
#include "Protocol/MmoPackets.h"

#pragma push_macro("verify")
#pragma push_macro("check")
#undef verify
#undef check
#include "packets.pb.cc"
#pragma pop_macro("check")
#pragma pop_macro("verify")
