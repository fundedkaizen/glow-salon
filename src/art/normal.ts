import { canvas } from './paint.ts'

/**
 * A tangent-space normal map from a greyscale height map (Sobel), for the skin shader: the big forms of
 * the face and every pore catch the light. `strength` scales the slopes.
 */
export function normalFromHeight(height: HTMLCanvasElement, strength = 3, size = height.width): HTMLCanvasElement {
  const [src, sctx] = canvas(size)
  sctx.drawImage(height, 0, 0, size, size)
  const data = sctx.getImageData(0, 0, size, size).data
  const [out, octx] = canvas(size)
  const img = octx.createImageData(size, size)
  const h = (x: number, y: number) => data[((Math.min(size - 1, Math.max(0, y)) * size) + Math.min(size - 1, Math.max(0, x))) * 4] / 255
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1))
      const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1))
      let nx = -dx * strength, ny = -dy * strength, nz = 1
      const l = Math.hypot(nx, ny, nz)
      nx /= l; ny /= l; nz /= l
      const i = (y * size + x) * 4
      img.data[i] = (nx * 0.5 + 0.5) * 255
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  void src
  return out
}
