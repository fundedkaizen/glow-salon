import { CanvasSource, Texture } from 'pixi.js'

/**
 * A GPU texture from a painted canvas, with mipmaps, so detailed art (pores, lashes, terry cloth) stays smooth
 * when the camera pulls back instead of shimmering.
 */
export function canvasTexture(canvas: HTMLCanvasElement): Texture {
  const source = new CanvasSource({ resource: canvas, autoGenerateMipmaps: true, scaleMode: 'linear' })
  source.style.mipmapFilter = 'linear'
  source.style.maxAnisotropy = 4
  return new Texture({ source })
}

/** The bounding box of a canvas's visible pixels, for trimming icons. */
export function trimmed(canvas: HTMLCanvasElement, size: number, pad = 6): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  const data = ctx.getImageData(0, 0, w, h).data
  let x0 = w, y0 = h, x1 = 0, y1 = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
  const out = document.createElement('canvas')
  out.width = out.height = size
  if (x1 <= x0) return out
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const k = (size - pad * 2) / Math.max(bw, bh)
  out.getContext('2d')!.drawImage(canvas, x0, y0, bw, bh, (size - bw * k) / 2, (size - bh * k) / 2, bw * k, bh * k)
  return out
}
