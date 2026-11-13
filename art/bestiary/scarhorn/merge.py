"""Append the clips of a skeleton-only glb (charge.py) to the rigged glb, joined by bone name, times from 0. Nothing that
was in the rigged glb changes: its JSON entries and BIN bytes are kept and the new clip's data goes after them. A clip
of the same name that an earlier run appended (always last) is cut off first, so reruns do not pile up.
  python3 merge.py full.glb clip.glb out.glb"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../../tools/hero'))
from glbanim import load, save, acc, add_acc

g, b = load(sys.argv[1]); c, cb = load(sys.argv[2])
idx = {n['name']: i for i, n in enumerate(g['nodes'])}
for a in c['animations']:
    old = [x for x in g['animations'] if x['name'] == a['name']]
    if old:
        acs = {i for s in old[0]['samplers'] for i in (s['input'], s['output'])}; k = min(acs)
        v = min(g['accessors'][i]['bufferView'] for i in acs)
        assert g['animations'][-1] is old[0] and acs == set(range(k, len(g['accessors']))), f"{a['name']} was not appended last"
        assert all(x['bufferView'] < v for x in g['accessors'][:k] + g.get('images', []) if 'bufferView' in x)
        del b[g['bufferViews'][v]['byteOffset']:]; del g['bufferViews'][v:]; del g['accessors'][k:]; g['animations'].pop()
        print(f"MERGE cut the earlier {a['name']} ({len(acs)} accessors)")
    t0 = min(acc(c, cb, s['input'])[0, 0] for s in a['samplers'])
    memo = {}  # the exporter shares one time accessor between samplers; keep it shared

    def copy(i, shift=0.0):
        if (i, shift) not in memo:
            memo[i, shift] = add_acc(g, b, acc(c, cb, i) - shift, c['accessors'][i]['type'])
        return memo[i, shift]
    smp = [{'input': copy(s['input'], t0), 'output': copy(s['output']), 'interpolation': s.get('interpolation', 'LINEAR')}
           for s in a['samplers']]
    ch = [{'sampler': x['sampler'], 'target': {'node': idx[c['nodes'][x['target']['node']]['name']], 'path': x['target']['path']}}
          for x in a['channels']]
    g['animations'].append({'name': a['name'], 'channels': ch, 'samplers': smp})
    print(f"MERGE {a['name']}: {len(ch)} channels, {len(memo)} accessors")
save(sys.argv[3], g, b)
