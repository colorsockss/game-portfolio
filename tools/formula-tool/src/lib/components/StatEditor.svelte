<script lang="ts">
  import type { Stat, ActorKey } from '$lib/project/types';
  import { projectStore } from '$lib/stores/project.svelte';
  import ItemEditor from './ItemEditor.svelte';

  interface Props {
    stat: Stat;
  }
  let { stat }: Props = $props();

  function setDefault(actor: ActorKey, raw: string) {
    const n = Number(raw);
    stat.defaults[actor] = Number.isFinite(n) ? n : 0;
    projectStore.markDirty();
  }
</script>

<ItemEditor kind="stat" item={stat}>
  <label class="field">시전자 기본값
    <input type="number" value={stat.defaults.caster} onchange={(e) => setDefault('caster', e.currentTarget.value)} />
  </label>
  <label class="field">대상 기본값
    <input type="number" value={stat.defaults.target} onchange={(e) => setDefault('target', e.currentTarget.value)} />
  </label>
</ItemEditor>
