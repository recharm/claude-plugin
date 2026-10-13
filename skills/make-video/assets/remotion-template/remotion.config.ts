import {Config} from '@remotion/cli/config';

// Footage ads hand the Remotion render to build_ad.mjs, which normalises to 30fps and mixes audio,
// so render the picture only and keep it sharp (pass --crf=16 for MP4; ProRes overlays take no CRF).
Config.setVideoImageFormat('jpeg');
Config.setJpegQuality(95);
Config.setConcurrency(null);
