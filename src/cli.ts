#!/usr/bin/env node

import { homedir } from 'node:os';
import path from 'node:path';

import {
  requestErnieUiControl,
  runErnieUiControlCli,
} from './packages/ernie-ui-control/index.js';

const socketPath = path.join(
  homedir(),
  'Library',
  'Application Support',
  'Ernie',
  'ui-control.sock',
);
process.exitCode = await runErnieUiControlCli(process.argv.slice(2), {
  request: (command) => requestErnieUiControl(socketPath, command),
  writeError: (message) => console.error(message),
  writeOutput: (message) => console.log(message),
});
