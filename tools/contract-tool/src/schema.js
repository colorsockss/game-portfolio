// 패킷 스키마(JSON)를 검사하고, 생성기가 쓰는 모양으로 풀고, 구조의 지문을 낸다.
import { createHash } from "node:crypto";

/** 와이어 정수 형식. size는 바이트이고 min·max는 담을 수 있는 범위다. */
export const INTEGERS = {
  u8: { size: 1, csharp: "byte", min: 0, max: 0xff, method: "U8" },
  u16: { size: 2, csharp: "ushort", min: 0, max: 0xffff, method: "U16" },
  u32: { size: 4, csharp: "uint", min: 0, max: 0xffffffff, method: "U32" },
  i16: { size: 2, csharp: "short", min: -0x8000, max: 0x7fff, method: "I16" },
};

const TYPE_NAME = /^[A-Z][A-Za-z0-9]*$/;
const FIELD_NAME = /^[a-z][A-Za-z0-9]*$/;
const NAMESPACE = /^[A-Z][A-Za-z0-9]*(\.[A-Z][A-Za-z0-9]*)*$/;
// 생성 코드가 같은 네임스페이스에 두는 형식과, 생성 메서드 안의 지역 변수·멤버 이름.
const RESERVED_TYPES = new Set(["Opcode", "Packets", "PacketWriter", "PacketReader", "MalformedPacketException"]);
const RESERVED_FIELDS = new Set(["packet", "item", "reader", "writer", "start", "i", "writeTo", "readFrom"]);
const DIRECTIONS = new Set(["toServer", "toClient"]);

/**
 * 스키마를 검사해 풀어 준다. 문제가 하나라도 있으면 모두 모아 Error로 던진다.
 * 필드의 `kind`는 integer, string, fixed, angle, enum, array이고, array의 원소는 정수나 구조체다.
 */
export function loadContract(schema) {
  const problems = [];
  const problem = (where, message) => problems.push(`${where}: ${message}`);
  const list = (key) => {
    const value = schema?.[key] ?? [];
    if (!Array.isArray(value)) problem(key, "must be an array");
    return Array.isArray(value) ? value : [];
  };

  if (typeof schema?.namespace !== "string" || !NAMESPACE.test(schema.namespace)) {
    problem("namespace", "must be a dotted PascalCase C# namespace");
  }
  const types = list("types");
  const enums = list("enums");
  const structs = list("structs");
  const packets = list("packets");

  const named = new Map();
  for (const [group, entries] of [["types", types], ["enums", enums], ["structs", structs], ["packets", packets]]) {
    entries.forEach((entry, index) => {
      const where = `${group}[${index}]${typeof entry?.name === "string" ? ` ${entry.name}` : ""}`;
      if (typeof entry?.name !== "string" || !TYPE_NAME.test(entry.name)) problem(where, "name must be PascalCase");
      else if (RESERVED_TYPES.has(entry.name)) problem(where, "name is reserved for generated code");
      else if (named.has(entry.name)) problem(where, `name is already used by ${named.get(entry.name).group}`);
      else named.set(entry.name, { group, entry });
      checkSummary(entry, where, problem);
    });
  }

  for (const type of types) {
    const where = `types ${type.name}`;
    if (!(type.wire in INTEGERS)) problem(where, `wire must be one of ${Object.keys(INTEGERS).join(", ")}`);
    if (type.kind === "fixed") {
      if (!Number.isInteger(type.scale) || type.scale <= 0) problem(where, "scale must be a positive integer");
    } else if (type.kind === "angle") {
      if (INTEGERS[type.wire]?.min !== 0) problem(where, "an angle needs an unsigned wire");
      if (typeof type.period !== "number" || !(type.period > 0)) problem(where, "period must be a positive number");
    } else {
      problem(where, 'kind must be "fixed" or "angle"');
    }
  }

  for (const entry of enums) {
    const where = `enums ${entry.name}`;
    const wire = INTEGERS[entry.wire];
    if (!wire || wire.min !== 0) problem(where, "wire must be an unsigned integer");
    const values = Array.isArray(entry.values) ? entry.values : [];
    if (values.length === 0) problem(where, "values must be a non-empty array");
    const names = new Set();
    const numbers = new Set();
    for (const value of values) {
      const at = `${where}.${value?.name}`;
      if (typeof value?.name !== "string" || !TYPE_NAME.test(value.name)) problem(at, "name must be PascalCase");
      else if (names.has(value.name)) problem(at, "name is repeated");
      names.add(value?.name);
      if (!Number.isInteger(value?.value) || (wire && (value.value < wire.min || value.value > wire.max))) {
        problem(at, `value must be an integer that fits ${entry.wire}`);
      } else if (numbers.has(value.value)) problem(at, `value ${value.value} is repeated`);
      numbers.add(value?.value);
      checkSummary(value, at, problem);
    }
  }

  const resolvedStructs = new Map();
  for (const struct of structs) {
    resolvedStructs.set(struct.name, { ...struct, fields: resolveFields(struct, `structs ${struct.name}`, false) });
  }

  const opcodes = new Map();
  const resolvedPackets = packets.map((packet) => {
    const where = `packets ${packet.name}`;
    if (!Number.isInteger(packet.opcode) || packet.opcode < 1 || packet.opcode > 0xffff) {
      problem(where, "opcode must be an integer from 1 to 65535");
    } else if (opcodes.has(packet.opcode)) problem(where, `opcode ${packet.opcode} is already used by ${opcodes.get(packet.opcode)}`);
    else opcodes.set(packet.opcode, packet.name);
    if (!DIRECTIONS.has(packet.direction)) problem(where, 'direction must be "toServer" or "toClient"');
    return { ...packet, fields: resolveFields(packet, where, true) };
  });

  if (problems.length > 0) throw new Error(`Invalid contract schema:\n- ${problems.join("\n- ")}`);

  return {
    namespace: schema.namespace,
    types,
    enums,
    structs: [...resolvedStructs.values()],
    packets: resolvedPackets,
    hash: contractHash(schema.namespace, types, enums, structs, packets),
  };

  // 구조체는 정수, 문자열, 정의한 형식, enum만 담는다. 배열은 패킷에만 두며 원소는 정수나 구조체다.
  function resolveFields(owner, where, allowArrays) {
    const fields = Array.isArray(owner.fields) ? owner.fields : [];
    if (fields.length === 0) problem(where, "fields must be a non-empty array");
    const names = new Set();
    return fields.map((field) => {
      const at = `${where}.${field?.name}`;
      if (typeof field?.name !== "string" || !FIELD_NAME.test(field.name)) problem(at, "name must be camelCase");
      else if (RESERVED_FIELDS.has(field.name)) problem(at, "name is reserved for generated code");
      else if (names.has(field.name)) problem(at, "name is repeated");
      else if (pascal(field.name) === owner.name) problem(at, "name must differ from the type that holds it");
      names.add(field?.name);
      checkSummary(field, at, problem);
      if (field?.maxLength !== undefined && field.type !== "string") problem(at, "maxLength is only for strings");
      return { ...field, pascal: pascal(String(field?.name)), ...resolveType(field, at, allowArrays) };
    });
  }

  function resolveType(field, at, allowArrays) {
    const type = field?.type;
    if (typeof type !== "string") return problem(at, "type must be a string"), {};
    if (type.endsWith("[]")) {
      const element = type.slice(0, -2);
      if (!allowArrays) return problem(at, "arrays are only allowed in packets"), {};
      if (element in INTEGERS) return { kind: "array", element: { kind: "integer", wire: INTEGERS[element] } };
      const struct = named.get(element);
      if (struct?.group !== "structs") return problem(at, `array items must be an integer or a struct, not ${element}`), {};
      return { kind: "array", element: { kind: "struct", name: element } };
    }
    if (type in INTEGERS) return { kind: "integer", wire: INTEGERS[type] };
    if (type === "string") {
      if (!Number.isInteger(field.maxLength) || field.maxLength < 1 || field.maxLength > 0xff) {
        problem(at, "a string needs maxLength from 1 to 255 (UTF-8 bytes)");
      }
      return { kind: "string" };
    }
    const target = named.get(type);
    if (target?.group === "types") return { kind: target.entry.kind, wire: INTEGERS[target.entry.wire] };
    if (target?.group === "enums") return { kind: "enum", wire: INTEGERS[target.entry.wire], values: target.entry.values };
    return problem(at, `unknown type ${type}${target ? ` (a ${target.group.slice(0, -1)} cannot be a field)` : ""}`), {};
  }
}

/** 필드 하나가 와이어에서 차지하는 가장 적은 바이트. 받는 쪽이 배열의 원소 수를 미리 거르는 데 쓴다. */
export function minBytes(field, structs) {
  if (field.kind === "string") return 1;
  if (field.kind === "array") return 2;
  if (field.kind === "struct") {
    return structs.find((struct) => struct.name === field.name).fields.reduce((sum, item) => sum + minBytes(item, structs), 0);
  }
  return field.wire.size;
}

export function pascal(name) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function checkSummary(entry, where, problem) {
  if (typeof entry?.summary !== "string" || entry.summary.trim() === "") problem(where, "summary must be a non-empty string");
}

// 와이어에 드러나는 구조(이름, 번호, 형식)만 담아 해시한다. summary를 고쳐도 지문은 그대로다.
function contractHash(namespace, types, enums, structs, packets) {
  const fields = (owner) => owner.fields.map(({ name, type, maxLength }) => ({ name, type, maxLength }));
  const structure = {
    namespace,
    types: types.map(({ name, kind, wire, scale, period }) => ({ name, kind, wire, scale, period })),
    enums: enums.map(({ name, wire, values }) => ({ name, wire, values: values.map(({ name, value }) => ({ name, value })) })),
    structs: structs.map((struct) => ({ name: struct.name, fields: fields(struct) })),
    packets: packets.map((packet) => ({ name: packet.name, opcode: packet.opcode, direction: packet.direction, fields: fields(packet) })),
  };
  return createHash("sha256").update(JSON.stringify(structure)).digest().readUInt32BE(0);
}
