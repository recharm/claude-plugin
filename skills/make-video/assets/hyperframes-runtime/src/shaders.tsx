// Shader backgrounds (WebGL), after the HyperFrames registry's background blocks (Apache-2.0, heygen-com/hyperframes -
// mesh gradient, aurora, marble, liquid, god rays, blobs, Voronoi, smoke; rewritten here as small GLSL programs that
// take the brand's colours). Every frame is a function of time alone, so seeking is exact.
// A <ShaderBg> renders a <canvas>; the runner draws it right after each render (flushShaders). Where WebGL is not
// available (some cloud sandboxes), the canvas draws a CSS gradient of the same colours instead.
import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';

export type ShaderStyle = 'mesh' | 'aurora' | 'marble' | 'liquid' | 'godrays' | 'blobs' | 'voronoi' | 'smoke';
export const SHADER_STYLES: ShaderStyle[] = ['mesh', 'aurora', 'marble', 'liquid', 'godrays', 'blobs', 'voronoi', 'smoke'];

const COMMON = `precision highp float;
uniform vec2 R; uniform float T; uniform vec3 C0; uniform vec3 C1; uniform vec3 C2; uniform vec3 C3; uniform float SEED;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21) + SEED); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
`;
// C0 = base (the scene's colour), C1 = second tone, C2 = accent, C3 = highlight
const FRAG: Record<ShaderStyle, string> = {
  mesh: `void main(){ vec2 uv = gl_FragCoord.xy / R; float t = T * 0.15;
    vec2 p1 = vec2(0.25 + 0.15 * sin(t * 1.3), 0.3 + 0.2 * cos(t)), p2 = vec2(0.8 + 0.1 * cos(t * 0.9), 0.25 + 0.15 * sin(t * 1.1));
    vec2 p3 = vec2(0.7 + 0.15 * sin(t * 0.7 + 2.0), 0.8 + 0.1 * cos(t * 1.4)), p4 = vec2(0.2 + 0.1 * cos(t * 1.2 + 1.0), 0.85 + 0.1 * sin(t));
    vec2 a = vec2(R.x / R.y, 1.0); float w1 = 1.0 / pow(length((uv - p1) * a) + 0.05, 2.0), w2 = 1.0 / pow(length((uv - p2) * a) + 0.05, 2.0);
    float w3 = 1.0 / pow(length((uv - p3) * a) + 0.05, 2.0), w4 = 1.0 / pow(length((uv - p4) * a) + 0.05, 2.0);
    vec3 c = (C0 * w1 + C1 * w2 + C2 * w3 * 0.6 + C0 * w4) / (w1 + w2 + w3 * 0.6 + w4);
    c += (fbm(uv * 3.0 + t) - 0.5) * 0.04; gl_FragColor = vec4(c, 1.0); }`,
  aurora: `void main(){ vec2 uv = gl_FragCoord.xy / R; float t = T * 0.25; vec3 c = C0;
    for (int i = 0; i < 3; i++) { float fi = float(i);
      float y = 0.55 + 0.12 * fi + 0.08 * sin(uv.x * (3.0 + fi) + t * (1.0 + 0.3 * fi)) + 0.1 * (fbm(vec2(uv.x * 2.0 + fi, t * 0.5)) - 0.5);
      float band = exp(-pow((uv.y - y) * (9.0 - fi * 2.0), 2.0)) * (0.6 + 0.4 * fbm(vec2(uv.x * 9.0, t + fi)));
      c += mix(C2, C1, fi / 2.0) * band * 0.75; }
    c += C3 * 0.04 * step(0.997, h21(floor(gl_FragCoord.xy / 3.0))); gl_FragColor = vec4(c, 1.0); }`,
  marble: `void main(){ vec2 uv = gl_FragCoord.xy / R.y; float t = T * 0.06;
    vec2 q = vec2(fbm(uv * 2.0 + t), fbm(uv * 2.0 + vec2(5.2, 1.3) - t)); vec2 r = vec2(fbm(uv * 2.0 + 4.0 * q + vec2(1.7, 9.2)), fbm(uv * 2.0 + 4.0 * q + vec2(8.3, 2.8)));
    float f = fbm(uv * 2.0 + 4.0 * r); vec3 c = mix(C0, C1, smoothstep(0.2, 0.9, f));
    float vein = smoothstep(0.02, 0.0, abs(sin((uv.x + r.x * 2.0) * 9.0) * 0.5) - 0.0) * 0.0 + smoothstep(0.035, 0.0, abs(fract(f * 4.0) - 0.5) - 0.46);
    c = mix(c, C2, vein * 0.55); gl_FragColor = vec4(c, 1.0); }`,
  liquid: `void main(){ vec2 uv = gl_FragCoord.xy / R.y; float t = T * 0.35; vec2 p = uv * 3.0;
    for (int i = 1; i < 5; i++) { float fi = float(i); p += vec2(0.6 / fi * sin(fi * p.y + t + 0.3 * fi), 0.6 / fi * sin(fi * p.x + t + 0.3 * fi)); }
    float v = 0.5 + 0.5 * sin(p.x + p.y); vec3 c = mix(C0, C1, v); c = mix(c, C2, smoothstep(0.75, 1.0, v) * 0.6); gl_FragColor = vec4(c, 1.0); }`,
  godrays: `void main(){ vec2 uv = gl_FragCoord.xy / R; vec2 src = vec2(0.5 + 0.08 * sin(T * 0.2), 1.12); vec2 d = uv - src;
    float ang = atan(d.x, -d.y), dist = length(d * vec2(R.x / R.y, 1.0));
    float rays = 0.0; for (int i = 0; i < 3; i++) { float fi = float(i); rays += pow(noise(vec2(ang * (9.0 + 6.0 * fi), T * 0.15 + fi)), 2.0) / (1.0 + fi); }
    float fall = exp(-dist * 1.3); vec3 c = mix(C0 * 0.85, C1, uv.y * 0.6); c += mix(C2, C3, 0.5) * rays * fall * 0.6 + C3 * exp(-dist * 3.5) * 0.25;
    gl_FragColor = vec4(c, 1.0); }`,
  blobs: `void main(){ vec2 uv = gl_FragCoord.xy / R.y; float t = T * 0.3; float f = 0.0;
    for (int i = 0; i < 6; i++) { float fi = float(i); vec2 c = vec2(0.5 * R.x / R.y + 0.42 * (R.x / R.y) * sin(t * (0.5 + 0.13 * fi) + fi * 1.7), 0.5 + 0.38 * cos(t * (0.4 + 0.11 * fi) + fi * 2.3));
      f += (0.012 + 0.006 * fi) / dot(uv - c, uv - c); }
    float m = smoothstep(0.9, 1.15, f), edge = smoothstep(0.9, 1.0, f) - smoothstep(1.0, 1.15, f);
    vec3 col = mix(C0, mix(C1, C2, uv.y), m) + C3 * edge * 0.25; gl_FragColor = vec4(col, 1.0); }`,
  voronoi: `void main(){ vec2 uv = gl_FragCoord.xy / R.y * 4.0; vec2 i = floor(uv), f = fract(uv); float d1 = 9.0, d2 = 9.0; float id = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); float h = h21(i + g);
      vec2 o = 0.5 + 0.4 * sin(T * 0.5 + 6.2831 * vec2(h, h21(i + g + 3.1))); float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = h; } else if (d < d2) d2 = d; }
    vec3 c = mix(C0, C1, id * 0.6); c = mix(c, C2, smoothstep(0.08, 0.0, d2 - d1) * 0.7); gl_FragColor = vec4(c, 1.0); }`,
  smoke: `void main(){ vec2 uv = gl_FragCoord.xy / R.y; float t = T * 0.12;
    float f = fbm(uv * 1.6 + vec2(fbm(uv * 1.6 + t), fbm(uv * 1.6 - t + 3.0)) * 1.4 + t);
    vec3 c = mix(C0, C1, smoothstep(0.25, 0.85, f)); c += C2 * pow(f, 4.0) * 0.5; gl_FragColor = vec4(c, 1.0); }`,
};

type Job = {key: string; style: ShaderStyle; t: number; colors: number[][]; seed: number; fallback: string};
const QUEUE: Job[] = [];
const ctxs = new WeakMap<HTMLCanvasElement, {gl: WebGLRenderingContext; progs: Record<string, WebGLProgram>} | null>();
const hex = (h: string) => { const x = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255); };

export const ShaderBg: React.FC<{style: ShaderStyle; colors: string[]; seed?: number}> = ({style, colors, seed = 1}) => {
  const f = useCurrentFrame();
  const {width, height, fps, id} = useVideoConfig() as {width: number; height: number; fps: number; id?: string};
  const key = `${id || 's'}-${style}-${seed}`;
  const cs = [...colors, colors[0], colors[0], colors[0]].slice(0, 4);
  QUEUE.push({key, style, t: f / fps + seed * 3.7, colors: cs.map(hex), seed, fallback: `linear-gradient(160deg, ${cs[0]}, ${cs[1]} 60%, ${cs[2]})`});
  // drawn at a third of the size and scaled up - backgrounds are soft, and it keeps every frame fast
  return <canvas data-mv-gl={key} width={Math.round(width / 3)} height={Math.round(height / 3)}
    style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />;
};

const program = (gl: WebGLRenderingContext, style: ShaderStyle) => {
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader'); return s; };
  const p = gl.createProgram()!;
  gl.attachShader(p, sh(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }'));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, COMMON + FRAG[style]));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  return p;
};

/** Draw every shader canvas the last render produced. Called by the runner after each frame's render. */
export const flushShaders = (root: HTMLElement) => {
  for (const job of QUEUE.splice(0)) {
    const cv = root.querySelector<HTMLCanvasElement>(`canvas[data-mv-gl="${job.key}"]`);
    if (!cv) continue;
    let c = ctxs.get(cv);
    if (c === undefined) {
      const gl = cv.getContext('webgl', {preserveDrawingBuffer: true, antialias: false}) as WebGLRenderingContext | null;
      if (gl) {
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      }
      c = gl ? {gl, progs: {}} : null;
      ctxs.set(cv, c);
    }
    if (!c) { cv.style.background = job.fallback; continue; } // no WebGL here: the same colours as a gradient
    const {gl} = c;
    try {
      const p = c.progs[job.style] ?? (c.progs[job.style] = program(gl, job.style));
      gl.useProgram(p);
      gl.viewport(0, 0, cv.width, cv.height);
      const a = gl.getAttribLocation(p, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(gl.getUniformLocation(p, 'R'), cv.width, cv.height);
      gl.uniform1f(gl.getUniformLocation(p, 'T'), job.t);
      gl.uniform1f(gl.getUniformLocation(p, 'SEED'), (job.seed % 97) / 97);
      job.colors.forEach((col, i) => gl.uniform3f(gl.getUniformLocation(p, `C${i}`), col[0], col[1], col[2]));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } catch (e) {
      console.error(`[make-video] shader ${job.style}: ${e}`);
      ctxs.set(cv, null); cv.style.background = job.fallback;
    }
  }
};
