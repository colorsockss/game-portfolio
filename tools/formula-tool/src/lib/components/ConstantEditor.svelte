<script lang="ts">
  import type { Constant } from '$lib/project/types';
  import { projectStore } from '$lib/stores/project.svelte';
  import ItemEditor from './ItemEditor.svelte';

  interface Props {
    constant: Constant;
    // 입력(Project.inputs)도 모양이 같아 이 편집기를 쓴다. 입력의 값은 시뮬레이션의 기본값이다.
    kind?: 'constant' | 'input';
  }
  let { constant, kind = 'constant' }: Props = $props();

  function setNumber(raw: string) {
    constant.value = Number(raw) || 0;
    projectStore.markDirty();
  }
</script>

<ItemEditor {kind} item={constant}>
  {#snippet hint()}
    {#if kind === 'input'}
      <p class="hint">공식을 부르는 쪽이 <code>Formula.get</code>의 마지막 인자로 넘기는 값입니다.</p>
    {/if}
  {/snippet}
  <label class="field">{kind === 'input' ? '기본값 (시뮬레이션)' : '값'}
    <input type="number" value={constant.value} onchange={(e) => setNumber(e.currentTarget.value)} />
  </label>
</ItemEditor>
