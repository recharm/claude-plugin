// Getting media into the workspace, robustly. Shared by fetch_clips, build_ad and preflight.
//
// Cloud sandboxes (claude.ai, some CI) often allow only an allowlist of hosts. Recharm clips live on
// S3 behind the transfer-acceleration host; the standard S3 host serves the same object and is more
// often allowlisted. When neither is reachable, clips can be dropped into a folder (or uploaded) by the
// user: a browser saves a clip under its URL's file name, so that is what we match on first.
import {createWriteStream} from 'node:fs';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';

/** The same object on every S3 host we know: transfer-accelerated first, then the standard endpoint. */
export const altUrls = (url) => {
  const out = [url];
  const m = url.match(/^https?:\/\/([a-z0-9.-]+)\.s3-accelerate\.amazonaws\.com(\/.*)$/i);
  if (m) out.push(`https://${m[1]}.s3.amazonaws.com${m[2]}`, `https://s3.amazonaws.com/${m[1]}${m[2]}`);
  return [...new Set(out)];
};

/** The file name a browser gives a download of this URL. */
export const urlBasename = (url) => decodeURIComponent(url.split('?')[0].split('/').pop() || '');

/** A clip the user already put somewhere: by URL file name, then by clip symbol (EGP.mp4, "EGP - Pouring.mp4"). */
export const findLocal = (url, symbol, dirs = []) => {
  const base = url ? urlBasename(url).toLowerCase() : '';
  for (const d of dirs.filter((x) => x && fs.existsSync(x))) {
    const files = fs.readdirSync(d).filter((f) => /\.(mp4|mov|m4v|webm)$/i.test(f));
    const hit = (base && files.find((f) => f.toLowerCase() === base))
      || (symbol && files.find((f) => new RegExp(`^${symbol}([ ._-]|$)`, 'i').test(f)))
      || (base && files.find((f) => f.toLowerCase().includes(base.replace(/\.[a-z0-9]+$/, ''))));
    if (hit) return path.join(d, hit);
  }
  return null;
};

/** How a failed request failed: the host answered (HTTP), or something in between refused it (blocked). */
const classify = (err) => {
  const code = err?.cause?.code || err?.code || '';
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return 'dns';
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET/.test(code) || err?.name === 'TimeoutError') return 'blocked';
  return 'error';
};

/** Download with host fallback, retries and an atomic rename. Returns {ok, url, status, reason}. */
export const fetchWithFallback = async (url, dest, {retries = 2, timeoutMs = 120000} = {}) => {
  let last = {ok: false, url, reason: 'not tried'};
  for (const u of altUrls(url)) {
    for (let a = 0; a <= retries; a++) {
      try {
        const res = await fetch(u, {signal: AbortSignal.timeout(timeoutMs)});
        const s3 = !!res.headers.get('x-amz-request-id');
        if (!res.ok) {
          // A 403 that didn't come from S3 is a proxy saying no: this host is blocked, try the next.
          last = {ok: false, url: u, status: res.status, reason: s3 ? `S3 answered ${res.status}` : `blocked by the network (HTTP ${res.status}, not from S3)`};
          break;
        }
        const part = `${dest}.part`;
        await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
        fs.renameSync(part, dest);
        return {ok: true, url: u};
      } catch (e) {
        last = {ok: false, url: u, reason: classify(e) === 'blocked' ? 'blocked by the network (connection refused or timed out)' : classify(e) === 'dns' ? 'host not resolvable from here' : String(e.message || e)};
        if (classify(e) !== 'error') break; // blocked or DNS: retrying the same host won't help
        await new Promise((r) => setTimeout(r, 800 * (a + 1)));
      }
    }
  }
  return last;
};

/** Is a host reachable from this workspace? A real S3 answer (even 403/404) counts; a proxy refusal doesn't. */
export const probeHost = async (url, {timeoutMs = 8000, expectS3 = false} = {}) => {
  try {
    const res = await fetch(url, {method: 'HEAD', signal: AbortSignal.timeout(timeoutMs), redirect: 'manual'});
    const s3 = !!res.headers.get('x-amz-request-id') || /AmazonS3/i.test(res.headers.get('server') || '');
    if (expectS3 && !s3) return {ok: false, status: res.status, reason: `answered ${res.status} but not as S3 - a proxy in between is refusing it`};
    return {ok: true, status: res.status};
  } catch (e) {
    const c = classify(e);
    return {ok: false, reason: c === 'blocked' ? 'connection refused or timed out (blocked)' : c === 'dns' ? 'host not resolvable (blocked or offline)' : String(e.message || e)};
  }
};
