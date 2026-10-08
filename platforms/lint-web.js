// Web shell lint: the shell (Backdrop Nav Skeleton.dc.html) may only arrange component instances and read design / config values.
// Flags look-and-feel literals in its template and logic: colours (hex, rgb[a], hsl, oklch), lengths (NNpx, except 0 / 1px hairlines
// and percentages), durations (NNms), easing curves (cubic-bezier, ease-in/out names) and numeric fallbacks after a design lookup (`|| 48`, `?? 300`).
// Skipped: regions between `lint:off <reason>` and `lint:on` comments (debug side panel, simulated devices, fake-backend artwork),
// hint-size placeholders (streaming only), elements marked data-harness="frame" and the data-harness="panel" side panel.
// Shell only: motion code (element.animate, style.transition, literal transition lists) — motion players live in platforms/web/motions.js.
// Not part of the API rules (api/invariants.js); run by Invariants.dc.html as a platform check.

const RULES = [
  { id: 'colour', re: /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/gi },
  { id: 'length', re: /(?<![\w.$-])(?!0px|1px)\d+(?:\.\d+)?px\b/g },
  { id: 'duration', re: /(?<![\w.$-])(?!0ms)\d+ms\b/g },
  { id: 'easing', re: /cubic-bezier\(|\bease-(?:in|out|in-out)\b/g },
  { id: 'fallback', re: /(?:\|\||\?\?)\s*-?\d{2,}(?:\.\d+)?\b/g }
];

const blank = m => m.replace(/[^\n]/g, ' ');
// shell only: motion code belongs in platforms/web/motions.js
const SHELL_RULES = [{ id: 'motion', re: /\.animate\(|style\.transition\s*=|transition:\s*(?!\{\{)[a-z]|'(?:opacity|transform|clip-path|top|left|width|height|border-radius) [^']*'\s*\+|cubicBezier|requestAnimationFrame\(\s*step/g }];
function strip(src) {
  // blank out (keeping line numbers): lint:off … lint:on regions, streaming placeholders (hint-size), harness frame lines, the harness panel to the template's end
  return src
    .replace(/lint:off[\s\S]*?lint:on/g, blank)
    .replace(/hint-size="[^"]*"/g, blank)
    .replace(/<div data-harness="panel"[\s\S]*?<\/x-dc>/g, blank)
    .replace(/^.*data-harness="frame".*$/gm, blank);
}

export function lintShell(source, isModule = false) {
  const start = isModule ? -1 : source.indexOf('<x-dc>'), body = start >= 0 ? source.slice(start) : source;
  const offsetLine = start >= 0 ? source.slice(0, start).split('\n').length - 1 : 0;
  const text = strip(body), lines = text.split('\n'), out = [];
  lines.forEach((line, i) => {
    // helmet: body resets, @font-face and keyframes are allowed there
    if (/<helmet>/.test(line)) return;
    for (const r of isModule ? RULES : [...RULES, ...SHELL_RULES]) { r.re.lastIndex = 0; let m; while ((m = r.re.exec(line))) out.push({ rule: r.id, line: offsetLine + i + 1, match: m[0], context: line.trim().slice(Math.max(0, m.index - 40), m.index + 40) }); }
  });
  return out;
}
