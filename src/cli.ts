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
    switch (parsed.command.type) {
      case 'focus':
        console.log('Ernie focused.');
        break;
      case 'set-theme':
        console.log(`Ernie theme set to ${parsed.command.theme}.`);
        break;
      case 'set-sidebar-open':
        console.log(`Ernie sidebar ${parsed.command.open ? 'shown' : 'hidden'}.`);
        break;
      case 'set-sidebar-width':
        console.log(`Ernie sidebar width set to ${parsed.command.width}px.`);
        break;
    }
  } else {
    console.error(result.error.message);
    process.exitCode = 1;
  }
}
