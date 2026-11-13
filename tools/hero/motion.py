# The hero's Idle, Walk and Run/Sprint rebuilt from the numbers in art/hero/motion/RESEARCH.md (Eddie: arms that hang
# naturally, a sprinter's run). Every other clip, the skin and the spring bones stay as they are.
#   python3 tools/hero/motion.py <retargeted hero.glb (build.sh)> <out.glb>
# Angles are degrees, relative to the T-pose rest (glTF: +Y up, he faces +Z, his left is +X).
import sys, numpy as np
from glbanim import load, save, add_acc, Rig, qmul, qinv, qrot, qbetween

g, B = load(sys.argv[1]); R = Rig(g); I = R.idx; N = len(R.names)
assert 'motion' not in g['asset'].get('extras', {}), 'this file already has the new motion: feed motion.py the retarget output'
L0 = {p: np.stack([r[p] for r in R.rest])[:, None] for p in ('translation', 'rotation', 'scale')}
RQ, RP = (a[:, 0] for a in R.fk(L0))
X, Y, Z = np.eye(3)
rad = np.radians
anim = lambda name: next(a for a in g['animations'] if a['name'] == name)
dur = lambda a: max(g['accessors'][s['input']]['max'][0] for s in a['samplers'])
grid = lambda T, fps=30: np.linspace(0, T, int(round(T * fps)) + 1)

def qa(axis, ang):  # rotation about a fixed axis by per-frame angles (radians) -> [T, 4]
    ang = np.asarray(ang, float)[..., None]
    return np.concatenate([np.asarray(axis, float) * np.sin(ang / 2), np.cos(ang / 2)], -1)

def solve(L, W):
    """World rotations W {bone: [T,4]} -> local rotations written into L; returns world rotations and positions."""
    T = L['rotation'].shape[1]; Q = np.zeros((N, T, 4)); P = np.zeros((N, T, 3))
    for i in R.order:
        j = R.parent.get(i)
        Qj, Pj = (Q[j], P[j]) if j is not None else (np.array([0, 0, 0, 1.0]), 0)
        P[i] = Pj + qrot(Qj, L['translation'][i])
        w = W.get(R.names[i])
        if w is None: Q[i] = qmul(Qj, L['rotation'][i])
        else: Q[i] = w; L['rotation'][i] = qmul(qinv(Qj), w)
    return Q, P

def torso_delta(Q, bone='upperChest'): return qmul(Q[I[bone]], qinv(RQ[I[bone]]))

def arm(D, s, th, al, ph, inw=0.0, curl=(22, 28, 18)):
    """One arm, relative to the torso's turn D [T,4]: th shoulder flexion (+ forward), al abduction, ph elbow flexion,
    inw forward swing turned in toward the midline; the palm faces the thigh; fingers in a loose curl. s = +1 left, -1 right."""
    n = lambda b: ('left' if s > 0 else 'right') + b
    T = len(D); al = np.broadcast_to(rad(al), (T,))
    up = RP[I[n('LowerArm')]] - RP[I[n('UpperArm')]]
    down = np.stack([qbetween(up, np.array([s * np.sin(a), -np.cos(a), 0])) for a in al])  # T-pose arm brought down to the side
    A = qmul(D, qmul(qa(Y, -s * rad(inw) * np.ones(T)), qmul(qa(X, -rad(th) * np.ones(T)), down)))
    E = qmul(A, qa(Y, -s * rad(ph) * np.ones(T)))  # elbow hinge (vertical in the T-pose: the hand comes forward)
    W = {n('Shoulder'): qmul(D, RQ[I[n('Shoulder')]]), n('UpperArm'): qmul(A, RQ[I[n('UpperArm')]]),
         n('LowerArm'): qmul(E, RQ[I[n('LowerArm')]]), n('Hand'): qmul(E, RQ[I[n('Hand')]])}
    for f in ('Index', 'Middle', 'Ring', 'Little'):
        c = 0
        for k, j in enumerate(('Proximal', 'Intermediate', 'Distal')):
            c += curl[k]; W[n(f + j)] = qmul(qmul(E, qa(Z, -s * rad(c) * np.ones(T))), RQ[I[n(f + j)]])
    for j in ('Proximal', 'Intermediate', 'Distal'): W[n('Thumb' + j)] = qmul(E, RQ[I[n('Thumb' + j)]])
    return W

def write(name, t, L):
    a = anim(name); ti = add_acc(g, B, t, 'SCALAR'); a['samplers'] = []
    for ch in a['channels']:
        i, p = ch['target']['node'], ch['target']['path']; v = L[p][i].copy()
        if p == 'rotation':
            for k in range(1, len(v)):
                if np.dot(v[k], v[k - 1]) < 0: v[k] = -v[k]
        ch['sampler'] = len(a['samplers'])
        a['samplers'].append({'input': ti, 'output': add_acc(g, B, v, 'VEC4' if p == 'rotation' else 'VEC3'), 'interpolation': 'LINEAR'})

def idle():
    a = anim('Idle'); T = dur(a); t = grid(T); L = R.sample(B, a, t); Q, _ = solve(L, {})
    D = torso_delta(Q); w = 2 * np.pi * t / T; W = {}
    for s in (1, -1):  # arms hang at the sides, hands by the outer thigh; breathing sways them a little
        W |= arm(D, s, th=2 + 1.5 * np.sin(w + (s < 0) * 0.7), al=9 + np.cos(w), ph=14 + 2 * np.sin(w))
    solve(L, W); return t, L

def walk():
    a = anim('Walk'); T = dur(a); t = grid(T); L = R.sample(B, a, t); Q, P = solve(L, {})
    u = t / T; rf = P[I['rightFoot'], :, 2] - P[I['hips'], :, 2]
    peak = np.angle(np.sum(rf * np.exp(-2j * np.pi * u))) / (2 * np.pi)  # the right foot is furthest forward here
    D = torso_delta(Q); W = {}
    for s in (1, -1):  # each arm swings with the opposite leg, a touch after its heel strike
        c = np.cos(2 * np.pi * (u - peak - 0.03 - (s < 0) * 0.5))
        W |= arm(D, s, th=1.5 + 16.5 * c, al=8, ph=24 + 8 * c)
    solve(L, W); return t, L

write('Idle', *idle())
write('Walk', *walk())
g['asset']['extras'] = {**g['asset'].get('extras', {}), 'motion': 'tools/hero/motion.py'}
save(sys.argv[2], g, B)
print('MOTION wrote', sys.argv[2], 'animations', len(g['animations']))
