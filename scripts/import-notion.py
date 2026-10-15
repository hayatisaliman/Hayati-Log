"""Import Notion monthly daily-log exports into Hayati Log.

Usage: python3 -I scripts/import-notion.py [--dry-run] [--force] [--file PATH] EXPORT_DIR [EXPORT_DIR ...]
Each EXPORT_DIR is one unzipped Notion export (the page .md plus a folder holding the database *_all.csv).
Merges into the existing data file and keeps a copy in backups/ first. Never writes to the export folders.
"""
import csv
import datetime as dt
import glob
import json
import os
import random
import re
import shutil
import string
import sys
from collections import Counter, defaultdict

HOME = os.path.expanduser('~')
OUT_DIR = next((d for d in (os.path.join(HOME, 'Library/Application Support', n) for n in ('hayati.log', 'com.hayati.report')) if os.path.isdir(d)), os.path.join(HOME, 'Library/Application Support/hayati.log'))
MONTHS = {m: i + 1 for i, m in enumerate(['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'])}

MIXED_MAP = {'Day Plan': 'plan', 'Day Task': 'plan', 'Future Me & Everyone': 'focus', 'Work Notes': 'notes'}
TEXT_MAP = {'Learn': 'learn', 'Friction': 'friction', 'Divert': 'rest', 'Etc': 'etc', 'Doa': 'doa', 'Tools': 'tools'}
CHECK_MAP = {'AI $': 'ai', 'AI PRO': 'ai', 'Exercise': 'exercise', 'Islamic Read': 'read'}
NEW_FIELDS = [
    {'id': 'etc', 'name': 'Etc', 'type': 'text', 'width': 160, 'icon': 'pin'},
    {'id': 'doa', 'name': 'Doa', 'type': 'text', 'width': 200, 'icon': 'heart'},
    {'id': 'tools', 'name': 'Tools', 'type': 'text', 'width': 140, 'icon': 'code'},
]
TIME_FIXES = {'2026-06-17': {'start': 13 * 60}}


def todo_id():
    return 't-' + ''.join(random.choices(string.ascii_lowercase + string.digits, k=7))


def clean(s):
    lines = [ln.replace('\xa0', ' ').strip() for ln in (s or '').split('\n')]
    return [ln for ln in lines if ln]


def clock(tag):
    m = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(AM|PM)', tag, re.I)
    if not m:
        return None
    return int(m.group(1)) % 12 * 60 + (720 if m.group(3).upper() == 'PM' else 0) + int(m.group(2) or 0)


def start_of(cell):
    tags = [t.strip() for t in cell.split(',') if t.strip()]
    sun = [t for t in tags if '🌒' not in t] or tags
    times = [c for c in map(clock, sun) if c is not None]
    return min(times) if times else None


def end_of(cell, start):
    tags = [t.strip() for t in cell.split(',') if t.strip()]
    night = [t for t in tags if '🌒' in t] or tags
    times = []
    for c in map(clock, night):
        if c is None:
            continue
        times.append(c + 1440 if c < 720 or (start is not None and c <= start) else c)
    return max(times) if times else None


def state_ids(cell, options):
    by_name = {o['name'].lower(): o['id'] for o in options}
    out = []
    for tag in (t.strip() for t in cell.split(',')):
        low = tag.lower()
        if re.search(r'\bd\d+\b', low):
            continue
        if 'dopa' in low and low.startswith(('high', 'low')):
            key = 'high dopa' if low.startswith('high') else 'low dopa'
        elif 'impulsive' in low:
            key = 'impulsive'
        elif 'brainfog' in low:
            key = 'brainfog'
        else:
            continue
        oid = by_name.get(key)
        if oid and oid not in out:
            out.append(oid)
    return out


def cycle_tag(cell):
    m = re.search(r'D(\d+)\s+([A-Za-z]+)', cell)
    return (int(m.group(1)), m.group(2).lower()) if m else None


def read_export(folder):
    csvs = glob.glob(os.path.join(folder, '**', '*_all.csv'), recursive=True)
    if not csvs:
        sys.exit(f'No *_all.csv found in {folder}')
    path = csvs[0]
    m = re.search(r'\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[A-Z]*\s+(\d{4})', os.path.basename(path).upper())
    if not m:
        sys.exit(f'Cannot tell the month from {os.path.basename(path)}')
    year, month = int(m.group(2)), MONTHS[m.group(1)]
    goal = None
    for md in glob.glob(os.path.join(folder, '*.md')):
        with open(md, encoding='utf-8') as fh:
            title = fh.readline().lstrip('#').strip()
        if ' - ' in title:
            goal = title.split(' - ', 1)[1].strip()
    with open(path, encoding='utf-8-sig') as fh:
        rows = list(csv.DictReader(fh))
    return year, month, goal, rows


def parse_date(text, year):
    return dt.datetime.strptime(f'{text.strip()} {year}', '%b %d %Y').date()


def main():
    args = sys.argv[1:]
    dry = '--dry-run' in args
    force = '--force' in args
    out = os.path.join(OUT_DIR, 'report.json')
    if '--file' in args:
        out = args[args.index('--file') + 1]
    folders = [a for i, a in enumerate(args) if not a.startswith('--') and (i == 0 or args[i - 1] != '--file')]
    if not folders:
        sys.exit(__doc__)

    with open(out, encoding='utf-8') as fh:
        data = json.load(fh)
    state_field = next((f for f in data['fields'] if f['id'] == 'state'), {'options': []})

    days = {}
    owner = {}
    goals = {}
    cycle_votes = Counter()
    period_days = []
    for folder in folders:
        year, month, goal, rows = read_export(folder)
        mkey = f'{year}-{month:02d}'
        if goal:
            goals[mkey] = goal
        for r in rows:
            if not (r.get('Date') or '').strip():
                continue
            d = parse_date(r['Date'], year)
            iso = d.isoformat()
            home = d.month == month
            cells = {}
            for col, key in MIXED_MAP.items():
                lines = clean(r.get(col))
                if lines:
                    cells[key] = [{'id': todo_id(), 'kind': 'text', 'text': ln} for ln in lines]
            for col, key in TEXT_MAP.items():
                lines = clean(r.get(col))
                if lines:
                    cells[key] = '\n'.join(lines)
            for col, key in CHECK_MAP.items():
                if (r.get(col) or '').strip().lower() == 'yes':
                    cells[key] = True
            start = start_of(r.get('Start') or '')
            start = TIME_FIXES.get(iso, {}).get('start', start)
            end = end_of(r.get('End') or '', start)
            if start is not None:
                cells['start'] = start
            if end is not None:
                cells['end'] = end
            tags = state_ids(r.get('State') or '', state_field['options'])
            if tags:
                cells['state'] = tags
            cyc = cycle_tag(r.get('State') or '')
            if cyc:
                cycle_votes[(d - dt.timedelta(days=cyc[0] - 1)).isoformat()] += 1
                if cyc[1].startswith('period'):
                    period_days.append(iso)
            if iso not in days or (home and not owner[iso]):
                base = days.get(iso, {})
                days[iso] = {**base, **cells}
                owner[iso] = home
            else:
                for k, v in cells.items():
                    days[iso].setdefault(k, v)

    starts = []
    for s in sorted(cycle_votes):
        if starts and (dt.date.fromisoformat(s) - dt.date.fromisoformat(starts[-1])).days < 5:
            if cycle_votes[s] > cycle_votes[starts[-1]]:
                starts[-1] = s
        elif cycle_votes[s] >= 2:
            starts.append(s)
    settings = data.setdefault('settings', {})
    have = settings.get('cycleStarts', [])
    new_starts = [s for s in starts if all(abs((dt.date.fromisoformat(s) - dt.date.fromisoformat(h)).days) >= 15 for h in have)]
    ends = list(settings.get('periodEnds', []))
    new_ends = []
    for s in starts:
        sd = dt.date.fromisoformat(s)
        mine = [p for p in period_days if 0 <= (dt.date.fromisoformat(p) - sd).days < 15]
        if mine and not any(0 <= (dt.date.fromisoformat(e) - sd).days < 15 for e in ends):
            new_ends.append(max(mine))

    existing = {r['date']: r for r in data['rows']}
    clash = sorted(d for d in days if d in existing and (existing[d].get('cells') or existing[d].get('blocks')))
    print(f'Data file: {out}')
    print(f'Days: {len(days)}  by month: {dict(sorted(Counter(d[:7] for d in days).items()))}')
    print(f'Month goals: {goals}')
    print(f'Cycle starts found: {starts}  new: {new_starts}  new period ends: {new_ends}')
    print(f'State tags used: {dict(Counter(t for c in days.values() for t in c.get("state", [])))}')
    print(f'Check-boxes ticked: {dict(Counter(k for c in days.values() for k in ("ai", "exercise", "read") if c.get(k)))}')
    print(f'Days with start/end: {sum(1 for c in days.values() if "start" in c)}/{sum(1 for c in days.values() if "end" in c)}')
    if clash:
        print(f'Already logged in the app: {clash}')
        if not force:
            sys.exit('Stopping. Re-run with --force to overwrite those days.')
    if dry:
        for iso in sorted(days)[:2]:
            print(iso, json.dumps(days[iso], ensure_ascii=False)[:600])
        return

    keep = [r for r in data['rows'] if r['date'] not in days]
    for iso, cells in days.items():
        keep.append({'id': f'r-{iso}', 'date': iso, 'cells': cells, 'notes': '', 'blocks': []})
    data['rows'] = sorted(keep, key=lambda r: r['date'])
    known = {f['id'] for f in data['fields']}
    at = next((i + 1 for i, f in enumerate(data['fields']) if f['id'] == 'rest'), len(data['fields']))
    for f in reversed(NEW_FIELDS):
        if f['id'] not in known:
            data['fields'].insert(at, dict(f))
    data.setdefault('monthGoals', {})
    for k, v in goals.items():
        data['monthGoals'].setdefault(k, v)
    settings['cycleStarts'] = sorted(have + new_starts)
    settings['periodEnds'] = sorted(ends + new_ends)

    backups = os.path.join(os.path.dirname(out), 'backups')
    os.makedirs(backups, exist_ok=True)
    shutil.copy(out, os.path.join(backups, f'before-notion-import-{dt.datetime.now():%Y%m%d-%H%M%S}.json'))
    with open(out + '.tmp', 'w', encoding='utf-8') as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    os.replace(out + '.tmp', out)
    print(f'Wrote {out}')


if __name__ == '__main__':
    main()
