// Generates solid-color PNG icons for PWA (192x192, 512x512, 180x180 apple-touch-icon)
// No external dependencies — uses only Node.js built-ins.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const crcTable = new Uint32Array(256)
for (let i = 0; i < 256; i++) {
  let c = i
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[i] = c
}
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const t = Buffer.from(type)
  const d = Buffer.isBuffer(data) ? data : Buffer.from(data)
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(d.length)
  const crc = Buffer.allocUnsafe(4); crc.writeUInt32BE(crc32(Buffer.concat([t, d])))
  return Buffer.concat([len, t, d, crc])
}
function solidPNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const row = Buffer.allocUnsafe(1 + size * 3)
  row[0] = 0
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => row))
  const idat = deflateSync(raw)
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))])
}

mkdirSync('public', { recursive: true })
// #0f172a = rgb(15, 23, 42) — matches app theme_color / background_color
const [R, G, B] = [15, 23, 42]
writeFileSync('public/icon-192.png', solidPNG(192, R, G, B))
writeFileSync('public/icon-512.png', solidPNG(512, R, G, B))
writeFileSync('public/apple-touch-icon.png', solidPNG(180, R, G, B))
console.log('Icons generated: icon-192.png, icon-512.png, apple-touch-icon.png')
