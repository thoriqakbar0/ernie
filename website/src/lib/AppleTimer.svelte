<script lang="ts">
  import { onMount } from 'svelte'
  let duration = $state(25 * 60)
  let remaining = $state(25 * 60)
  let running = $state(false)
  let deadline = 0
  let phase = $state('Focus')
  let announcement = $state('')
  const display = $derived(`${Math.floor(remaining / 60).toString().padStart(2, '0')}:${(remaining % 60).toString().padStart(2, '0')}`)
  function update() { if (!running) return; remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); if (!remaining) { running = false; announcement = `${phase} finished. Ready for ${phase === 'Focus' ? 'a break' : 'another focus session'}?` } }
  function toggle() { if (running) { update(); running = false } else { if (!remaining) remaining = duration; deadline = Date.now() + remaining * 1000; running = true; announcement = '' } }
  function setPhase(next: string, seconds: number) { running = false; phase = next; duration = seconds; remaining = seconds; announcement = '' }
  onMount(() => { const interval = window.setInterval(update, 250); return () => window.clearInterval(interval) })
</script>
<div class="apple-timer">
  <div class="timer-tabs"><button aria-pressed={phase === 'Focus'} onclick={() => setPhase('Focus',1500)}>Focus · 25 min</button><button aria-pressed={phase === 'Break'} onclick={() => setPhase('Break',300)}>Break · 5 min</button></div>
  <div class="timer-apple" aria-hidden="true">🍎</div>
  <div class="timer-digits" role="timer" aria-label={`${phase} time remaining`}>{display}</div>
  <div class="timer-actions"><button onclick={toggle}>{running ? 'Pause' : remaining === duration ? 'Start' : 'Resume'}</button><button onclick={() => setPhase(phase,duration)}>Reset</button></div>
  <p aria-live="polite">{announcement}</p>
</div>
