# Measure the hero's Idle / Walk / Run / Sprint against art/hero/motion/RESEARCH.md, read back from the baked glb.
#   python3 tools/hero/motion_check.py public/models/hero.glb      -> one line per clip and side, exit 1 if any is out of range
# Angles in degrees. Shoulder = upper arm's sagittal angle to the trunk (hips -> neck), + forward. Elbow = included angle
# (180 straight). Chin = the rig's chin joint (head). Hip = that side's hip joint. Gap = skinned hand to body, metres.
# Arm-leg timing: the arm's most-forward instant minus the opposite foot's strike, as a fraction of the cycle (RESEARCH: the
# forward arm peaks as the opposite foot strikes; within 0.1 of a cycle passes), and the swing is opposite: in step with the
# other side's thigh (correlation > 0) and against its own (< 0).
import sys, numpy as np
from glbanim import load, acc, Rig, qrot, strike as landing

g, B = load(sys.argv[1]); R = Rig(g); I = R.idx
anim = lambda name: next(a for a in g['animations'] if a['name'] == name)
bad = 0
def ok(name, val, lo, hi):
    global bad; good = lo <= val <= hi; bad += not good
    return f'{name} {val:.2f} [{lo},{hi}]{"" if good else " OUT"}'

def sample(name, n=240):
    a = anim(name); T = max(g['accessors'][s['input']]['max'][0] for s in a['samplers'])
    t = np.linspace(0, T, n, endpoint=False); return t, T, R.fk(R.sample(B, a, t))

def ang(v, up, fwd):  # sagittal angle of v from "down" toward "forward"
    return np.degrees(np.arctan2(np.sum(v * fwd, -1), -np.sum(v * up, -1)))

def frame(P):
    up = P[I['neck']] - P[I['hips']]; up /= np.linalg.norm(up, axis=-1, keepdims=True)
    fwd = np.array([0, 0, 1.0]) - up[:, 2:3] * up; fwd /= np.linalg.norm(fwd, axis=-1, keepdims=True)
    return up, fwd

def arm_stats(P, side):
    n = lambda b: side + b; up, fwd = frame(P)
    S, E, W = P[I[n('UpperArm')]], P[I[n('LowerArm')]], P[I[n('Hand')]]
    sh = ang(E - S, up, fwd)
    a, b = S - E, W - E
    el = np.degrees(np.arccos(np.sum(a * b, -1) / np.linalg.norm(a, axis=-1) / np.linalg.norm(b, axis=-1)))
    thigh = ang(P[I[n('LowerLeg')]] - P[I[n('UpperLeg')]], np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))
    return sh, el, thigh, S, W

# skinned vertices, for the idle hand-to-thigh gap
prim = g['meshes'][0]['primitives'][0]['attributes']
V = acc(g, B, prim['POSITION']); Wt = acc(g, B, prim['WEIGHTS_0'])
ja = g['accessors'][prim['JOINTS_0']]; jv = g['bufferViews'][ja['bufferView']]; o = jv.get('byteOffset', 0) + ja.get('byteOffset', 0)
J = np.frombuffer(bytes(B[o:o + 4 * ja['count']]), np.uint8).reshape(-1, 4)
skin = g['skins'][0]; joints = skin['joints']; IBM = acc(g, B, skin['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
jname = [R.names[j] for j in joints]
def skinned(Q, P, k):
    M = np.zeros((len(joints), 4, 4))
    for a, j in enumerate(joints):
        x, y, z, w = Q[j, k]
        M[a, :3, :3] = [[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]]
        M[a, :3, 3] = P[j, k]; M[a, 3, 3] = 1
    S = M @ IBM; Vh = np.concatenate([V, np.ones((len(V), 1))], 1)
    return np.einsum('vk,vkij,vj->vi', Wt, S[J], Vh)[:, :3]
def owner(pred): return np.array([sum(w for j, w in zip(js, ws) if pred(jname[j])) for js, ws in zip(J, Wt)]) > 0.5
hand_v = owner(lambda s: 'Hand' in s or any(f in s for f in ('Thumb', 'Index', 'Middle', 'Ring', 'Little')))
arm_v = owner(lambda s: 'Arm' in s or 'Shoulder' in s) | hand_v
def gap(X, side):
    h = X[hand_v & (np.sign(X[:, 0]) == (1 if side == 'left' else -1))]; body = X[~arm_v]
    body = body[np.linalg.norm(body[:, None, ::2] - h.mean(0)[None, None, ::2], axis=-1)[:, 0] < 0.4]
    return min(np.min(np.linalg.norm(body[None] - c[:, None], axis=-1)) for c in np.array_split(h, 8))

t, T, (Q, P) = sample('Idle', 60)
for side in ('left', 'right'):
    sh, el, _, S, W = arm_stats(P, side); ua = P[I[side + 'LowerArm']] - S; ua /= np.linalg.norm(ua, axis=-1, keepdims=True)
    vert = np.degrees(np.arccos(-ua[:, 1])); abd = np.degrees(np.arcsin(np.abs(ua[:, 0])))
    th = P[I[side + 'UpperLeg']][:, 1]; kn = P[I[side + 'LowerLeg']][:, 1]
    down = np.mean((th - P[I[side + 'MiddleProximal']][:, 1]) / (th - kn))  # knuckles: 0 at the hip joint, 1 at the knee
    gaps = [gap(skinned(Q, P, k), side) for k in (0, 15, 30, 45)]
    print('IDLE', side, ok('upperArmFromVertical', vert.max(), 0, 10), ok('abduction', abd.min(), 5, 10), ok('abductionMax', abd.max(), 5, 10),
          ok('elbowFlex', 180 - el.min(), 5, 20), ok('elbowFlexMin', 180 - el.max(), 5, 20), ok('handGapMin', min(gaps), 0.005, 0.10),
          f'(info: knuckles {down:.2f} of the way down the thigh)')

for name, rng in (('Walk', dict(fw=(15, 20), bk=(10, 20), tot=(25, 40), elf=(15, 35))), ('Run', None), ('Sprint', None)):
    t, T, (Q, P) = sample(name); u = t / T; up, _ = frame(P)
    for side in ('left', 'right'):
        sh, el, thigh, S, W = arm_stats(P, side)
        other = 'right' if side == 'left' else 'left'
        _, _, thigh_o, _, _ = arm_stats(P, other)
        sole = np.minimum(P[I[other + 'Foot']][:, 1] - 0.105, P[I[other + 'Toes']][:, 1] - 0.009)  # the other foot's lowest point
        strike = landing(sole, u)
        lag = (u[np.argmax(sh)] - strike + 0.5) % 1 - 0.5
        corr = lambda a, b: np.corrcoef(a, b)[0, 1]
        opp = ok('armPeakMinusOppStrike', lag, -0.1, 0.1) + ' ' + ok('corrOppThigh', corr(sh, thigh_o), 0, 1) + ' ' + ok('corrOwnThigh', corr(sh, thigh), -1, 0)
        if rng:
            print(name.upper(), side, ok('fwd', sh.max(), *rng['fw']), ok('back', -sh.min(), *rng['bk']), ok('range', np.ptp(sh), *rng['tot']),
                  ok('elbowFlexMin', 180 - el.max(), *rng['elf']), ok('elbowFlexMax', 180 - el.min(), *rng['elf']), opp)
        else:
            f, b = np.argmax(sh), np.argmin(sh); chin = P[I['head']][f, 1]
            print(name.upper(), side, ok('range', np.ptp(sh), 100, 130), f'(fwd {sh.max():.0f} back {-sh.min():.0f})',
                  ok('elbowFront', el[f], 60, 75), ok('elbowBack', el[b], 100, 120),
                  ok('handFrontMinusChin', W[f, 1] - chin, -0.15, 0.05), ok('handFrontMinusShoulder', W[f, 1] - S[f, 1], 0, 0.2),
                  ok('handBehindHip', P[I[side + 'UpperLeg']][b, 2] - W[b, 2], 0.05, 0.4), opp,
                  ok('handFromMidline', np.abs(P[I[side + 'MiddleProximal']][:, 0] - P[I['hips']][:, 0]).min(), 0.05, 0.3),
                  ok('trunkLean', np.degrees(np.arcsin(up[:, 2].mean())), 5, 10))
print('MOTIONCHECK', 'ok' if not bad else f'{bad} OUT'); sys.exit(1 if bad else 0)
