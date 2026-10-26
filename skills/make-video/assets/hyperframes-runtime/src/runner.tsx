// The HyperFrames side of the runtime. hf_build.mjs writes one sub-composition per scene; each calls
// MV.scene(id, spec), which renders that scene with Preact for whatever frame HyperFrames seeks to.
//   - a scene's entering transition plays over its first frames, the next scene's exiting transition over its last
//     (the hosts overlap by the transition length, like Remotion's TransitionSeries)
//   - the scene's <video> tags (written in the file, so HyperFrames extracts and seeks them) are moved into the slots
//     the components render (shim/remotion.tsx Video)
//   - every image is loaded and decoded before the first frame is captured (window.__hf.buildReady)
import {h, render} from 'preact';
import {ConfigCtx, FrameCtx, IMAGES, spring, VIDEO_KEYS} from 'remotion';
import {PartCtx} from './carry';
import {Overlay, OverlayItem, presentation, Scene, SceneView, Transition, transitionFrames} from './Ad';
import {Caption, Captions, CaptionStyle} from './captions';
import {flushShaders} from './shaders';
import {LOTTIE_QUEUE} from './visuals';
import {Look, LookLayer} from './look';
import lottie from 'lottie-web/build/player/lottie_light';

type W = Window & {
  gsap: {timeline: (o: {paused: boolean}) => {to: (t: object, v: object, at: number) => void}};
  __timelines: Record<string, unknown>;
  __hf?: {buildReady?: Record<string, Promise<unknown>>};
  MV: unknown;
};
const win = window as unknown as W;

export type SceneSpec = {
  scene: Scene; index: number; fps: number; width: number; height: number;
  enter?: Transition; exit?: Transition; only?: string;
  offset?: number; hostFrames?: number; // a window render (hf_build --range): start this many frames into the scene, for hostFrames frames
  videos: Record<string, string>; // slot key ("assets/clips/x.mp4@420#0") -> id of the <video> tag in this scene file
};

const progressOf = (t: Transition, frame: number, len: number) => {
  if (len <= 0) return 1;
  const k = Math.max(0, Math.min(1, frame / len));
  return t.timing === 'spring' ? Math.min(1, spring({frame: k * len, fps: 30, config: {damping: 200}, durationInFrames: len})) : k;
};

/** Moves each <video> into its slot; a video whose slot is gone this frame waits in a hidden parking box. */
const placeVideos = (mount: HTMLElement, park: HTMLElement, videos: Record<string, string>, warned: Set<string>) => {
  const used = new Set<string>();
  mount.querySelectorAll<HTMLElement>('[data-mv-video]').forEach((slot) => {
    const key = slot.dataset.mvVideo!, id = videos[key];
    const v = id ? document.getElementById(id) as HTMLVideoElement | null : null;
    if (!v) { if (!warned.has(key)) { warned.add(key); console.error(`[make-video] no <video> written for ${key} - re-run hf_build.mjs`); } return; }
    used.add(id);
    if (v.parentNode !== slot) slot.appendChild(v);
    const fit = slot.dataset.fit || 'cover';
    if (v.style.objectFit !== fit) Object.assign(v.style, {position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', objectFit: fit});
  });
  for (const id of Object.values(videos)) {
    const v = document.getElementById(id);
    if (v && !used.has(id) && v.parentNode !== park) park.appendChild(v);
  }
};

const anims = new Map<HTMLElement, {goToAndStop: (f: number, isFrame: boolean) => void}>();
/** Draw shader backgrounds and step Lottie animations to the frame just rendered. */
const afterRender = (root: HTMLElement) => {
  flushShaders(root);
  for (const job of LOTTIE_QUEUE.splice(0)) {
    const el = root.querySelector<HTMLElement>(`[data-mv-lottie="${job.key}"]`);
    if (!el) continue;
    let a = anims.get(el);
    if (!a) { a = lottie.loadAnimation({container: el, renderer: 'svg', loop: false, autoplay: false, animationData: JSON.parse(JSON.stringify(job.data))}) as never; anims.set(el, a!); }
    a!.goToAndStop(job.frame, true);
  }
};

const preload = (srcs: string[]) => Promise.all([
  ...srcs.map((src) => new Promise<void>((ok) => { const im = new Image(); im.onload = () => (im.decode ? im.decode().then(() => ok(), () => ok()) : ok()); im.onerror = () => { console.error(`[make-video] image not found: ${src}`); ok(); }; im.src = src; })),
  (document as Document & {fonts?: {ready: Promise<unknown>}}).fonts?.ready ?? Promise.resolve(),
]);

const register = (id: string, durationSec: number, draw: (t: number) => void, sampleFrames: number) => {
  // collect every image the scene shows (render it every few frames), then decode them all before capture starts
  IMAGES.clear();
  for (let f = 0; f < sampleFrames; f += 3) draw(f / 30);
  draw(0);
  win.__hf = win.__hf || {};
  win.__hf.buildReady = win.__hf.buildReady || {};
  win.__hf.buildReady[id] = preload([...IMAGES]);
  const proxy = {t: 0};
  const tl = win.gsap.timeline({paused: true});
  tl.to(proxy, {t: durationSec, duration: durationSec, ease: 'none', onUpdate: () => draw(proxy.t)}, 0);
  win.__timelines = win.__timelines || {};
  win.__timelines[id] = tl;
};

const scene = (id: string, spec: SceneSpec) => {
  const root = document.getElementById(`${id}-mount`);
  if (!root) throw new Error(`[make-video] #${id}-mount is missing from the scene file`);
  const park = document.getElementById(`${id}-park`) ?? root;
  const {scene: s, fps, width, height} = spec;
  const dur = Math.max(1, Math.round(s.duration * fps));
  const tIn = spec.enter ? transitionFrames(spec.enter) : 0, tOut = spec.exit ? transitionFrames(spec.exit) : 0;
  // each join gets its own seed (the index of the scene it leads into), so two ink bleeds in one ad differ
  const pIn = spec.enter ? presentation(spec.enter, spec.index * 13 + 5) : null, pOut = spec.exit ? presentation(spec.exit, (spec.index + 1) * 13 + 5) : null;
  const warned = new Set<string>();
  const off = spec.offset ?? 0, hostFrames = spec.hostFrames ?? dur - off;
  const draw = (t: number) => {
    const f = Math.max(0, Math.min(dur - 1, off + Math.round(t * fps)));
    VIDEO_KEYS.length = 0;
    let tree = h(SceneView as never, {s, index: spec.index, only: spec.only} as never);
    // the presentations stay mounted outside their transition (at rest), so images and videos never remount
    if (pIn) tree = h(pIn.component as never, {presentationDirection: 'entering', presentationProgress: f < tIn ? progressOf(spec.enter!, f, tIn) : 1, passedProps: pIn.props} as never, tree);
    if (pOut) tree = h(pOut.component as never, {presentationDirection: 'exiting', presentationProgress: f >= dur - tOut ? progressOf(spec.exit!, f - (dur - tOut), tOut) : 0, passedProps: pOut.props} as never, tree);
    render(
      h(ConfigCtx.Provider, {value: {width, height, fps, durationInFrames: dur, id}},
        h(FrameCtx.Provider, {value: f}, h(PartCtx.Provider, {value: spec.only}, tree))),
      root,
    );
    placeVideos(root, park, spec.videos, warned);
    afterRender(root);
  };
  register(id, hostFrames / fps, draw, hostFrames);
};

export type OverlaySpec = {items: OverlayItem[]; duration: number; fps: number; width: number; height: number};
const overlay = (id: string, spec: OverlaySpec) => {
  const root = document.getElementById(`${id}-mount`);
  if (!root) throw new Error(`[make-video] #${id}-mount is missing`);
  const dur = Math.max(1, Math.round(spec.duration * spec.fps));
  const draw = (t: number) => {
    const f = Math.max(0, Math.min(dur - 1, Math.round(t * spec.fps)));
    render(h(ConfigCtx.Provider, {value: {width: spec.width, height: spec.height, fps: spec.fps, durationInFrames: dur, id}},
      h(FrameCtx.Provider, {value: f}, h(Overlay as never, {items: spec.items, duration: spec.duration} as never))), root);
    afterRender(root);
  };
  register(id, spec.duration, draw, dur);
};

export type CaptionSpec = {captions: Caption[]; style: CaptionStyle; duration: number; fps: number; width: number; height: number};
const captions = (id: string, spec: CaptionSpec) => {
  const root = document.getElementById(`${id}-mount`);
  if (!root) throw new Error(`[make-video] #${id}-mount is missing`);
  const dur = Math.max(1, Math.round(spec.duration * spec.fps));
  const draw = (t: number) => {
    const f = Math.max(0, Math.min(dur - 1, Math.round(t * spec.fps)));
    render(h(ConfigCtx.Provider, {value: {width: spec.width, height: spec.height, fps: spec.fps, durationInFrames: dur, id}},
      h(FrameCtx.Provider, {value: f}, h(Captions as never, {captions: spec.captions, style: spec.style} as never))), root);
  };
  // captions show no images, so there is nothing to preload: sample only the first seconds
  register(id, spec.duration, draw, Math.min(dur, 90));
};

/** cuts: the frames where each scene's window starts (its transition begins). The look's grain and sweep run on the time
 * since the latest cut, so a scene re-rendered on its own (hf_build --incremental) matches the whole-ad render. */
export type LookSpec = {look: Look; duration: number; fps: number; width: number; height: number; offset?: number; cuts?: number[]};
const look = (id: string, spec: LookSpec) => {
  const root = document.getElementById(`${id}-mount`);
  if (!root) throw new Error(`[make-video] #${id}-mount is missing`);
  const dur = Math.max(1, Math.round(spec.duration * spec.fps));
  const off = spec.offset ?? 0, cuts = [0, ...(spec.cuts ?? [])];
  const draw = (t: number) => {
    const abs = off + Math.max(0, Math.min(dur - 1, Math.round(t * spec.fps)));
    const f = abs - Math.max(...cuts.filter((c) => c <= abs));
    render(h(ConfigCtx.Provider, {value: {width: spec.width, height: spec.height, fps: spec.fps, durationInFrames: dur + off, id}},
      h(FrameCtx.Provider, {value: f}, h(LookLayer as never, {look: spec.look} as never))), root);
  };
  register(id, spec.duration, draw, 3);
};

win.MV = {scene, overlay, captions, look, version: '3'};
