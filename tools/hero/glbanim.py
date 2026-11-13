# Read / sample / forward-kinematics / patch the animations of a .glb in plain numpy (no Blender: glTF node space as is).
import json, struct, numpy as np

def load(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    g = json.loads(b[20:20 + n]); o = 20 + n; bl = struct.unpack('<I', b[o:o + 4])[0]
    return g, bytearray(b[o + 8:o + 8 + bl])

def save(path, g, binb):
    while len(binb) % 4: binb += b'\0'
    g['buffers'][0]['byteLength'] = len(binb)
    j = json.dumps(g, separators=(',', ':')).encode()
    j += b' ' * (-len(j) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(binb)) + struct.pack('<II', len(j), 0x4E4F534A) + j \
        + struct.pack('<II', len(binb), 0x004E4942) + bytes(binb)
    open(path, 'wb').write(out)

NC = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def acc(g, binb, i):
    a = g['accessors'][i]; v = g['bufferViews'][a['bufferView']]
    assert a['componentType'] == 5126 and 'byteStride' not in v, a
    o = v.get('byteOffset', 0) + a.get('byteOffset', 0); k = NC[a['type']]
    return np.frombuffer(bytes(binb[o:o + 4 * k * a['count']]), '<f4').reshape(a['count'], k).astype(float)

def add_acc(g, binb, arr, typ):
    """Append float data as a new bufferView + accessor; returns the accessor index."""
    arr = np.asarray(arr, '<f4').reshape(len(arr), -1)
    while len(binb) % 4: binb += b'\0'
    g['bufferViews'].append({'buffer': 0, 'byteOffset': len(binb), 'byteLength': arr.nbytes})
    binb += arr.tobytes()
    a = {'bufferView': len(g['bufferViews']) - 1, 'componentType': 5126, 'count': len(arr), 'type': typ}
    if typ == 'SCALAR': a['min'], a['max'] = [float(arr.min())], [float(arr.max())]
    g['accessors'].append(a); return len(g['accessors']) - 1

# --- quaternions (x, y, z, w) ---
def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(a, -1, 0); bx, by, bz, bw = np.moveaxis(b, -1, 0)
    return np.stack([aw*bx + ax*bw + ay*bz - az*by, aw*by - ax*bz + ay*bw + az*bx,
                     aw*bz + ax*by - ay*bx + az*bw, aw*bw - ax*bx - ay*by - az*bz], -1)
def qinv(q): return q * np.array([-1, -1, -1, 1.0])
def qaxis(axis, ang):
    axis = np.asarray(axis, float); axis = axis / np.linalg.norm(axis)
    return np.concatenate([axis * np.sin(ang / 2), [np.cos(ang / 2)]])
def qrot(q, v):  # rotate vectors v by q
    u = q[..., :3]; w = q[..., 3:]
    t = 2 * np.cross(u, v); return v + w * t + np.cross(u, t)
def qbetween(a, b):  # shortest arc a -> b
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); c = np.cross(a, b); d = np.dot(a, b)
    q = np.concatenate([c, [1 + d]]); return q / np.linalg.norm(q)
def slerp(q0, q1, t):
    d = np.sum(q0 * q1, -1, keepdims=True); q1 = np.where(d < 0, -q1, q1); d = np.abs(d)
    lin = d > 0.9995; th = np.arccos(np.clip(d, -1, 1)); s = np.sin(th) + 1e-12
    r = np.where(lin, q0 + t * (q1 - q0), (np.sin((1 - t) * th) * q0 + np.sin(t * th) * q1) / s)
    return r / np.linalg.norm(r, axis=-1, keepdims=True)

class Rig:
    def __init__(self, g):
        self.g = g; self.names = [n['name'] for n in g['nodes']]; self.idx = {n: i for i, n in enumerate(self.names)}
        self.parent = {c: i for i, n in enumerate(g['nodes']) for c in n.get('children', [])}
        self.rest = [{'translation': np.array(n.get('translation', [0, 0, 0]), float),
                      'rotation': np.array(n.get('rotation', [0, 0, 0, 1]), float),
                      'scale': np.array(n.get('scale', [1, 1, 1]), float)} for n in g['nodes']]
        order, seen = [], set()
        def visit(i):
            if i in seen: return
            if i in self.parent: visit(self.parent[i])
            seen.add(i); order.append(i)
        for i in range(len(self.names)): visit(i)
        self.order = order

    def sample(self, binb, anim, times):
        """local TRS per node for each time: dict path -> array [nodes, T, k]"""
        T = len(times); out = {p: np.repeat(np.stack([r[p] for r in self.rest])[:, None], T, 1) for p in ('translation', 'rotation', 'scale')}
        for ch in anim['channels']:
            s = anim['samplers'][ch['sampler']]; t = acc(self.g, binb, s['input'])[:, 0]; v = acc(self.g, binb, s['output'])
            p = ch['target']['path']; i = ch['target']['node']
            k = np.clip(np.searchsorted(t, times, 'right') - 1, 0, len(t) - 1); k1 = np.minimum(k + 1, len(t) - 1)
            f = np.where(k1 > k, (times - t[k]) / np.maximum(t[k1] - t[k], 1e-9), 0)[:, None]
            if s['interpolation'] == 'STEP': f = f * 0
            out[p][i] = slerp(v[k], v[k1], f) if p == 'rotation' else v[k] + f * (v[k1] - v[k])
        return out

    def fk(self, L):
        """world rotation q [nodes,T,4] and position p [nodes,T,3] (scale ignored: the rig is unit scale)"""
        N, T = L['rotation'].shape[:2]; Q = np.zeros((N, T, 4)); P = np.zeros((N, T, 3))
        for i in self.order:
            if i in self.parent:
                j = self.parent[i]; Q[i] = qmul(Q[j], L['rotation'][i]); P[i] = P[j] + qrot(Q[j], L['translation'][i])
            else: Q[i] = L['rotation'][i]; P[i] = L['translation'][i]
        return Q, P

def strike(sole, u):
    """When a foot lands, from its sole height per frame over one cycle (u in [0,1)): the first frame of the longest stretch
    near the ground (within 1.5 cm of its stance level). A swing that dips close to the ground mid-air (the Drifter's toe
    clears by 1 cm) is a short stretch, not the landing."""
    low = sole < np.percentile(sole, 10) + 0.015; n = len(sole)
    if low.all() or not low.any(): raise ValueError('foot never lands')
    k = int(np.argmin(low)); best, start, run = 0, 0, 0                          # walk round the loop from a frame in the air
    for j in range(1, n + 1):
        i = (k + j) % n; run = run + 1 if low[i] else 0
        if run > best: best, start = run, (i - run + 1) % n
    return u[start]
