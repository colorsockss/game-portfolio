# MMORPG 매뉴얼

mmo의 구조, 규칙, 명령입니다. 소개는 [README.md](README.md)에, 만들 게임의 설계는 [docs/design.md](docs/design.md)에, 할 일은 [docs/backlog.md](docs/backlog.md)에 있습니다.

## 패킷 정의

- 원본은 `shared/contract/packets.proto`(proto3) 하나입니다. 서버(C#), Unity(C#), Unreal(C++)이 여기서 protoc로 생성한 코드를 씁니다.
  - 생성: 루트의 `npm run generate`가 `shared/contract/Contract.csproj`를 빌드하고, 그 빌드가 Google.Protobuf.Tools(NuGet 3.36.2)의 protoc 하나로 C#(`generated/Packets.cs`)과 C++(`generated/packets.pb.h`, `packets.pb.cc`)을 함께 만듭니다. 두 엔진 모두 MSBuild 생성을 쓰지 못하므로 생성 파일을 커밋해 서버, Unity, Unreal이 함께 씁니다. macOS용 protoc는 x86_64뿐이라 Apple Silicon에서는 Rosetta로 돕니다.
  - 버전: protoc, C# 런타임(Google.Protobuf), Unreal의 libprotobuf는 모두 36.2입니다(2026-11-09). C++ 생성 코드는 런타임과 버전이 다르면 컴파일되지 않으므로 셋을 함께 올립니다. 35.1에서 36.2로 바꿀 때 C# 생성 코드는 한 글자도 바뀌지 않았습니다.
  - Unity 조건: 프로젝트를 Unity와 같은 조건(.NET Standard 2.1, C# 9, 경고는 오류)으로 컴파일해 생성 코드가 Unity에서도 컴파일되는지 지킵니다. 생성 파일은 고치지 않고 `packets.proto`와 함께 커밋합니다.
  - 테스트: `npm run test:mmo`(`Contract.Tests`, xUnit)가 모든 패킷의 길이 구분 왕복, 패킷 번호, 아래 표의 와이어 크기를 확인합니다.
- 주고받는 것은 늘 `Packet` 하나이고, `body`(oneof)의 필드 번호가 패킷 번호입니다. 따로 번호 enum을 두지 않습니다. 기능마다 번호 범위 하나를 씁니다(1–99 세션, 100–199 월드).
- 프레임은 Protobuf의 길이 구분 형식(varint 길이 + `Packet`)입니다. 받는 쪽은 길이가 상한을 넘거나 읽을 수 없는 패킷이면 `KICK_REASON_MALFORMED_PACKET`으로 끊습니다.
- 배포된 필드 번호와 enum 값은 바꾸거나 다시 쓰지 않고, 지운 필드의 번호는 `reserved`로 막습니다.
- 클라이언트는 `Login.protocol_version`에 `PROTOCOL_VERSION_CURRENT`를 싣고, 서버는 자기 값과 다르면 `LOGIN_RESULT_CODE_VERSION_MISMATCH`로 거절합니다. 필드를 더하기만 하면 모르는 쪽이 건너뛰므로 버전을 올리지 않고, 뜻이 바뀌어 옛 클라이언트를 받을 수 없을 때만 올립니다.
- 좌표 `x`, `z`는 1 m를 32칸으로 나눈 `sint32`(맵은 ±1,024 m 안), 방향 `yaw`는 한 바퀴를 256칸으로 나눈 칸 번호입니다. 높이는 보내지 않고 각자 지면에서 구합니다.
- 축과 방향: 위에서 볼 때 `+z`가 앞(북), `+x`가 오른쪽(동)입니다. `yaw` 0이 `+z`를 보고 시계 방향으로 늡니다(64가 `+x`). 서버는 방향을 전달만 하므로 두 클라이언트가 이 규약으로 맞춥니다. Unity는 `x`, `z`와 Y축 회전에 그대로 쓰고, Unreal은 `z`를 X(앞), `x`를 Y(오른쪽)에 쓰며 `yaw`는 같은 방향입니다.
- 함께 쓰는 수(1 m의 칸 수, 맵 반 너비, yaw 칸 수, 초당 틱 수, 최대 속도, Ping 간격, 무응답 시간 제한)는 `packets.proto`의 `Constant` enum 값이 원본입니다. Protobuf에는 상수가 없어서 enum 값으로 두고, C#과 C++이 함께 생성됩니다. `shared/contract/Units.cs`는 그 값에 C#에서 쓰기 좋은 형으로 이름만 붙입니다.
- 끊긴 연결: 클라이언트는 5초마다 `Ping`을 보내고 서버는 그 틱에 `Pong`으로 답합니다. `Pong`과 `LoginResult`에는 서버의 지금 틱 번호(`EntityMoves.tick`과 같은 수)가 실려, 주변에서 아무도 움직이지 않아도 클라이언트가 서버 시계를 맞춥니다. 어느 쪽이든 15초 동안 아무것도 받지 못하면 연결이 죽었다고 보고 끊습니다(서버는 `KICK_REASON_IDLE_TIMEOUT`). TCP는 망이 바뀐 휴대폰이나 멈춘 앱의 끊김을 몇 분 동안 알려 주지 않기 때문입니다. `Ping` 프레임은 3바이트이고 TCP/IP 머리 52바이트를 더해 연결 하나에 약 11 B/s(1,000명에 11 KB/s)이며, `Pong`은 그 틱의 버퍼에 함께 실립니다.
- 위치 되돌림: 서버는 `Move`를 거절하면 `ack`를 1 올린 `PositionReset`을 보내고, 그 `ack`를 실은 `Move`가 올 때까지 옛 `ack`의 `Move`를 버립니다. 되돌림을 받기 전에 보낸 `Move`가 다시 거절되어 되돌림이 이어지지 않게 하려는 것입니다.
- 서버는 한 틱 동안 한 연결로 보낼 패킷을 한 버퍼에 이어 쓰고 한 번에 보냅니다. TCP/IP 머리(약 52바이트)가 패킷마다가 아니라 틱마다 붙습니다.

### 형식을 고른 근거 (2026-11-06)

기준은 보이는 범위에서 움직이는 개체 50명, 20Hz, 틱마다 한 번 보내고 TCP/IP 머리 52바이트입니다. `EntityMoves`의 개체 하나(예: id 1234, x 123.4 m, z −512.5 m, yaw 200°)의 크기와 그 부하가 늘 이어질 때의 송신량입니다. Protobuf 줄은 `Contract.Tests`가 잰 값(개체 하나 15바이트, 50명을 담은 프레임 760바이트)입니다.

| 형식 | 개체 하나 | 클라이언트당 송신 | 동접 1,000명의 월 송신 비용(AWS $0.09/GB) | Hostinger KVM 4(월 16 TB)로 버티는 동접 |
| --- | --- | --- | --- | --- |
| 직접 만든 고정 크기(지운 안) | 9B | 10,240 B/s | 약 $2,400 | 약 590명 |
| MessagePack | 12B | 13,220 B/s | 약 $3,100 | 약 460명 |
| **Protobuf** | 15B | 16,240 B/s | 약 $3,800 | 약 375명 |

Protobuf의 15B는 원소 태그·길이 2 + `id` 3 + `x` 3 + `z` 4 + `yaw` 3바이트이고(태그 1바이트 + varint, 좌표는 zigzag), 프레임은 길이 2 + `Packet`의 태그·길이 4 + `tick` 4 + 개체 50 × 15입니다. MessagePack은 같은 값을 인코딩해 잰 값이고, 직접 만든 형식은 고정 크기의 합입니다. 서버 뼈대로 잰 실제 값은 [부하 측정](#부하-측정-2026-11-06)에 있습니다.

Protobuf를 고른 이유는 언어 중립 표준 정의 하나에서 protoc가 C#과 C++(Unreal)을 만들어 주고, 필드를 더해도 옛 쪽이 건너뛰어 버전을 맞추기 쉽고, 직접 만든 정의 문법과 생성기를 유지하지 않아도 되기 때문입니다. 대가는 개체 하나에 6바이트(송신 +58%)입니다. 이 결정으로 직접 만든 형식(`.def` 문법과 `tools/contract-tool`)은 지웠습니다.

## 서버

`server/src/`(.NET 10 콘솔 앱)입니다.

- **스레드**: 20Hz 틱 루프 하나만 월드(`World`)를 읽고 고칩니다. 연결마다 받기·보내기 작업이 있지만, 받기는 읽은 패킷을 큐에 넣기만 하고 보내기는 틱이 만든 버퍼를 보내기만 합니다. 그래서 잠금이 없고, 같은 ID의 두 연결도 틱 안에서 차례로 처리됩니다.
- **틱**: 큐 처리(연결, 로그인, `Move`, 끊김) → `World.Step`(플레이어마다 시야를 지난 틱과 비교해 `EntitiesLeave` → `EntitiesEnter` → `EntityMoves`) → 연결마다 이번 틱의 패킷을 한 버퍼로 보내기.
- **로그인**: 프로토콜 버전 → ID 형식(영문 소문자·숫자·밑줄 4–16자) → 동시 접속 상한 순으로 검사하고, 실패하면 `LoginResult`를 보낸 뒤 끊습니다. 같은 ID가 이미 있으면 예전 연결을 `KICK_REASON_DUPLICATE_LOGIN`으로 끊고, 새 연결이 그 자리에서 새 개체 번호로 이어 갑니다(상한이 가득 차도 자리를 넘겨받습니다). 연결하고 10초 안에 로그인하지 않으면 끊고, 로그인 전이든 뒤든 15초 동안 아무 패킷도 오지 않으면 `KICK_REASON_IDLE_TIMEOUT`으로 끊습니다. 저장한 위치에서 시작하고, 저장한 적이 없는 ID는 `--spawn-half-extent` 안의 무작위 위치에서 시작합니다.
- **이동 검증**: 최대 속도는 6 m/s입니다(데이터가 생기기 전까지 `packets.proto`의 `Constant`). 틱마다 최대 속도의 1.1배(클라이언트 시계 오차의 여유)만큼 이동 거리가 차오르고 1초 치까지 쌓이며, 받아들인 `Move`가 그 거리를 씁니다. TCP가 1초까지 몰아서 전한 `Move`는 받아 주고, 더 먼 `Move`나 맵 밖으로 가는 `Move`는 `PositionReset`으로 되돌립니다. `yaw`가 256 이상이면 `KICK_REASON_MALFORMED_PACKET`입니다.
- **시야**: 맵을 32 m 칸으로 나누고 둘레 3×3칸(96 m 사방)의 개체가 보입니다. 내 개체는 로그인한 틱의 `EntitiesEnter`에만 들어가고 `EntityMoves`에는 들어가지 않습니다.
- **보내기**: 버퍼를 2초(40틱) 넘게 보내지 못하고 쌓이면 클라이언트가 따라오지 못하는 것으로 보고 끊습니다. 클라이언트가 보내는 패킷의 길이 상한은 256바이트입니다. 끊을 때는 남은 패킷을 보내고 FIN을 보낸 뒤 상대가 닫기를 5초까지 기다립니다.
- **저장**: 마지막 위치(`x`, `z`, `yaw`)를 SQLite(`Microsoft.Data.Sqlite`, `--database`, 기본은 작업 디렉터리의 `mmo.sqlite`)의 `players` 테이블에 로그인 ID별로 둡니다. 나간 플레이어(끊김, 강제 종료, 같은 ID의 재로그인)는 그 틱 끝에, 접속 중인 플레이어는 움직였으면 60초마다, 서버가 내려갈 때는 모두를 저장합니다. 한 번의 저장은 한 트랜잭션입니다. 틱 스레드에서 동기로 읽고 쓰므로 저장과 로그인이 엇갈리지 않고, 저장하기 전에 다시 들어오면 메모리의 위치에서 이어 갑니다. 저장이 실패하면 로그를 남기고 위치를 메모리에 둔 채 다음 틱(나간 플레이어)이나 다음 주기(접속 중인 플레이어)에 다시 씁니다. 서버 프로세스가 죽으면 마지막 주기 뒤의 이동(최대 60초)을 잃습니다. 커밋마다 fsync를 기다리지 않게 WAL과 `synchronous = NORMAL`이라, 전원이 나가면 마지막 커밋을 잃을 수 있지만 파일은 깨지지 않습니다. 스키마는 단계 목록과 `PRAGMA user_version`으로 올립니다(idle 서버와 같은 방식).
- **종료**: SIGINT·SIGTERM을 받으면 모두에게 `KICK_REASON_SERVER_SHUTDOWN`을 보내고, 위치를 저장하고 내려갑니다.
- **로그**: 10초마다 플레이어 수, 평균 시야 개체 수, 틱 시간(평균·최대), 송신량, CPU, 메모리, 할당량을 찍습니다.
- **테스트**: `server/test/`가 월드 규칙과 저장을 소켓 없이(SQLite는 `:memory:`와 임시 파일), 프레임·로그인·끊기·종료를 루프백 TCP로 확인합니다.
- **Live**: 키우기와 같은 Hostinger VPS에서 서비스 `mmo-server`(systemd)가 `mmo.dennou.cloud:7777`(TCP, 모든 인터페이스. Caddy를 거치지 않음)로 받습니다. 데이터는 `/srv/mmo/data/mmo.sqlite`, 릴리스는 `/srv/mmo/server/releases/<커밋>/`이고 `current` 링크가 지금 것을 가리킵니다.
  - 준비: `server/deploy/setup.sh`를 VPS에서 root로 한 번 돌립니다(폴더, 서비스, `deploy`가 그 서비스만 다시 시작하는 sudo 한 줄, ufw가 켜져 있으면 7777 열기). 배포 사용자 `deploy`와 SSH 키는 키우기의 것을 함께 쓰므로 키우기 준비가 먼저입니다. 서비스는 `Restart=always`(프로세스가 끝나면 다시 띄움)이고, 내려갈 때 위치를 저장하도록 `TimeoutStopSec=30`으로 기다립니다. DNS의 `mmo.dennou.cloud` A 레코드와 Hostinger 패널의 방화벽(쓴다면)은 손으로 맞춥니다.
  - 내보내기: GitHub Actions의 `mmo server`(손으로 실행)가 `test:mmo`를 돌리고, VPS의 CPU(`uname -m`)에 맞춰 .NET 런타임을 함께 실은 빌드(`dotnet publish --self-contained`, 약 81 MB)를 만들어 `server/deploy/deploy.sh`로 올립니다. VPS에 .NET을 설치하지 않으려는 것입니다. `deploy.sh`는 커밋마다 릴리스를 임시 이름에 올린 뒤 이름을 바꾸고, `current`를 한 번에 바꿔 다시 시작한 뒤 바깥에서 7777로 `Ping`을 보내 `Pong`이 오는지 봅니다(`server/deploy/check.mjs`). 이미 올린 커밋이면 올리기 없이 그 릴리스로 돌아가고(롤백), 가장 최근 릴리스 5개만 남깁니다. 다시 시작하면 접속한 플레이어는 `SERVER_SHUTDOWN`을 받고 끊깁니다.
  - 비밀값: 키우기와 같은 `secrets.VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `vars.VPS_HOST`, `VPS_USER`를 씁니다. 새로 더할 것이 없습니다.

### 부하 측정 (2026-11-06)

`server/tools/load-test`의 봇이 정사각형 안을 틱마다 최대 속도로 걷습니다(모든 개체가 매 틱 움직이는 최악의 경우). 봇이 보는 개체가 [형식을 고른 근거](#형식을-고른-근거-2026-11-06)의 기준(50명)과 비슷하도록 봇 수에 맞춰 정사각형 크기를 정했습니다. 서버와 봇을 한 Mac(Apple M4 Max, 14코어)에서 루프백으로 돌린 Release 빌드이고, 봇이 들어온 뒤 10초 단위 구간의 값입니다(첫 구간은 로그인과 JIT로 최대 틱이 67–73 ms).

| 봇 | 정사각형 | 평균 시야 | 틱 평균(최대) | 서버 CPU | 클라이언트당 송신 | 작업 집합(힙) | 할당 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1,000 | ±200 m | 54.5명 | 7.2 ms (10.0 ms) | 1.3코어 | 14,772 B/s | 85 MB (38 MB) | 65 MB/s |
| 2,000 | ±285 m | 55.2명 | 15.4 ms (23.5 ms) | 2.0코어 | 15,354 B/s | 101 MB (69 MB) | 131 MB/s |

- 틱 시간은 플레이어 수에 비례합니다. 2,000명의 틱을 나눠 재면(따로 돌린 14.3 ms 구간) 큐 처리 0.2 ms, 시야 비교 7.0 ms, 직렬화와 보내기 큐 넣기 7.1 ms입니다. 틱 하나의 예산(50 ms)으로 이 Mac에서 약 6,000명까지이고, 그 전에 줄일 곳은 `HashSet`으로 하는 시야 비교와, 직렬화할 때 개체마다 여러 번 도는 `CalculateSize`입니다.
- 2,000명의 위치를 한 트랜잭션으로 저장하는 데 4.8 ms(60초마다 한 틱), 2,000명이 한 틱에 한꺼번에 나갈 때 3.2 ms가 더 걸렸습니다. 데이터베이스 파일은 2,000명에 57 KB입니다.
- 틱 밖의 CPU(1,000명 1.2코어, 2,000명 1.7코어)는 소켓 받기·보내기입니다. 연결마다 초당 받기 20번, 보내기 20번입니다.
- 클라이언트당 송신 15,354 B/s는 개체 하나 평균 약 14바이트입니다. 좌표가 ±285 m 안이라 예시 개체(15바이트)보다 varint가 짧습니다. TCP/IP 머리(틱마다 한 세그먼트, 52 × 20 = 1,040 B/s)를 더하면 16,394 B/s이고, 한 달(30.4일) 43 GB입니다. 동접 1,000명이면 AWS 송신 요금($0.09/GB)으로 월 약 $3,900, Hostinger KVM 4(월 16 TB, 4 vCPU)로는 약 370명입니다.
- 그래서 Hostinger KVM 4에서는 CPU(370명이면 이 Mac 기준 0.5코어 안팎)가 아니라 월 송신량이 동시 접속을 정합니다. VPS의 코어는 이 Mac보다 느리므로 CPU 값은 VPS에서 다시 잽니다.

## Unreal 클라이언트

`client-unreal/`(UE 5.8, C++)입니다. 대상은 Mac과 Android이고, 지금은 Mac에서 로그인해 Field 레벨을 걷고 시야 안의 다른 플레이어가 보간되어 움직이는 데까지 있습니다. 캐릭터는 메시가 들어오기 전(backlog 14)의 자리 표시용 원기둥(나는 파랑, 남은 주황, 앞을 보이는 어두운 코)입니다.

- **시작**: 맵은 `Field`(`/Game/Maps/Field`) 하나이고 로그인 화면도 이 레벨에서 띄워 레벨을 옮기지 않습니다. `AMmoGameMode`는 컨트롤러만 정하고 폰은 처음부터 만들지 않으며, 화면은 화면 관리자가 로그인 화면부터 엽니다. 명령줄의 `-MmoServer=호스트:포트`(기본 `127.0.0.1:7777`)로 서버를 바꾸고, `-MmoLogin=아이디`가 있으면 로그인 화면이 처음 한 번 바로 로그인합니다.
- **에셋**: `Scripts/create_content.py`가 에디터 명령(아래 명령 표)으로 격자 머티리얼(`M_Grid`: 월드 자리에서 1 m마다 가는 선, 10 m마다 굵은 선, 선 굵기는 화면 픽셀 기준), 자리 표시용 머티리얼(`M_Placeholder`: `Color` 파라미터), `Field` 레벨(엔진 평면 2,048 m, 해, 하늘, 하늘빛. 모두 동적 조명)을 만듭니다. 에셋은 손으로 고치지 않고 스크립트를 고쳐 다시 돌립니다(이미 있는 레벨은 열어서 액터를 비우고 다시 놓습니다). 그래서 에디터에만 PythonScriptPlugin을 켭니다. 코드가 경로로만 읽는 에셋(엔진의 기본 도형, `/Game/Materials`)은 레벨이 참조하지 않으므로 `DefaultGame.ini`의 `DirectoriesToAlwaysCook`에 둡니다.
- **좌표**: 패킷 단위 ↔ `FVector`·`FRotator`는 `Game/MmoCoordinates.h` 한 곳에서만 바꿉니다. 패킷의 `z`가 X, `x`가 Y이고 1 m가 100 단위이며, 높이는 0(지면)입니다.
- **내 캐릭터**: `UMmoEntitySubsystem`이 내 개체가 들어오면 `AMmoCharacter`를 만들어 `AMmoPlayerController`에 붙입니다. 이동 컴포넌트의 최대 속도는 서버와 같은 6 m/s이고 움직이는 쪽을 봅니다. 컨트롤러가 Enhanced Input(액션과 매핑은 에셋 없이 C++로 만듦)으로 WASD를 카메라 기준으로 받고, 마우스 오른쪽을 누른 동안 마우스로 카메라를 돌리고 휠로 당기며(300–1,500 단위, 내려다보는 각도 5–75°), 터치 기기는 HUD의 가상 조이스틱(아래 화면)으로 걷고, 조이스틱 밖에서 한 손가락으로 돌리고 두 손가락을 벌려 당깁니다. 게임패드는 왼쪽 스틱(`Gamepad_Left2D`)으로 걷습니다. 엔진의 터치 인터페이스는 끕니다(`DefaultInput.ini`의 `DefaultTouchInterface=None`). 터치는 프레임마다 `GetInputTouchState`로 읽는데, 회전 입력은 `Super::PlayerTick` 안에서 적용되고 액터 틱 끝에 지워지므로 그 앞에서 넣습니다. 입력 모드는 `FInputModeGameAndUI`이고 잡는 동안 커서를 감추지 않습니다. 감추면 포인터가 제자리에 묶여 터치의 끄는 자리가 갱신되지 않습니다. Mac에서는 `-faketouches`로 마우스를 터치로 바꿔 시험합니다. 프레임마다 캐릭터의 자리를 `FMoveSender`에 넘겨 `Move`를 보내고, `PositionReset`이 오면 그 자리로 순간 이동합니다. `DefaultInput.ini`에서 옛 입력 배율(`bEnableLegacyInputScales`)을 꺼 `AddYawInput`의 값이 곧 각도입니다.
- **다른 개체**: `UMmoEntitySubsystem`(`UTickableWorldSubsystem`)이 프레임마다 월드의 나간 개체 → 들어온 개체 순으로 `AMmoEntityActor`를 지우고 만들고, 모든 다른 개체를 `RenderTick`의 `Sample` 자리에 놓습니다. 액터의 틱, 이동 컴포넌트, 충돌은 없습니다. 연결이 끊기면 세션이 월드를 비워 모든 액터(내 캐릭터 포함)가 지워집니다.
- **알려진 문제**: Mac에서 한글 입력기(두벌식)가 켜져 있으면 게임이 글자 키를 모두 A로 읽어 WASD가 한쪽으로만 걷습니다(2026-11-11, 키 상태 로그로 확인). 영문 입력으로 바꾸면 됩니다. 엔진의 Mac 키 해석 문제라 아직 고치지 않았습니다.
- **모듈**: 게임 모듈 `PortfolioMmo` 하나에 protobuf를 쓰는 코드를 모읍니다. 에디터에서는 모듈마다 정적 라이브러리가 따로 링크되므로, 모듈을 나누면 libprotobuf가 두 벌 들어가 전역 상태가 갈라집니다. 에디터에만 들어가는 `PortfolioMmoEditor`(위젯 블루프린트 생성기)는 게임 모듈의 UI 기반 클래스만 쓰고 protobuf를 쓰지 않습니다. 그래서 UI 헤더는 `Packet`을 앞선 선언으로만 씁니다.
- **엔진 없는 코드**: `Protocol/`(패킷), `World/`(월드 모델), `Screen/`(화면 스택)은 UE 타입 없이 표준 C++과 protobuf만 씁니다. Unity 클라이언트가 C#으로 옮기는 부분입니다. `PacketFrames`가 프레임을 쓰고 읽습니다(varint 길이 5바이트까지, 프레임 1 MiB까지, 넘거나 해석할 수 없으면 `Malformed`). `Tests/run.mjs`가 그 폴더들의 `.cpp`를 모두 UE 없이 clang(`-Wall -Werror`, RTTI·예외 없음)으로 빌드해 `Tests/*Test.cpp`를 돌리므로, 어느 파일이든 UE 헤더를 include하면 테스트가 깨져 경계가 지켜집니다. 엔진 없는 폴더를 더하면 `run.mjs`의 `ENGINE_FREE`에 적습니다. 테스트는 `Login` 프레임이 서버가 읽는 바이트와 같은지도 봅니다. `npm run test:mmo`가 이것도 돌리고, Mac이 아니면 건너뛰었다고 알립니다(GitHub 러너는 Linux라 건너뜁니다. backlog 66).
- **생성 코드**: UBT는 모듈 폴더 밖의 소스를 컴파일하지 않으므로 `Protocol/Packets.cpp`가 `shared/contract/generated/packets.pb.cc`를 include합니다. 생성 폴더는 시스템 경로로 넣어 생성 코드의 경고를 UE 설정에서 뺍니다. UE의 `verify`·`check` 매크로가 abseil의 멤버 함수(btree의 `verify()`)와 부딪히므로 `packets.pb.h`는 `Protocol/MmoPackets.h`로만 include하고, 그 안에서만 두 매크로를 치웁니다.
- **연결**: `UMmoConnection`(GameInstanceSubsystem)이 서버와 같은 구조로 돕니다. 수신 스레드가 프레임을 읽어 큐에 넣고, 게임 스레드가 프레임마다(`FTSTicker`) 꺼내 `OnConnected`, `OnPacket`, `OnClosed`로 알립니다. 보내기와 델리게이트는 게임 스레드에서만 일어납니다. 소켓은 논블로킹이고 수신 스레드는 100 ms마다 멈춤 요청을 확인합니다(받을 바이트가 있으면 바로 깸). 연결은 5초까지 기다리고, `NoDelay`를 켭니다. 연결된 동안 `Ping`을 보내고, 15초 동안 아무것도 오지 않으면 닫습니다. 게임 스레드가 멈춰(백그라운드의 앱) `Ping`을 보내지 못하면 서버가 끊으므로 받은 패킷이 끝없이 쌓이지 않습니다.
- **세션과 월드**: `UMmoSession`(GameInstanceSubsystem)이 서버 주소, 로그인 ID, 월드(`MmoWorld::FWorldState`)를 가집니다. 연결의 패킷을 월드에 먼저 반영한 뒤 자기 델리게이트로 알리므로, 화면(위젯·액터)은 연결이 아니라 세션을 듣고 월드를 읽기만 합니다. `FWorldState`는 내 개체 번호, 시야 안의 개체(`EntitiesEnter`·`EntitiesLeave`·`EntityMoves`), 다음 `Move`에 실을 `ack`(`PositionReset`)를 가집니다. 서버는 `LoginResult`와 내 개체가 든 `EntitiesEnter`를 같은 틱에 보내는데, 화면이 아직 없어도 월드에 남습니다. 들어오고 나간 개체의 번호는 큐에 쌓이고 화면이 `TakeLeft`, `TakeEntered` 차례로 꺼내 액터를 지우고 만듭니다.
- **단위**: `World/Units.h`가 칸 ↔ 미터(미터 → 칸은 반올림), `yaw` 칸 ↔ 도(한 바퀴로 감음)를 바꿉니다. 값은 `Constant`에서 읽습니다.
- **다른 개체의 보간**: `FServerClock`이 받은 틱 번호(`LoginResult`, `Pong`, `EntityMoves`)와 받은 때로 서버의 지금 틱을 어림합니다. 가장 빨리 도착한 값을 따르고, 늦게 온 값 쪽으로는 받을 때마다 2%씩만 내려가 TCP가 몰아 전해도 흔들리지 않습니다. 개체마다 `FEntityTrack`이 최근 8개의 (틱, 위치, `yaw`)를 가지고, 화면은 `RenderTick`(서버의 지금 틱 - 2)의 자리를 `Sample`로 얻습니다. 앞뒤 기록 사이는 선형으로, `yaw`는 가까운 쪽으로 돌고, 기록 밖이면 끝의 기록에 세워 앞질러 그리지 않습니다. 새 기록이 앞 기록보다 4틱 넘게 뒤면 한 틱 앞에 옛 자리를 끼워, 서 있던 개체가 출발할 때 미끄러지지 않게 합니다(한두 틱이 빠진 채 걷는 개체는 그대로 이어 그립니다). `EntityEnter`에는 틱이 없어 들어온 개체의 첫 기록은 마지막으로 받은 틱에 둡니다.
- **Move 보내기**: `FMoveSender`가 프레임 시간을 모아 50 ms(서버 틱)마다, 마지막으로 보낸 위치·`yaw`·`ack`와 다를 때만 `Move`를 냅니다. 멈추면 선 자리가 한 번 더 가고 끝납니다. 간격을 빼며 세어 30 fps에서도 평균 20번/초이고, 서 있다가 움직이면 첫 프레임에 바로 보냅니다. 행동 패킷 직전의 `Flush`는 밀린 위치를 지금 보냅니다.
- **로그인**: 아이디 → `UMmoSession::LogIn` → 연결 → `Login`(`PROTOCOL_VERSION_CURRENT`) → `LoginResult`의 결과, `Kicked`의 이유, 연결 끊김, 로그아웃을 상태 줄에 한국어로 보여 줍니다. 실패 뒤 서버가 끊어도 실패 메시지를 덮지 않습니다. 로그인 화면은 닫혀 있는 동안에도 세션을 들어, 게임 중에 끊긴 까닭이 다시 열릴 때 보입니다.
- **화면 관리자**: `UMmoUiManager`(`ULocalPlayerSubsystem`)가 컨트롤러가 생기면 뿌리 위젯(`UMmoUiRoot`)을 뷰포트에 올리고 로그인 화면을 엽니다. 뿌리는 아래에서 위로 이름표, HUD, 창, 팝업, 알림 층이고, 층 자체는 입력을 받지 않아 화면이 없는 곳의 터치와 클릭은 게임으로 갑니다. `Open(화면)`은 위젯 블루프린트를 비동기로 불러와 그 층의 맨 위에 올리고(이미 열려 있으면 맨 위로 옮김), 닫아도 위젯을 지우지 않고 다음에 다시 씁니다. 로그인하면 로그인 화면을 닫고 HUD를 열며, 연결이 끊기면 HUD와 창을 닫고 로그인 화면을 엽니다(게임 중에 끊겼으면 알림도). 지금 화면은 아래 목록뿐이고, 상점 등의 창은 그 항목에서 더합니다.
  - 판단: 무엇이 열렸는지, 뒤로 가기가 무엇을 닫는지, 입력을 어디로 보낼지는 엔진 없는 `MmoScreen::FScreenStack`이 정합니다. 화면마다 층, 뒤로 닫히는지, 입력(화면만·게임·창)이 정해져 있습니다. 뒤로 가기(Esc, Android 뒤로 버튼. 컨트롤러의 `Back` 액션)는 팝업 → 창 순서로 마지막에 연 것을 닫고, 닫을 것이 없고 게임 중이면 설정 창을 엽니다. 로그인 화면이 열려 있으면 입력은 화면만 받고(`FInputModeUIOnly`), 창이나 팝업이 열려 있으면 카메라는 돌지만 캐릭터는 걷지 않습니다(`SetIgnoreMoveInput`).
  - 초점: 게임으로 입력을 돌릴 때 초점을 게임 뷰포트로 옮깁니다(`SetAllUserFocusToGameViewport`). 입력 모드는 따로 정한 위젯이 없으면 초점을 옮기지 않아서, 로그인 화면의 글 상자에 남은 초점 때문에 Esc가 컨트롤러에 가지 않았습니다.
  - 화면: 로그인(`WBP_Login`), HUD(`WBP_Hud`, 터치 기기에서만 가상 조이스틱 `WBP_Joystick`), 설정(`WBP_Settings`: 로그아웃, 닫기), 확인 팝업(`WBP_Confirm`: 예·아니요), 알림(`WBP_Notice`: 3초 동안 위에 뜸), 이름표(`WBP_NameTag`)입니다. 가상 조이스틱은 누른 손가락을 붙잡아 가운데에서 끈 만큼을 프레임마다 키보드와 같은 이동 액션에 넣습니다(`InjectInputForAction`). 조이스틱이 가져간 터치는 카메라로 가지 않습니다.
  - 이름표 층: `UMmoNameTagLayer`가 프레임마다 시야 안의 개체(내 캐릭터 포함)의 머리 위(높이 2.1 m. 바닥이 평평하다고 봄)를 화면 좌표로 바꿔 이름표를 놓습니다. 이름표는 개체마다 만들지 않고 풀에서 꺼내 쓰고, 개체가 나가거나 화면 밖이면 감춰 풀로 돌립니다.
  - 위젯 블루프린트: C++ 기반 클래스(`UMmoLoginWidget` 등, `BindWidget`)를 부모로 하는 위젯 블루프린트를 에디터 모듈의 생성기 `UMmoCreateWidgetsCommandlet`이 만듭니다(아래 명령 표). 배치의 원본은 그 코드이고, 에디터에서 고친 배치는 다시 만들 때 덮입니다. 엔진이 위젯 블루프린트의 위젯 트리를 Python에 내놓지 않아 레벨처럼 스크립트로 만들 수 없기 때문입니다(2026-11-11 정함). 생성기가 처음 빈 트리로 한 번 컴파일할 때 "필수 위젯 바인딩을 찾지 못했습니다" 경고가 찍히지만, 트리를 채운 뒤의 컴파일과 저장은 성공합니다. 위젯 블루프린트는 코드만 참조하므로 `/Game/UI`를 늘 쿠킹합니다.
- **protobuf**: `Source/ThirdParty/MmoProtobuf/`가 libprotobuf 36.2와 abseil 20250512.1(protobuf가 정한 버전)의 정적 라이브러리와 헤더를 링크합니다. `build.mjs`가 두 소스를 SHA-256으로 확인하고 받아 Mac(arm64·x86_64, macOS 14)과 Android(arm64-v8a, API 26, 정적 libc++)용으로 빌드합니다(M4 Max에서 두 플랫폼 72초). 결과는 LFS로 커밋하고 버전을 바꿀 때만 다시 돌립니다.
  - 크기: Mac 15 MB, Android 11 MB, 헤더 9.3 MB(561개). NDK 툴체인이 Release에도 `-g`를 넣어 Android는 디버그 정보를 지우기 전 145 MB였습니다.
  - 엔진의 `Protobuf` 모듈(30.0)은 쓰지 않습니다. Mac·Windows·Linux 라이브러리뿐이고, 서버와 버전이 다르고, 엔진을 올리면 바뀝니다. 그것을 쓰는 MetaHumanSDK 플러그인은 아래처럼 꺼져 있어 엔진 쪽 protobuf가 함께 링크되지 않습니다.
  - 빌드에는 cmake(3.16 이상)·ninja와, Android는 `NDKROOT`에 UE 5.8이 요구하는 NDK r27c가 필요합니다. 아래 Android 도구 폴더의 `env.sh`를 source하면 둘 다 갖춰집니다(SDK의 cmake 3.22.1과 ninja, NDK 27.2.12479018). 지금 커밋한 Android 라이브러리는 같은 버전의 NDK(Unity 6000.3.15f1에 든 것)로 빌드했습니다.
- **서버 주소**: `UMmoSettings`(`DefaultGame.ini`, 기본 `127.0.0.1:7777`)가 기본값이고 명령줄의 `-MmoServer=호스트:포트`가 이깁니다. `Scripts/package.mjs <mac|android> [--target local|live]`가 대상의 주소를 `BuildCookRun -cmdline`으로 패키지의 `UECommandLine.txt`에 넣어, 커밋한 ini를 바꾸지 않고 패키지마다 주소를 정합니다. local은 Mac이 `127.0.0.1`, Android가 이 Mac의 LAN 주소(같은 Wi-Fi의 휴대폰과 BlueStacks가 붙음)이고, live는 서버 배포(backlog 10)에서 주소를 정할 때까지 멈춥니다. 서버는 모든 인터페이스(`IPAddress.Any`)에서 받습니다.
- **Mac 패키지**: `Scripts/package.mjs mac`이 `BuildCookRun`으로 `Saved/Archive/`에 `.app`(arm64)을 만들고, 실행 파일의 로컬 심볼을 지운(`strip -x`) 뒤 다시 서명합니다(2026-11-11, 212 MB, 로컬 서버에 로그인해 걷는 것까지 확인). C++ 빌드가 된 뒤 쿠킹부터 Development 94초, Shipping 50–55초였습니다. 크기와 줄인 방법은 아래 표에 있습니다. Xcode 26부터 Metal Toolchain을 따로 받아야 하고(`xcodebuild -downloadComponent MetalToolchain`, 838.9 MB), 없으면 에디터 열기와 쿠킹이 셰이더 컴파일에서 멈춥니다.
- **플러그인**: `.uproject`의 `DisableEnginePluginsByDefault`로 엔진 플러그인(기본으로 켜지는 것 187개)을 모두 끄고 쓰는 것만 켭니다. 게임에는 EnhancedInput(과 그것이 쓰는 DataValidation), AndroidDeviceProfileSelector(Android 기기별 설정), AndroidPermission(UE의 `GameActivity.java`가 그 Java 클래스를 import해 없으면 Gradle 컴파일이 실패함), ACLPlugin(엔진 기본 애니메이션 압축), 에디터에만(`TargetAllowList`) 콘텐츠 브라우저, 에셋 정의, 플러그인 창, Xcode·Rider 연동, PythonScriptPlugin(에셋을 만드는 스크립트)이 켜집니다. 기본으로 켜져 있던 것 중 MetaHumanSDK(엔진 protobuf), AndroidFileServer(켜 두면 `DefaultEngine.ini`에 기기 연결용 `SecurityToken`을 써 넣음), NNEDenoiser(ONNX Runtime 97 MB)도 이렇게 꺼집니다. 플러그인이 필요해지면 `.uproject`에 켭니다.
  - 에디터에만 켠 플러그인도 쿠커(에디터 프로세스)가 모듈을 불러 그 셰이더가 게임에 들어갈 수 있습니다. Interchange(에셋 임포트)를 에디터에만 켜면 셰이더 약 11 MB가 늘고 그 콘텐츠의 쿠킹이 실패해서(게임에 모듈이 없음), 에셋을 임포트할 때 다시 켜고 `DefaultGame.ini`의 `DirectoriesToNeverCook`에 `/Interchange`를 더합니다.
- **렌더러**: 조명은 동적 조명만 쓰도록 Lumen, Nanite, 가상 그림자, 메시 거리장, 레이 트레이싱, 라이트맵(정적 조명)을 `DefaultEngine.ini`에서 끕니다. 그래서 그 기능들에 필요한 SM6 없이 Mac 셰이더를 SM5 한 벌만 싣습니다(SM5는 DirectX 11급 기능으로 모든 Metal Mac에서 돌고, SM6는 Nanite 등이 쓰는 DirectX 12급 기능으로 Apple Silicon·macOS 14 이상). 셰이더가 줄고, Android의 모바일 렌더러와도 표현이 가까워집니다. 필요해지면 그 줄을 지우면 됩니다.
- **Android**: `Config/DefaultEngine.ini`에 패키지 이름(`cloud.dennou.mmo`), arm64만, API 26–36, APK 하나에 데이터를 넣는 설정이 있습니다. `Scripts/package.mjs android`가 `Saved/Archive/Android_ASTC/`에 APK를 만듭니다. BlueStacks Air(Mac, arm64-v8a, Android 13)에서 로그인해 걷고 카메라를 돌리는 것까지 확인했습니다(2026-11-11). 실제 기기는 아직입니다.
  - 렌더러: Vulkan만 싣습니다(`bSupportsVulkan=True`, `bBuildForES31=False`). BlueStacks에서 OpenGL ES 렌더러가 에뮬레이터 드라이버 안에서 크래시가 났기 때문입니다(2026-11-10). 엔진의 Android 기본 기기 프로필은 Vulkan을 끄고(`r.Android.DisableVulkanSupport=1`) 목록에 있는 일부 기기만 켜므로, `Config/DefaultDeviceProfiles.ini`에서 모든 기기에 켭니다. 그러지 않으면 목록에 없는 기기(BlueStacks 포함)가 "Unable to run on this device"로 멈춥니다. Vulkan 1.1 드라이버가 없는 기기는 엔진의 드라이버 검사에서 그대로 거절됩니다.
  - 하늘: 모바일 렌더러는 `SkyAtmosphere`를 그리려면 `IsSky` 머티리얼의 메시가 따로 있어야 해서 지금은 하늘 없이 안개색 배경입니다(Development 빌드는 화면에 경고를 띄움).
  - BlueStacks: 설정에서 ADB를 켜면 `adb connect 127.0.0.1:5555`로 붙고, `adb install -r`로 넣고 `adb shell input`으로 누르고 끌 수 있습니다(아래 명령 표). 휴대폰은 같은 Wi-Fi에서 local APK가 이 Mac의 서버에 붙습니다.
  - 필요한 것: 엔진의 Android 대상 플랫폼 구성 요소(Epic Games Launcher의 선택 다운로드, 엔진 쪽 약 2.5 GB. 없으면 UBT가 시작부터 멈춤), 아래 도구 폴더, SDK 폴더의 라이선스 동의(`sdkmanager --licenses`가 `licenses/`에 씀. 없으면 APK 단계에서 멈춤).
  - 도구 폴더: Unity처럼 엔진 버전마다 Android Studio·Unity와 따로 `/Users/Shared/Epic Games/Android/UE_5.8/`에 둡니다(SDK 3.0 GB, JDK 335 MB). `Scripts/setup-android.mjs`가 받는 파일을 배포처의 체크섬으로 확인하며 만듭니다. 받는 것은 Temurin JDK 21.0.13, cmdline-tools 21.0, 엔진의 `Engine/Config/Android/Android_SDK.json`이 정한 platform(android-36)·build-tools(36.0.0)·cmake(3.22.1)·NDK(27.2.12479018)입니다. 빌드 전에 그 폴더의 `env.sh`를 source해 `ANDROID_HOME`, `NDKROOT`, `JAVA_HOME`을 줍니다. 셸 프로필은 고치지 않습니다.
  - JDK: UE 5.8의 Gradle 8.13은 Java 23까지만 돌아서 Android Studio 2026.2에 든 JDK 25를 쓸 수 없습니다. 엔진의 `SetupAndroid.command`도 그 JDK를 `~/.zshrc`에 써 넣으므로 쓰지 않습니다.
  - cmdline-tools: 22.0부터 `sdkmanager`가 Android CLI(`android sdk`)로 바뀌어 `--licenses`가 라이선스 파일을 쓰지 않고(UE는 그 파일이 있어야 APK를 만듦), CLI가 기본으로 사용 통계를 보냅니다. 그래서 21.0으로 고정합니다.
  - 빌드 가속기(UBA): UBA는 컴파일러에 라이브러리를 주입(DYLD)해 돌리는데, NDK의 clang은 Google이 hardened runtime으로 서명해 주입이 막힙니다(Xcode의 clang은 막히지 않아 Mac 빌드는 UBA로 돕니다). 그래서 Android는 `-UbtArgs=-NoUBA`로 끕니다. 켜 두면 컴파일마다 `not active but did not get exit message` 오류가 찍힙니다.
  - 크기: Vulkan만 실은 APK가 75.8 MB입니다(2026-11-11, 콘텐츠가 늘었습니다). 아래는 2026-11-09의 74.4 MB APK입니다: `libUnreal.so`가 압축 전 94.6 MB(APK 안 37.9 MB), 데이터(`main.obb.png`) 31.4 MB, Java(`classes.dex`) 9.2 MB입니다. 셰이더는 Vulkan과 OpenGL ES 3.1 두 벌(압축 전 각 6.8 MB, 5.3 MB)입니다. Unity의 SDK로 만들었을 때는 `libUnreal.so`에 디버그 정보가 남아 APK가 96.6 MB였는데, 까닭은 찾지 못했습니다.

### Mac 패키지 크기 (2026-11-09)

로그인 화면만 있는 지금 앱으로 쟀습니다. 우리 콘텐츠(`.pak`)는 10 MB 안팎이고 나머지는 엔진입니다.

| 단계 | 크기 | 줄어든 것 |
| --- | --- | --- |
| Development, 엔진 기본 설정 | 872 MB | 실행 파일 413 MB(코드 228, 심볼 표 165), 셰이더 Metal SM5·SM6 두 벌, NNEDenoiser가 끌어오는 ONNX Runtime 97 MB(같은 dylib 두 개), MoltenVK 11 MB |
| Shipping, Mac 셰이더 SM6만, NNEDenoiser 끔 | 481 MB | 실행 파일 268 MB(개발용 코드가 빠짐), SM5 셰이더 67 MB, ONNX Runtime·MoltenVK |
| 위 + 렌더러 기능 끔 | 449 MB | 셰이더(압축 전) 173 → 128 MB |
| 위 + 실행 파일 `strip -x`와 다시 서명 | 347 MB | 실행 파일 268 → 167 MB. UBT가 Shipping에서 하는 strip은 `-S`(디버그 심볼만)라 로컬 심볼 약 100만 개가 남는다 |
| 위 + Mac 셰이더를 SM6 대신 SM5 한 벌로 | 297 MB | 콘텐츠 110 → 60 MB. 끈 렌더러 기능이 SM6를 쓰던 것이다 |
| 위 + 엔진 플러그인 기본 끔(지금 설정) | **212 MB**(zip 96 MB) | 실행 파일 167 → 95 MB, 콘텐츠 60 → 46 MB. 게임에 들어가는 플러그인이 227개에서 4개로 |

- 실행 파일은 arm64라 Intel Mac은 받지 않습니다.
- 마지막 앱(212 MB)이 로컬 서버에 로그인하는 것을 확인했습니다. Shipping은 로그를 남기지 않아 서버 로그의 접속자 수로 봤습니다.
- `strip -x`는 `Scripts/package.mjs`가 합니다. 지우면 크래시 콜스택의 함수 이름이 빠지므로 dSYM을 따로 보관해야 읽을 수 있습니다.
- 남은 것: 엔진 실행 파일 95 MB, Metal Shader Converter 55.5 MB(MetalRHI가 링크해 뺄 수 없음), 셰이더와 엔진 콘텐츠 46 MB(전역 셰이더 49 MB, 머티리얼 셰이더 3.7 MB, 엔진 폰트 4.5 MB를 압축), Vorbis 6.4 MB. 엔진 런타임이라 설정으로는 더 줄이기 어렵습니다.

## 명령 (저장소 루트에서)

| 명령 | 설명 |
| --- | --- |
| `npm run generate -- mmo` | `packets.proto`에서 `generated/`의 C#과 C++을 다시 만든다(게임 이름이 없으면 idle의 생성 파일도 함께) |
| `npm run test:mmo` | 생성 파일 검사 후 mmo의 C# 테스트(`mmo.slnx`: 패킷, 서버)와 Unreal 클라이언트의 엔진 없는 테스트(Mac에서만). CI(`mmo-ci.yml`)는 `mmo/`가 바뀌면 이것만 돌린다 |
| `npm run check` | 바뀐 영역의 검사. `mmo/`만 바뀌었으면 `test:mmo` |
| `dotnet run -c Release --project mmo/server/src -- --port 7777` | 서버. `--max-players`(동시 접속 상한, 기본 1000), `--spawn-half-extent`(저장한 위치가 없을 때 시작 위치를 고르는 정사각형의 반 너비, m, 기본 0), `--database`(SQLite 파일, 기본 `mmo.sqlite`. `dotnet run`의 작업 디렉터리는 `mmo/server/`) |
| `node mmo/server/deploy/check.mjs mmo.dennou.cloud 7777` | 그 주소의 MMO 서버가 `Ping`에 `Pong`으로 답하는지 본다(배포 뒤 확인과 같음) |
| `dotnet run -c Release --project mmo/server/tools/load-test -- --bots 2000 --half-extent 285` | 봇 부하. 서버는 같은 `--spawn-half-extent`와 빈 `--database`로 띄우고, 틱 시간·CPU·메모리는 서버 로그에서 읽는다. `--host`, `--port`, `--seconds`(측정 시간, 기본 30) |
| `node mmo/client-unreal/Tests/run.mjs` | Unreal 클라이언트의 엔진 없는 코드(`Protocol/`, `World/`, `Screen/`)와 생성된 C++을 clang으로 빌드해 테스트한다. 커밋된 Mac 라이브러리를 써서 지금은 Mac에서만 돌고, 다른 OS에서는 건너뛴다. `test:mmo`가 부른다 |
| `"/Users/Shared/Epic Games/UE_5.8/Engine/Build/BatchFiles/Mac/Build.sh" PortfolioMmoEditor Mac Development -Project="$PWD/mmo/client-unreal/PortfolioMmo.uproject"` | Unreal 에디터 타깃 빌드(Mac). 에디터에서 열거나 아래처럼 게임으로 돌리기 전에 한다 |
| `"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" -game -MmoLogin=hero_01` | Unreal 클라이언트를 게임으로 실행해 바로 로그인한다. `-MmoServer=호스트:포트`, 화면 없이 확인하려면 `-nullrhi -stdout`(연결 로그까지 보려면 `-FullStdOutLogOutput`) |
| `source "/Users/Shared/Epic Games/Android/UE_5.8/env.sh" && node mmo/client-unreal/Source/ThirdParty/MmoProtobuf/build.mjs` | libprotobuf·abseil을 Mac·Android용으로 다시 빌드한다(`mac`, `android`로 하나만). protobuf 버전을 바꿀 때만 |
| `node mmo/client-unreal/Scripts/package.mjs mac` | Mac `.app`을 로컬 서버 주소로 빌드·쿠킹·패키징하고 심볼을 지워 다시 서명해 `mmo/client-unreal/Saved/Archive/Mac/`에 둔다(`Saved/`는 커밋하지 않음). `--config Development`는 로그가 남는 빌드, `--target live`는 Live 서버 주소(backlog 10에서 정함) |
| `"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" -run=pythonscript -script="$PWD/mmo/client-unreal/Scripts/create_content.py" -unattended -nosplash -nullrhi` | `Field` 레벨과 머티리얼을 다시 만든다. 에디터가 프로젝트를 열고 있지 않을 때 돌린다 |
| `"/Users/Shared/Epic Games/UE_5.8/Engine/Binaries/Mac/UnrealEditor-Cmd" "$PWD/mmo/client-unreal/PortfolioMmo.uproject" -run=MmoCreateWidgets -unattended -nosplash -nullrhi` | 위젯 블루프린트(`/Game/UI/WBP_*`)를 다시 만든다. 에디터 타깃을 빌드한 뒤, 에디터가 프로젝트를 열고 있지 않을 때 돌린다 |
| `node mmo/client-unreal/Scripts/setup-android.mjs` | Unreal용 Android 도구(JDK, SDK, NDK)를 `/Users/Shared/Epic Games/Android/UE_5.8/`에 받는다. 라이선스 동의가 없으면 동의할 명령을 보여 주고 멈추므로, 동의한 뒤 다시 돌린다 |
| `node mmo/client-unreal/Scripts/package.mjs android` | Android APK를 이 Mac의 LAN 주소로 만들어 `mmo/client-unreal/Saved/Archive/Android_ASTC/`에 둔다(Android 도구의 `env.sh`를 스스로 source함). 옵션은 mac과 같다 |
| `"/Users/Shared/Epic Games/Android/UE_5.8/sdk/platform-tools/adb" connect 127.0.0.1:5555 && "/Users/Shared/Epic Games/Android/UE_5.8/sdk/platform-tools/adb" -s 127.0.0.1:5555 install -r mmo/client-unreal/Saved/Archive/Android_ASTC/PortfolioMmo-Android-Shipping-arm64.apk` | BlueStacks(설정에서 ADB를 켬)에 APK를 넣는다. 휴대폰은 USB 디버깅을 켜고 `-s` 없이 |
