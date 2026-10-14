"""Import AppFlowy daily-log databases into Hayati Log.

Usage: python3 -I scripts/import-appflowy.py [--dry-run] [--force] [--db PATH]
Reads AppFlowy's local SQLite cache read-only. Never writes to AppFlowy.
"""
import datetime as dt
import glob
import json
import os
import re
import shutil
import sqlite3
import sys
from collections import Counter, defaultdict

HOME = os.path.expanduser('~')
APPFLOWY = os.path.join(HOME, 'Library/Application Support/com.appflowy.appflowy.flutter')
OUT_DIR = os.path.join(HOME, 'Library/Application Support/com.hayati.report')
OUT = os.path.join(OUT_DIR, 'report.json')
BOUNDARY = 9

DAILY_MAP = {
    'Day Plan': 'plan', 'Pending': 'pending', 'Work Focus': 'focus', 'Work Done': 'done',
    'Work Notes': 'notes', 'Learn': 'learn', 'Friction': 'friction', 'Divert / Rest': 'rest',
}
CHECK_MAP = {'AI': 'ai', 'Exercise': 'exercise', 'Read': 'read'}
APPFLOWY_COLOR = {0: 'pink', 1: 'pink', 2: 'blue', 3: 'orange', 4: 'cyan', 5: 'green', 6: 'green', 7: 'cyan', 8: 'red', 9: 'gray'}
STATE_COLOR = {'High Dopa': 'green', 'Mid Dopa': 'cyan', 'Low Dopa': 'blue', 'Brainfog': 'gray', 'Impulsive': 'orange'}


def varint(b, i):
    r = s = 0
    while True:
        c = b[i]
        i += 1
        r |= (c & 0x7F) << s
        s += 7
        if c < 0x80:
            return r, i


def dec(b, depth=0):
    i = 0
    out = []
    try:
        while i < len(b):
            k, i = varint(b, i)
            f, w = k >> 3, k & 7
            if f == 0:
                return None
            if w == 0:
                v, i = varint(b, i)
                out.append((f, v))
            elif w == 2:
                n, i = varint(b, i)
                raw = b[i:i + n]
                i += n
                sub = dec(raw, depth + 1) if depth < 8 and n > 0 else None
                try:
                    s = raw.decode()
                except UnicodeDecodeError:
                    s = None
                if s is not None and (sub is None or all(c.isprintable() for c in s)):
                    out.append((f, s))
                elif sub is not None:
                    out.append((f, sub))
                else:
                    out.append((f, raw.hex()))
            elif w == 1:
                i += 8
            elif w == 5:
                i += 4
            else:
                return None
        return out
    except (IndexError, ValueError):
        return None


def g(lst, k):
    return [v for f, v in lst if f == k]


def find_db(arg):
    if arg:
        return arg
    cands = glob.glob(os.path.join(APPFLOWY, 'data*', '*', 'flowy-database.db'))
    if not cands:
        sys.exit('AppFlowy database not found')
    return max(cands, key=os.path.getsize)


def load(path):
    con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
    schemas = {}
    for did, val in con.execute('select database_id, value from db_view_schema_cache'):
        d = dec(val) or []
        fields = {}
        for f in g(d, 6):
            fid = (g(f, 1) or [''])[0]
            opts = {}
            for o in g(f, 6):
                if isinstance(o, list):
                    for oo in g(o, 1):
                        if isinstance(oo, list):
                            opts[(g(oo, 1) or [''])[0]] = {'name': (g(oo, 2) or [''])[0], 'color': (g(oo, 3) or [0])[0]}
            fields[fid] = {'name': (g(f, 2) or [''])[0], 'type': (g(f, 4) or [0])[0], 'options': opts}
        schemas.setdefault(did, {}).update(fields)
    cells = defaultdict(lambda: defaultdict(dict))
    for did, fid, rid, ft, t, n, b, ts, j, up in con.execute(
            'select database_id, field_id, row_id, field_type, value_text, value_number, value_bool, value_timestamp, value_json, updated_at from db_database_cell_index'):
        cells[did][rid][fid] = {'type': ft, 'text': t, 'num': n, 'bool': b, 'ts': ts, 'up': up or 0}
    return schemas, cells


def field_registry(schemas):
    reg = {}
    for fields in schemas.values():
        for fid, f in fields.items():
            if fid not in reg:
                reg[fid] = {**f, 'options': dict(f['options'])}
            else:
                reg[fid]['options'].update(f['options'])
    return reg


def opt_names(reg, fid, text):
    f = reg.get(fid)
    if not text:
        return []
    ids = [x for x in text.split(',') if x]
    return [f['options'][i]['name'] if f and i in f['options'] else i for i in ids]


def clock(name):
    m = re.search(r'(\d{1,2})(?::(\d{2}))?\s*(AM|PM)', name or '', re.I)
    if not m:
        return None
    h = int(m.group(1)) % 12 + (12 if m.group(3).upper() == 'PM' else 0)
    mins = h * 60 + int(m.group(2) or 0)
    return mins + 1440 if mins < BOUNDARY * 60 else mins


def dur(names):
    total = 0
    found = False
    for n in names:
        for v, u in re.findall(r'(\d+(?:\.\d+)?)\s*([hm])', n.lower()):
            total += float(v) * (60 if u == 'h' else 1)
            found = True
    return round(total) if found else None


def cell_date(c):
    if c.get('ts'):
        return dt.datetime.fromtimestamp(c['ts'])
    if c.get('text'):
        for fmt in ('%b %d, %Y', '%Y-%m-%d', '%Y/%m/%d'):
            try:
                return dt.datetime.strptime(c['text'].strip(), fmt)
            except ValueError:
                pass
    return None


def is_empty_text(c):
    t = c.get('text')
    return t is None or not t.strip()


def main():
    args = sys.argv[1:]
    dry = '--dry-run' in args
    force = '--force' in args
    db_arg = args[args.index('--db') + 1] if '--db' in args else None
    src = find_db(db_arg)
    schemas, cells = load(src)
    reg = field_registry(schemas)
    by_name = lambda did, fid: (schemas.get(did, {}).get(fid) or reg.get(fid) or {}).get('name')

    days = defaultdict(dict)
    stamps = defaultdict(dict)
    cycle_votes = Counter()
    state_opts = {}
    tb_rows = []

    for did, rows in cells.items():
        names = {by_name(did, fid) for r in rows.values() for fid in r}
        if 'Work Focus' in names or 'Day Plan' in names:
            for rid, r in rows.items():
                date_c = next((c for fid, c in r.items() if by_name(did, fid) == 'Date'), None)
                d = cell_date(date_c) if date_c else None
                if not d:
                    continue
                iso = d.date().isoformat()
                for fid, c in r.items():
                    name = by_name(did, fid)
                    up = c['up']
                    def put(key, val):
                        if val in (None, '', []):
                            return
                        if up >= stamps[iso].get(key, -1):
                            days[iso][key] = val
                            stamps[iso][key] = up
                    if name in DAILY_MAP and not is_empty_text(c):
                        put(DAILY_MAP[name], c['text'].rstrip())
                    elif name in CHECK_MAP:
                        if c.get('bool') or (c.get('text') or '').lower() in ('yes', 'true'):
                            put(CHECK_MAP[name], True)
                    elif name in ('Start', 'End'):
                        n = opt_names(reg, fid, c.get('text'))
                        put(name.lower(), clock(n[0]) if n else None)
                    elif name == 'State':
                        tags = []
                        for n in opt_names(reg, fid, c.get('text')):
                            m = re.search(r'D(\d+)', n)
                            if m and re.search(r'Period|Prolif|Ovu|Luteal|Late', n):
                                cycle_votes[(d.date() - dt.timedelta(days=int(m.group(1)) - 1)).isoformat()] += 1
                            else:
                                oid = re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')
                                color = STATE_COLOR.get(n)
                                if not color:
                                    raw = next((o['color'] for o in reg.get(fid, {}).get('options', {}).values() if o['name'] == n), 9)
                                    color = APPFLOWY_COLOR.get(raw, 'gray')
                                state_opts[oid] = {'id': oid, 'name': n, 'color': color}
                                tags.append(oid)
                        put('state', tags)
        elif 'Type' in names and ({'Intent', 'Intent Time', 'Actual', 'Actual Time'} & names):
            for rid, r in rows.items():
                rec = {}
                for fid, c in r.items():
                    name = by_name(did, fid)
                    if name == 'Date':
                        rec['dt'] = cell_date(c)
                    elif name == 'Type':
                        rec['types'] = opt_names(reg, fid, c.get('text'))
                    elif name in ('Activity / Reason', 'Activity') and not is_empty_text(c):
                        rec['text'] = c['text'].rstrip()
                    elif name in ('Intent', 'Intent Time'):
                        rec['plan'] = dur(opt_names(reg, fid, c.get('text')) or [c.get('text') or ''])
                    elif name in ('Actual', 'Actual Time'):
                        rec['actual'] = dur(opt_names(reg, fid, c.get('text')) or [c.get('text') or ''])
                if rec.get('dt') and (rec.get('types') or rec.get('text')):
                    tb_rows.append(rec)

    starts = sorted(s for s, n in cycle_votes.items() if n >= 2)
    merged = []
    for s in starts:
        if merged and (dt.date.fromisoformat(s) - dt.date.fromisoformat(merged[-1])).days < 5:
            if cycle_votes[s] > cycle_votes[merged[-1]]:
                merged[-1] = s
        else:
            merged.append(s)

    cats = [
        ('work', '🖥️', 'Work', 'work'), ('meetings', '💬', 'Meetings', 'work'), ('email', '📧', 'Email', 'work'),
        ('learning', '📚', 'Learning', 'work'), ('meals', '🍽️', 'Meals', 'self'), ('exercise', '🏃', 'Exercise', 'self'),
        ('selfcare', '🧴', 'Self-care', 'self'), ('chores', '🏠', 'Chores', 'home'), ('errands', '🛒', 'Errands', 'home'),
        ('break', '☕', 'Break', 'rest'), ('entertainment', '🍿', 'Entertainment', 'rest'), ('sleep', '🛏️', 'Sleep', 'rest'),
        ('social', '👥', 'Social', 'out'), ('travel', '🚗', 'Travel', 'out'),
    ]
    categories = [{'id': c[0], 'emoji': c[1], 'name': c[2], 'group': c[3]} for c in cats]
    cat_by_key = {re.sub(r'[^a-z]', '', c['name'].lower()): c['id'] for c in categories}
    cat_by_key.setdefault('computer', 'work')

    def cat_ids(types):
        ids = []
        for t in types:
            key = re.sub(r'[^a-z]', '', t.lower())
            cid = cat_by_key.get(key)
            if not cid:
                cid = key or 'other'
                categories.append({'id': cid, 'emoji': '•', 'name': re.sub(r'^[^\w]+', '', t).strip() or t, 'group': 'work'})
                cat_by_key[key] = cid
            if cid not in ids:
                ids.append(cid)
        if len(ids) > 1 and 'work' in ids:
            ids.remove('work')
        return ids

    blocks_by_day = defaultdict(list)
    seen = set()
    for rec in sorted(tb_rows, key=lambda r: r['dt']):
        logical = (rec['dt'] - dt.timedelta(hours=BOUNDARY)).date()
        start = int((rec['dt'] - dt.datetime.combine(logical, dt.time())).total_seconds() // 60)
        key = (logical, start, rec.get('text'))
        if key in seen:
            continue
        seen.add(key)
        blocks_by_day[logical.isoformat()].append({
            'start': start, 'cats': cat_ids(rec.get('types', [])), 'text': rec.get('text', ''),
            'plan': rec.get('plan'), 'actual': rec.get('actual'),
        })
    for iso, bs in blocks_by_day.items():
        bs.sort(key=lambda b: b['start'])
        for i, b in enumerate(bs):
            nxt = bs[i + 1]['start'] if i + 1 < len(bs) else None
            if b.get('actual'):
                b['end'] = b['start'] + b['actual'] if nxt is None else min(b['start'] + b['actual'], max(nxt, b['start']))
            elif nxt is not None and nxt - b['start'] <= 180:
                b['end'] = nxt
            else:
                b['end'] = None
            b['id'] = f"b-{iso.replace('-', '')}-{i}"
            b.pop('actual', None)
        days.setdefault(iso, {})

    for cells_ in days.values():
        if cells_.get('end') is not None and cells_.get('start') is not None and cells_['end'] <= cells_['start']:
            cells_['end'] += 1440

    state_field = {
        'id': 'state', 'name': 'State', 'type': 'multi', 'width': 150,
        'options': [state_opts[k] for k in sorted(state_opts, key=lambda k: list(STATE_COLOR).index(state_opts[k]['name']) if state_opts[k]['name'] in STATE_COLOR else 99)],
    }
    rows = []
    for iso in sorted(days):
        cells_out = dict(days[iso])
        rows.append({'id': f'r-{iso}', 'date': iso, 'cells': cells_out, 'notes': '', 'blocks': blocks_by_day.get(iso, [])})

    months = Counter(r['date'][:7] for r in rows)
    print(f'Source: {src}')
    print(f'Days: {len(rows)}  by month: {dict(sorted(months.items()))}')
    print(f'Time blocks: {sum(len(r["blocks"]) for r in rows)} across {sum(1 for r in rows if r["blocks"])} days')
    print(f'Cycle starts: {merged}')
    print(f'State tags: {[o["name"] for o in state_field["options"]]}')
    if dry:
        return

    out = {'version': 1, 'importedFrom': 'appflowy', 'importedAt': dt.datetime.now().isoformat(timespec='seconds'),
           'settings': {'dayStartsAt': BOUNDARY, 'cycleStarts': merged, 'wrap': True},
           'categories': categories, 'rows': rows, '_stateField': state_field}
    if os.path.exists(OUT):
        if not force:
            sys.exit(f'{OUT} already exists. Re-run with --force to replace it (a copy is kept in backups/).')
        os.makedirs(os.path.join(OUT_DIR, 'backups'), exist_ok=True)
        shutil.copy(OUT, os.path.join(OUT_DIR, 'backups', f'before-import-{dt.datetime.now():%Y%m%d-%H%M%S}.json'))
    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT + '.tmp', 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
    os.replace(OUT + '.tmp', OUT)
    print(f'Wrote {OUT}')


if __name__ == '__main__':
    main()
