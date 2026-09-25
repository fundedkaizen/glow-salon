/** Reading Helper B's models in Node, which has no image decoder. */

/** The GLB with its images dropped (Node has no image decoder; the check needs the rig and the clips, not the textures). */
export function withoutImages(buf: Buffer): ArrayBuffer {
  const jsonLen = buf.readUInt32LE(12)
  const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'))
  delete json.images; delete json.textures; delete json.samplers
  const strip = (o: Record<string, unknown>) => { for (const k of Object.keys(o)) { if (/Texture$/.test(k)) delete o[k]; else if (o[k] && typeof o[k] === 'object') strip(o[k] as Record<string, unknown>) } }
  for (const m of json.materials ?? []) strip(m)
  let text = JSON.stringify(json)
  while (text.length % 4) text += ' '
  const jsonBytes = Buffer.from(text, 'utf8')
  const rest = buf.subarray(20 + jsonLen)
  const out = Buffer.alloc(12 + 8 + jsonBytes.length + rest.length)
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8)
  out.writeUInt32LE(jsonBytes.length, 12); out.writeUInt32LE(0x4e4f534a, 16)
  jsonBytes.copy(out, 20); rest.copy(out, 20 + jsonBytes.length)
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
}
