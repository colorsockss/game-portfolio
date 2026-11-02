export type EngineErrorType =
  | 'ParseError'
  | 'UnknownIdentifier'
  | 'UnknownFunction'
  | 'ArityError'
  | 'DivisionByZero'
  | 'CycleError'
  | 'TypeError'
  // Big 모드에서 결정적으로 계산할 수 없는 함수·연산자, 정수가 아닌 pow 지수
  | 'Unsupported';

export interface EngineError {
  type: EngineErrorType;
  message: string;
  start: number;
  end: number;
}

export function engineError(
  type: EngineErrorType,
  message: string,
  start = 0,
  end = 0,
): EngineError {
  return { type, message, start, end };
}
