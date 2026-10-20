import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import type { Bot } from 'mineflayer'

export function captureWorldMap(bot: Bot, radius: number, capturesDirectory: string) {
  const center = bot.entity.position.floored()
  const scale = radius <= 16 ? 10 : 6
  const blocksWide = radius * 2 + 1
  const width = blocksWide * scale
  const height = width
  const rgba = Buffer.alloc(width * height * 4, 255)

  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      let visibleName = 'void'
      let light = 8
      for (let dy = 16; dy >= -24; dy--) {
        const block = bot.blockAt(center.offset(dx, dy, dz), false)
        if (block && !['air', 'cave_air', 'void_air'].includes(block.name)) {
          visibleName = block.name
          light = Math.max(block.light, block.skyLight)
          break
        }
      }
      const color = blockColor(visibleName, light)
      fill(rgba, width, (dx + radius) * scale, (dz + radius) * scale, scale, scale, color)
      if ((center.x + dx) % 4 === 0 || (center.z + dz) % 4 === 0) {
        shadeEdges(rgba, width, (dx + radius) * scale, (dz + radius) * scale, scale)
      }
    }
  }

  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity || !entity.isValid) continue
    const dx = Math.round(entity.position.x - center.x)
    const dz = Math.round(entity.position.z - center.z)
    if (Math.abs(dx) > radius || Math.abs(dz) > radius) continue
    const x = (dx + radius) * scale + Math.floor(scale / 2)
    const y = (dz + radius) * scale + Math.floor(scale / 2)
    const color: Color = entity.type === 'player' ? [255, 79, 0] : [20, 20, 20]
    fill(rgba, width, x - 2, y - 2, 5, 5, color)
  }

  const botCenter = radius * scale + Math.floor(scale / 2)
  fill(rgba, width, botCenter - 1, botCenter - 5, 3, 11, [255, 79, 0])
  fill(rgba, width, botCenter - 5, botCenter - 1, 11, 3, [255, 79, 0])

  const png = encodePng(width, height, rgba)
  mkdirSync(capturesDirectory, { recursive: true })
  const filename = `${new Date().toISOString().replaceAll(':', '-')}-${randomUUID().slice(0, 8)}.png`
  writeFileSync(path.join(capturesDirectory, filename), png)
  return {
    buffer: png,
    filename,
    width,
    height,
    radius,
    center: { x: center.x, y: center.y, z: center.z },
    size: png.length,
    mimeType: 'image/png' as const
  }
}

type Color = [number, number, number]

function blockColor(name: string, light: number): Color {
  let color: Color
  if (name === 'void') color = [20, 20, 20]
  else if (name.includes('water')) color = [40, 105, 170]
  else if (name.includes('lava') || name.includes('magma')) color = [230, 75, 25]
  else if (name.includes('grass') || name.includes('moss')) color = [74, 128, 58]
  else if (name.includes('leaves') || name.includes('vine')) color = [52, 105, 48]
  else if (name.includes('sand') || name.includes('end_stone')) color = [205, 190, 130]
  else if (name.includes('snow') || name.includes('ice')) color = [218, 230, 232]
  else if (name.includes('dirt') || name.includes('mud') || name.includes('soul_soil')) color = [112, 78, 53]
  else if (name.includes('log') || name.includes('wood') || name.includes('planks')) color = [137, 98, 60]
  else if (name.includes('stone') || name.includes('ore') || name.includes('deepslate')) color = [112, 112, 108]
  else if (name.includes('nether') || name.includes('crimson')) color = [112, 43, 45]
  else {
    const hash = [...name].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 17)
    color = [70 + hash % 100, 70 + (hash >>> 8) % 100, 70 + (hash >>> 16) % 100]
  }
  const factor = 0.62 + Math.min(15, light) / 40
  return color.map((channel) => Math.min(255, Math.round(channel * factor))) as Color
}

function fill(buffer: Buffer, width: number, x: number, y: number, blockWidth: number, blockHeight: number, color: Color) {
  const imageHeight = buffer.length / 4 / width
  for (let py = Math.max(0, y); py < Math.min(imageHeight, y + blockHeight); py++) {
    for (let px = Math.max(0, x); px < Math.min(width, x + blockWidth); px++) {
      const offset = (py * width + px) * 4
      buffer[offset] = color[0]
      buffer[offset + 1] = color[1]
      buffer[offset + 2] = color[2]
      buffer[offset + 3] = 255
    }
  }
}

function shadeEdges(buffer: Buffer, width: number, x: number, y: number, scale: number) {
  for (let index = 0; index < scale; index++) {
    const coordinates: Array<[number, number]> = [[x + index, y], [x, y + index]]
    for (const [px, py] of coordinates) {
      const offset = (py * width + px) * 4
      buffer[offset] = Math.round((buffer[offset] ?? 0) * 0.82)
      buffer[offset + 1] = Math.round((buffer[offset + 1] ?? 0) * 0.82)
      buffer[offset + 2] = Math.round((buffer[offset + 2] ?? 0) * 0.82)
    }
  }
}

function encodePng(width: number, height: number, rgba: Buffer) {
  const stride = width * 4
  const scanlines = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) rgba.copy(scanlines, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([signature, chunk('IHDR', header), chunk('IDAT', deflateSync(scanlines)), chunk('IEND', Buffer.alloc(0))])
}

function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type, 'ascii')
  const output = Buffer.alloc(data.length + 12)
  output.writeUInt32BE(data.length, 0)
  name.copy(output, 4)
  data.copy(output, 8)
  output.writeUInt32BE(crc32(Buffer.concat([name, data])), data.length + 8)
  return output
}

function crc32(data: Buffer) {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}
