// @remotion/motion-blur: HyperFrames has no sub-frame sampling. Final renders get a light blur instead
// (hf_build.mjs --blur: render at 60fps, blend each pair of frames down to 30). Here it is a pass-through.
import type {ComponentChildren} from 'preact';
export const CameraMotionBlur = ({children}: {children?: ComponentChildren; samples?: number; shutterAngle?: number}) => children as never;
