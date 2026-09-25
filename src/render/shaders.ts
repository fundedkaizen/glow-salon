import { Geometry, GlProgram, Mesh, Shader, UniformGroup, type Texture, type TextureSource } from 'pixi.js'

/**
 * Two shaders make the close-ups: the skin (albedo lit through a pore-and-form normal map, with a warm
 * subsurface band, wet highlights and glints where water, serum or cream sits) and a layer shader for
 * everything painted on top (grime, foam, clay, polish): art x mask, lit with relief from its own edges so
 * thick things (clay, cream, polish) look thick.
 */
const vertex = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`

const skinFragment = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uAlbedo;
uniform sampler2D uHeight;
uniform sampler2D uWet;
uniform vec3 uBump;   // x texel size, y fine strength, z soft strength
uniform vec3 uLight;
uniform vec4 uSkin;   // x steam flush, y wet everywhere, z time, w dewy sheen after moisturiser
uniform vec3 uSss;
uniform vec4 uColor;
uniform float uFlipMask;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// Normals straight from the height map: fine ones (pores) and soft ones (the form, from a blurrier mip).
vec3 normalAt(vec2 uv, float spread, float bias, float strength) {
  vec2 dx = vec2(uBump.x * spread, 0.0), dy = vec2(0.0, uBump.x * spread);
  float hx = texture(uHeight, uv + dx, bias).r - texture(uHeight, uv - dx, bias).r;
  float hy = texture(uHeight, uv + dy, bias).r - texture(uHeight, uv - dy, bias).r;
  return normalize(vec3(-hx * strength, -hy * strength, 1.0));
}

void main() {
  vec4 alb = texture(uAlbedo, vUV);
  if (alb.a < 0.003) discard;
  vec3 base = alb.rgb / alb.a;
  vec3 n = normalAt(vUV, 1.0, 0.0, uBump.y);
  vec3 nSoft = normalAt(vUV, 10.0, 3.0, uBump.z);
  vec3 L = normalize(uLight);
  float ndl = dot(nSoft, L);
  float wrap = clamp((ndl + 0.5) / 1.5, 0.0, 1.0);
  // Light that has travelled under the skin comes out warm, strongest where the light turns away.
  float scatter = smoothstep(0.05, 0.55, wrap) * (1.0 - smoothstep(0.45, 1.0, wrap));
  vec3 col = base * (0.78 + 0.26 * wrap) + uSss * scatter * 0.2;
  // Shadows keep their colour: warmer and a little redder as the light turns away, never grey.
  col *= mix(vec3(1.02, 0.93, 0.88), vec3(1.0), wrap);
  vec2 muv = vec2(vUV.x, mix(vUV.y, 1.0 - vUV.y, uFlipMask));
  float wet = clamp(texture(uWet, muv).a * 1.25 + uSkin.y, 0.0, 1.0);
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float ndh = max(dot(n, H), 0.0);
  float ndhSoft = max(dot(nSoft, H), 0.0);
  float drySheen = pow(ndhSoft, 14.0) * 0.05;
  float wetSpec = pow(ndhSoft, 60.0 + 160.0 * wet) * 1.0 * wet;
  // Tiny glints where pores catch the light through a film of water.
  float sparkleSeed = hash(floor(vUV * 700.0));
  float glint = step(0.9975, sparkleSeed) * pow(ndhSoft, 20.0) * smoothstep(0.5, 1.0, wet) * (0.5 + 0.5 * sin(uSkin.z * 3.0 + sparkleSeed * 40.0));
  float dewy = pow(ndhSoft, 30.0) * uSkin.w * 0.32;
  col *= mix(vec3(1.0), vec3(1.07, 0.95, 0.94), uSkin.x);
  // Wet skin reads a touch deeper and richer under the shine.
  col = mix(col, col * col * 1.18, wet * 0.18);
  // Broad sheens take the skin's own colour on deeper tones (a flat white sheen reads as a grey film);
  // the sharp wet highlight stays white.
  float lum = dot(base, vec3(0.3, 0.5, 0.2));
  vec3 sheenCol = mix(base * 1.8 + 0.06, vec3(1.0, 0.985, 0.97), smoothstep(0.35, 0.85, lum));
  // Natural shine where the gloss map says the skin is oilier (T-zone, cheekbones, chin, knuckles): a broad
  // soft highlight on the form plus a fine sparkle from the pores inside it. It follows the light, which
  // sways a little with the customer's breathing.
  float gloss = texture(uHeight, vUV).g;
  float shine = (pow(ndhSoft, 70.0) * 0.34 + pow(ndh, 140.0) * 0.16) * gloss;
  col += sheenCol * (drySheen + dewy + shine) + vec3(1.0, 0.985, 0.97) * wetSpec;
  col += vec3(glint) * 0.0;
  float a = alb.a * uColor.a;
  finalColor = vec4(col * a, a);
}`

const layerFragment = /* glsl */ `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uArt;
uniform sampler2D uArt2;
uniform sampler2D uMask;
uniform vec4 uP;     // x art2 mix, y gloss, z relief, w opacity
uniform vec4 uTint;  // rgb multiply, a amount
uniform vec3 uLight;
uniform vec2 uTexel;
uniform float uFlipMask;
uniform vec4 uColor;

float cover(vec2 uv) { return texture(uMask, vec2(uv.x, mix(uv.y, 1.0 - uv.y, uFlipMask))).a; }
float lum(vec2 uv) { vec4 c = mix(texture(uArt, uv), texture(uArt2, uv), uP.x); return dot(c.rgb, vec3(0.333)) + c.a * 0.5; }

void main() {
  vec4 art = mix(texture(uArt, vUV), texture(uArt2, vUV), uP.x);
  float m = cover(vUV);
  float alpha = art.a * m * uP.w * uColor.a;
  if (alpha < 0.002) discard;
  vec3 col = art.rgb / max(art.a, 0.001);
  col = mix(col, col * uTint.rgb, uTint.a);
  vec2 dx = vec2(uTexel.x * 1.5, 0.0), dy = vec2(0.0, uTexel.y * 1.5);
  float mx = cover(vUV + dx) - cover(vUV - dx);
  float my = cover(vUV + dy) - cover(vUV - dy);
  float lx = lum(vUV + dx * 0.5) - lum(vUV - dx * 0.5);
  float ly = lum(vUV + dy * 0.5) - lum(vUV - dy * 0.5);
  vec3 n = normalize(vec3(-(mx * 1.6 + lx) * uP.z, -(my * 1.6 + ly) * uP.z, 1.0));
  vec3 L = normalize(uLight);
  float diff = clamp(dot(n, L) * 0.55 + 0.56, 0.0, 1.25);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(n, H), 0.0), mix(12.0, 160.0, uP.y)) * uP.y * 1.3;
  vec3 outc = col * diff + vec3(1.0, 0.99, 0.97) * spec;
  finalColor = vec4(outc * alpha, alpha);
}`

let quad: Geometry | null = null
/** A 1024 x 1024 quad in art space, shared by every surface mesh. */
export function artQuad(size = 1024) {
  quad ??= new Geometry({
    attributes: {
      aPosition: [0, 0, size, 0, size, size, 0, size],
      aUV: [0, 0, 1, 0, 1, 1, 0, 1],
    },
    indexBuffer: [0, 1, 2, 0, 2, 3],
  })
  return quad
}

/** Light from the top left, a little in front: the same for every close-up so they match. */
export const LIGHT: [number, number, number] = [-0.32, -0.5, 0.8]

/** `height` is a greyscale height map (the form and the pores); the shader derives the normals from it. */
export function skinMesh(albedo: Texture, height: Texture, wet: TextureSource, sss: [number, number, number], flipMask: number, bump = 2.4) {
  const uniforms = new UniformGroup({
    uLight: { value: new Float32Array(LIGHT), type: 'vec3<f32>' },
    uSkin: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
    uSss: { value: new Float32Array(sss), type: 'vec3<f32>' },
    uFlipMask: { value: flipMask, type: 'f32' },
    uBump: { value: new Float32Array([1 / height.width, bump * 4, bump * 0.6]), type: 'vec3<f32>' },
  })
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment: skinFragment, name: 'glow-skin' }),
    resources: { uAlbedo: albedo.source, uHeight: height.source, uWet: wet, skinUniforms: uniforms },
  })
  const mesh = new Mesh({ geometry: artQuad(), shader })
  return { mesh, uniforms }
}

export type LayerUniforms = UniformGroup<{ uP: { value: Float32Array; type: 'vec4<f32>' }; uTint: { value: Float32Array; type: 'vec4<f32>' }; uLight: { value: Float32Array; type: 'vec3<f32>' }; uTexel: { value: Float32Array; type: 'vec2<f32>' }; uFlipMask: { value: number; type: 'f32' } }>

export function layerMesh(art: Texture, art2: Texture, mask: TextureSource, style: { gloss: number; relief: number; opacity?: number }, maskSize: number, flipMask: number) {
  const uniforms = new UniformGroup({
    uP: { value: new Float32Array([0, style.gloss, style.relief, style.opacity ?? 1]), type: 'vec4<f32>' },
    uTint: { value: new Float32Array([1, 1, 1, 0]), type: 'vec4<f32>' },
    uLight: { value: new Float32Array(LIGHT), type: 'vec3<f32>' },
    uTexel: { value: new Float32Array([1 / maskSize, 1 / maskSize]), type: 'vec2<f32>' },
    uFlipMask: { value: flipMask, type: 'f32' },
  })
  const shader = new Shader({
    glProgram: GlProgram.from({ vertex, fragment: layerFragment, name: 'glow-layer' }),
    resources: { uArt: art.source, uArt2: art2.source, uMask: mask, layerUniforms: uniforms },
  })
  const mesh = new Mesh({ geometry: artQuad(), shader })
  return { mesh, uniforms }
}
