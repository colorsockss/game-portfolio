import type { ViewRoot } from "../../presentation/ui/ports.js";
import type { UnityTypes } from "./components.js";

/** 뷰가 자기 프리팹의 ViewRefs 컴포넌트에서 읽는 것(idle/client/Assets/Scripts/Views/ViewRefs.cs). */
export interface RefsSource {
  /** 항목의 Kind. 그 이름의 항목이 없으면 -1. */
  GetKind(name: string): number;
  GetObject(name: string): unknown;
  GetList(name: string): CSharpArray | null;
  GetString(name: string): string | null;
  GetNumber(name: string): number;
  GetBool(name: string): boolean;
}

/** Unity UI 브리지(unity/ui.ts)가 ViewRoot 뒤에 둔 ViewRefs. */
export function viewRefs(root: ViewRoot): RefsSource {
  return root as unknown as RefsSource;
}

/** PuerTS가 넘겨주는 모양의 C# 배열. */
interface CSharpArray {
  readonly Length: number;
  get_Item(index: number): unknown;
}

/** 항목이 담은 것의 종류. ViewRefs.Kind와 같은 숫자다. */
export const Kind = { Object: 0, List: 1, String: 2, Number: 3, Bool: 4 } as const;
export type Kind = (typeof Kind)[keyof typeof Kind];
const kindNames = ["Object", "List", "String", "Number", "Bool"];

/** 선언된 항목 하나: 뷰를 열 때 검사할 종류와 TypeScript용 값 타입. */
export interface Declared<T> {
  readonly kind: Kind;
  /** 객체와 목록: Unity 타입의 전체 이름. 인스펙터의 "Copy TS"가 쓰는 그대로다. */
  readonly type?: string;
  /** 설정하지 않는다. T를 싣고 다닐 뿐이다. */
  readonly value?: T;
}

/** TypeScript가 보는 Unity 타입 이름: UnityTypes의 바인딩 모양, 없으면 unknown. */
export type UnityType<N extends string> = N extends keyof UnityTypes ? UnityTypes[N] : unknown;
// 알려진 이름은 자동완성에 나오게 하면서 다른 이름도 받는다.
type TypeName = (keyof UnityTypes & string) | (string & {});

/** 항목 종류별 선언. ViewRefs 인스펙터의 "Copy TS"가 쓴다. */
export const ref = {
  object: <N extends TypeName>(type: N): Declared<UnityType<N>> => ({ kind: Kind.Object, type }),
  list: <N extends TypeName>(type: N): Declared<UnityType<N>[]> => ({ kind: Kind.List, type }),
  string: (): Declared<string> => ({ kind: Kind.String }),
  number: (): Declared<number> => ({ kind: Kind.Number }),
  bool: (): Declared<boolean> => ({ kind: Kind.Bool }),
};

/** 뷰가 읽는 값. 선언에서 타입을 얻는다. */
export type Refs<D> = { readonly [K in keyof D]: D[K] extends Declared<infer T> ? T : never };

/**
 * 뷰가 선언한 항목을 뷰를 열 때 한 번에 모두 읽는다. 없는 항목, 종류가 틀린 항목, 할당되지 않은
 * 객체를 한꺼번에 보고하므로, 어긋난 프리팹과 뷰는 뷰를 여는 순간 실패한다.
 */
export function readRefs<D extends Record<string, Declared<unknown>>>(source: RefsSource, declared: D): Refs<D> {
  const result: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [name, { kind }] of Object.entries(declared)) {
    const actual = source.GetKind(name);
    if (actual === -1) {
      problems.push(`${name} is missing`);
    } else if (actual !== kind) {
      problems.push(`${name} is ${kindNames[actual]}, not ${kindNames[kind]}`);
    } else {
      const value = read(source, name, kind);
      if (value === null || value === undefined) problems.push(`${name} has nothing assigned`);
      else result[name] = value;
    }
  }
  if (problems.length > 0) throw new Error(`ViewRefs: ${problems.join("; ")}.`);
  return result as Refs<D>;
}

function read(source: RefsSource, name: string, kind: Kind): unknown {
  switch (kind) {
    case Kind.Object:
      return source.GetObject(name);
    case Kind.List: {
      const list = source.GetList(name);
      return list && Array.from({ length: list.Length }, (_, index) => list.get_Item(index));
    }
    case Kind.String:
      return source.GetString(name);
    case Kind.Number:
      return source.GetNumber(name);
    case Kind.Bool:
      return source.GetBool(name);
  }
}
