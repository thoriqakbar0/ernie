<script lang="ts">
  import { untrack } from 'svelte'
  let { kind }: { kind: 'research' | 'engineering' } = $props()
  const initialKind = untrack(() => kind)
  let stage = $state(0)
  let newTask = $state('')
  let tasks = $state(initialKind === 'research' ? [
    { text: 'Prepare next week’s lesson outline', done: false },
    { text: 'Compare methods in three papers', done: false },
    { text: 'Draft questions for my supervisor', done: false },
  ] : [
    { text: 'Write the expected behavior', done: false },
    { text: 'Trace the existing implementation', done: false },
    { text: 'Break the change into reviewable tasks', done: false },
  ])
  const stages = initialKind === 'research' ? ['Plan the week', 'Read & connect', 'Write & review'] : ['Understand', 'Build', 'Verify & review']
  const notes = initialKind === 'research' ? ['Protect a writing block around teaching. Choose one useful outcome for each.', 'Put paper notes beside the research question. Record methods, findings, and gaps.', 'Turn the notes into a section outline. Keep supervisor questions in view.'] : ['Define the problem and acceptance criteria before changing code.', 'Keep the plan beside the implementation. Work through one small change at a time.', 'Check behavior, run relevant tests, and collect the evidence for review.']
  const complete = $derived(tasks.filter(task => task.done).length)
  function add(event: SubmitEvent) { event.preventDefault(); if (!newTask.trim()) return; tasks.push({text:newTask.trim(),done:false}); newTask='' }
</script>
<div class="planning-flow">
  <nav aria-label="Planning stages">{#each stages as label, i}<button aria-current={stage === i ? 'step' : undefined} onclick={() => stage=i}><span>0{i+1}</span>{label}</button>{/each}</nav>
  <div class="planning-body"><div><h3>{stages[stage]}</h3><p>{notes[stage]}</p><label class="planning-note">{kind === 'research' ? 'This week’s research question' : 'What should this change do?'}<textarea placeholder={kind === 'research' ? 'What do I need to understand next?' : 'Describe the outcome for the person using it…'}></textarea></label></div>
  <div class="planning-tasks"><p>{complete} of {tasks.length} tasks done</p>{#each tasks as task}<label><input type="checkbox" bind:checked={task.done}/><span class:task-done={task.done}>{task.text}</span></label>{/each}<form onsubmit={add}><input aria-label="New planning task" bind:value={newTask} placeholder="Add your next step…" maxlength="160"/><button disabled={!newTask.trim()}>Add</button></form><button class="next-stage" onclick={() => stage = (stage+1)%stages.length}>{stage === stages.length-1 ? 'Back to the plan' : 'Next: '+stages[stage+1]} →</button></div></div>
</div>
