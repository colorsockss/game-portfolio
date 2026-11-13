// proto 출력의 바이너리. generate-proto.js가 낸 스키마와 같은 규칙으로 행을 Protobuf(proto3) 와이어 형식에 쓴다.
// 필드 번호는 index + 1이고, 필드 번호 순서로 쓰며, 기본값(0, false, "", 빈 배열)은 쓰지 않는다(optional 필드는 null만 뺀다).
// 같은 입력이면 바이트까지 같다.
import { isOptional } from './generate-proto.js';

const encoder = new TextEncoder();

class Writer {
  constructor() { this.bytes = []; }

  varint(value) {
    let n = BigInt.asUintN(64, BigInt(value));
    while (n >= 0x80n) {
      this.bytes.push(Number(n & 0x7fn) | 0x80);
      n >>= 7n;
    }
    this.bytes.push(Number(n));
  }

  tag(number, wireType) { this.varint((number << 3) | wireType); }

  raw(bytes) { for (const byte of bytes) this.bytes.push(byte); }

  delimited(number, bytes) {
    this.tag(number, 2);
    this.varint(bytes.length);
    this.raw(bytes);
  }

  finish() { return Uint8Array.from(this.bytes); }
}

// 스칼라 하나의 와이어 형식과 값의 바이트. enum 열은 int32(음수는 64비트로 늘림)다.
function scalar(field, value) {
  const writer = new Writer();
  switch (field.base) {
    case 'int':
      if (field.enum) writer.varint(value);
      else writer.varint(((value << 1) ^ (value >> 31)) >>> 0);
      return { wireType: 0, bytes: writer.finish() };
    case 'uint':
      writer.varint(value);
      return { wireType: 0, bytes: writer.finish() };
    case 'long': {
      const n = BigInt(value);
      writer.varint(BigInt.asUintN(64, (n << 1n) ^ (n >> 63n)));
      return { wireType: 0, bytes: writer.finish() };
    }
    case 'bool':
      writer.varint(value ? 1 : 0);
      return { wireType: 0, bytes: writer.finish() };
    case 'float': {
      const view = new DataView(new ArrayBuffer(4));
      view.setFloat32(0, value, true);
      return { wireType: 5, bytes: new Uint8Array(view.buffer) };
    }
    case 'double': {
      const view = new DataView(new ArrayBuffer(8));
      view.setFloat64(0, value, true);
      return { wireType: 1, bytes: new Uint8Array(view.buffer) };
    }
    case 'string':
      return { wireType: 2, bytes: encoder.encode(value) };
    default:
      throw new Error(`Field '${field.name}': type ${field.type} has no proto encoding`);
  }
}

const isDefault = (value) => value === 0 || value === 0n || value === false || value === '';

// 레코드 하나(필드 이름 → 값)를 메시지 하나로 쓴다.
export function encodeRecord(fields, record) {
  const writer = new Writer();
  for (const field of fields) {
    const number = field.index + 1;
    const value = record[field.name];
    if (value === null) continue;
    if (field.array) {
      if (value.length === 0) continue;
      if (field.base === 'string') {
        for (const element of value) writer.delimited(number, scalar(field, element).bytes);
      } else {
        // 수와 bool의 배열은 proto3의 기본인 packed(길이 구분 하나에 이어 씀)다.
        const packed = new Writer();
        for (const element of value) packed.raw(scalar(field, element).bytes);
        writer.delimited(number, packed.finish());
      }
      continue;
    }
    if (!isOptional(field) && isDefault(value)) continue;
    const { wireType, bytes } = scalar(field, value);
    if (wireType === 2) writer.delimited(number, bytes);
    else {
      writer.tag(number, wireType);
      writer.raw(bytes);
    }
  }
  return writer.finish();
}

// id가 있는 테이블: 목록 메시지(`repeated <Table>Row rows = 1`). 기본값만 있는 행도 길이 0으로 써서 행 수를 지킨다.
export function encodeRows(fields, rows) {
  const writer = new Writer();
  for (const row of rows) writer.delimited(1, encodeRecord(fields, row));
  return writer.finish();
}
