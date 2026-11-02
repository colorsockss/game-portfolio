import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

// chromeTheme에는 { dark: true }가 없다. 테마는 CM 패싯이 아니라 var()/CSS 캐스케이드로 정한다.
const chromeTheme = EditorView.theme({
  '&': {
    color: 'var(--text)',
    backgroundColor: 'var(--surface)',
  },
  '.cm-content': {
    caretColor: 'var(--text)',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--text)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-2)',
    color: 'var(--text-faint)',
    border: 'none',
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: tags.number, color: 'var(--syntax-number)' },
  { tag: tags.keyword, color: 'var(--syntax-func)' },
  { tag: tags.variableName, color: 'var(--syntax-ident)' },
  { tag: tags.operator, color: 'var(--syntax-operator)' },
]);

export const expressionEditorTheme: Extension = [chromeTheme, syntaxHighlighting(highlightStyle)];
