import { spawnSync } from "node:child_process"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const check = process.argv.slice(2).includes("--check")

const resize = (variant, size) => {
  const result = spawnSync(
    "magick",
    [
      path.resolve(root, `assets/brand/${variant}.png`),
      "-colorspace",
      "sRGB",
      "-filter",
      "Lanczos",
      "-resize",
      `${size}x${size}`,
      "-background",
      "none",
      "-gravity",
      "center",
      "-extent",
      `${size}x${size}`,
      "-strip",
      "-define",
      "png:exclude-chunks=date,time",
      "PNG32:-",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  )
  if (result.error || result.status !== 0) {
    throw new Error("Brand generation requires ImageMagick 7 (`magick`).", {
      cause: result.error ?? result.stderr.toString(),
    })
  }
  return result.stdout
}

const icns = (images) => {
  const chunks = [...images].map(([type, data]) => {
    const header = Buffer.alloc(8)
    header.write(type)
    header.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([header, data])
  })
  const header = Buffer.alloc(8)
  header.write("icns")
  header.writeUInt32BE(8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0), 4)
  return Buffer.concat([header, ...chunks])
}

const ico = (images) => {
  const header = Buffer.alloc(6 + images.size * 16)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(images.size, 4)
  let offset = header.length
  let index = 0
  for (const [size, data] of images) {
    const start = 6 + index * 16
    index += 1
    header[start + 1] = size === 256 ? 0 : size
    header[start] = header[start + 1]
    header.writeUInt16LE(1, start + 4)
    header.writeUInt16LE(32, start + 6)
    header.writeUInt32LE(data.length, start + 8)
    header.writeUInt32LE(offset, start + 12)
    offset += data.length
  }
  return Buffer.concat([header, ...images.values()])
}

const generateAssets = () => {
  // @lat: [[branding#Brand assets]]
  const production = new Map(
    [16, 32, 48, 64, 128, 180, 256, 512, 1024].map((size) => [size, resize("production", size)]),
  )
  const development = resize("development", 512)
  return new Map([
    ["src/renderer/icon.png", production.get(512)],
    [
      "src/renderer/favicon.ico",
      ico(new Map([16, 32, 48, 64].map((size) => [size, production.get(size)]))),
    ],
    ["src/renderer/apple-touch-icon.png", production.get(180)],
    ["src/browser/icon.png", development],
    [
      "src/browser/favicon.ico",
      ico(new Map([16, 32, 48, 64].map((size) => [size, resize("development", size)]))),
    ],
    ["build/brand/icon.png", production.get(512)],
    [
      "build/brand/icon.ico",
      ico(new Map([16, 32, 48, 64, 128, 256].map((size) => [size, production.get(size)]))),
    ],
    [
      "build/brand/icon.icns",
      icns(
        new Map([
          ["icp4", production.get(16)],
          ["icp5", production.get(32)],
          ["icp6", production.get(64)],
          ["ic07", production.get(128)],
          ["ic08", production.get(256)],
          ["ic09", production.get(512)],
          ["ic10", production.get(1024)],
          ["ic11", production.get(32)],
          ["ic12", production.get(64)],
          ["ic13", production.get(256)],
          ["ic14", production.get(512)],
        ]),
      ),
    ],
  ])
}

const verifyAssets = async (outputs) => {
  const results = await Promise.all(
    [...outputs].map(async ([assetPath, data]) => {
      const existing = await readFile(path.resolve(root, assetPath)).catch((error) => {
        if (error.code === "ENOENT") {
          return Buffer.alloc(0)
        }
        throw error
      })
      return existing.equals(data) ? [] : [assetPath]
    }),
  )
  const stale = results.flat()
  if (stale.length) {
    throw new Error(`Stale brand assets; run nub run brand:sync:\n${stale.join("\n")}`)
  }
}

const writeAssets = async (outputs) => {
  await Promise.all(
    [...outputs].map(async ([assetPath, data]) => {
      const target = path.resolve(root, assetPath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, data)
    }),
  )
}

const main = async () => {
  const outputs = generateAssets()
  await (check ? verifyAssets(outputs) : writeAssets(outputs))
  console.log(`${check ? "Verified" : "Generated"} ${outputs.size} brand assets.`)
}

await main()
