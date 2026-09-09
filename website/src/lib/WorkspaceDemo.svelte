<script lang="ts">
  import PlanningFlow from './PlanningFlow.svelte'
  import AppleTimer from './AppleTimer.svelte'
  let mode = $state<'engineering' | 'research' | 'timer' | 'score'>('engineering')
  let prompt = $state('')
  let feedback = $state('')
  let selected = $state(0)
  function choose(next: 'engineering' | 'research' | 'timer' | 'score') { mode = next; selected = 0; feedback = '' }
  function submit(event: SubmitEvent) {
    event.preventDefault()
    if (/timer|pomodoro|apple|focus/i.test(prompt)) { choose('timer'); prompt = '' }
    else if (/madrid|score|football/i.test(prompt)) { choose('score'); prompt = '' }
    else if (/phd|teach|research|week/i.test(prompt)) { choose('research'); prompt = '' }
    else if (/code|feature|engineer|plan/i.test(prompt)) { choose('engineering'); prompt = '' }
    else feedback = 'Try a teaching and PhD plan, a feature plan, an apple timer, or a Real Madrid score.'
  }
</script>
<div class="arrangement-requests" aria-label="Try a workspace">
  <button class:chosen={mode === 'engineering'} aria-pressed={mode === 'engineering'} onclick={() => choose('engineering')}>“put my feature plan beside my work” ↗</button>
  <button class:chosen={mode === 'research'} aria-pressed={mode === 'research'} onclick={() => choose('research')}>“help me plan teaching and my PhD” ↗</button>
  <button class:chosen={mode === 'timer'} aria-pressed={mode === 'timer'} onclick={() => choose('timer')}>“a pomodoro, but make it an apple” ↗</button>
  <button class:chosen={mode === 'score'} aria-pressed={mode === 'score'} onclick={() => choose('score')}>“bring me the latest Real Madrid score” ↗</button>
</div>
<div class="possibility-workspace">
  <header><img src="/assets/character-356.svg" alt="" width="28" height="28" /><span>Remy <span class="workspace-name">/ {{engineering:'from idea to review',research:'teaching & research',timer:'a little focus',score:'match day'}[mode]}</span></span></header>
  <div hidden={mode !== 'timer'}><AppleTimer /></div>
  <div hidden={mode !== 'research'}><PlanningFlow kind="research" /></div>
  <div hidden={mode !== 'engineering'}><PlanningFlow kind="engineering" /></div>
  {#if mode === 'score'}
    <div class="score-board"><p>Champions League · 8 September 2026 · Full time</p><div class="match-score"><span>Real Madrid</span><strong>2 – 1</strong><span>Inter</span></div><p>Checked 9 September 2026. Saved result.</p><a href="https://cadenaser.com/nacional/2026/09/08/real-madrid-2-1-inter-de-milan-resumen-resultado-y-goles-del-partido-de-la-jornada-1-de-la-champions-league-cadena-ser/" target="_blank" rel="noreferrer">Read the match report on Cadena SER ↗</a></div>
  {/if}
  <form class="demo-composer" onsubmit={submit}><img src="/assets/character-356.svg" alt="" width="30" height="30" /><input aria-label="Ask Remy to change the workspace" bind:value={prompt} placeholder="What would help you here?" /><button class="send-button" disabled={!prompt.trim()} aria-label="Apply workspace request">↑</button></form>
</div>
{#if feedback}<p class="demo-feedback possibility-feedback" aria-live="polite">{feedback}</p>{/if}
