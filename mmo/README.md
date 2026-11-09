# MMORPG (mmo)

**준비 중입니다.** 패킷 정의(`shared/contract/packets.proto`)와 서버 뼈대(로그인, 20Hz 틱, 이동 검증, 시야, SQLite 저장)가 있고([MANUAL.md](MANUAL.md)), 클라이언트는 아직 없습니다.

틱마다 이동과 전투를 계산해 주변 플레이어에게 보내는 상태 서버 하나에 Unity와 Unreal 클라이언트가 함께 붙는 MMORPG를 만듭니다. 두 클라이언트는 같은 Protobuf 정의에서 생성한 코드(Unity는 C#, Unreal은 C++)로 같은 조건에서 서버에 붙습니다. Unity 클라이언트를 먼저 다 만들고, Unreal 클라이언트는 그것을 C++과 UMG로 옮겨(포팅) 만듭니다.

## 계획

| 부분 | 기술 |
| --- | --- |
| 서버 | C#(.NET 10). 틱 루프, 시야(AOI), 이동 검증, SQLite 저장 |
| Unity 클라이언트 | C#만(PuerTS 없음), UI Toolkit + [App UI](https://docs.unity3d.com/Packages/com.unity.dt.app-ui@latest) |
| Unreal 클라이언트 | C++, UMG |
| 통신 | TCP 위의 Protobuf(길이 구분 형식). `packets.proto` 하나에서 protoc로 C#(서버·Unity)과 C++(Unreal) 생성 |
| 데이터 | 저장소 루트의 [데이터 툴](../tools/data-tool/README.md)과 [공식 툴](../tools/formula-tool/README.md)에 C#·C++ 출력을 더해 사용 |
