// Patch only the staged, bundled launcher. Installed dependencies and source Git state stay untouched.
const fs = require('node:fs/promises')
const path = require('node:path')
const { createRequire } = require('node:module')
module.exports = async function afterPack(context) {
  const project = process.env.ERNIE_HISTORY_BUILD_ROOT || path.resolve(__dirname, "..")
  const resources = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, context.packager.appInfo.productFilename + '.app', 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  const bundle = path.join(resources, 'app')
  const launcher = path.join(bundle, 'launcher.mjs')
  const source = await fs.readFile(launcher, 'utf8')
  const ending = 'main().catch((err) => {\n\tconsole.error("[launcher] fatal:", err);\n\tapp.exit(1);\n});'
  const pnpmInstall = 'cliArgs: [\n\t\t\t\t\tentry.path,\n\t\t\t\t\t"install",\n\t\t\t\t\t"--reporter=append-only"\n\t\t\t\t]'
  // The bundled Zenbu installer otherwise updates stale lockfiles during recovery.
  // Fail packaging if its pinned launcher changes instead of silently losing this guarantee.
  if ([ending, pnpmInstall, 'export {};'].some(fragment => source.split(fragment).length !== 2)) throw new Error('Zenbu launcher changed; review history integration before packaging.')
  const bootstrap = source.replace(pnpmInstall, pnpmInstall.replace('"--reporter=append-only"', '"--frozen-lockfile",\n\t\t\t\t\t"--reporter=append-only"'))
  await fs.writeFile(path.join(bundle,'zenbu-bootstrap.mjs'), bootstrap.replace(ending, '').replace('export {};', 'export { readAppConfig, appsDirFor, resolveMirror, readHostVersion, ensureAppsDir, ensureDepsInstalled, handoff };'))
  const requireFromVite = createRequire(require.resolve('vite', {paths:[project]}))
  const esbuild = requireFromVite('esbuild')
  const storeModule = path.join(project,'.zenbu','history-source-store.mjs')
  await esbuild.build({entryPoints:[path.join(project,'src/host/history/source-store.ts')],outfile:storeModule,bundle:true,platform:'node',format:'esm',target:'node22'})
  const {pathToFileURL} = require('node:url')
  const {SourceStore} = await import(pathToFileURL(storeModule).href + '?build=' + Date.now())
  // Stage the exact permitted source, including newly created files, without reading Git's index.
  const {Effect} = await import(pathToFileURL(require.resolve('effect', {paths:[project]})).href)
  const store = new SourceStore(path.join(project,'.zenbu','build','history-objects'))
  const snapshot = await Effect.runPromise(store.capture(project))
  const seed = path.join(bundle,'official-source')
  await store.materialize({...snapshot,id:'bundled',createdAt:new Date().toISOString(),origin:'official_update',title:'Official Ernie',hostVersion:context.packager.appInfo.version,dataGeneration:1,knownWorking:false,kept:false},seed)
  await esbuild.build({entryPoints:[path.join(project,'src/host/history/desktop.ts')],outfile:path.join(bundle,'history-host.mjs'),bundle:true,platform:'node',format:'esm',external:['electron'],target:'node22'})
  await esbuild.build({entryPoints:[path.join(project,'src/host/history/agent-cli.ts')],outfile:path.join(bundle,'history-agent.mjs'),bundle:true,platform:'node',format:'esm',external:['electron'],target:'node22'})
  await fs.copyFile(path.join(project,'src/host/history/preload.cjs'),path.join(bundle,'history-preload.cjs'))
  await fs.copyFile(path.join(project,'src/host/history/history.html'),path.join(bundle,'history.html'))
  await fs.copyFile(path.join(project,'src/host/history/history-ui.js'),path.join(bundle,'history-ui.js'))
  const binary = context.electronPlatformName === 'darwin'
    ? path.join('..','..','MacOS',context.packager.appInfo.productFilename)
    : path.relative(bundle,path.join(context.appOutDir,context.packager.appInfo.productFilename))
  if (context.electronPlatformName !== 'win32') {
    await fs.writeFile(path.join(bundle,'ernie-history'), '#!/bin/sh\nunset ELECTRON_RUN_AS_NODE\nbase=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$base/'+binary+'" "$base" --ernie-history-cli "$@"\n', {mode:0o755})
  }
  await fs.writeFile(launcher, `import { app, Menu, MenuItem } from 'electron';
import { readAppConfig, appsDirFor, resolveMirror, readHostVersion, ensureAppsDir, ensureDepsInstalled, handoff } from './zenbu-bootstrap.mjs';
async function launchHistory() {
const childArg = process.argv.find(value => value.startsWith('--ernie-history-child='));
const cli = process.argv.indexOf('--ernie-history-cli');
if (cli !== -1) {
  const { agentMain } = await import('./history-agent.mjs');
  try { await agentMain(process.argv.slice(cli + 1)); app.exit(0); } catch { process.stderr.write('Ernie history unavailable. Open Ernie and retry.\\n'); app.exit(1); }
} else if (childArg) {
  const directory = childArg.slice('--ernie-history-child='.length);
  app.on('before-quit',()=>process.send?.({type:'ernie-quit'}));
  app.on('web-contents-created', (_event, contents) => {
    const ready = setInterval(() => {
      if (contents.isDestroyed()) { clearInterval(ready); return; }
      void contents.executeJavaScript('Boolean(document.getElementById("ernie-workspace"))').then(async found => {
        if (found) {
          clearInterval(ready);
          const {callHistory}=await import('./history-agent.mjs');
          const menu=Menu.getApplicationMenu()??new Menu();
          menu.append(new MenuItem({label:'App recovery',submenu:[{label:'Recover Ernie…',click:()=>{void callHistory(process.env.ERNIE_HISTORY_HOME,{method:'history.open'}).catch(()=>{});}}]}));
          Menu.setApplicationMenu(menu);
          process.send?.({type:'ernie-ready'});
        }
      }).catch(() => {});
    }, 500);
    ready.unref();
  });
  try { await handoff(directory); } catch { process.send?.({type:'ernie-failed'}); app.exit(1); }
} else {
  await app.whenReady();
  const cfg=readAppConfig();
  if (cfg.packageManager.type !== 'pnpm') throw new Error('Ernie app history requires the bundled pnpm installer with frozen lockfiles.');
  const { homedir } = await import('node:os'); const { join } = await import('node:path');
  const source=join(homedir(),'.zenbu','apps','ernie'); const {version}=readHostVersion(app.getAppPath());
  const { existsSync } = await import('node:fs');
  const officialSource=join(app.getAppPath(),'official-source');
  const prepareSource=async()=>{ if (!existsSync(source)) { const {cp,rename,mkdir}=await import('node:fs/promises'); const pending=source+'.install-'+process.pid; await mkdir(join(source,'..'),{recursive:true}); await cp(officialSource,pending,{recursive:true}); await rename(pending,source); } };
  const { startHistoryDesktop }=await import('./history-host.mjs');
  await startHistoryDesktop({source,version,officialSource,prepareSource,install:directory=>ensureDepsInstalled(directory,cfg.packageManager)});
}
}
void launchHistory().catch(error=>{console.error('[history] startup failed:',error instanceof Error?error.message:'Unknown failure');app.exit(1);});
`)
}
