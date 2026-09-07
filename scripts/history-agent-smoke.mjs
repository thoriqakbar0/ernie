import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {spawn} from 'node:child_process'
const require=createRequire(import.meta.url)
const esbuild=createRequire(require.resolve('vite'))('esbuild')
const root=await mkdtemp(join(tmpdir(),'ernie-agent-history-'))
const source=join(root,'source');const home=join(root,'history')
await mkdir(join(source,'src'),{recursive:true})
for(const file of ['package.json','pnpm-lock.yaml','zenbu.config.ts','zenbu.plugin.ts','zenbu.plugins.jsonc','tsconfig.json'])await writeFile(join(source,file),'{}')
await writeFile(join(source,'src','app.ts'),'quoted application source')
await esbuild.build({stdin:{contents:'export {HistoryController} from "./src/host/history/controller"; export {serveHistory} from "./src/host/history/transport";',resolveDir:process.cwd()},outfile:join(root,'controller.mjs'),bundle:true,platform:'node',format:'esm'})
await esbuild.build({entryPoints:['src/host/history/agent-cli.ts'],outfile:join(root,'agent.mjs'),bundle:true,platform:'node',format:'esm'})
const {HistoryController,serveHistory}=await import(pathToFileURL(join(root,'controller.mjs')))
const controller=await HistoryController.open({home,initialSource:source,hostVersion:'fixture',dataGeneration:1,managed:true,recoveryAvailable:true,activation:{open:async()=>{},install:async()=>{},requestApproval:()=>{}}})
const close=await serveHistory(controller,home)
const run=(args,input='')=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,['--input-type=module','-e',`import {agentMain} from ${JSON.stringify(pathToFileURL(join(root,'agent.mjs')).href)};await agentMain(process.argv.slice(1));`,"--",...args],{env:{...process.env,ERNIE_HISTORY_HOME:home},stdio:['pipe','pipe','pipe']})
 let output='',error='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk)
 child.on('error',reject);child.on('exit',code=>code===0?resolve(output.trim().split('\n').map(line=>JSON.parse(line))):reject(new Error(error)))
 child.stdin.end(input)
})
try{
 const [cli]=await run(['history.status'])
 const rpc=await run(['--mcp'],[
  {jsonrpc:'2.0',id:1,method:'initialize'},
  {jsonrpc:'2.0',id:2,method:'tools/list'},
  {jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'history_status',arguments:{}}},
  {jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'history_activate',arguments:{}}},
 ].map(item=>JSON.stringify(item)).join('\n')+'\n')
 const status=JSON.parse(rpc.find(item=>item.id===3).result.content[0].text)
 assert.equal(cli.value.currentCheckpointId,status.value.currentCheckpointId)
 assert.equal(status.value.workspace,source)
 assert.ok(rpc.find(item=>item.id===4).error)
 assert.ok(!rpc.find(item=>item.id===2).result.tools.some(tool=>tool.name==='history_activate'))
 console.log('CLI and MCP agree on workspace and checkpoint; activation is unavailable to agents.')
}finally{await close();controller.stopWatching();await rm(root,{recursive:true,force:true})}
