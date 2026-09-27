#!/usr/bin/env python3
"""Check a DesignSync puller session actually fetched everything it was asked to.

Trusting the agent's own end-of-run summary is exactly the failure mode this exists to catch:
a puller session claimed "All text files successfully fetched with no errors" in the same
breath as "the remaining component files from media and navigation... would continue the same
pattern" — it had quietly stopped after components/forms/ and reported success anyway. This
reads the ACTUAL list_files result and the ACTUAL get_file calls out of the transcript(s) and
diffs them, so completeness is a fact, not a claim.

  python3 ds_check_complete.py TRANSCRIPT [TRANSCRIPT...]

Prints one missing path per line to stdout, and a one-line summary to stderr. Exit 0 if nothing
is missing, 1 otherwise.

The include/skip rule here MUST match the rule stated in design_pull.sh's PULL_PROMPT — they are
independent statements of the same policy (one in prose to the model, one in code checking its
work), not derived from a shared source. If you change one, change the other.
"""
import json, sys

TEXT_EXTS = ('.jsx', '.d.ts', '.card.html', '.css', '.md', '.js', '.json', '.html')
SKIP_PREFIXES = ('assets/', 'uploads/')
SKIP_EXACT = {'_ds_bundle.js'}


def find_first(obj, pred):
    if isinstance(obj, dict):
        if pred(obj):
            return obj
        for v in obj.values():
            r = find_first(v, pred)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = find_first(v, pred)
            if r is not None:
                return r
    elif isinstance(obj, str):
        try:
            parsed = json.loads(obj)
        except Exception:
            return None
        return find_first(parsed, pred)
    return None


def is_wanted(path):
    if path in SKIP_EXACT:
        return False
    if any(path.startswith(p) for p in SKIP_PREFIXES):
        return False
    return path.endswith(TEXT_EXTS)


def main():
    transcripts = sys.argv[1:]
    if not transcripts:
        print('usage: ds_check_complete.py TRANSCRIPT [TRANSCRIPT...]', file=sys.stderr)
        sys.exit(2)

    listed = None
    fetched = set()
    for t in transcripts:
        try:
            lines = open(t, encoding='utf-8', errors='replace')
        except FileNotFoundError:
            print(f'  MISSING transcript: {t}', file=sys.stderr)
            continue
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if 'list_files' in line and '"paths":' in line and listed is None:
                r = find_first(json.loads(line) if line.startswith('{') else line,
                                lambda d: isinstance(d, dict) and d.get('method') == 'list_files' and 'paths' in d)
                if r:
                    listed = r['paths']
            if '"method":"get_file"' in line and '"content":' in line:
                r = find_first(json.loads(line) if line.startswith('{') else line,
                                lambda d: isinstance(d, dict) and d.get('method') == 'get_file' and 'path' in d)
                if r:
                    fetched.add(r['path'])

    if listed is None:
        print('list_files result not found in any given transcript — cannot verify completeness', file=sys.stderr)
        sys.exit(2)

    wanted = sorted(p for p in listed if is_wanted(p))
    missing = sorted(set(wanted) - fetched)

    print(f'wanted: {len(wanted)}   fetched: {len(fetched & set(wanted))}   missing: {len(missing)}',
          file=sys.stderr)
    for m in missing:
        print(m)
    sys.exit(1 if missing else 0)


if __name__ == '__main__':
    main()
