#!/usr/bin/env node

import { homedir } from 'node:os';
import path from 'node:path';

import {
  parseErnieUiControlCliArguments,
  requestErnieUiControl,
} from './packages/ernie-ui-control/index.js';

const parsed = parseErnieUiControlCliArguments(process.argv.slice(2));
if (!parsed.ok) {
  console.error(parsed.message);
  process.exitCode = 2;
} else {
  const socketPath = path.join(
    homedir(),
    'Library',
    'Application Support',
    'Ernie',
    'ui-control.sock',
  );
  const result = await requestErnieUiControl(socketPath, parsed.command);
  if (result.ok) {
    console.log('Ernie focused.');
  } else {
    console.error(result.error.message);
    process.exitCode = 1;
  }
}
