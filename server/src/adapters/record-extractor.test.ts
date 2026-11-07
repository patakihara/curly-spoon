import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanRecording } from './http/scan.js';
import {
  type ExecResult,
  headRecording,
  KNOWN_TRACK,
  onServer,
  processRecording,
  recordedFormatUrl,
  recordExtractor,
  trimInfo,
} from './record-extractor.js';

const ADDRESS = '85.76.1.2';
const STREAM =
  `https://rr3---sn-abcdef12.googlevideo.com/videoplayback?expire=1794034003&ei=e1&ip=${ADDRESS}` +
  '&id=o-AbCdEf0123456789&itag=251&source=youtube&requiressl=yes&mh=xy&mm=31&mn=sn-abcdef12' +
  '&ms=au&mv=m&pl=24&initcwndbps=99&bui=AbCdEf0123456789&spc=QwErTy0123456789&vprv=1' +
  '&mime=audio%2Fwebm&rqh=1&clen=3445462&dur=213.581&lmt=1&mt=1&sparams=expire,ip&sig=s1' +
  '&lsparams=mh,mm&lsig=l1&n=n1&pot=p1';

describe("the recorder's rebuild of a stream's URL", () => {
  it('keeps only named parameters, with the address, signatures and cache nodes out', () => {
    const url = new URL(recordedFormatUrl(STREAM));
    expect(url.hostname).toBe('rr0---sn-recorded.googlevideo.com');
    expect([...url.searchParams.keys()].sort()).toEqual(
      ['clen', 'dur', 'ei', 'expire', 'ip', 'itag', 'lsig', 'mime', 'n', 'sig', 'source'].sort(),
    );
    for (const name of ['ip', 'sig', 'lsig', 'n', 'ei']) {
      expect(url.searchParams.get(name), name).toBe('<token>');
    }
    const text = recordedFormatUrl(STREAM);
    for (const gone of [ADDRESS, 'sn-abcdef12', 'AbCdEf', 'QwErTy', 'o-Ab']) {
      expect(text).not.toContain(gone);
    }
  });

  it('a manifest, whose path holds the address, and any other host, lose the whole of it', () => {
    const manifest = `https://manifest.googlevideo.com/api/manifest/hls/ip/${ADDRESS}/sig/x`;
    expect(recordedFormatUrl(manifest)).toBe('https://rr0---sn-recorded.googlevideo.com/elsewhere');
    expect(recordedFormatUrl('https://i.ytimg.com/sb/x?sqp=abc')).toBe(
      'http://upstream.invalid/elsewhere',
    );
  });
});

describe("the recorder's trim of an extractor's answer", () => {
  it('keeps named fields alone, leaving out headers, fragments and cookies', () => {
    const out = trimInfo({
      id: KNOWN_TRACK,
      duration: 214,
      uploader_url: 'https://www.youtube.com/@x',
      automatic_captions: { en: [] },
      formats: [
        {
          format_id: '251',
          url: STREAM,
          vcodec: 'none',
          http_headers: { 'User-Agent': 'x' },
          cookies: 'a=b',
          fragments: [{ url: STREAM }],
        },
      ],
    });
    expect(Object.keys(out).sort()).toEqual(['duration', 'formats', 'id', 'trimmed']);
    const [format] = out.formats as Record<string, unknown>[];
    expect(Object.keys(format!).sort()).toEqual(['format_id', 'url', 'vcodec']);
    expect(JSON.stringify(out)).not.toContain(ADDRESS);
  });
});

describe('a process as a recording', () => {
  const run = (stderr: string, stdout: unknown = null) => ({
    call: 'c',
    version: 'yt-dlp 1',
    argv: ['yt-dlp', '--', KNOWN_TRACK],
    rc: 1,
    stdout,
    stderr,
  });

  it('holds the command line and the exit code, and passes the scan', () => {
    const recording = processRecording(
      run('ERROR: failed. See  https://github.com/x/y/wiki  now'),
      [],
    );
    expect(recording.response.status).toBe(1);
    expect(JSON.stringify(recording.request.body)).toContain(KNOWN_TRACK);
    expect(JSON.stringify(recording.response.body)).not.toContain('github.com');
    expect(scanRecording(recording)).toEqual([]);
  });

  it('the address is replaced wherever it stands, as a secret', () => {
    const recording = processRecording(run(`from ${ADDRESS} refused`), [ADDRESS]);
    expect(JSON.stringify(recording)).not.toContain(ADDRESS);
  });

  it('[M3.ytmusic/a] the scan fails on a stream URL the trim did not see', () => {
    const planted = run('', {
      formats: [{ url: 'https://rr0---sn-recorded.googlevideo.com/x?bui=AbCdEf0123456789' }],
    });
    const kinds = scanRecording(processRecording(planted, [])).map((finding) => finding.kind);
    expect(kinds).toContain('query-secret');
  });

  it("a stream host's answer has the clip for its body, and no secret in its query", () => {
    const recording = headRecording(
      'range-chunk',
      'yt-dlp 1',
      STREAM,
      'bytes=0-1',
      { status: 206, headers: { 'content-type': 'audio/webm', 'set-cookie': 'a=b' } },
      [ADDRESS],
    );
    expect(recording.response.body).toMatchObject({ bytes: 'opus-clip.webm' });
    expect(JSON.stringify(recording)).not.toContain(ADDRESS);
    expect(recording.response.headers).toEqual({ 'content-type': 'audio/webm' });
    expect(scanRecording(recording)).toEqual([]);
  });
});

describe('the recording run', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** The server, as the recorder sees it through ssh. */
  function server(
    overrides: (line: string, stdin?: string) => ExecResult | undefined = () => undefined,
  ) {
    const lines: string[] = [];
    const info = {
      id: KNOWN_TRACK,
      duration: 214,
      formats: [
        { format_id: '251', url: STREAM, filesize: 3445462, vcodec: 'none', protocol: 'https' },
        { format_id: '160', url: STREAM.replace('audio%2Fwebm', 'video%2Fmp4'), filesize: 1 },
      ],
    };
    const ok = (stdout: string): ExecResult => ({ rc: 0, stdout, stderr: '' });
    const exec = (argv: string[], stdin?: string): Promise<ExecResult> => {
      const line = argv.join(' ');
      lines.push(line);
      const special = overrides(line, stdin);
      if (special !== undefined) return Promise.resolve(special);
      if (line.includes("'--version'")) return Promise.resolve(ok('2026.10.26\n'));
      if (line.includes('cdn-cgi/trace')) return Promise.resolve(ok(`ip=${ADDRESS}\n`));
      if (line.includes("'--dump-json'")) {
        return Promise.resolve(
          line.includes('zzzzzzzzzz0') || line.includes('player_skip')
            ? { rc: 1, stdout: '', stderr: 'ERROR: failed' }
            : ok(JSON.stringify(info)),
        );
      }
      if (stdin !== undefined) {
        const range = stdin.trim().split('\n')[1]!;
        const away = line.includes('container:gluetun');
        const status = away ? 403 : range.endsWith('-') ? 416 : 206;
        const type = stdin.includes('video%2Fmp4') ? 'video/mp4' : 'audio/webm';
        const head = { 'content-type': type, 'content-range': `bytes 0-1/3445462` };
        return Promise.resolve(ok(JSON.stringify({ status, headers: head })));
      }
      return Promise.resolve(ok(''));
    };
    return { lines, exec };
  }

  const root = () => {
    const dir = mkdtempSync(join(tmpdir(), 'auralis-record-extractor-'));
    dirs.push(dir);
    return dir;
  };

  it('writes every call, each free of the address, and removes its container', async () => {
    const { exec, lines } = server();
    const dir = root();
    const out: string[] = [];
    await recordExtractor({
      exec,
      out: (line) => out.push(line),
      root: dir,
      longTrack: KNOWN_TRACK,
    });
    expect(readdirSync(join(dir, 'ytdlp', 'recordings')).sort()).toEqual(
      ['error-botwall', 'error-unavailable', 'info-long', 'info-node', 'info-plain'].map(
        (call) => `${call}.json`,
      ),
    );
    expect(readdirSync(join(dir, 'googlevideo', 'recordings')).sort()).toEqual(
      ['range-403', 'range-416', 'range-chunk', 'range-head', 'range-video'].map(
        (call) => `${call}.json`,
      ),
    );
    for (const sub of ['ytdlp', 'googlevideo']) {
      for (const file of readdirSync(join(dir, sub, 'recordings'))) {
        const text = readFileSync(join(dir, sub, 'recordings', file), 'utf8');
        expect(text, file).not.toContain(ADDRESS);
        expect(text, file).not.toContain('sn-abcdef12');
      }
    }
    expect(lines.at(-1)).toMatch(/'docker' 'rm' '-f' 'auralis-record-/);
    for (const line of out) expect(line).not.toContain('googlevideo');
  });

  it('removes its container when a step fails too', async () => {
    const { exec, lines } = server((line) =>
      line.includes("'--version'") ? { rc: 126, stdout: '', stderr: '' } : undefined,
    );
    await expect(
      recordExtractor({ exec, out: () => undefined, root: root(), longTrack: KNOWN_TRACK }),
    ).rejects.toThrow(/failed with 126/);
    expect(lines.at(-1)).toMatch(/'docker' 'rm' '-f' 'auralis-record-/);
  });

  it("gives the far shell one quoted line, so a command's `&&` stays inside its container", () => {
    const [ssh, host, line, ...rest] = onServer('sh', '-c', `cd /tmp && echo 'x' "$HOME"`);
    expect([ssh, host, rest]).toEqual(['ssh', 'mediaserver', []]);
    expect(line).toBe(`'sh' '-c' 'cd /tmp && echo '\\''x'\\'' "$HOME"'`);
  });

  it('never sends a URL on a command line, where the server keeps it in its process list', async () => {
    const { exec, lines } = server();
    await recordExtractor({ exec, out: () => undefined, root: root(), longTrack: KNOWN_TRACK });
    for (const line of lines) expect(line).not.toContain('videoplayback');
  });
});
