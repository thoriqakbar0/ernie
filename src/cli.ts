#!/usr/bin/env node

import {
  defaultErnieUiControlSocketPath,
  requestErnieUiControl,
  runErnieUiControlCli,
} from './packages/ernie-ui-control/index.js';

const socketPath = defaultErnieUiControlSocketPath();
process.exitCode = await runErnieUiControlCli(process.argv.slice(2), {
  request: (command) => requestErnieUiControl(socketPath, command),
  writeError: (message) => console.error(message),
  writeOutput: (message) => console.log(message),
});
