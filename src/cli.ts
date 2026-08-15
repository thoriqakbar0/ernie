#!/usr/bin/env node

import {
  defaultErnieUiControlSocketPath,
  requestErnieUiControl,
  runErnieUiControlCli,
} from './packages/ernie-ui-control/index.js';

const socketPath = defaultErnieUiControlSocketPath();
process.exitCode = await runErnieUiControlCli(process.argv.slice(2), {
  requestCapabilities: () =>
    requestErnieUiControl(socketPath, { type: 'list-capabilities' }),
  requestCommand: (command) => requestErnieUiControl(socketPath, command),
  writeError: (message) => console.error(message),
  writeOutput: (message) => console.log(message),
});
