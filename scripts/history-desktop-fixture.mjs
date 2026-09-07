import { mkdtemp, mkdir, writeFile, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite'))('esbuild')
const root = await mkdtemp(join(tmpdir(), 'ernie-recovery-fixture-'))
const source = join(root,'source')
const host = join(root,'host')
await mkdir(join(source,'src'),{recursive:true})
await mkdir(host,{recursive:true})
for (const name of ['package.json','pnpm-lock.yaml','zenbu.config.ts','zenbu.plugin.ts','zenbu.plugins.jsonc','tsconfig.json']) await writeFile(join(source,name),'{}')
await writeFile(join(source,'src','app.ts'),'working')
await writeFile(join(source,'.env'),'excluded fixture data')
await esbuild.build({entryPoints:['src/host/history/desktop.ts'],outfile:join(host,'history-host.mjs'),bundle:true,platform:'node',format:'esm',external:['electron'],target:'node22'})
for (const [from,to] of [['preload.cjs','history-preload.cjs'],['history.html','history.html'],['history-ui.js','history-ui.js']]) await copyFile(join('src/host/history',from),join(host,to))
await writeFile(join(host,'package.json'),JSON.stringify({name:'ernie-recovery-fixture',version:'1.0.0',main:'main.mjs',type:'module'}))
await writeFile(join(host,'main.mjs'),`import {app,BrowserWindow} from 'electron';
import {readFile} from 'node:fs/promises';import {join} from 'node:path';
app.setName('Ernie Recovery Fixture');app.setPath('userData',${JSON.stringify(join(root,'user-data'))});
async function run() {
const child=process.argv.find(arg=>arg.startsWith('--ernie-history-child='));
if(child){
 await app.whenReady();const source=child.slice('--ernie-history-child='.length);
 if((await readFile(join(source,'src','app.ts'),'utf8'))!=='working') app.exit(1);
 else {const window=new BrowserWindow({width:550,height:300});await window.loadURL('data:text/html,<h1 id="ernie-workspace">Disposable Ernie application</h1><p>This fixture does not use real conversations or files.</p>');process.send?.({type:'ernie-ready'});}
}else{const {startHistoryDesktop}=await import('./history-host.mjs');await startHistoryDesktop({source:${JSON.stringify(source)},home:${JSON.stringify(join(root,'history'))},version:'fixture',install:async()=>{}});}
}
void run().catch(error=>{console.error(error);app.exit(1)});
`)
const executable = require('electron')
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(executable,[host],{env,stdio:'inherit'})
process.stdout.write(JSON.stringify({fixtureRoot:root,source,host,pid:child.pid})+'\n')
child.on('error',error=>{process.stderr.write(error.message+'\n');process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
