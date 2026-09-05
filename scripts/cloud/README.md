# Ernie in Codex cloud

Use the Ernie environment for `thoriqakbar0/ernie`. Read the repository's `AGENTS.md`, `docs/workflow.md`, `docs/ui.md`, and architecture map before changing the app.

## Environment configuration

Select `thoriqakbar0/ernie`, the universal Ubuntu 24.04 image, and Node.js 22 for bootstrap. Setup installs Node 24.19.0 for the project because `phase` requires Node 24. Enable container caching and use manual setup. Generate the setup field with `nub --node scripts/cloud/render-setup.mjs`; paste its output into the environment's setup command. Set maintenance to `bash /opt/ernie-cloud/maintenance.sh`.

The setup field embeds these files, so it works before this folder is pushed. Regenerate that field when changing the cloud helpers. Keep agent internet access off unless the requested task needs it. Setup and maintenance have network access for dependency downloads.

## Development

Run `ernie-dev` from the checkout. It starts the real Zenbu service host and browser gateway at `http://127.0.0.1:4310/?browser=1`. Keep this process alive across renderer edits for HMR. The cloud launcher runs as the `ernie` user under Xvfb; it does not create a visible Electron renderer.

Use Nub for project scripts. Setup installs dependencies and generates Zenbu types. Maintenance refreshes these after checkout changes. `lat` and `frog` are available as commands.

Cloud containers have separate local state. Provider credentials from the Mac are not copied. UI work can inspect existing cloud-local state without sending a model request; executing model work requires an appropriately configured provider.

## Record an interaction

Keep the development server running. Create a scenario using Playwright's page API:

```js
export default async function ({ page, step, url }) {
  await step('Open Ernie', async () => {
    await page.goto(url);
  });
  // Inspect the current UI, then use its observed controls in further steps.
}
```

Run `ernie-record scenario.mjs`. Each run creates a new directory under `artifacts/interactions/` containing:

- A WebM video for each opened page.
- `trace.zip` with the interaction timeline and DOM snapshots.
- `steps.json` with named steps, timestamps, and outcomes.
- A screenshot after each named step.

Use `await step('Describe the action', async () => { ... })` around each meaningful interaction. The recorder attaches to the existing application through its browser URL. It owns only its recording browser. It does not start, stop, or restart Ernie.

Set `ERNIE_RECORD_URL` for another development gateway. Record controlled content. Videos, snapshots, and traces can contain the visible conversation and runtime connection metadata; keep them out of Git and review them before sharing. Attach the relevant recording files to the task response.

## Inspect frame by frame

Run `ernie-frames path/to/video.webm path/to/new-frames-directory`. The output includes every decoded video frame, its timestamp, and an `index.html` viewer with a slider and previous/next controls. Left and right arrow keys also step through the frames. Open that HTML alongside its image files, or serve the directory locally. A downloaded copy must preserve the directory contents.

Video capture can omit intermediate rendered frames. This viewer exposes the recorded frames; it does not measure the display's native refresh rate. For DOM state and action timing, inspect `trace.zip` using Playwright Trace Viewer.

The recorder is an inspection tool. Existing Cypress integration tests remain the test suite. Follow repository rules before running tests or builds. Report the actual surface inspected and link the saved evidence; do not call an uninspected screenshot HMR verification.
