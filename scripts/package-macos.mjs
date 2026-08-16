import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const runFile = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const buildRoot = path.join(repositoryRoot, '.build');
const outputRoot = path.join(buildRoot, 'release');
const applicationName = 'Ernie';
const bundleIdentifier = 'com.ta0.ernie';
const sourceApplicationPath = path.join(
  repositoryRoot,
  'node_modules/electron/dist/Electron.app',
);
const applicationPath = path.join(outputRoot, `${applicationName}.app`);
const applicationResourcesPath = path.join(
  applicationPath,
  'Contents',
  'Resources',
);
const packagedSourcePath = path.join(applicationResourcesPath, 'app');
const entitlementsPath = path.join(
  repositoryRoot,
  'build/entitlements.mac.plist',
);

function assertSupportedHost() {
  if (process.platform !== 'darwin') {
    throw new Error('The macOS package must be built on macOS.');
  }
}

async function run(executable, arguments_, options = {}) {
  return runFile(executable, arguments_, {
    cwd: repositoryRoot,
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

async function replacePlistString(plistPath, key, value) {
  await run('/usr/bin/plutil', [
    '-replace',
    key,
    '-string',
    value,
    plistPath,
  ]);
}

async function createApplicationIcon() {
  const iconsetRoot = await mkdtemp(
    path.join(os.tmpdir(), 'ernie-iconset-'),
  );
  const iconsetPath = path.join(iconsetRoot, 'Ernie.iconset');
  const sourceIconPath = path.join(repositoryRoot, 'public/ernie-logo.png');
  const targetIconPath = path.join(applicationResourcesPath, 'ernie.icns');
  const iconSizes = [16, 32, 128, 256, 512];

  await mkdir(iconsetPath, { recursive: true });
  try {
    for (const size of iconSizes) {
      await run('/usr/bin/sips', [
        '-z',
        String(size),
        String(size),
        sourceIconPath,
        '--out',
        path.join(iconsetPath, `icon_${size}x${size}.png`),
      ]);
      await run('/usr/bin/sips', [
        '-z',
        String(size * 2),
        String(size * 2),
        sourceIconPath,
        '--out',
        path.join(iconsetPath, `icon_${size}x${size}@2x.png`),
      ]);
    }
    await run('/usr/bin/iconutil', [
      '-c',
      'icns',
      iconsetPath,
      '-o',
      targetIconPath,
    ]);
  } finally {
    await rm(iconsetRoot, { recursive: true, force: true });
  }
}

async function brandHelperApplication(suffix) {
  const originalName = `Electron Helper${suffix}`;
  const brandedName = `${applicationName} Helper${suffix}`;
  const frameworksPath = path.join(applicationPath, 'Contents', 'Frameworks');
  const originalPath = path.join(frameworksPath, `${originalName}.app`);
  const brandedPath = path.join(frameworksPath, `${brandedName}.app`);
  const originalExecutablePath = path.join(
    originalPath,
    'Contents',
    'MacOS',
    originalName,
  );
  const brandedExecutablePath = path.join(
    originalPath,
    'Contents',
    'MacOS',
    brandedName,
  );
  const infoPlistPath = path.join(originalPath, 'Contents', 'Info.plist');
  const identifierSuffix = suffix
    .replaceAll(/[()]/g, '')
    .trim()
    .toLowerCase();

  await rename(originalExecutablePath, brandedExecutablePath);
  await replacePlistString(infoPlistPath, 'CFBundleName', brandedName);
  await replacePlistString(infoPlistPath, 'CFBundleDisplayName', brandedName);
  await replacePlistString(infoPlistPath, 'CFBundleExecutable', brandedName);
  await replacePlistString(
    infoPlistPath,
    'CFBundleIdentifier',
    identifierSuffix.length === 0
      ? `${bundleIdentifier}.helper`
      : `${bundleIdentifier}.helper.${identifierSuffix}`,
  );
  await rename(originalPath, brandedPath);
}

async function brandApplication(version) {
  const infoPlistPath = path.join(applicationPath, 'Contents', 'Info.plist');
  const originalExecutablePath = path.join(
    applicationPath,
    'Contents',
    'MacOS',
    'Electron',
  );
  const brandedExecutablePath = path.join(
    applicationPath,
    'Contents',
    'MacOS',
    applicationName,
  );

  await rename(originalExecutablePath, brandedExecutablePath);
  await replacePlistString(
    infoPlistPath,
    'CFBundleDisplayName',
    applicationName,
  );
  await replacePlistString(infoPlistPath, 'CFBundleName', applicationName);
  await replacePlistString(
    infoPlistPath,
    'CFBundleExecutable',
    applicationName,
  );
  await replacePlistString(
    infoPlistPath,
    'CFBundleIdentifier',
    bundleIdentifier,
  );
  await replacePlistString(
    infoPlistPath,
    'CFBundleShortVersionString',
    version,
  );
  await replacePlistString(infoPlistPath, 'CFBundleVersion', version);
  await replacePlistString(infoPlistPath, 'CFBundleIconFile', 'ernie.icns');

  for (const suffix of ['', ' (GPU)', ' (Plugin)', ' (Renderer)']) {
    await brandHelperApplication(suffix);
  }
}

async function findInstalledPackageDirectory(fromDirectory, packageName) {
  let currentDirectory = fromDirectory;

  while (true) {
    const candidatePath = path.join(
      currentDirectory,
      'node_modules',
      ...packageName.split('/'),
    );
    try {
      await readFile(path.join(candidatePath, 'package.json'), 'utf8');
      return realpath(candidatePath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) break;
    currentDirectory = parentDirectory;
  }

  throw new Error(`Missing installed runtime dependency: ${packageName}`);
}

function packageStoreKey(packageJson, sourcePath) {
  const safeName = packageJson.name.replaceAll('/', '+');
  const sourceHash = createHash('sha256')
    .update(sourcePath)
    .digest('hex')
    .slice(0, 12);
  return `${safeName}@${packageJson.version}-${sourceHash}`;
}

async function collectRuntimePackages(rootNames) {
  const packages = new Map();

  async function visit(sourcePath) {
    const resolvedSourcePath = await realpath(sourcePath);
    const existing = packages.get(resolvedSourcePath);
    if (existing !== undefined) return existing;

    const packageJson = JSON.parse(
      await readFile(path.join(resolvedSourcePath, 'package.json'), 'utf8'),
    );
    const collectedPackage = {
      dependencies: new Map(),
      packageJson,
      sourcePath: resolvedSourcePath,
      storeKey: packageStoreKey(packageJson, resolvedSourcePath),
    };
    packages.set(resolvedSourcePath, collectedPackage);

    const dependencyNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.optionalDependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ]);
    for (const dependencyName of [...dependencyNames].sort()) {
      try {
        const dependencySourcePath = await findInstalledPackageDirectory(
          resolvedSourcePath,
          dependencyName,
        );
        collectedPackage.dependencies.set(
          dependencyName,
          await visit(dependencySourcePath),
        );
      } catch (error) {
        const optional =
          dependencyName in (packageJson.optionalDependencies ?? {}) ||
          packageJson.peerDependenciesMeta?.[dependencyName]?.optional === true;
        if (!optional) throw error;
      }
    }

    return collectedPackage;
  }

  const roots = new Map();
  for (const rootName of rootNames) {
    const sourcePath = await findInstalledPackageDirectory(
      repositoryRoot,
      rootName,
    );
    roots.set(rootName, await visit(sourcePath));
  }
  return { packages: [...packages.values()], roots };
}

async function createDirectoryLink(linkPath, targetPath) {
  await mkdir(path.dirname(linkPath), { recursive: true });
  await symlink(path.relative(path.dirname(linkPath), targetPath), linkPath);
}

async function installRuntimeDependencies(packageJson) {
  const packagedPackageJson = {
    name: packageJson.name,
    productName: packageJson.productName,
    version: packageJson.version,
    description: packageJson.description,
    type: packageJson.type,
    main: packageJson.main,
    license: packageJson.license,
    dependencies: {
      effect: packageJson.dependencies.effect,
      'prime-agent': packageJson.dependencies['prime-agent'],
      typebox: packageJson.dependencies.typebox,
    },
  };

  await writeFile(
    path.join(packagedSourcePath, 'package.json'),
    `${JSON.stringify(packagedPackageJson, null, 2)}\n`,
  );
  const rootNames = Object.keys(packagedPackageJson.dependencies);
  const runtime = await collectRuntimePackages(rootNames);
  const nodeModulesPath = path.join(packagedSourcePath, 'node_modules');
  const storePath = path.join(nodeModulesPath, '.store');

  for (const runtimePackage of runtime.packages) {
    const packagePath = path.join(
      storePath,
      runtimePackage.storeKey,
      'node_modules',
      ...runtimePackage.packageJson.name.split('/'),
    );
    await cp(runtimePackage.sourcePath, packagePath, {
      dereference: true,
      filter: (sourcePath) =>
        path.relative(runtimePackage.sourcePath, sourcePath) !== 'node_modules',
      recursive: true,
    });
  }

  for (const runtimePackage of runtime.packages) {
    const wrapperNodeModulesPath = path.join(
      storePath,
      runtimePackage.storeKey,
      'node_modules',
    );
    for (const [dependencyName, dependency] of runtimePackage.dependencies) {
      await createDirectoryLink(
        path.join(wrapperNodeModulesPath, ...dependencyName.split('/')),
        path.join(
          storePath,
          dependency.storeKey,
          'node_modules',
          ...dependency.packageJson.name.split('/'),
        ),
      );
    }
  }

  for (const [rootName, runtimePackage] of runtime.roots) {
    await createDirectoryLink(
      path.join(nodeModulesPath, ...rootName.split('/')),
      path.join(
        storePath,
        runtimePackage.storeKey,
        'node_modules',
        ...runtimePackage.packageJson.name.split('/'),
      ),
    );
  }

  console.log(
    `runtime dependencies: ${runtime.packages.length} installed packages`,
  );
}

async function copyApplicationSource(packageJson) {
  await mkdir(packagedSourcePath, { recursive: true });
  await cp(path.join(buildRoot, 'main'), path.join(packagedSourcePath, '.build/main'), {
    recursive: true,
  });
  await cp(
    path.join(buildRoot, 'renderer'),
    path.join(packagedSourcePath, '.build/renderer'),
    { recursive: true },
  );
  await installRuntimeDependencies(packageJson);
}

function readOptionalEnvironment(name) {
  const value = process.env[name]?.trim();
  return value === undefined || value.length === 0 ? undefined : value;
}

async function signApplication() {
  const identity = readOptionalEnvironment('MACOS_SIGNING_IDENTITY') ?? '-';
  const arguments_ = ['--force', '--deep', '--sign', identity];

  if (identity !== '-') {
    arguments_.push(
      '--options',
      'runtime',
      '--timestamp',
      '--entitlements',
      entitlementsPath,
    );
  }
  arguments_.push(applicationPath);
  await run('/usr/bin/codesign', arguments_);
  await run('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    '--verbose=2',
    applicationPath,
  ]);
}

function readNotarizationConfiguration() {
  const keyPath = readOptionalEnvironment(
    'APP_STORE_CONNECT_API_KEY_PATH',
  );
  const keyId = readOptionalEnvironment('APP_STORE_CONNECT_KEY_ID');
  const issuerId = readOptionalEnvironment(
    'APP_STORE_CONNECT_ISSUER_ID',
  );
  const values = [keyPath, keyId, issuerId];

  if (values.every((value) => value === undefined)) return null;
  if (values.some((value) => value === undefined)) {
    throw new Error(
      'Notarization requires APP_STORE_CONNECT_API_KEY_PATH, APP_STORE_CONNECT_KEY_ID, and APP_STORE_CONNECT_ISSUER_ID.',
    );
  }
  return { issuerId, keyId, keyPath };
}

async function createZip(archivePath) {
  await rm(archivePath, { force: true });
  await run('/usr/bin/ditto', [
    '-c',
    '-k',
    '--sequesterRsrc',
    '--keepParent',
    applicationPath,
    archivePath,
  ]);
}

async function notarizeApplication(configuration) {
  const submissionArchivePath = path.join(outputRoot, '.notarization.zip');

  await createZip(submissionArchivePath);
  try {
    await run('/usr/bin/xcrun', [
      'notarytool',
      'submit',
      submissionArchivePath,
      '--key',
      configuration.keyPath,
      '--key-id',
      configuration.keyId,
      '--issuer',
      configuration.issuerId,
      '--wait',
    ]);
    await run('/usr/bin/xcrun', ['stapler', 'staple', applicationPath]);
  } finally {
    await rm(submissionArchivePath, { force: true });
  }
}

async function main() {
  assertSupportedHost();
  const packageJson = JSON.parse(
    await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'),
  );
  const architecture = process.arch;
  const archiveName = `${applicationName}-${packageJson.version}-mac-${architecture}.zip`;
  const archivePath = path.join(outputRoot, archiveName);

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await run('/bin/cp', ['-cR', sourceApplicationPath, applicationPath]);
  await brandApplication(packageJson.version);
  await createApplicationIcon();
  await copyApplicationSource(packageJson);
  await signApplication();

  const notarization = readNotarizationConfiguration();
  if (notarization !== null) await notarizeApplication(notarization);

  await createZip(archivePath);
  const { stdout: checksum } = await run('/usr/bin/shasum', [
    '-a',
    '256',
    archivePath,
  ]);
  await writeFile(`${archivePath}.sha256`, checksum);

  console.log(`macOS package: ${archivePath}`);
  console.log(
    `signing: ${readOptionalEnvironment('MACOS_SIGNING_IDENTITY') ?? 'ad hoc (development only)'}`,
  );
  console.log(`notarized: ${notarization === null ? 'no' : 'yes'}`);
}

await main();
