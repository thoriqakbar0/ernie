import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  createErnieUiControlCapabilityRegistry,
  DuplicateUiCapabilityIdError,
  DuplicateUiCommandIdError,
  DuplicateUiCommandPathError,
  InvalidUiCapabilityDefinitionError,
  parseErnieUiControlCapabilityManifest,
  parseErnieUiControlCliArguments,
  parseErnieUiControlRequest,
  parseErnieUiControlResult,
  requestErnieUiControl,
  runErnieUiControlCli,
  startErnieUiControlServer,
  UiCapabilityRegistryClosedError,
  type ErnieUiControlCapabilityRegistration,
  type ErnieUiControlCommand,
  type ErnieUiControlInputConstraint,
} from '../index';

const windowCapabilityRegistration = {
  commands: [
    {
      id: 'focus',
      inputConstraints: [],
      path: ['ui', 'focus'],
      resultDescription: 'The Ernie window receives focus.',
    },
  ],
  id: 'window',
  summary: 'Control the Ernie application window.',
} as const satisfies ErnieUiControlCapabilityRegistration;

test('parses only supported UI commands and versions', () => {
  assert.deepEqual(
    parseErnieUiControlRequest({
      command: { type: 'focus' },
      version: 1,
    }),
    { type: 'focus' },
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { type: 'send-task' },
      version: 1,
    }),
    null,
  );
  assert.deepEqual(
    parseErnieUiControlRequest({
      command: { theme: 'dark', type: 'set-theme' },
      version: 1,
    }),
    { theme: 'dark', type: 'set-theme' },
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { theme: 'system', type: 'set-theme' },
      version: 1,
    }),
    null,
  );
  assert.deepEqual(
    parseErnieUiControlRequest({
      command: { open: true, type: 'set-sidebar-open' },
      version: 1,
    }),
    { open: true, type: 'set-sidebar-open' },
  );
  assert.deepEqual(
    parseErnieUiControlRequest({
      command: { type: 'set-sidebar-width', width: 320 },
      version: 1,
    }),
    { type: 'set-sidebar-width', width: 320 },
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { type: 'set-sidebar-width', width: 191 },
      version: 1,
    }),
    null,
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { type: 'set-sidebar-width', width: 320.5 },
      version: 1,
    }),
    null,
  );
  assert.equal(
    parseErnieUiControlRequest({
      command: { type: 'focus' },
      version: 2,
    }),
    null,
  );
  assert.deepEqual(parseErnieUiControlCliArguments(['ui', 'focus']), {
    command: { type: 'focus' },
    ok: true,
  });
  assert.deepEqual(parseErnieUiControlCliArguments(['--', 'ui', 'focus']), {
    command: { type: 'focus' },
    ok: true,
  });
  assert.deepEqual(
    parseErnieUiControlCliArguments(['ui', 'theme', 'dark']),
    {
      command: { theme: 'dark', type: 'set-theme' },
      ok: true,
    },
  );
  assert.deepEqual(
    parseErnieUiControlCliArguments(['--', 'ui', 'theme', 'light']),
    {
      command: { theme: 'light', type: 'set-theme' },
      ok: true,
    },
  );
  assert.equal(
    parseErnieUiControlCliArguments(['ui', 'theme', 'system']).ok,
    false,
  );
  assert.deepEqual(
    parseErnieUiControlCliArguments(['ui', 'sidebar', 'show']),
    {
      command: { open: true, type: 'set-sidebar-open' },
      ok: true,
    },
  );
  assert.deepEqual(
    parseErnieUiControlCliArguments(['ui', 'sidebar', 'hide']),
    {
      command: { open: false, type: 'set-sidebar-open' },
      ok: true,
    },
  );
  assert.deepEqual(
    parseErnieUiControlCliArguments(['--', 'ui', 'sidebar', 'width', '320']),
    {
      command: { type: 'set-sidebar-width', width: 320 },
      ok: true,
    },
  );
  assert.equal(
    parseErnieUiControlCliArguments(['ui', 'sidebar', 'width', '191']).ok,
    false,
  );
  assert.equal(
    parseErnieUiControlCliArguments(['ui', 'sidebar', 'width', '320.5']).ok,
    false,
  );
  assert.equal(parseErnieUiControlCliArguments(['agent', 'list']).ok, false);
});

test('accepts every documented sidebar width', () => {
  for (let width = 192; width <= 384; width += 1) {
    assert.deepEqual(
      parseErnieUiControlCliArguments([
        'ui',
        'sidebar',
        'width',
        String(width),
      ]),
      { command: { type: 'set-sidebar-width', width }, ok: true },
    );
  }
});

test('parses safe UI-control responses', () => {
  assert.deepEqual(parseErnieUiControlResult({ ok: true, version: 1 }), {
    ok: true,
    version: 1,
  });
  assert.deepEqual(
    parseErnieUiControlResult({
      error: { code: 'ui_unavailable', message: 'No window.' },
      ok: false,
      version: 1,
    }),
    {
      error: { code: 'ui_unavailable', message: 'No window.' },
      ok: false,
      version: 1,
    },
  );
  assert.equal(
    parseErnieUiControlResult({
      error: { code: 'secret', message: 'No.' },
      ok: false,
      version: 1,
    }),
    null,
  );
});

test('rejects malformed Capability manifests at the response boundary', () => {
  const discoveryCapability = {
    availability: { status: 'available' },
    commands: [
      {
        id: 'list-capabilities',
        inputConstraints: [],
        path: ['ui', 'capabilities'],
        resultDescription: 'A versioned Capability manifest is returned.',
      },
    ],
    id: 'discovery',
    source: 'built-in',
    summary: 'Inspect Ernie built-in UI controls.',
  } as const;
  const manifest = {
    capabilities: [discoveryCapability],
    schemaVersion: 1,
  } as const;
  assert.deepEqual(
    parseErnieUiControlResult({ manifest, ok: true, version: 1 }),
    { manifest, ok: true, version: 1 },
  );

  const invalidManifests = [
    { capabilities: [], schemaVersion: 1 },
    {
      capabilities: [
        {
          ...discoveryCapability,
          commands: [
            { ...discoveryCapability.commands[0], id: 'not stable' },
          ],
        },
      ],
      schemaVersion: 1,
    },
    {
      capabilities: [
        {
          ...discoveryCapability,
          commands: [
            {
              ...discoveryCapability.commands[0],
              inputConstraints: [
                { kind: 'enum', name: 'theme', values: [] },
              ],
            },
          ],
        },
      ],
      schemaVersion: 1,
    },
    {
      capabilities: [
        {
          ...discoveryCapability,
          commands: [
            {
              ...discoveryCapability.commands[0],
              path: ['plugin', 'capabilities'],
            },
          ],
        },
      ],
      schemaVersion: 1,
    },
    {
      capabilities: [
        discoveryCapability,
        {
          ...discoveryCapability,
          commands: [
            {
              ...discoveryCapability.commands[0],
              id: 'inspect-capabilities',
              path: ['ui', 'inspect-capabilities'],
            },
          ],
        },
      ],
      schemaVersion: 1,
    },
    {
      capabilities: [
        discoveryCapability,
        {
          ...discoveryCapability,
          commands: [
            {
              ...discoveryCapability.commands[0],
              id: 'inspect-capabilities',
            },
          ],
          id: 'inspection',
        },
      ],
      schemaVersion: 1,
    },
  ];
  for (const invalidManifest of invalidManifests) {
    assert.equal(
      parseErnieUiControlResult({
        manifest: invalidManifest,
        ok: true,
        version: 1,
      }),
      null,
    );
  }

  interface CyclicManifest {
    self?: CyclicManifest;
  }
  const cyclicManifest: CyclicManifest = {};
  cyclicManifest.self = cyclicManifest;
  assert.equal(parseErnieUiControlCapabilityManifest(cyclicManifest), null);
  assert.equal(
    parseErnieUiControlCapabilityManifest(
      Object.defineProperty({}, 'capabilities', {
        enumerable: true,
        get: () => {
          throw new Error('private manifest getter failure');
        },
      }),
    ),
    null,
  );
});

test('controls Ernie through an owner-only local socket', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  const commands: ErnieUiControlCommand[] = [];
  const started = await startErnieUiControlServer(
    socketPath,
    (command) => {
      commands.push(command);
      return { ok: true, version: 1 };
    },
    () => undefined,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  try {
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
    assert.deepEqual(
      await requestErnieUiControl(socketPath, { type: 'focus' }),
      { ok: true, version: 1 },
    );
    assert.deepEqual(
      await requestErnieUiControl(socketPath, {
        theme: 'dark',
        type: 'set-theme',
      }),
      { ok: true, version: 1 },
    );
    assert.deepEqual(
      await requestErnieUiControl(socketPath, {
        open: false,
        type: 'set-sidebar-open',
      }),
      { ok: true, version: 1 },
    );
    assert.deepEqual(
      await requestErnieUiControl(socketPath, {
        type: 'set-sidebar-width',
        width: 320,
      }),
      { ok: true, version: 1 },
    );
    assert.deepEqual(commands, [
      { type: 'focus' },
      { theme: 'dark', type: 'set-theme' },
      { open: false, type: 'set-sidebar-open' },
      { type: 'set-sidebar-width', width: 320 },
    ]);
  } finally {
    await started.value.close();
    await assert.rejects(stat(socketPath));
    await rm(directory, { force: true, recursive: true });
  }
});

test('rejects a response kind that does not match its request', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-ui-control-response-kind-'),
  );
  const socketPath = path.join(directory, 'ui-control.sock');
  const server = createServer((socket) => {
    socket.once('data', () => socket.end('{"ok":true,"version":1}\n'));
  });
  await new Promise<void>((resolve) => server.listen(socketPath, resolve));

  try {
    assert.deepEqual(
      await requestErnieUiControl(socketPath, { type: 'list-capabilities' }),
      {
        error: {
          code: 'invalid_response',
          message: 'Ernie returned an invalid UI response.',
        },
        ok: false,
        version: 1,
      },
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { force: true, recursive: true });
  }
});

test('runs existing UI commands through the public CLI seam', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-cli-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  const commands: ErnieUiControlCommand[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const started = await startErnieUiControlServer(
    socketPath,
    (command) => {
      commands.push(command);
      return { ok: true, version: 1 };
    },
    () => undefined,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  try {
    const runtime = {
      requestCapabilities: () =>
        requestErnieUiControl(socketPath, { type: 'list-capabilities' }),
      requestCommand: (command: ErnieUiControlCommand) =>
        requestErnieUiControl(socketPath, command),
      writeError: (message: string) => errors.push(message),
      writeOutput: (message: string) => output.push(message),
    };
    const cases = [
      {
        arguments_: ['ui', 'focus'],
        command: { type: 'focus' },
        output: 'Ernie focused.',
      },
      {
        arguments_: ['ui', 'theme', 'dark'],
        command: { theme: 'dark', type: 'set-theme' },
        output: 'Ernie theme set to dark.',
      },
      {
        arguments_: ['ui', 'theme', 'light'],
        command: { theme: 'light', type: 'set-theme' },
        output: 'Ernie theme set to light.',
      },
      {
        arguments_: ['ui', 'sidebar', 'show'],
        command: { open: true, type: 'set-sidebar-open' },
        output: 'Ernie sidebar shown.',
      },
      {
        arguments_: ['ui', 'sidebar', 'hide'],
        command: { open: false, type: 'set-sidebar-open' },
        output: 'Ernie sidebar hidden.',
      },
      {
        arguments_: ['--', 'ui', 'sidebar', 'width', '320'],
        command: { type: 'set-sidebar-width', width: 320 },
        output: 'Ernie sidebar width set to 320px.',
      },
      {
        arguments_: ['ui', 'sidebar', 'width', '192'],
        command: { type: 'set-sidebar-width', width: 192 },
        output: 'Ernie sidebar width set to 192px.',
      },
      {
        arguments_: ['ui', 'sidebar', 'width', '384'],
        command: { type: 'set-sidebar-width', width: 384 },
        output: 'Ernie sidebar width set to 384px.',
      },
    ] as const;

    for (const testCase of cases) {
      assert.equal(
        await runErnieUiControlCli(testCase.arguments_, runtime),
        0,
      );
    }

    assert.deepEqual(
      commands,
      cases.map((testCase) => testCase.command),
    );
    assert.deepEqual(
      output,
      cases.map((testCase) => testCase.output),
    );
    assert.deepEqual(errors, []);
  } finally {
    await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('discovers built-in UI capabilities through the public CLI seam', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-ui-capabilities-cli-'),
  );
  const socketPath = path.join(directory, 'ui-control.sock');
  const commands: ErnieUiControlCommand[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const started = await startErnieUiControlServer(
    socketPath,
    (command) => {
      commands.push(command);
      return { ok: true, version: 1 };
    },
    () => undefined,
    (capabilityId) => ({
      status: capabilityId === 'theme' ? 'unavailable' : 'available',
    }),
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  const expectedManifest = {
    capabilities: [
      {
        availability: { status: 'available' },
        commands: [
          {
            id: 'list-capabilities',
            inputConstraints: [],
            path: ['ui', 'capabilities'],
            resultDescription:
              'A versioned manifest of built-in UI capabilities.',
          },
        ],
        id: 'discovery',
        source: 'built-in',
        summary: 'Inspect Ernie built-in UI controls.',
      },
      {
        availability: { status: 'available' },
        commands: [
          {
            id: 'focus',
            inputConstraints: [],
            path: ['ui', 'focus'],
            resultDescription: 'The Ernie window receives focus.',
          },
        ],
        id: 'window',
        source: 'built-in',
        summary: 'Control the Ernie application window.',
      },
      {
        availability: { status: 'unavailable' },
        commands: [
          {
            id: 'set-theme',
            inputConstraints: [
              {
                kind: 'enum',
                name: 'theme',
                values: ['dark', 'light'],
              },
            ],
            path: ['ui', 'theme'],
            resultDescription: 'The requested color theme is applied.',
          },
        ],
        id: 'theme',
        source: 'built-in',
        summary: 'Control the Ernie color appearance.',
      },
      {
        availability: { status: 'available' },
        commands: [
          {
            id: 'set-sidebar-open',
            inputConstraints: [
              {
                kind: 'enum',
                name: 'visibility',
                values: ['show', 'hide'],
              },
            ],
            path: ['ui', 'sidebar'],
            resultDescription: 'The requested sidebar visibility is applied.',
          },
          {
            id: 'set-sidebar-width',
            inputConstraints: [
              {
                kind: 'integer',
                maximum: 384,
                minimum: 192,
                name: 'width',
              },
            ],
            path: ['ui', 'sidebar', 'width'],
            resultDescription: 'The requested sidebar width is applied.',
          },
        ],
        id: 'sidebar',
        source: 'built-in',
        summary: 'Control the Ernie sidebar presentation.',
      },
    ],
    schemaVersion: 1,
  };

  try {
    const exitCode = await runErnieUiControlCli(['ui', 'capabilities'], {
      requestCapabilities: () =>
        requestErnieUiControl(socketPath, { type: 'list-capabilities' }),
      requestCommand: (command) => requestErnieUiControl(socketPath, command),
      writeError: (message) => errors.push(message),
      writeOutput: (message) => output.push(message),
    });

    assert.equal(exitCode, 0);
    assert.deepEqual(output, [JSON.stringify(expectedManifest, null, 2)]);
    assert.deepEqual(errors, []);
    assert.deepEqual(commands, []);
    assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
  } finally {
    await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('rejects a duplicate UI capability identifier', () => {
  const registry = createErnieUiControlCapabilityRegistry();

  assert.deepEqual(registry.register(windowCapabilityRegistration), {
    ok: true,
  });
  const duplicate = registry.register(windowCapabilityRegistration);
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.equal(duplicate.error instanceof DuplicateUiCapabilityIdError, true);
  assert.equal(duplicate.error.code, 'duplicate_capability_id');
  assert.equal(
    duplicate.error.message,
    'UI capability "window" is already registered.',
  );
});

test('rejects a duplicate UI capability command path', () => {
  const registry = createErnieUiControlCapabilityRegistry();
  const conflictingRegistration = {
    commands: [
      {
        id: 'raise-window',
        inputConstraints: [],
        path: ['ui', 'focus'],
        resultDescription: 'The Ernie window is raised.',
      },
    ],
    id: 'other-window',
    summary: 'Control another window operation.',
  } satisfies ErnieUiControlCapabilityRegistration;

  assert.deepEqual(registry.register(windowCapabilityRegistration), {
    ok: true,
  });
  const duplicate = registry.register(conflictingRegistration);
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.equal(duplicate.error instanceof DuplicateUiCommandPathError, true);
  assert.equal(duplicate.error.code, 'duplicate_command_path');
  assert.equal(
    duplicate.error.message,
    'UI command path "ui focus" is already registered.',
  );

  const internallyConflictingRegistry =
    createErnieUiControlCapabilityRegistry();
  const internalDuplicate = internallyConflictingRegistry.register({
      ...windowCapabilityRegistration,
      commands: [
        windowCapabilityRegistration.commands[0],
        {
          ...windowCapabilityRegistration.commands[0],
          id: 'raise-window',
        },
      ],
    });
  assert.equal(internalDuplicate.ok, false);
  if (internalDuplicate.ok) return;
  assert.equal(
    internalDuplicate.error instanceof DuplicateUiCommandPathError,
    true,
  );
});

test('rejects a duplicate UI capability command identifier', () => {
  const registry = createErnieUiControlCapabilityRegistry();
  const conflictingRegistration = {
    commands: [
      {
        id: 'focus',
        inputConstraints: [],
        path: ['ui', 'raise'],
        resultDescription: 'The Ernie window is raised.',
      },
    ],
    id: 'other-window',
    summary: 'Control another window operation.',
  } satisfies ErnieUiControlCapabilityRegistration;

  assert.deepEqual(registry.register(windowCapabilityRegistration), {
    ok: true,
  });
  const duplicate = registry.register(conflictingRegistration);
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.equal(duplicate.error instanceof DuplicateUiCommandIdError, true);
  assert.equal(duplicate.error.code, 'duplicate_command_id');
  assert.equal(
    duplicate.error.message,
    'UI command identifier "focus" is already registered.',
  );
});

test('rejects malformed UI capability definitions without throwing', () => {
  interface CyclicDefinition {
    self?: CyclicDefinition;
  }
  const cyclicDefinition: CyclicDefinition = {};
  cyclicDefinition.self = cyclicDefinition;
  const getterFailure = new Error('private getter failure');
  const throwingDefinition = Object.defineProperty({}, 'summary', {
    enumerable: true,
    get: () => {
      throw getterFailure;
    },
  });
  const cyclicResult = createErnieUiControlCapabilityRegistry().register(
    cyclicDefinition,
  );
  assert.equal(cyclicResult.ok, false);
  if (!cyclicResult.ok) {
    assert.equal(cyclicResult.error.cause instanceof RangeError, true);
  }
  const throwingResult = createErnieUiControlCapabilityRegistry().register(
    throwingDefinition,
  );
  assert.equal(throwingResult.ok, false);
  if (!throwingResult.ok) {
    assert.equal(throwingResult.error.cause, getterFailure);
  }
  const invalidRegistrations = [
    { ...windowCapabilityRegistration, id: '' },
    { ...windowCapabilityRegistration, summary: '   ' },
    { ...windowCapabilityRegistration, summary: undefined },
    { ...windowCapabilityRegistration, commands: [] },
    {
      ...windowCapabilityRegistration,
      commands: [{ ...windowCapabilityRegistration.commands[0], id: '' }],
    },
    {
      ...windowCapabilityRegistration,
      commands: [{ ...windowCapabilityRegistration.commands[0], path: [] }],
    },
    {
      ...windowCapabilityRegistration,
      commands: [
        {
          ...windowCapabilityRegistration.commands[0],
          resultDescription: ' ',
        },
      ],
    },
    {
      ...windowCapabilityRegistration,
      commands: [
        {
          ...windowCapabilityRegistration.commands[0],
          inputConstraints: [
            { kind: 'enum', name: 'theme', values: [] },
          ],
        },
      ],
    },
  ] satisfies readonly unknown[];

  for (const invalidRegistration of invalidRegistrations) {
    const registry = createErnieUiControlCapabilityRegistry();
    const result = registry.register(invalidRegistration);
    assert.equal(result.ok, false);
    if (result.ok) continue;
    assert.equal(
      result.error instanceof InvalidUiCapabilityDefinitionError,
      true,
    );
    assert.equal(result.error.code, 'invalid_definition');
    assert.equal(result.error.message, 'UI capability definition is invalid.');
  }
});

test('rejects UI capability registration after startup closes', () => {
  const registry = createErnieUiControlCapabilityRegistry();
  registry.close();

  const result = registry.register(windowCapabilityRegistration);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error instanceof UiCapabilityRegistryClosedError, true);
  assert.equal(result.error.code, 'registry_closed');
  assert.equal(result.error.message, 'UI capability registration is closed.');
});

test('snapshots accepted UI capability definitions', () => {
  const registry = createErnieUiControlCapabilityRegistry();
  const commandPath = ['ui', 'focus'];
  const inputConstraints: ErnieUiControlInputConstraint[] = [];
  const registration = {
    commands: [
      {
        id: 'focus',
        inputConstraints,
        path: commandPath,
        resultDescription: 'The Ernie window receives focus.',
      },
    ],
    id: 'window',
    summary: 'Control the Ernie application window.',
  } satisfies ErnieUiControlCapabilityRegistration;

  assert.deepEqual(registry.register(registration), { ok: true });
  commandPath[1] = 'raise';
  inputConstraints.push({
    kind: 'enum',
    name: 'mutated',
    values: ['after-registration'],
  });
  registration.summary = 'Mutated after registration.';

  assert.deepEqual(
    registry.close().createManifest(() => ({ status: 'available' })),
    {
      capabilities: [
        {
          availability: { status: 'available' },
          commands: [
            {
              id: 'focus',
              inputConstraints: [],
              path: ['ui', 'focus'],
              resultDescription: 'The Ernie window receives focus.',
            },
          ],
          id: 'window',
          source: 'built-in',
          summary: 'Control the Ernie application window.',
        },
      ],
      schemaVersion: 1,
    },
  );
});

test('generates focused nested CLI help without contacting Ernie', async () => {
  const output: string[] = [];
  const errors: string[] = [];
  const runtime = {
    requestCapabilities: (): never => {
      throw new Error('Help must not contact Ernie.');
    },
    requestCommand: (): never => {
      throw new Error('Help must not contact Ernie.');
    },
    writeError: (message: string) => errors.push(message),
    writeOutput: (message: string) => output.push(message),
  };

  assert.equal(await runErnieUiControlCli(['ui', '--help'], runtime), 0);
  assert.deepEqual(output, [
    'Usage:\n' +
      '  ernie ui capabilities\n' +
      '  ernie ui focus\n' +
      '  ernie ui theme <dark|light>\n' +
      '  ernie ui sidebar <show|hide>\n' +
      '  ernie ui sidebar width <192..384>',
  ]);
  assert.deepEqual(errors, []);

  output.length = 0;
  assert.equal(
    await runErnieUiControlCli(['ui', 'capabilities', '--help'], runtime),
    0,
  );
  assert.deepEqual(output, ['Usage: ernie ui capabilities']);
  assert.deepEqual(errors, []);

  output.length = 0;
  assert.equal(
    await runErnieUiControlCli(['ui', 'sidebar', '--help'], runtime),
    0,
  );
  assert.deepEqual(output, [
    'Usage:\n' +
      '  ernie ui sidebar <show|hide>\n' +
      '  ernie ui sidebar width <192..384>',
  ]);
  assert.deepEqual(errors, []);

  output.length = 0;
  assert.equal(
    await runErnieUiControlCli(['ui', 'theme', 'system'], runtime),
    2,
  );
  assert.deepEqual(output, []);
  assert.deepEqual(errors, ['Usage: ernie ui theme <dark|light>']);

  errors.length = 0;
  assert.equal(
    await runErnieUiControlCli(['ui', 'bogus', '--help'], runtime),
    2,
  );
  assert.deepEqual(output, []);
  assert.deepEqual(errors, [
    'Usage:\n' +
      '  ernie ui capabilities\n' +
      '  ernie ui focus\n' +
      '  ernie ui theme <dark|light>\n' +
      '  ernie ui sidebar <show|hide>\n' +
      '  ernie ui sidebar width <192..384>',
  ]);

  errors.length = 0;
  assert.equal(
    await runErnieUiControlCli(['agent', 'list', '--help'], runtime),
    2,
  );
  assert.deepEqual(output, []);
  assert.equal(errors.length, 1);

  errors.length = 0;
  assert.equal(
    await runErnieUiControlCli(['--', '--', 'ui', 'focus'], runtime),
    2,
  );
  assert.deepEqual(output, []);
  assert.equal(errors.length, 1);
});

test('reports an unavailable application during capability discovery', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-ui-capabilities-offline-'),
  );
  const socketPath = path.join(directory, 'ui-control.sock');
  const output: string[] = [];
  const errors: string[] = [];

  try {
    const exitCode = await runErnieUiControlCli(['ui', 'capabilities'], {
      requestCapabilities: () =>
        requestErnieUiControl(socketPath, { type: 'list-capabilities' }),
      requestCommand: (command) => requestErnieUiControl(socketPath, command),
      writeError: (message) => errors.push(message),
      writeOutput: (message) => output.push(message),
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(output, []);
    assert.deepEqual(errors, ['Ernie is not running.']);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test('reports a safe discovery failure when availability inspection fails', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-ui-capabilities-failure-'),
  );
  const socketPath = path.join(directory, 'ui-control.sock');
  const privateFailure = new Error('private availability failure');
  const reportedFailures: Readonly<{
    cause: unknown;
    message: string;
  }>[] = [];
  const started = await startErnieUiControlServer(
    socketPath,
    () => ({ ok: true, version: 1 }),
    (message, cause) => reportedFailures.push({ cause, message }),
    () => {
      throw privateFailure;
    },
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  try {
    assert.deepEqual(
      await requestErnieUiControl(socketPath, { type: 'list-capabilities' }),
      {
        error: {
          code: 'internal_error',
          message: 'Ernie could not inspect its UI capabilities.',
        },
        ok: false,
        version: 1,
      },
    );
    assert.deepEqual(reportedFailures, [
      {
        cause: privateFailure,
        message: 'Ernie UI capability inspection failed.',
      },
    ]);
  } finally {
    await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('reports safe runtime failures through the public CLI seam', async () => {
  const directory = await mkdtemp(
    path.join(tmpdir(), 'ernie-ui-control-cli-failure-'),
  );
  const socketPath = path.join(directory, 'ui-control.sock');
  const output: string[] = [];
  const errors: string[] = [];
  const started = await startErnieUiControlServer(
    socketPath,
    () => ({
      error: { code: 'ui_unavailable', message: 'Ernie has no open window.' },
      ok: false,
      version: 1,
    }),
    () => undefined,
  );
  assert.equal(started.ok, true);
  if (!started.ok) return;

  try {
    const exitCode = await runErnieUiControlCli(['ui', 'focus'], {
      requestCapabilities: () =>
        requestErnieUiControl(socketPath, { type: 'list-capabilities' }),
      requestCommand: (command) => requestErnieUiControl(socketPath, command),
      writeError: (message) => errors.push(message),
      writeOutput: (message) => output.push(message),
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(output, []);
    assert.deepEqual(errors, ['Ernie has no open window.']);
  } finally {
    await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('replaces a stale UI-control socket during startup', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-stale-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  const orphan = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import { createServer } from 'node:net'; createServer().listen(process.argv[1], () => process.kill(process.pid, 'SIGKILL'));",
      socketPath,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(orphan.signal, 'SIGKILL');
  assert.equal((await stat(socketPath)).isSocket(), true);

  const started = await startErnieUiControlServer(
    socketPath,
    () => ({ ok: true, version: 1 }),
    () => undefined,
  );

  try {
    assert.equal(started.ok, true);
  } finally {
    if (started.ok) await started.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('preserves an active UI-control socket during competing startup', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-active-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  let requestCount = 0;
  const active = await startErnieUiControlServer(
    socketPath,
    () => {
      requestCount += 1;
      return { ok: true, version: 1 };
    },
    () => undefined,
  );
  assert.equal(active.ok, true);
  if (!active.ok) return;

  try {
    const competing = await startErnieUiControlServer(
      socketPath,
      () => ({ ok: true, version: 1 }),
      () => undefined,
    );
    assert.equal(competing.ok, false);
    assert.deepEqual(
      await requestErnieUiControl(socketPath, { type: 'focus' }),
      { ok: true, version: 1 },
    );
    assert.equal(requestCount, 1);
  } finally {
    await active.value.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test('reports a stopped application without exposing socket errors', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ernie-ui-control-offline-'));
  const socketPath = path.join(directory, 'ui-control.sock');
  try {
    assert.deepEqual(
      await requestErnieUiControl(socketPath, { type: 'focus' }),
      {
        error: { code: 'app_unavailable', message: 'Ernie is not running.' },
        ok: false,
        version: 1,
      },
    );
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
