// @remotion/transitions, as far as the library uses it: the presentation contract plus fade / slide / wipe.
// The runner (runner.tsx) applies a scene's entering presentation over its first frames and the next scene's
// exiting presentation over its last ones - the two overlap in time, like TransitionSeries.
import {h} from 'preact';
import type {ComponentChildren, FunctionComponent} from 'preact';
import {AbsoluteFill} from './remotion';

export type TransitionPresentationComponentProps<P> = {
  children?: ComponentChildren; presentationDirection: 'entering' | 'exiting'; presentationProgress: number; passedProps: P;
  presentationDurationInFrames?: number;
};
export type TransitionPresentation<P> = {component: FunctionComponent<TransitionPresentationComponentProps<P>>; props: P};
type Dir = 'from-left' | 'from-right' | 'from-top' | 'from-bottom';

const FadeView: FunctionComponent<TransitionPresentationComponentProps<Record<string, never>>> = ({children, presentationDirection, presentationProgress: p}) =>
  h(AbsoluteFill, {style: {opacity: presentationDirection === 'entering' ? p : 1}}, children);
export const fade = (): TransitionPresentation<Record<string, never>> => ({component: FadeView, props: {}});

const SlideView: FunctionComponent<TransitionPresentationComponentProps<{direction: Dir}>> = ({children, presentationDirection, presentationProgress: p, passedProps}) => {
  const d = passedProps.direction;
  const sign = d === 'from-left' || d === 'from-top' ? -1 : 1, v = d === 'from-top' || d === 'from-bottom';
  const k = presentationDirection === 'entering' ? (1 - p) * sign : -p * sign;
  return h(AbsoluteFill, {style: {transform: v ? `translateY(${k * 100}%)` : `translateX(${k * 100}%)`}}, children);
};
export const slide = ({direction = 'from-right'}: {direction?: Dir} = {}): TransitionPresentation<{direction: Dir}> => ({component: SlideView, props: {direction}});

const WipeView: FunctionComponent<TransitionPresentationComponentProps<{direction: Dir}>> = ({children, presentationDirection, presentationProgress: p, passedProps}) => {
  if (presentationDirection === 'exiting') return h(AbsoluteFill, {}, children);
  const r = (1 - p) * 100, d = passedProps.direction;
  const clip = d === 'from-left' ? `inset(0 ${r}% 0 0)` : d === 'from-right' ? `inset(0 0 0 ${r}%)` : d === 'from-top' ? `inset(0 0 ${r}% 0)` : `inset(${r}% 0 0 0)`;
  return h(AbsoluteFill, {style: {clipPath: clip}}, children);
};
export const wipe = ({direction = 'from-left'}: {direction?: Dir} = {}): TransitionPresentation<{direction: Dir}> => ({component: WipeView, props: {direction}});

// Timing descriptors, read by the runner.
export const linearTiming = ({durationInFrames}: {durationInFrames: number}) => ({kind: 'linear' as const, durationInFrames});
export const springTiming = ({durationInFrames, config}: {durationInFrames: number; config?: Record<string, number>}) => ({kind: 'spring' as const, durationInFrames, config});
// TransitionSeries itself is replaced by one HyperFrames sub-composition per scene (hf_build.mjs).
export const TransitionSeries = Object.assign(() => null, {Sequence: () => null, Transition: () => null});
