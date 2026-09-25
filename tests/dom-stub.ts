/**
 * Just enough of a browser for the 3D builders to run in Node (the mesh layout check): a canvas whose 2D context
 * accepts every call and draws nothing. Textures come out blank; the geometry is what the check reads.
 */
const noop = (): unknown => ctx
const ctx: unknown = new Proxy(function () {} as object, {
  get: (_t, key) => {
    if (key === 'measureText') return () => ({ width: 10, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
    if (key === 'getImageData' || key === 'createImageData') return (a: number, b: number, w = a, h = b) => ({ data: new Uint8ClampedArray(Math.max(1, (w | 0) * (h | 0) * 4)), width: w, height: h })
    if (key === 'canvas') return makeCanvas()
    if (key === Symbol.toPrimitive) return () => 0
    return noop
  },
  set: () => true,
  apply: () => ctx,
})
function makeCanvas() {
  return { width: 300, height: 150, style: {}, getContext: () => ctx, toDataURL: () => 'data:,', addEventListener() {}, removeEventListener() {} }
}
const g = globalThis as Record<string, unknown>
if (!g.document) g.document = { createElement: () => makeCanvas(), createElementNS: () => makeCanvas() }
if (!g.OffscreenCanvas) g.OffscreenCanvas = class { width: number; height: number; constructor(w: number, h: number) { this.width = w; this.height = h } getContext() { return ctx } }
export {}
