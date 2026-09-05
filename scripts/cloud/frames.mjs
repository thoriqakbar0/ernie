import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const [input, directory] = process.argv.slice(2);
if (!input || !directory) throw new Error('Usage: ernie-frames video.webm new-output-directory');
const output = resolve(directory);
// Require a new directory so frame extraction cannot overwrite earlier evidence.
await mkdir(output);
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_frames', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', resolve(input)], { maxBuffer: 32 * 1024 * 1024 }));
if (!Array.isArray(probe.frames) || probe.frames.length === 0) throw new Error('No video frames found');
const timestamps = probe.frames.map((frame) => {
  const seconds = Number(frame.best_effort_timestamp_time);
  if (!Number.isFinite(seconds)) throw new Error('Invalid frame timestamp');
  return seconds;
});
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', resolve(input), '-map', '0:v:0', '-fps_mode', 'passthrough', join(output, 'frame-%06d.png')], { stdio: 'inherit' });
await writeFile(join(output, 'timestamps.json'), JSON.stringify(timestamps));
await writeFile(join(output, 'index.html'), `<!doctype html>
<meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Interaction frames</title>
<style>body{font:16px system-ui;margin:24px;background:#f5f5f5;color:#171717}nav{display:flex;gap:12px;align-items:center;margin:16px 0}input{flex:1}img{max-width:100%;height:auto;border:1px solid #bbb}button{font:inherit;padding:8px}output{min-width:200px}</style>
<h1>Interaction frames</h1><p>Use the slider or left and right arrow keys. These are decoded video frames; capture may omit intermediate rendered frames.</p>
<nav><button id="previous">Previous</button><input aria-label="Frame" id="slider" type="range" min="1" max="${timestamps.length}" value="1"><button id="next">Next</button><output id="position"></output></nav>
<img id="frame" alt="Recorded interaction frame">
<script>
const times=${JSON.stringify(timestamps)};
const slider=document.getElementById('slider');
function show(){const n=Number(slider.value);document.getElementById('frame').src='frame-'+String(n).padStart(6,'0')+'.png';document.getElementById('position').textContent=n+' / '+times.length+' · '+times[n-1].toFixed(3)+' s'}
function move(amount){slider.value=String(Math.max(1,Math.min(times.length,Number(slider.value)+amount)));show()}
slider.addEventListener('input',show);
document.getElementById('previous').onclick=()=>move(-1);
document.getElementById('next').onclick=()=>move(1);
document.addEventListener('keydown',event=>{if(event.target===slider)return;if(event.key==='ArrowLeft'){event.preventDefault();move(-1)}if(event.key==='ArrowRight'){event.preventDefault();move(1)}});
show();
</script>`);
console.log(`Frames: ${timestamps.length}\nViewer: ${join(output, 'index.html')}`);
