#!/usr/bin/env node
/**
 * review.mjs - a review page for a motion-graphics ad: watch it, leave notes on scenes, make quick edits, and re-render
 * only the scenes that changed.
 *
 *   node review.mjs <project>/ads/<name>.json [--edl edl.json] [--port 4317]
 *
 * Starts a local server (127.0.0.1 only) and prints its address - open it in a browser (Claude: the built-in browser).
 *
 *   The page     the ad (with voiceover, music and captions when --edl is given), a scene strip, and one card per scene:
 *                its frame, timing, animations and transition; quick edits (heading, sub, text preset, background, transition,
 *                length, camera, or the scene's JSON) and notes. "Apply & re-render" checks the edit (mg_check), keeps the
 *                previous version (Undo), and re-renders only the scenes it touched (hf_build --incremental): seconds,
 *                not the whole ad. "Render final" renders with motion blur, rebuilds the EDL's MP4 and runs the gate;
 *                "Export for Premiere / Resolve" runs export_nle.mjs on it.
 *   Notes        are saved in <project>/ads/<name>.review.json: {notes: [{id, scene, t, text, status, reply}]}. A note that
 *                needs judgement ("make this punchier") is for Claude: Claude edits the ad JSON and marks the note done
 *                with a reply. The server watches the ad JSON, so the page re-renders by itself after Claude's edit.
 *
 * Previews are draft quality (full-size animation, half-size mix); the cache keeps every version, so Undo is instant.
 */
import {spawn, spawnSync} from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {BG_STYLES, BG_TONES, CAMERAS, CARRY_VARIANTS, LOOKS, PRESETS, TRANSITION_TYPES} from './lib/vocab.mjs';
import {defaultSeconds, transitionFrames} from './lib/transitions.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i === -1 ? d : argv[i + 1]; };
const adPath = argv[0] && path.resolve(argv[0]);
if (!adPath || !fs.existsSync(adPath)) { console.error('usage: node review.mjs <project>/ads/<name>.json [--edl edl.json] [--port 4317]'); process.exit(2); }
const edlPath = opt('--edl') ? path.resolve(opt('--edl')) : null;
if (edlPath && !fs.existsSync(edlPath)) { console.error(`no EDL at ${edlPath}`); process.exit(2); }
const PORT = Number(opt('--port', 4317));
const FPS = 30;
const project = path.resolve(path.dirname(adPath), '..');
const name = path.basename(adPath, '.json');
const brand = path.basename(path.dirname(project)); // <root>/brands/<slug>/hyperframes
const work = path.join(project, 'out', '.review', name);
fs.mkdirSync(path.join(work, 'thumbs'), {recursive: true});
const reviewFile = path.join(path.dirname(adPath), `${name}.review.json`);
const versionsDir = path.join(path.dirname(adPath), '.versions');
const PAGE = path.join(HERE, '..', 'assets', 'review', 'review.html');
const readJ = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const writeJ = (p, o) => { fs.writeFileSync(p + '.tmp', JSON.stringify(o, null, 1)); fs.renameSync(p + '.tmp', p); };

// ---- timing, as hf_build computes it
const timingOf = (ad) => {
  const scenes = ad.scenes || [];
  const frames = scenes.map((s) => Math.max(1, Math.round(s.duration * FPS)));
  const tIn = scenes.map((s, i) => (i > 0 && s.transition ? transitionFrames(s.transition, FPS) : 0));
  const starts = [];
  scenes.forEach((s, i) => starts.push(i === 0 ? 0 : starts[i - 1] + frames[i - 1] - tIn[i]));
  const total = scenes.length ? starts[starts.length - 1] + frames[frames.length - 1] : 0;
  return {total: total / FPS, scenes: scenes.map((s, i) => ({start: starts[i] / FPS, end: (starts[i] + frames[i]) / FPS, tIn: tIn[i] / FPS,
    cut0: i === 0 ? 0 : (starts[i] + tIn[i] / 2) / FPS, cut1: i === scenes.length - 1 ? total / FPS : (starts[i + 1] + tIn[i + 1] / 2) / FPS}))};
};

// ---- notes
const loadReview = () => readJ(reviewFile, null) || {ad: path.basename(adPath), notes: []};
const saveReview = (r) => { r.updated = new Date().toISOString(); writeJ(reviewFile, r); };

// ---- jobs: one at a time; a preview asked for while one runs is run again after it
const status = {busy: false, job: null, step: '', log: [], last: null, rev: 0, pending: false, preview: null, windows: null, edlOffset: 0, finalOut: null, exportDir: null, changed: []};
// the page listens on /api/events (Server-Sent Events: delivered even when the browser throttles a hidden tab's timers)
const listeners = new Set();
let pushTimer = null;
const pushNow = () => { pushTimer = null; const {log, ...rest} = status; const msg = `data: ${JSON.stringify({...rest, log: log.slice(-14)})}\n\n`; for (const r of listeners) r.write(msg); };
const push = () => { if (!pushTimer) pushTimer = setTimeout(pushNow, 250); };
const say = (line) => { const l = String(line).trimEnd(); if (!l) return; status.log.push(l); if (status.log.length > 60) status.log.splice(0, status.log.length - 60); push(); };
let renderedScenes = null; // the scenes as last rendered - to tell the page exactly which ones changed
const run = (args, label) => new Promise((done) => {
  status.step = label;
  say(`> ${label}`);
  const c = spawn(process.execPath, args, {env: process.env});
  let txt = '';
  const take = (d) => { txt += d; String(d).split(/\r?\n/).forEach((l) => /\S/.test(l) && say(l)); };
  c.stdout.on('data', take);
  c.stderr.on('data', take);
  c.on('close', (code) => done({ok: code === 0, txt}));
});
let lastAdWrite = 0;
let adText = ''; // the ad as last accepted - what an edit on disk replaces, kept for Undo
const writeAd = (ad) => { writeJ(adPath, ad); lastAdWrite = fs.statSync(adPath).mtimeMs; };
const settle = () => { lastAdWrite = fs.statSync(adPath).mtimeMs; adText = fs.readFileSync(adPath, 'utf8'); };

/** EDL fields that hold paths, made absolute so a copy of the EDL works from another folder. */
const absEdl = (edl, base, mgFile, total) => {
  const abs = (p) => (p && !/^https?:\/\//i.test(p) ? path.resolve(base, p) : p);
  const e = JSON.parse(JSON.stringify(edl));
  let offset = null, t = 0;
  (e.segments || []).forEach((sg) => {
    if (sg.motion && path.resolve(base, sg.motion) === adPath) {
      if (mgFile) { sg.file = mgFile; delete sg.url; }
      if (total != null && (sg.out == null || sg.out >= (sg._mvTotal ?? sg.out) - 0.1)) sg.out = +total.toFixed(3);
      sg._mvTotal = total;
      if (offset == null) offset = t - (sg.in || 0);
    } else if (sg.file) sg.file = abs(sg.file);
    if (sg.motion) sg.motion = abs(sg.motion);
    t += (sg.out ?? 0) - (sg.in ?? 0);
  });
  for (const k of ['voiceover', 'music']) if (e.audio?.[k]?.file) e.audio[k].file = abs(e.audio[k].file);
  (e.audio?.sfx || []).forEach((x) => { if (x.file) x.file = abs(x.file); });
  (e.overlays || []).forEach((o) => { o.file = abs(o.file); });
  for (const k of ['fontsDir', 'clipsDir', 'cacheDir']) if (e[k]) e[k] = abs(e[k]);
  if (e.captionStyle?.project) e.captionStyle.project = abs(e.captionStyle.project);
  if (e.output) e.output = abs(e.output);
  return {edl: e, offset: offset ?? 0};
};

const preview = async () => {
  const mg = path.join(work, `${name}-mg.mp4`);
  const r = await run([path.join(HERE, 'hf_build.mjs'), adPath, '--incremental', '--draft', '--out', mg], 'rendering the changed scenes');
  if (!r.ok) return {ok: false, summary: 'render failed - see the log'};
  status.windows = readJ(mg.replace(/\.mp4$/, '.windows.json'));
  let file = mg, summary = (r.txt.match(/\d+ windows.*$/m) || [''])[0];
  if (edlPath) {
    const total = timingOf(readJ(adPath)).total;
    const {edl, offset} = absEdl(readJ(edlPath), path.dirname(edlPath), mg, total);
    edl.output = path.join(work, `${name}.mp4`);
    edl.workDir = path.join(work, 'mix');
    const tmpEdl = path.join(work, 'edl.json');
    writeJ(tmpEdl, edl);
    const m = await run([path.join(HERE, 'build_ad.mjs'), tmpEdl, '--draft'], 'mixing voiceover, music and captions');
    if (!m.ok) return {ok: false, summary: 'the mix failed - see the log'};
    file = path.join(work, `${name}-draft.mp4`);
    status.edlOffset = offset;
  }
  status.preview = file;
  const now = (readJ(adPath)?.scenes || []).map((s) => JSON.stringify(s));
  status.changed = renderedScenes ? now.map((s, i) => (s !== renderedScenes[i] ? i : -1)).filter((i) => i >= 0) : [];
  renderedScenes = now;
  status.rev++;
  return {ok: true, summary};
};

const final = async () => {
  const out = path.join(project, 'out', `${name}-final.mp4`);
  const r = await run([path.join(HERE, 'hf_build.mjs'), adPath, '--incremental', '--blur', '--out', out], 'final render (motion blur)');
  if (!r.ok) return {ok: false, summary: 'final render failed - see the log'};
  if (!edlPath) { status.finalOut = out; return {ok: true, summary: `final animation -> ${out}`}; }
  // the EDL now points at the final render, with the motion segment's length following the ad
  const edl = readJ(edlPath), base = path.dirname(edlPath), total = timingOf(readJ(adPath)).total;
  if (!fs.existsSync(edlPath + '.before-review')) fs.copyFileSync(edlPath, edlPath + '.before-review');
  (edl.segments || []).forEach((sg) => {
    if (sg.motion && path.resolve(base, sg.motion) === adPath) {
      sg.file = out.split(path.sep).join('/');
      delete sg.url;
      if (sg.out == null || sg.out >= (sg._mvTotal ?? sg.out) - 0.1) sg.out = +total.toFixed(3);
      sg._mvTotal = total;
    }
  });
  writeJ(edlPath, edl);
  const b = await run([path.join(HERE, 'build_ad.mjs'), edlPath], 'building the finished MP4');
  if (!b.ok) return {ok: false, summary: 'build_ad failed - see the log'};
  status.finalOut = path.resolve(base, edl.output);
  const g = await run([path.join(HERE, 'gate.mjs'), status.finalOut, '--edl', edlPath, '--brand', brand], 'the gate');
  const verdict = /BLOCKED/.test(g.txt) ? 'BLOCKED' : /PASS/.test(g.txt) ? 'PASS' : 'see log';
  return {ok: g.ok, summary: `finished ad -> ${status.finalOut}  (gate: ${verdict})`, gate: verdict};
};

const exportNle = async () => {
  if (!edlPath) return {ok: false, summary: 'export needs the EDL (--edl)'};
  const r = await run([path.join(HERE, 'export_nle.mjs'), edlPath, '--verify'], 'exporting the layered timeline');
  const dir = (r.txt.match(/layered edit -> (.+)$/m) || [])[1];
  status.exportDir = dir || null;
  return {ok: r.ok, summary: r.ok ? `layered timeline -> ${dir}` : 'export failed - see the log'};
};

const queue = [];
const enqueue = (kind) => {
  if (kind === 'preview' && (queue.includes('preview') || (status.busy && status.job === 'preview' && (status.pending = true)))) return;
  queue.push(kind);
  pump();
};
const pump = async () => {
  if (status.busy || !queue.length) return;
  const kind = queue.shift();
  Object.assign(status, {busy: true, job: kind, step: '', pending: false});
  push();
  const t0 = Date.now();
  let res;
  try { res = await {preview, final, export: exportNle}[kind](); } catch (e) { res = {ok: false, summary: e.message}; say(e.stack || e.message); }
  status.last = {kind, ...res, secs: +((Date.now() - t0) / 1000).toFixed(1), at: new Date().toISOString()};
  say(`${res.ok ? 'done' : 'FAILED'}: ${res.summary} (${status.last.secs}s)`);
  Object.assign(status, {busy: false, job: null, step: ''});
  pushNow();
  if (status.pending) { status.pending = false; queue.unshift('preview'); }
  pump();
};

// ---- edits from the page: checked, versioned, then rendered
const clean = (v, max = 400) => String(v ?? '').slice(0, max);
const applyPatch = (s, p) => {
  if ('text' in p) { if (p.text) s.text = clean(p.text); else delete s.text; }
  if ('sub' in p) { if (p.sub) s.sub = clean(p.sub); else delete s.sub; }
  if ('strike' in p) { if (p.strike) s.strike = clean(p.strike); else delete s.strike; }
  if (p.preset && PRESETS.includes(p.preset)) s.preset = p.preset;
  if (p.bg && BG_TONES.includes(p.bg)) s.bg = p.bg;
  if (p.bgStyle && BG_STYLES.includes(p.bgStyle)) s.bgStyle = p.bgStyle;
  if (p.camera && CAMERAS.includes(p.camera)) s.camera = p.camera;
  if (Number.isFinite(p.duration) && p.duration >= 0.5 && p.duration <= 30) s.duration = +p.duration.toFixed(2);
  if ('transition' in p) {
    const t = p.transition;
    if (!t || t.type === 'cut') delete s.transition;
    else if (TRANSITION_TYPES.includes(t.type)) {
      s.transition = {...(s.transition?.type === t.type ? s.transition : {}), type: t.type};
      if (t.type === 'carry') s.transition.variant = CARRY_VARIANTS.includes(t.variant) ? t.variant : s.transition.variant || 'dot';
      else delete s.transition.variant;
    }
  }
};
/** Keep the version an edit replaces (its text), so Undo can bring it back. */
const snapshot = (why, text) => {
  fs.mkdirSync(versionsDir, {recursive: true});
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const f = path.join(versionsDir, `${name}.${stamp}.json`);
  fs.writeFileSync(f, text);
  const r = loadReview();
  r.versions = [...(r.versions || []), {file: path.basename(f), at: new Date().toISOString(), why}].slice(-50);
  saveReview(r);
};
const check = () => {
  const r = spawnSync(process.execPath, [path.join(HERE, 'mg_check.mjs'), adPath], {encoding: 'utf8', env: process.env});
  const lines = (r.stdout + r.stderr).split('\n').map((l) => l.trim()).filter(Boolean);
  return {ok: r.status === 0, blocks: lines.filter((l) => l.startsWith('BLOCK')), warns: lines.filter((l) => l.startsWith('warn'))};
};

// ---- the server
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, {'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
};
const body = (req) => new Promise((ok, bad) => {
  let b = '';
  req.on('data', (d) => { b += d; if (b.length > 2e6) { bad(new Error('too large')); req.destroy(); } });
  req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { bad(e); } });
});
const streamFile = (req, res, file, type) => {
  if (!file || !fs.existsSync(file)) return send(res, 404, {error: 'not rendered yet'});
  const size = fs.statSync(file).size, range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (range) {
    const a = range[1] ? Number(range[1]) : 0, b = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, {'Content-Type': type, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': b - a + 1, 'Cache-Control': 'no-store'});
    fs.createReadStream(file, {start: a, end: b}).pipe(res);
  } else {
    res.writeHead(200, {'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'});
    fs.createReadStream(file).pipe(res);
  }
};
const thumb = (k) => {
  const ad = readJ(adPath), tm = timingOf(ad).scenes[k];
  if (!tm || !status.preview) return null;
  const f = path.join(work, 'thumbs', `r${status.rev}_${k}.jpg`);
  if (!fs.existsSync(f)) {
    const t = status.edlOffset + (tm.cut0 + tm.cut1) / 2;
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', t.toFixed(3), '-i', status.preview, '-frames:v', '1', '-vf', 'scale=216:-2', '-q:v', '4', f]);
  }
  return fs.existsSync(f) ? f : null;
};

const server = http.createServer(async (req, res) => {
  // local only: refuse other hosts (DNS rebinding) and cross-site posts (the custom header forces a CORS preflight we never allow)
  const host = String(req.headers.host || '');
  if (!new RegExp(`^(127\\.0\\.0\\.1|localhost):${PORT}$`).test(host)) return send(res, 403, {error: 'local only'});
  if (req.method === 'POST' && req.headers['x-mv-review'] !== '1') return send(res, 403, {error: 'missing header'});
  const url = new URL(req.url, `http://${host}`);
  try {
    if (req.method === 'GET' && url.pathname === '/') return send(res, 200, fs.readFileSync(PAGE, 'utf8'), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/video') return streamFile(req, res, status.preview, 'video/mp4');
    if (req.method === 'GET' && url.pathname.startsWith('/thumb/')) {
      const f = thumb(Number(url.pathname.split('/')[2]));
      return f ? streamFile(req, res, f, 'image/jpeg') : send(res, 404, {error: 'no thumb'});
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, {'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive'});
      res.write('retry: 2000\n\n');
      listeners.add(res);
      req.on('close', () => listeners.delete(res));
      return pushNow();
    }
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const {log, ...rest} = status;
      return send(res, 200, {...rest, log: log.slice(-14)});
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      const ad = readJ(adPath), r = loadReview();
      return send(res, 200, {name, brand, adPath, edl: edlPath, reviewFile, ad, timing: timingOf(ad), offset: status.edlOffset, notes: r.notes || [],
        versions: (r.versions || []).length, vocab: {PRESETS, BG_STYLES, BG_TONES, CAMERAS, TRANSITION_TYPES, CARRY_VARIANTS, LOOKS, defaults: Object.fromEntries(TRANSITION_TYPES.map((t) => [t, defaultSeconds(t)]))},
        windows: status.windows, rev: status.rev, finalOut: status.finalOut, exportDir: status.exportDir});
    }
    if (req.method === 'POST' && url.pathname === '/api/apply') {
      if (status.busy && status.job !== 'preview') return send(res, 409, {error: `busy (${status.job})`});
      const {edits = [], look} = await body(req);
      const before = fs.readFileSync(adPath, 'utf8');
      const ad = JSON.parse(before);
      for (const e of edits) {
        const s = ad.scenes?.[e.index];
        if (!s) continue;
        if (e.json) {
          const j = typeof e.json === 'string' ? JSON.parse(e.json) : e.json;
          if (!j || typeof j !== 'object' || !j.type) throw new Error(`scene ${e.index + 1}: the JSON needs at least a "type"`);
          ad.scenes[e.index] = j;
        } else applyPatch(s, e.patch || {});
      }
      if (look && LOOKS.includes(look)) ad.look = look;
      writeAd(ad);
      const c = check();
      if (!c.ok) {
        fs.writeFileSync(adPath, before);
        settle();
        return send(res, 422, {error: 'mg_check blocked the edit - nothing changed', blocks: c.blocks});
      }
      snapshot(`before: ${edits.map((e) => `S${e.index + 1}`).join(', ')}${look ? ` look ${look}` : ''}`, before);
      settle();
      enqueue('preview');
      return send(res, 200, {ok: true, warns: c.warns});
    }
    if (req.method === 'POST' && url.pathname === '/api/undo') {
      const r = loadReview(), v = (r.versions || []).pop();
      if (!v) return send(res, 400, {error: 'nothing to undo'});
      fs.copyFileSync(path.join(versionsDir, v.file), adPath);
      settle();
      saveReview(r);
      enqueue('preview');
      return send(res, 200, {ok: true, restored: v});
    }
    if (req.method === 'POST' && ['/api/render', '/api/final', '/api/export'].includes(url.pathname)) {
      enqueue({'/api/render': 'preview', '/api/final': 'final', '/api/export': 'export'}[url.pathname]);
      return send(res, 200, {ok: true});
    }
    if (req.method === 'POST' && url.pathname === '/api/note') {
      const {op, id, scene, t, text, status: st} = await body(req);
      const r = loadReview();
      r.notes = r.notes || [];
      if (op === 'add') {
        if (!String(text || '').trim()) return send(res, 400, {error: 'empty note'});
        r.notes.push({id: crypto.randomBytes(4).toString('hex'), scene: Number.isInteger(scene) ? scene : null, t: Number.isFinite(t) ? +t.toFixed(2) : null,
          text: clean(text, 2000), status: 'open', created: new Date().toISOString()});
      } else {
        const n = r.notes.find((x) => x.id === id);
        if (!n) return send(res, 404, {error: 'no such note'});
        if (op === 'delete') r.notes = r.notes.filter((x) => x.id !== id);
        if (op === 'status' && ['open', 'done', 'wontfix'].includes(st)) n.status = st;
      }
      saveReview(r);
      return send(res, 200, {ok: true, notes: r.notes});
    }
    send(res, 404, {error: 'not found'});
  } catch (e) {
    send(res, 400, {error: e.message});
  }
});

// Claude (or anyone) editing the ad JSON outside the page -> re-render on our own
settle();
setInterval(() => {
  try {
    const m = fs.statSync(adPath).mtimeMs;
    if (m === lastAdWrite) return;
    lastAdWrite = m;
    const text = fs.readFileSync(adPath, 'utf8');
    if (text === adText) return;
    JSON.parse(text); // a half-written file throws here; the next tick sees the finished one
    if (!check().ok) { say('the ad JSON changed on disk, but mg_check blocks it - fix it and save again (nothing re-rendered)'); return; }
    snapshot('before: an edit on disk', adText);
    adText = text;
    say('the ad JSON changed on disk - re-rendering the scenes it touched');
    enqueue('preview');
  } catch { lastAdWrite = 0; /* mid-write: look again next second */ }
}, 1000);

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  review: ${name}${edlPath ? `  (with ${path.basename(edlPath)})` : ''}`);
  console.log(`  open   http://127.0.0.1:${PORT}/`);
  console.log(`  notes  ${reviewFile}`);
  console.log('  Ctrl+C stops it. The first preview renders now (every scene once; after that only what changes).\n');
  enqueue('preview');
});
server.on('error', (e) => { console.error(`  could not listen on 127.0.0.1:${PORT} (${e.code}) - pass --port <another>`); process.exit(1); });
