// Data-driven ad: a list of scenes (ads/<name>.json via --props) joined by TransitionSeries.
// Every scene carries VISUALS from the animation library (visuals.tsx) - a pour, a chart, a gauge, badges, a
// packshot - built from the brand's motifs. A scene whose only animation is text refuses to render.
import React from 'react';
import {AbsoluteFill, Sequence, random, useCurrentFrame, useVideoConfig} from 'remotion';
import {linearTiming, springTiming, TransitionPresentation, TransitionPresentationComponentProps, TransitionSeries} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {wipe} from '@remotion/transitions/wipe';
import {C} from './theme';
import {sec} from './lib/anim';
import {IconName} from './lib/icons';
import {Background, Bars, EndCard, Footage, HighlightRing, LowerThird, Preset, ProductShot, Rule, Safe, SlideList, Stat, Txt} from './components';
import {Box, defaultLayer, Icon, isRealVisual, Steps, VisualOf, VisualView} from './visuals';
import {iconFor} from './motifs';
import {CUSTOM} from './custom';

type Dir = 'from-left' | 'from-right' | 'from-top' | 'from-bottom';
export type Transition = {type: 'fade' | 'slide' | 'wipe' | 'whip' | 'zoom' | 'iris'; direction?: Dir; seconds?: number; timing?: 'linear' | 'spring'};
export type Scene = {
  type: 'scene' | 'title' | 'stat' | 'list' | 'compare' | 'product' | 'footage' | 'endcard' | 'custom';
  duration: number;
  bg?: 'ground' | 'primary' | 'secondary' | 'dark';
  transition?: Transition;
  visuals?: VisualOf[];
  text?: string; sub?: string; preset?: Preset; textY?: 'top' | 'center' | 'bottom'; glitch?: boolean; shake?: number[];
  value?: string; label?: string;
  items?: string[]; marker?: 'check' | 'number' | 'dot' | 'icon';
  bars?: {label: string; value: number; highlight?: boolean}[]; unit?: string; note?: string;
  src?: string; trimBefore?: number; pushIn?: boolean; fit?: 'cover' | 'blurfill';
  ring?: {x: number; y: number; r?: number};
  lowerThird?: {title: string; sub?: string};
  url?: string; cta?: string;
  component?: string; draws?: string;
};
export type AdProps = {scenes: Scene[]; approvedClaims?: string[]};
export type OverlayItem = {
  type: 'title' | 'stat' | 'list' | 'lowerThird' | 'visual'; start: number; duration: number; y?: number;
  text?: string; sub?: string; preset?: Preset; value?: string; label?: string; items?: string[]; marker?: 'check' | 'number' | 'dot';
  icon?: IconName; visual?: VisualOf;
};
export type OverlayProps = {duration: number; items: OverlayItem[]};

// ------------------------------------------------------------------ the non-text rule

/** Why a scene is more than text, or null if it is only text. mg_check.mjs applies the same rule before render. */
export const visualReason = (s: Scene): string | null => {
  if (s.type === 'footage') return 'footage';
  if (s.type === 'product' || s.type === 'endcard') return s.type;
  if (s.type === 'compare') return 'bars';
  if (s.type === 'custom') return s.draws ? `custom: ${s.draws}` : null;
  if (s.type === 'list' && s.marker === 'icon') return 'icon steps';
  const real = (s.visuals ?? []).find((v) => isRealVisual(v.kind));
  return real ? real.kind : null;
};

// ------------------------------------------------------------------ transitions

const WhipView: React.FC<TransitionPresentationComponentProps<{dir: Dir}>> = ({children, presentationDirection, presentationProgress: p, passedProps}) => {
  const d = presentationDirection === 'exiting' ? -p : 1 - p;
  const v = passedProps.dir === 'from-bottom' || passedProps.dir === 'from-top';
  const sign = passedProps.dir === 'from-left' || passedProps.dir === 'from-top' ? -1 : 1;
  return <AbsoluteFill style={{transform: v ? `translateY(${sign * d * 100}%)` : `translateX(${sign * d * 100}%)`, filter: `blur(${Math.sin(p * Math.PI) * 28}px)`}}>{children}</AbsoluteFill>;
};
const ZoomView: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({children, presentationDirection, presentationProgress: p}) => {
  const ex = presentationDirection === 'exiting';
  return <AbsoluteFill style={{transform: `scale(${ex ? 1 + p * 1.8 : 0.55 + 0.45 * p})`, opacity: ex ? 1 - p : Math.min(1, p * 2),
    filter: `blur(${Math.sin(p * Math.PI) * 14}px)`}}>{children}</AbsoluteFill>;
};
const IrisView: React.FC<TransitionPresentationComponentProps<Record<string, never>>> = ({children, presentationDirection, presentationProgress: p}) => (
  <AbsoluteFill style={{clipPath: presentationDirection === 'entering' ? `circle(${p * 75}% at 50% 50%)` : undefined}}>{children}</AbsoluteFill>
);

// The presentations have different prop types; widen so one helper can return any of them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const presentation = (t: Transition): TransitionPresentation<any> =>
  t.type === 'slide' ? slide({direction: t.direction ?? 'from-right'})
    : t.type === 'wipe' ? wipe({direction: t.direction ?? 'from-left'})
      : t.type === 'whip' ? {component: WhipView, props: {dir: t.direction ?? 'from-right'}}
        : t.type === 'zoom' ? {component: ZoomView, props: {}}
          : t.type === 'iris' ? {component: IrisView, props: {}}
            : fade();

export const transitionFrames = (t?: Transition) => (t ? sec(t.seconds ?? 0.4) : 0);
export const adDuration = (scenes: Scene[]) =>
  scenes.reduce((n, s, i) => n + sec(s.duration) - (i > 0 ? transitionFrames(s.transition) : 0), 0);

// ------------------------------------------------------------------ scene

const onDark = (bg?: Scene['bg']) => (bg === 'primary' || bg === 'secondary' || bg === 'dark' ? C.onPrimary : C.text);

const Glitchy: React.FC<{children: React.ReactNode}> = ({children}) => {
  const f = useCurrentFrame();
  const amp = f < 10 ? 30 * (1 - f / 10) : f % 9 === 0 ? 12 : 0;
  const j = (k: string) => (random(`${k}${f}`) - 0.5) * 2 * amp;
  return (
    <div style={{position: 'relative'}}>
      {['#00F0FF', '#FF2E88'].map((c, i) => (
        <div key={c} style={{position: 'absolute', inset: 0, color: c, mixBlendMode: 'screen', opacity: 0.85, transform: `translate(${j(`g${i}`)}px, ${j(`h${i}`) * 0.3}px)`,
          filter: `drop-shadow(0 0 0 ${c})`}}>{children}</div>
      ))}
      <div style={{position: 'relative'}}>{children}</div>
    </div>
  );
};

const SceneView: React.FC<{s: Scene; index: number}> = ({s, index}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  if (!visualReason(s)) {
    throw new Error(`Scene ${index + 1} ("${s.type}"${s.text ? `: "${s.text}"` : ''}) only animates text. Add a visual from the animation library ` +
      '(pour, chart, gauge, card, badges, icon, steps, orbit, packshot, split, shatter, particles) or footage - see references/animation-library.md.');
  }
  const footage = s.type === 'footage';
  const color = footage ? C.onPrimary : onDark(s.bg);
  const mains = (s.visuals ?? []).filter((v) => (v.layer ?? defaultLayer(v.kind)) === 'main');
  const textY = s.textY ?? (mains.length || s.type === 'list' ? 'top' : 'center');
  const justify = textY === 'top' ? 'flex-start' : textY === 'bottom' ? 'flex-end' : 'center';
  const headSize = s.type === 'title' && !mains.length ? 132 : 100;
  let heading = s.text ? <Txt text={s.text} preset={s.preset ?? (index === 0 ? 'fade' : 'fadeRise')} at={index === 0 ? 0 : 4} size={headSize} color={color} /> : null;
  if (heading && s.glitch) heading = <Glitchy>{heading}</Glitchy>;
  const sub = s.sub ? <Txt text={s.sub} at={14} size={60} weight={600} color={color} /> : null;

  // Content box for the visuals: under the heading when text sits on top, else the whole safe area.
  const portrait = H > W;
  const top = s.text && textY === 'top' ? (portrait ? 0.3 : 0.32) : textY === 'bottom' ? (portrait ? 0.08 : 0.06) : (portrait ? 0.1 : 0.08);
  const bottom = textY === 'bottom' && s.text ? (portrait ? 0.66 : 0.66) : (portrait ? 0.86 : 0.92);
  const content: Box = {x: W * 0.06, y: H * top, w: W * 0.88, h: H * (bottom - top)};
  const boxOf = (v: VisualOf): Box => {
    if (v.box) return {x: v.box.x * W, y: v.box.y * H, w: v.box.w * W, h: v.box.h * H};
    const l = v.layer ?? defaultLayer(v.kind);
    return l === 'main' ? content : {x: 0, y: 0, w: W, h: H};
  };
  const layer = (l: 'back' | 'main' | 'front') => (s.visuals ?? []).filter((v) => (v.layer ?? defaultLayer(v.kind)) === l)
    .map((v, i) => <VisualView key={`${l}${i}`} v={v} box={boxOf(v)} />);

  const shake = (s.shake ?? []).map(sec).reduce((acc, t) => {
    if (f < t || f > t + 10) return acc;
    const k = 18 * (1 - (f - t) / 10);
    return {x: acc.x + (random(`kx${f}`) - 0.5) * 2 * k, y: acc.y + (random(`ky${f}`) - 0.5) * 2 * k};
  }, {x: 0, y: 0});

  const Custom = s.type === 'custom' ? CUSTOM[s.component ?? ''] : null;
  if (s.type === 'custom' && !Custom) throw new Error(`Scene ${index + 1}: custom component "${s.component}" is not registered in src/custom/index.ts`);

  return (
    <AbsoluteFill style={{transform: `translate(${shake.x}px, ${shake.y}px)`}}>
      {footage ? <Footage src={s.src!} trimBefore={s.trimBefore} pushIn={s.pushIn !== false} fit={s.fit} /> : <Background tone={s.bg ?? 'ground'} seed={index + 1} />}
      {footage && (s.text || mains.length > 0) && (
        <AbsoluteFill style={{background: `linear-gradient(180deg, ${C.secondary}cc 0%, transparent 38%, transparent 62%, ${C.secondary}aa 100%)`}} />
      )}
      {layer('back')}
      {Custom && <Custom duration={s.duration} />}
      {s.type === 'endcard' && <EndCard url={s.url} cta={s.cta} />}
      {layer('main')}
      {s.type !== 'endcard' && s.type !== 'custom' && (
        <Safe justify={justify}>
          {footage ? (heading && <div style={{padding: '0.4em 0.8em', borderRadius: 24, background: `${C.secondary}cc`}}>{heading}</div>) : heading}
          {s.type === 'title' && !mains.length && <Rule at={10} />}
          {sub}
          {s.type === 'stat' && <Stat value={s.value ?? ''} label={s.label} at={6} color={s.bg && s.bg !== 'ground' ? 'accent' : 'primary'} />}
          {s.type === 'list' && s.marker !== 'icon' && <SlideList items={s.items ?? []} marker={s.marker} at={10} size={78} color={color} />}
          {s.type === 'compare' && <><Bars bars={s.bars ?? []} unit={s.unit} at={8} />{s.note && <Txt text={s.note} at={30} size={30} weight={500} color={color} />}</>}
          {s.type === 'product' && <ProductShot src={s.src!} at={4} height={0.42} />}
        </Safe>
      )}
      {s.type === 'list' && s.marker === 'icon' && <Steps box={content} items={(s.items ?? []).map((t) => ({text: t, icon: iconFor(t)?.icon}))} at={0.3} />}
      {footage && s.lowerThird && <Safe justify="flex-end"><LowerThird title={s.lowerThird.title} sub={s.lowerThird.sub} at={10} /></Safe>}
      {layer('front')}
      {s.ring && <HighlightRing x={s.ring.x} y={s.ring.y} r={s.ring.r} at={12} />}
    </AbsoluteFill>
  );
};

export const Ad: React.FC<AdProps> = ({scenes}) => {
  const {fps} = useVideoConfig();
  const items: React.ReactNode[] = [];
  scenes.forEach((s, i) => {
    if (i > 0 && s.transition) {
      const t = s.transition;
      const frames = transitionFrames(t);
      items.push(
        <TransitionSeries.Transition key={`t${i}`} presentation={presentation(t)}
          timing={t.timing === 'spring' ? springTiming({config: {damping: 200}, durationInFrames: frames}) : linearTiming({durationInFrames: frames})} />,
      );
    }
    items.push(
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={sec(s.duration)} premountFor={fps}>
        <SceneView s={s} index={i} />
      </TransitionSeries.Sequence>,
    );
  });
  return <TransitionSeries>{items}</TransitionSeries>;
};

// ------------------------------------------------------------------ overlay

/** Transparent graphics to lay over footage in build_ad.mjs (EDL "overlays"). Each item needs an icon or a visual too. */
export const Overlay: React.FC<OverlayProps> = ({items}) => {
  const {fps, height, width} = useVideoConfig();
  return (
    <AbsoluteFill>
      {items.map((it, i) => {
        if (!it.icon && !it.visual) {
          throw new Error(`Overlay item ${i + 1} ("${it.type}") is text only - give it an "icon" or a "visual" (gauge, badges, icon, packshot...).`);
        }
        const y = height * (it.y ?? 0.72);
        const box: Box = {x: width * 0.06, y: y - height * 0.14, w: width * 0.88, h: height * 0.28};
        return (
          <Sequence key={i} from={sec(it.start)} durationInFrames={sec(it.duration)} premountFor={fps}>
            <OverlayIcon it={it} />
            {it.visual && <VisualView v={it.visual} box={it.visual.box ? {x: it.visual.box.x * width, y: it.visual.box.y * height, w: it.visual.box.w * width, h: it.visual.box.h * height} : box} />}
            {it.type !== 'visual' && (
              <AbsoluteFill style={{alignItems: 'center'}}>
                <div style={{position: 'absolute', top: y, transform: 'translateY(-50%)', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 24}}>
                  {it.type === 'lowerThird' && <LowerThird title={it.text ?? ''} sub={it.sub} at={0} exitAt={sec(it.duration) - 10} />}
                  {it.type === 'title' && <Txt text={it.text ?? ''} preset={it.preset ?? 'fadeRise'} exitAt={sec(it.duration) - 8} size={90} color="onPrimary" />}
                  {it.type === 'stat' && <Stat value={it.value ?? ''} label={it.label} color="accent" />}
                  {it.type === 'list' && <SlideList items={it.items ?? []} marker={it.marker} color="onPrimary" />}
                </div>
              </AbsoluteFill>
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const OverlayIcon: React.FC<{it: OverlayItem}> = ({it}) => {
  const f = useCurrentFrame();
  const {height, width} = useVideoConfig();
  if (!it.icon) return null;
  const D = Math.min(width, height) * 0.16, y = height * (it.y ?? 0.72) - D * 1.25;
  return (
    <div style={{position: 'absolute', left: width / 2 - D / 2, top: y - D / 2, width: D, height: D, borderRadius: '50%', background: C.primary,
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 30px rgba(0,0,0,0.3)', transform: `scale(${Math.min(1, f / 8)})`}}>
      <Icon name={it.icon} size={D * 0.62} p={Math.min(1, Math.max(0, (f - 4) / 16))} color={C.onPrimary} />
    </div>
  );
};
