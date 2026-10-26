"""separate.py - cut a subject (person, product, hand) out of a clip with SAM 2.1, locally.

Run by separate.mjs inside its own venv:
    python separate.py <frames_dir> <out_dir> --points "x,y,1;x,y,0" [--model tiny|base-plus|large] [--feather 2]

<frames_dir>  PNG frames extracted by separate.mjs (constant frame rate, frame_00000.png ...)
<out_dir>     writes frame_00000.png ... as RGBA: the subject on transparency, edges softened by --feather px
--points      on the FIRST frame, as fractions of the frame (0..1): label 1 = subject, 0 = exclude (e.g. a box the
              hand holds when you only want the hand). Two or three points on the subject beat one.

Method after Barty-Bart/motion-graphics "object-separation" (MIT): SAM 2.1 through Hugging Face transformers,
frames in chunks of 60, each chunk seeded with the previous chunk's last mask.
"""
import argparse, glob, os, sys, time

import numpy as np
import torch
from PIL import Image, ImageFilter
from transformers import Sam2VideoModel, Sam2VideoProcessor

ap = argparse.ArgumentParser()
ap.add_argument('frames'); ap.add_argument('out')
ap.add_argument('--points', required=True)
ap.add_argument('--model', default='auto')
ap.add_argument('--feather', type=float, default=2.0)
ap.add_argument('--chunk', type=int, default=60)
a = ap.parse_args()

if torch.cuda.is_available():
    dev = 'cuda'
    vram = torch.cuda.get_device_properties(0).total_memory / 2**30
    auto = 'large' if vram >= 11.5 else 'base-plus'
elif getattr(torch.backends, 'mps', None) and torch.backends.mps.is_available():
    dev, auto = 'mps', 'base-plus'
else:
    dev, auto = 'cpu', 'tiny'
size = auto if a.model == 'auto' else a.model
mid = {'tiny': 'facebook/sam2.1-hiera-tiny', 'base-plus': 'facebook/sam2.1-hiera-base-plus', 'large': 'facebook/sam2.1-hiera-large'}[size]
print(f'  device {dev}, model {mid}', flush=True)

files = sorted(glob.glob(os.path.join(a.frames, '*.png')))
if not files:
    sys.exit(f'no frames in {a.frames}')
full = [np.array(Image.open(f).convert('RGB')) for f in files]
H, W = full[0].shape[:2]
# SAM resizes to 1024 internally - feed ~960 wide, map the masks back to full size
sw = 960 if W > 960 else W
sh = round(H * sw / W)
small = [np.array(Image.fromarray(f).resize((sw, sh), Image.BILINEAR)) for f in full]

pts, labs = [], []
for p in a.points.split(';'):
    x, y, l = (p.split(',') + ['1'])[:3]
    pts.append([float(x) * sw, float(y) * sh]); labs.append(int(l))

model = Sam2VideoModel.from_pretrained(mid).to(dev).eval()
proc = Sam2VideoProcessor.from_pretrained(mid)
os.makedirs(a.out, exist_ok=True)

masks = [None] * len(small)
prev = None
t0 = time.time()
for c0 in range(0, len(small), a.chunk):
    chunk = small[c0:c0 + a.chunk]
    s = proc.init_video_session(video=chunk, inference_device=dev, video_storage_device='cpu', inference_state_device='cpu', dtype=torch.float32)
    if prev is None:
        proc.add_inputs_to_inference_session(inference_session=s, frame_idx=0, obj_ids=1, input_points=[[pts]], input_labels=[[labs]])
    else:
        proc.add_inputs_to_inference_session(inference_session=s, frame_idx=0, obj_ids=1, input_masks=prev.astype(np.uint8))
    with torch.inference_mode():
        model(inference_session=s, frame_idx=0)
        for o in model.propagate_in_video_iterator(s, start_frame_idx=0):
            m = proc.post_process_masks([o.pred_masks], original_sizes=[[sh, sw]], binarize=True)[0]
            m = np.asarray(m).astype(bool)
            while m.ndim > 2:
                m = m[0]
            masks[c0 + o.frame_idx] = m
            prev = m
    done = min(len(small), c0 + a.chunk)
    print(f'  {done}/{len(small)} frames  ({(time.time() - t0) / done:.1f}s per frame)', flush=True)

# subject on transparency, at full resolution, with a soft edge
empty = 0
for i, (rgb, m) in enumerate(zip(full, masks)):
    if m is None or not m.any():
        empty += 1
        m = np.zeros((sh, sw), bool)
    alpha = Image.fromarray((m * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR)
    if a.feather > 0:
        alpha = alpha.filter(ImageFilter.GaussianBlur(a.feather))
    rgba = np.dstack([rgb, np.array(alpha)])
    Image.fromarray(rgba, 'RGBA').save(os.path.join(a.out, f'frame_{i:05d}.png'), optimize=False, compress_level=3)
cover = float(np.mean([m.mean() for m in masks if m is not None]))
print(f'  wrote {len(full)} frames to {a.out}  (subject covers {cover * 100:.0f}% of the frame on average{f", {empty} frames lost the subject" if empty else ""})', flush=True)
