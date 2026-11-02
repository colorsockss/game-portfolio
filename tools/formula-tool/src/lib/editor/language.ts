import { StreamLanguage, LanguageSupport } from '@codemirror/language';
import { BUILTINS } from '$lib/engine';

const builtinNames = new Set(Object.keys(BUILTINS));

const streamParser = StreamLanguage.define({
  token(stream): string | null {
    if (stream.eatSpace()) return null;
    if (stream.match(/^[0-9]*\.?[0-9]+/)) return 'number';
    if (stream.match(/^[A-Za-z_][A-Za-z0-9_]*/)) {
      return builtinNames.has(stream.current()) ? 'keyword' : 'variableName';
    }
    if (stream.match(/^(<=|>=|==|!=|&&|\|\||[-+*/%<>!?:])/)) return 'operator';
    stream.next();
    return null;
  },
});

export const expressionLanguage = new LanguageSupport(streamParser);
