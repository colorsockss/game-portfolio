<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { EditorView, keymap } from '@codemirror/view';
  import { EditorState } from '@codemirror/state';
  import { minimalSetup } from 'codemirror';
  import {
    autocompletion,
    completionKeymap,
    type CompletionContext,
    type CompletionResult,
  } from '@codemirror/autocomplete';
  import { linter, lintGutter } from '@codemirror/lint';
  import type { Project } from '$lib/project/types';
  import { expressionLanguage } from './language';
  import { expressionCompletions } from './completions';
  import { expressionDiagnostics } from './lint';
  import { expressionEditorTheme } from './editor-theme';

  interface Props {
    value: string;
    project: Project;
    formulaKey: string;
    onChange: (value: string) => void;
  }
  // EditorView는 onMount에서 한 번만 생성된다. props는 마운트 이후 동기화되지 않는다 —
  // project는 객체 참조라 클로저가 최신 상태를 읽지만, formulaKey/value는 원시값이라
  // 마운트 시점 값으로 고정된다. 부모는 공식이 바뀌면 {#key formulaId}로 이 컴포넌트를
  // 다시 마운트해야 한다.
  let { value, project, formulaKey, onChange }: Props = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;

  function complete(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
    if (!word || (word.from === word.to && !context.explicit)) return null;
    return {
      from: word.from,
      options: expressionCompletions(project),
      validFor: /^[A-Za-z_][A-Za-z0-9_]*$/,
    };
  }

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          minimalSetup,
          expressionEditorTheme,
          expressionLanguage,
          EditorView.lineWrapping,
          autocompletion({ override: [complete] }),
          linter((v) => expressionDiagnostics(v.state.doc.toString(), formulaKey, project), {
            delay: 150,
          }),
          lintGutter(),
          keymap.of(completionKeymap),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
  });

  onDestroy(() => view?.destroy());
</script>

<div class="expr-editor" bind:this={host}></div>

<style>
  .expr-editor :global(.cm-editor) {
    border: 1px solid var(--border-strong);
    border-radius: var(--radius);
    font-size: 14px;
    min-height: 2.5em;
  }
  .expr-editor :global(.cm-editor.cm-focused) {
    outline: 2px solid var(--accent);
    outline-offset: -1px;
  }
  .expr-editor :global(.cm-content) {
    padding: 8px 4px;
    outline: none;
  }
</style>
