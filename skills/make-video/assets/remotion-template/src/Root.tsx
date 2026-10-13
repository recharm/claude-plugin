import React from 'react';
import {CalculateMetadataFunction, Composition} from 'remotion';
import {Ad, adDuration, AdProps, Overlay, OverlayProps} from './Ad';
import {T} from './theme';
import example from '../ad.json';
import {sec} from './lib/anim';

// Size comes from theme.json (written by mg_init.mjs from the interview's ratio): 1080x1920 or 1920x1080.
const W = T.aspect === '16:9' ? 1920 : 1080;
const H = T.aspect === '16:9' ? 1080 : 1920;

const adMeta: CalculateMetadataFunction<AdProps> = ({props}) => ({durationInFrames: Math.max(1, adDuration(props.scenes))});
const overlayMeta: CalculateMetadataFunction<OverlayProps> = ({props}) => ({durationInFrames: Math.max(1, sec(props.duration))});

export const Root: React.FC = () => (
  <>
    <Composition id="Ad" component={Ad} fps={30} width={W} height={H} durationInFrames={300}
      defaultProps={example.ad as AdProps} calculateMetadata={adMeta} />
    <Composition id="Overlay" component={Overlay} fps={30} width={W} height={H} durationInFrames={300}
      defaultProps={example.overlay as OverlayProps} calculateMetadata={overlayMeta} />
  </>
);
