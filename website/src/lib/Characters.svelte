<script lang="ts">
  let { seeds = [356, 17, 85] }: { seeds?: readonly number[] } = $props()
</script>
<div class="characters" aria-hidden="true">{#each seeds as seed}<img src={`/assets/character-${seed}.svg`} alt="" width="48" height="48" />{/each}</div>
