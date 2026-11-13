# MMO 기획 데이터 원본

테이블마다 xlsx 하나(LFS)를 둡니다. 열은 [설계의 데이터 테이블](../docs/design.md#데이터-테이블)이 원본이고, 시트 규칙은 [data-tool](../../tools/data-tool/README.md)에 있습니다. 테이블은 그것을 쓰는 backlog 항목이 만듭니다.

저장소 루트의 `npm run generate -- mmo`가 data-tool의 proto 출력으로 `mmo/shared/data/`의 `.proto`, Protobuf 바이너리, 데이터 해시, protoc가 만든 C#·C++을 다시 만듭니다. 생성물은 직접 고치지 않고 이 폴더의 원본과 함께 커밋합니다.
