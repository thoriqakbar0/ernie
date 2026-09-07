import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('..', import.meta.url))
const child = spawn('nub', ['run', 'build:electron'], {cwd:root,stdio:'inherit',env:{...process.env,ERNIE_HISTORY_BUILD_ROOT:root}})
child.on('error',error=>{process.stderr.write(error.message+'\n');process.exitCode=1})
child.on('exit',code=>{process.exitCode=code??1})
