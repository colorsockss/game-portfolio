# MMORPG 매뉴얼

mmo의 구조, 규칙, 명령입니다. 소개는 [README.md](README.md)에, 할 일은 [docs/backlog.md](docs/backlog.md)에 있습니다.

## 패킷 정의

- 원본은 `shared/contract/packets.proto`(proto3) 하나입니다. 서버(C#), Unity(C#), Unreal(C++)이 여기서 protoc로 생성한 코드를 씁니다.
  - C#: 루트의 `npm run generate`가 `shared/contract/Contract.csproj`를 빌드해 Grpc.Tools(NuGet 2.85.0)의 protoc로 `generated/Packets.cs`를 만듭니다. Unity는 MSBuild 생성을 쓰지 못하므로 이 파일을 커밋해 Unity와 서버가 함께 쓰고, 런타임은 Google.Protobuf 3.36.2입니다. 프로젝트를 Unity와 같은 조건(.NET Standard 2.1, C# 9, 경고는 오류)으로 컴파일해 생성 코드가 Unity에서도 컴파일되는지 지킵니다. 생성 파일은 고치지 않고 `packets.proto`와 함께 커밋합니다.
  - C++: Unreal 클라이언트(backlog 8)를 시작할 때 그 libprotobuf와 같은 버전의 protoc로 만듭니다.
  - 테스트: `npm run test:mmo`(`Contract.Tests`, xUnit)가 모든 패킷의 길이 구분 왕복, 패킷 번호, 아래 표의 와이어 크기를 확인합니다.
- 주고받는 것은 늘 `Packet` 하나이고, `body`(oneof)의 필드 번호가 패킷 번호입니다. 따로 번호 enum을 두지 않습니다. 기능마다 번호 범위 하나를 씁니다(1–99 세션, 100–199 월드).
- 프레임은 Protobuf의 길이 구분 형식(varint 길이 + `Packet`)입니다. 받는 쪽은 길이가 상한을 넘거나 읽을 수 없는 패킷이면 `KICK_REASON_MALFORMED_PACKET`으로 끊습니다.
- 배포된 필드 번호와 enum 값은 바꾸거나 다시 쓰지 않고, 지운 필드의 번호는 `reserved`로 막습니다.
- 클라이언트는 `Login.protocol_version`에 `PROTOCOL_VERSION_CURRENT`를 싣고, 서버는 자기 값과 다르면 `LOGIN_RESULT_CODE_VERSION_MISMATCH`로 거절합니다. 필드를 더하기만 하면 모르는 쪽이 건너뛰므로 버전을 올리지 않고, 뜻이 바뀌어 옛 클라이언트를 받을 수 없을 때만 올립니다.
- 좌표 `x`, `z`는 1 m를 32칸으로 나눈 `sint32`(맵은 ±1,024 m 안), 방향 `yaw`는 한 바퀴를 256칸으로 나눈 칸 번호입니다. 높이는 보내지 않고 각자 지면에서 구합니다. Protobuf에는 상수가 없어서 단위는 `packets.proto`의 주석이 원본이고, 변환 도우미는 C#(서버·Unity)과 C++(Unreal)에 하나씩 둡니다.
- 위치 되돌림: 서버는 `Move`를 거절하면 `ack`를 1 올린 `PositionReset`을 보내고, 그 `ack`를 실은 `Move`가 올 때까지 옛 `ack`의 `Move`를 버립니다. 되돌림을 받기 전에 보낸 `Move`가 다시 거절되어 되돌림이 이어지지 않게 하려는 것입니다.
- 서버는 한 틱 동안 한 연결로 보낼 패킷을 한 버퍼에 이어 쓰고 한 번에 보냅니다. TCP/IP 머리(약 52바이트)가 패킷마다가 아니라 틱마다 붙습니다.

### 형식을 고른 근거 (2026-11-06)

기준은 보이는 범위에서 움직이는 개체 50명, 20Hz, 틱마다 한 번 보내고 TCP/IP 머리 52바이트입니다. `EntityMoves`의 개체 하나(예: id 1234, x 123.4 m, z −512.5 m, yaw 200°)의 크기와 그 부하가 늘 이어질 때의 송신량입니다. Protobuf 줄은 `Contract.Tests`가 잰 값(개체 하나 15바이트, 50명을 담은 프레임 760바이트)입니다.

| 형식 | 개체 하나 | 클라이언트당 송신 | 동접 1,000명의 월 송신 비용(AWS $0.09/GB) | Hostinger KVM 4(월 16 TB)로 버티는 동접 |
| --- | --- | --- | --- | --- |
| 직접 만든 고정 크기(지운 안) | 9B | 10,240 B/s | 약 $2,400 | 약 590명 |
| MessagePack | 12B | 13,220 B/s | 약 $3,100 | 약 460명 |
| **Protobuf** | 15B | 16,240 B/s | 약 $3,800 | 약 375명 |

Protobuf의 15B는 원소 태그·길이 2 + `id` 3 + `x` 3 + `z` 4 + `yaw` 3바이트이고(태그 1바이트 + varint, 좌표는 zigzag), 프레임은 길이 2 + `Packet`의 태그·길이 4 + `tick` 4 + 개체 50 × 15입니다. MessagePack은 같은 값을 인코딩해 잰 값이고, 직접 만든 형식은 고정 크기의 합입니다. 실제 평균은 서버 뼈대(backlog 6)에서 잽니다.

Protobuf를 고른 이유는 언어 중립 표준 정의 하나에서 protoc가 C#과 C++(Unreal)을 만들어 주고, 필드를 더해도 옛 쪽이 건너뛰어 버전을 맞추기 쉽고, 직접 만든 정의 문법과 생성기를 유지하지 않아도 되기 때문입니다. 대가는 개체 하나에 6바이트(송신 +58%)입니다. 이 결정으로 직접 만든 형식(`.def` 문법과 `tools/contract-tool`)은 지웠습니다.

## 명령 (저장소 루트에서)

| 명령 | 설명 |
| --- | --- |
| `npm run generate` | `packets.proto`에서 `generated/Packets.cs`를 다시 만든다(idle의 생성 파일도 함께) |
| `npm run test:mmo` | mmo의 C# 테스트 |
| `npm run check` | 바뀐 곳에 맞는 검사. `mmo/`만 바뀌었으면 생성 파일 검사와 `test:mmo` |
