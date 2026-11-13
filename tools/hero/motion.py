# The hero's Idle, Walk and Run/Sprint rebuilt from the numbers in art/hero/motion/RESEARCH.md (Eddie: arms that hang
# naturally, a sprinter's run). Every other clip, the skin and the spring bones stay as they are.
#   python3 tools/hero/motion.py <retargeted hero.glb (build.sh)> <out.glb>
# Angles are degrees, relative to the T-pose rest (glTF: +Y up, he faces +Z, his left is +X).
import sys, numpy as np
from glbanim import load, save, acc, add_acc, Rig, qmul, qinv, qrot, qbetween, slerp, strike as landing

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

def mat2q(M):  # [T,3,3] rotation matrices -> quaternions (near identity here: the trunk turns < 30°)
    w = np.sqrt(1 + M[:, 0, 0] + M[:, 1, 1] + M[:, 2, 2]) / 2
    return np.stack([(M[:, 2, 1] - M[:, 1, 2]) / (4 * w), (M[:, 0, 2] - M[:, 2, 0]) / (4 * w), (M[:, 1, 0] - M[:, 0, 1]) / (4 * w), w], -1)

def strike(P, u, side):  # when a foot lands: its lowest point (heel or ball) comes back to the ground
    return landing(np.minimum(P[I[side + 'Foot']][:, 1] - RP[I[side + 'Foot']][1], P[I[side + 'Toes']][:, 1] - RP[I[side + 'Toes']][1]), u)

def trunk(Q, P, upright=False):
    """The frame the arm angles are measured in (and motion_check.py reads back): up = hips -> neck (or plumb, for arms that
    just hang), across = the chest's own."""
    up = P[I['neck']] - P[I['hips']] if not upright else np.broadcast_to(Y, P[I['neck']].shape).copy()
    up /= np.linalg.norm(up, axis=-1, keepdims=True)
    lat = qrot(torso_delta(Q), X); lat -= np.sum(lat * up, -1, keepdims=True) * up; lat /= np.linalg.norm(lat, axis=-1, keepdims=True)
    return mat2q(np.stack([lat, up, np.cross(lat, up)], -1))

def arm(Q, P, s, th, al, ph, inw=0.0, curl=(22, 28, 18), upright=False, carry=0.0):
    """One arm, in the trunk's frame: th shoulder flexion (+ forward), al abduction, ph elbow flexion, inw forward swing
    turned in toward the midline, carry the elbow's carrying angle (the forearm angles out from the hip); the palm faces the
    thigh; fingers in a loose curl. s = +1 left, -1 right."""
    n = lambda b: ('left' if s > 0 else 'right') + b
    D, Rt = torso_delta(Q), trunk(Q, P, upright); T = len(D); al = np.broadcast_to(rad(al), (T,))
    up = RP[I[n('LowerArm')]] - RP[I[n('UpperArm')]]
    down = np.stack([qbetween(up, np.array([s * np.sin(a), -np.cos(a), 0])) for a in al])  # T-pose arm brought down to the side
    A = qmul(Rt, qmul(qa(Y, -s * rad(inw) * np.ones(T)), qmul(qa(X, -rad(th) * np.ones(T)), down)))
    straight = qbetween(RP[I[n('Hand')]] - RP[I[n('LowerArm')]], up)        # the T-pose elbow is bent ~6°: start from straight
    E = qmul(A, qmul(qa(Y, -s * rad(ph) * np.ones(T)), qmul(qa(Z, s * rad(carry) * np.ones(T)), straight)))          # elbow hinge (vertical in the T-pose: the hand comes forward)
    W = {n('Shoulder'): qmul(D, RQ[I[n('Shoulder')]]), n('UpperArm'): qmul(A, RQ[I[n('UpperArm')]]),
         n('LowerArm'): qmul(E, RQ[I[n('LowerArm')]]), n('Hand'): qmul(E, RQ[I[n('Hand')]])}
    for f in ('Index', 'Middle', 'Ring', 'Little'):
        c = 0
        for k, j in enumerate(('Proximal', 'Intermediate', 'Distal')):
            c += curl[k]; W[n(f + j)] = qmul(qmul(E, qa(Z, -s * rad(c) * np.ones(T))), RQ[I[n(f + j)]])
    for j in ('Proximal', 'Intermediate', 'Distal'): W[n('Thumb' + j)] = qmul(E, RQ[I[n('Thumb' + j)]])
    return W

def qto(a, b):  # per-frame shortest arc a[T,3] -> b[T,3]
    a = a / np.linalg.norm(a, axis=-1, keepdims=True); b = b / np.linalg.norm(b, axis=-1, keepdims=True)
    q = np.concatenate([np.cross(a, b), 1 + np.sum(a * b, -1, keepdims=True)], -1)
    return q / np.linalg.norm(q, axis=-1, keepdims=True)

l1 = np.linalg.norm(R.rest[I['leftLowerLeg']]['translation']); l2 = np.linalg.norm(R.rest[I['leftFoot']]['translation'])  # thigh, shin

def leg(side, H, A, pole):
    """Thigh and shin world rotations putting the ankle on A from the hip H, the knee bent toward pole (two-bone IK)."""
    d = A - H; dist = np.linalg.norm(d, axis=-1, keepdims=True); dn = d / dist
    assert dist.max() < l1 + l2, f'{side} leg overstretched {dist.max():.3f}'
    w = pole - np.sum(pole * dn, -1, keepdims=True) * dn; w /= np.linalg.norm(w, axis=-1, keepdims=True)
    ca = (l1**2 + dist**2 - l2**2) / (2 * l1 * dist); K = H + l1 * (ca * dn + np.sqrt(1 - ca**2) * w)
    up, lo, ft = (I[side + b] for b in ('UpperLeg', 'LowerLeg', 'Foot'))
    return K, {side + 'UpperLeg': qmul(qto(RP[lo] - RP[up], K - H), RQ[up]), side + 'LowerLeg': qmul(qto(RP[ft] - RP[lo], A - K), RQ[lo])}

def write(name, t, L):
    a = anim(name); ti = add_acc(g, B, t, 'SCALAR'); a['samplers'] = []
    for ch in a['channels']:
        i, p = ch['target']['node'], ch['target']['path']; v = L[p][i].copy()
        if p == 'rotation':
            for k in range(1, len(v)):
                if np.dot(v[k], v[k - 1]) < 0: v[k] = -v[k]
        ch['sampler'] = len(a['samplers'])
        a['samplers'].append({'input': ti, 'output': add_acc(g, B, v, 'VEC4' if p == 'rotation' else 'VEC3'), 'interpolation': 'LINEAR'})

def flat_feet():
    """The Drifter's own clips hold each foot ~14° toes-up against its rest (its Idle does too: the clip data, not the
    retarget), so he stands on his heels and leans back. Turn each foot down by its mean tilt in the Idle, in every clip but
    the Walk: its stance is laid flat by plant() and its swing keeps the lift that clears the toes."""
    a = anim('Idle'); Q, _ = solve(R.sample(B, a, grid(dur(a))), {})
    for sd in ('left', 'right'):
        f = I[sd + 'Foot']; fz = qrot(qmul(Q[f], qinv(RQ[f])), Z)
        tilt = np.mean(np.arctan2(-fz[:, 1], np.hypot(fz[:, 0], fz[:, 2])))     # < 0: toes up
        C = qmul(qinv(RQ[f]), qmul(qa(X, -tilt), RQ[f]))                         # that turn, in the foot's own frame
        for an in g['animations']:
            for ch in an['channels'] if an['name'] != 'Walk' else ():
                if ch['target'] == {'node': f, 'path': 'rotation'}:
                    smp = an['samplers'][ch['sampler']]; smp['output'] = add_acc(g, B, qmul(acc(g, B, smp['output']), C), 'VEC4')
        print(f'FEET {sd} foot turned {np.degrees(-tilt):.1f}° toes-down in every clip but the Walk')

def idle():
    """Standing: the Drifter's idle, stacked upright from the side (ankle, hip, shoulder, ear over each other, weight over
    the middle of the foot; it leant back with the pelvis pushed forward), arms hanging at the sides."""
    a = anim('Idle'); T = dur(a); t = grid(T); n = len(t); L = R.sample(B, a, t); Q0, P0 = solve(L, {}); hips = I['hips']
    side = lambda P, b: (P[I['left' + b]] + P[I['right' + b]]) / 2
    sag = lambda v: np.arctan2(v[:, 2], v[:, 1])                                # lean from plumb, + forward
    ear = lambda P: P[I['head']] + 0.3 * (P[I['HeadTop_End']] - P[I['head']])
    heel = lambda sd: P0[I[sd + 'Foot']] + qrot(qmul(Q0[I[sd + 'Foot']], qinv(RQ[I[sd + 'Foot']])), np.array([0, -RP[I[sd + 'Foot']][1], -0.099]))
    midfoot = ((heel('left') + heel('right')) / 2 + side(P0, 'Toes')) / 2
    L['translation'][hips][:, 2] += midfoot[:, 2] - side(P0, 'UpperLeg')[:, 2]   # hips back over the middle of the feet
    W = {'head': Q0[I['head']]}; w = 2 * np.pi * t / T                          # the head keeps its own level gaze
    def arms():  # arms hang at the sides, hands by the outer thigh; breathing sways them a little (the collarbones follow the chest)
        Q, P = solve(L, W)
        for s in (1, -1): W.update(arm(Q, P, s, th=1.5 + np.sin(w + (s < 0) * 0.7), al=7.5 + 0.5 * np.cos(w), ph=10 + 2 * np.sin(w), upright=True, carry=10))
    for _ in range(12):                                                          # then the trunk over the hips, the ear over the shoulders
        Q, P = solve(L, W)
        for sd in ('left', 'right'):                                             # feet stay planted; knees as the donor's
            W |= leg(sd, P[I[sd + 'UpperLeg']], P0[I[sd + 'Foot']], P0[I[sd + 'LowerLeg']] - P0[I[sd + 'UpperLeg']])[1]
            W[sd + 'Foot'], W[sd + 'Toes'] = Q0[I[sd + 'Foot']], Q0[I[sd + 'Toes']]
        arms(); Q, P = solve(L, W); a1 = sag(side(P, 'UpperArm') - side(P, 'UpperLeg')); a2 = sag(ear(P) - side(P, 'UpperArm'))
        for b, share in (('spine', 0.4), ('chest', 0.7), ('upperChest', 1.0)):
            W[b] = qmul(qa(X, -a1 * share), Q[I[b]])
        W['neck'] = qmul(qa(X, -a1 - a2), Q[I['neck']])
    arms(); Q, P = solve(L, W); print(f'IDLE upright: hips moved {100 * np.mean(midfoot[:, 2] - side(P0, "UpperLeg")[:, 2]):+.1f} cm to stand over the mid-foot, '
          f'hip-shoulder {np.degrees(sag(side(P, "UpperArm") - side(P, "UpperLeg"))).mean():+.1f}°, shoulder-ear {np.degrees(sag(ear(P) - side(P, "UpperArm"))).mean():+.1f}°'); return t, L

def plant(sd, A, F, u, T, v, H, hz, duty=0.6):
    """A walking foot's stance: the heel lands, the foot rolls flat, the heel rises over the ball, and whichever point bears
    the weight holds still on the ground (in this in-place clip: slides back at exactly v); the heel rises early enough that
    the leg from the hip joint H still reaches. The swing stays the donor's, eased into the stance over a tenth of a cycle
    at each end. Returns ankle positions, foot and toe world rotations."""
    f, tb = I[sd + 'Foot'], I[sd + 'Toes']; m = len(u) - 1; A = A.copy(); F = F.copy()   # one cycle: the last frame is the first
    heel = np.array([RP[f][0], 0, -0.137]) - RP[f]; ball = RP[tb] - [0, 0.009, 0] - RP[f]  # sole points (boot heel, ball), from the ankle
    dq = qmul(F[:m], qinv(RQ[f])); fz = qrot(dq, Z)
    yaw, pitch = np.arctan2(fz[:, 0], fz[:, 2]), np.arctan2(-fz[:, 1], np.hypot(fz[:, 0], fz[:, 2]))
    low = A[:m, 1] + np.minimum(qrot(dq, heel)[:, 1], qrot(dq, ball)[:, 1])     # the sole's lowest point
    i_s = int(np.argmin(np.abs(u[:m] - landing(low, u[:m]))))                  # heel strike: the sole comes down (the donor then skids on)
    reach = 0.99 * (l1 + l2)                                                    # a walking leg nearly straightens at both ends
    for n_st in range(int(round(duty * m)), int(0.45 * m), -1):                # toe-off after the stance share of the cycle, or
        i_o = (i_s + n_st) % m; j = np.arange(n_st + 1); idx = (i_s + j) % m; s_ = j / n_st   # sooner if the leg can't reach
        yaw0 = yaw[(i_s + n_st // 2) % m]
        p = np.where(s_ < 0.15, pitch[i_s] * (1 - smooth(s_ / 0.15)), np.where(s_ < 0.6, 0, pitch[i_o] * smooth((s_ - 0.6) / 0.4)))
        turn = qa(Y, np.full(len(j), yaw0)); q = qmul(turn, qa(X, p)); back = np.stack([0 * j, 0 * j, -v * j * T / m], -1)
        h0 = (A[i_s] + qrot(q[0], heel)) * [1, 0, 1]                            # heel lands on the ground (y = 0)
        a0 = h0 - qrot(q[0], heel) - H[i_s]                                     # as far ahead as the leg reaches, both feet alike
        h0[2] -= a0[2] - np.sqrt(max(reach**2 - a0[0]**2 - a0[1]**2, 0))
        k15 = np.argmax(s_ >= 0.15); b0 = h0 + back[k15] + qrot(q[k15], ball - heel) - back[k15]
        far = lambda k: np.linalg.norm(b0 + back[k] - qrot(qmul(turn[k], qa(X, p[k])), ball) - H[idx[k]]) > reach
        for k in range(k15, len(j)):                                            # heel up just enough for the leg to reach
            while p[k] < rad(60) and far(k): p[k] += rad(1)
        if not any(far(k) for k in range(k15, len(j))): break
    p[k15:] = np.maximum.accumulate(p[k15:]); q = qmul(turn, qa(X, p))          # once it rises it keeps rising to toe-off
    planted = np.where((s_ < 0.15)[:, None], h0 + back - qrot(q, heel), b0 + back - qrot(q, ball))
    lift = p[-1] - pitch[i_o]                                                    # the swing starts from the stance's last pitch
    d_s, d_o = planted[0] - A[i_s], planted[-1] - A[i_o]
    for k in range(m):                                                          # ease the swing into and out of the stance
        before, after = (u[i_s] - u[k]) % 1, (u[k] - u[i_o]) % 1
        if after < 0.1:
            w_ = smooth(1 - after / 0.1); A[k] += d_o * w_
            F[k] = qmul(qmul(qa(Y, (yaw0 - yaw[i_o]) * w_), qa(qrot(qa(Y, yaw0), X), lift * w_)), F[k])
        if before < 0.1: A[k] += d_s * smooth(1 - before / 0.1); F[k] = qmul(qa(Y, (yaw0 - yaw[i_s]) * smooth(1 - before / 0.1)), F[k])
    A[idx] = planted; F[idx] = qmul(q, RQ[f])
    for k in range(m):                                                          # after toe-off the ball leaves the ground at once
        after = (u[k] - u[i_o]) % 1
        if 0 < after < 0.15: A[k, 1] += max(0, 0.012 + 0.5 * after - A[k, 1] - qrot(qmul(F[k], qinv(RQ[f])), ball)[1])
    flat = np.zeros(m); flat[idx] = p > 0                                        # toes stay flat on the ground while the heel is up
    for k in range(m): flat[k] = max(flat[k], smooth(1 - ((u[k] - u[i_o]) % 1) / 0.08))  # then follow the foot
    Tq = slerp(qmul(qmul(F[:m], qinv(RQ[f])), RQ[tb]), qmul(qa(Y, np.full(m, yaw0)), RQ[tb]), flat[:, None])
    A[m], F[m] = A[0], F[0]; Tq = np.concatenate([Tq, Tq[:1]])
    return A, F, Tq

def walk(v=1.6, k=None):
    """The Drifter's walk, sped up k times and its stride stretched by IK so the planted foot moves at the game's v (no
    skating) and the soles touch the ground (the donor floats ~5 cm); arms swing from the shoulder against the legs."""
    a = anim('Walk'); k = k or dur(a) * v / (2 * (l1 + l2))  # cadence so each step is one leg length (the hero's approved walk; ~x1.3)
    T = dur(a) / k; t = grid(T); u = t / T; hips = I['hips']
    L = R.sample(B, a, t * k); Q, P = solve(L, {})
    sole = {sd: np.minimum(P[I[sd + 'Foot']][:, 1] - RP[I[sd + 'Foot']][1], P[I[sd + 'Toes']][:, 1] - RP[I[sd + 'Toes']][1]) for sd in ('left', 'right')}
    vz = np.median(np.concatenate([np.gradient(P[I[sd + 'Foot']][:, 2], t)[sole[sd] < sole[sd].min() + 0.01] for sd in sole]))
    stretch, drop = v / -vz, min(x.min() for x in sole.values())
    hz = P[hips][:, 2:3]; A, Fw, Tw = {}, {}, {}; need = np.zeros(len(t))
    for sd in sole:
        A[sd] = P[I[sd + 'Foot']] - [0, drop, 0]; A[sd][:, 2:3] = hz + stretch * (A[sd][:, 2:3] - hz)
        H = P[I[sd + 'UpperLeg']] - [0, drop, 0]
        A[sd], Fw[sd], Tw[sd] = plant(sd, A[sd], Q[I[sd + 'Foot']], u, T, v, H, hz)
        dxz = np.linalg.norm((A[sd] - H)[:, ::2], axis=-1)
        need = np.maximum(need, H[:, 1] - A[sd][:, 1] - np.sqrt(np.maximum((0.993 * (l1 + l2))**2 - dxz**2, 0)))
    # the hips dip only where the long step needs it (double support), smoothly; never less than needed
    loop = lambda x, w: np.convolve(np.concatenate([x[-w:-1], x, x[1:w]]), np.ones(2 * w - 1) / (2 * w - 1), 'valid')
    w = max(2, len(t) // 12); e = np.maximum(need, 0)
    e = loop(np.max([np.roll(e, j) for j in range(-w, w + 1)], 0), w); e = np.maximum(e, need) + 0.002
    L['translation'][hips][:, 1] -= drop + e; Q2, P2 = solve(L, {}); W = {}
    for sd in sole:
        _, Wl = leg(sd, P2[I[sd + 'UpperLeg']], A[sd], P[I[sd + 'LowerLeg']] - P[I[sd + 'UpperLeg']]); W |= Wl  # knee as the donor's
        W[sd + 'Foot'], W[sd + 'Toes'] = Fw[sd], Tw[sd]
    Q, P = solve(L, W)
    for s in (1, -1):  # each arm swings with the opposite leg, peaking a touch after that foot's heel strike
        c = np.cos(2 * np.pi * (u - strike(P, u, 'right' if s > 0 else 'left') - 0.02))
        W |= arm(Q, P, s, th=1.5 + 16.5 * c, al=8, ph=23 + 7 * c, carry=8)
    solve(L, W)
    print(f'WALK v {v} m/s, cycle {T:.3f} s ({2 / T:.2f} steps/s, step {v * T / 2:.2f} m): donor x{k:.2f} faster, stride x{stretch:.2f}, '
          f'hips down {100 * drop:.1f} cm to the ground + {100 * e.min():.1f}..{100 * e.max():.1f} cm to reach')
    return t, L

def spline(keys, u):  # periodic cubic Hermite through (u, value) keys, u in [0, 1)
    k = sorted(keys); ku = np.array([x for x, _ in k]); kv = np.array([v for _, v in k]); n = len(k)
    U = np.concatenate([ku[-1:] - 1, ku, ku[:1] + 1]); V = np.concatenate([kv[-1:], kv, kv[:1]])
    m = (V[2:] - V[:-2]) / (U[2:] - U[:-2])
    u = np.mod(u, 1); i = np.clip(np.searchsorted(ku, u, 'right') - 1, -1, n - 1)
    u0 = np.where(i < 0, ku[-1] - 1, ku[i]); j = (i + 1) % n; u1 = np.where(i + 1 >= n, ku[0] + 1, ku[np.minimum(i + 1, n - 1)])
    h = u1 - u0; s = (u - u0) / h; v0, v1, m0, m1 = kv[i], kv[j], m[i], m[j]
    return (2*s**3 - 3*s**2 + 1) * v0 + (s**3 - 2*s**2 + s) * h * m0 + (-2*s**3 + 3*s**2) * v1 + (s**3 - s**2) * h * m1

def smooth(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

def run(v=6.0, T=0.56):
    """A sprinter's stride (RESEARCH.md): tall trunk leaning ~9°, high knee drive, heel recovered under the hips, the foot
    landing just ahead of the hips on the ball and rolling back at exactly the ground speed v (no skating), arms pumping."""
    t = grid(T, 60); n = len(t); u = t / T; hips = I['hips']
    L = {p: np.repeat(np.stack([r[p] for r in R.rest])[:, None], n, 1) for p in ('translation', 'rotation', 'scale')}
    reach = 0.97 * (l1 + l2)

    def body(c, extra=0.0):  # pelvis and trunk for a contact fraction c (right foot lands at u=0, left at u=0.5); extra: added lean°
        mid = np.cos(4 * np.pi * (u - c / 2))                           # +1 at each mid-stance, -1 at mid-flight
        yaw = rad(6) * np.cos(2 * np.pi * u)                           # the swinging leg's hip goes forward
        L['translation'][hips] = np.stack([-0.01 * np.cos(2 * np.pi * (u - c / 2)), 0.977 * RP[hips][1] - 0.025 * mid, np.full(n, RP[hips][2])], -1)
        W = {'hips': qmul(qmul(qa(Y, yaw), qa(Z, -rad(3) * np.cos(2 * np.pi * (u - c / 2)))), qmul(qa(X, rad(6) * np.ones(n)), RQ[hips])),
             'head': qmul(qa(X, rad(8) * np.ones(n)), RQ[I['head']])}  # head in line with the neck, eyes forward
        for b, lean, turn in (('spine', 11 + extra, 0.3), ('chest', 12 + extra, -0.4), ('upperChest', 13 + extra, -1.3), ('neck', 8, -0.6)):
            W[b] = qmul(qmul(qa(Y, turn * yaw), qa(X, rad(lean) * np.ones(n))), RQ[I[b]])
        P = solve(L, W)[1]; up = P[I['neck']] - P[I['hips']]
        return W, P, np.degrees(np.arcsin((up[:, 2] / np.linalg.norm(up, axis=-1)).mean()))  # trunk lean as motion_check reads it

    def plan(s, P, c):
        side = 'left' if s > 0 else 'right'; nm = lambda b: side + b
        uu = np.mod(u - (0.5 if s > 0 else 0), 1); H = P[I[nm('UpperLeg')]]
        toe_in = qa(Y, -s * rad(7) * np.ones(n)); rv = RP[I[nm('Toes')]] - RP[I[nm('Foot')]]
        off = lambda p: qrot(qmul(qa(X, rad(p)), toe_in[:np.size(p)]), rv)  # ankle -> ball for a foot pitched p (heel up)
        k_td, k_to = np.argmin(np.minimum(uu, 1 - uu)), np.argmin(np.abs(uu - c))
        def ball_z(k, p, sign):  # as far forward / back as the leg reaches at that instant
            o = off(np.array([p]))[0]; return H[k, 2] + sign * np.sqrt(reach**2 - (H[k, 1] - 0.009 + o[1])**2) + o[2]
        return dict(side=nm, uu=uu, H=H, toe_in=toe_in, off=off, zTD=ball_z(k_td, 12, 1), zTO=ball_z(k_to, 48, -1),
                    bx=H[k_td, 0] - s * 0.025 + off(np.array([12]))[0, 0])

    c, extra = 0.21, 0.0
    for _ in range(4):  # the bob depends on the contact time, the contact time on how far the foot reaches
        for _ in range(3): W, P, lean = body(c, extra); extra += 7.5 - lean   # a sprinter's ~7.5° lean on any spine
        legs = {s: plan(s, P, c) for s in (1, -1)}
        c_new = np.mean([(g_['zTD'] - g_['zTO']) / (v * T) for g_ in legs.values()])
        if abs(c_new - c) < 1e-4: break
        c = c_new
    for s, G in legs.items():
        nm, uu, H, off = G['side'], G['uu'], G['H'], G['off']; st = uu <= c
        p_st = np.where(uu / c < 0.25, 12 - 11 * smooth(uu / c / 0.25), 1 + 47 * smooth((uu / c - 0.6) / 0.4) ** 1.5)  # the heel settles as he loads
        ball = np.stack([np.full(n, G['bx']), np.full(n, 0.009), G['zTD'] - v * np.minimum(uu, c) * T], -1)  # planted, rolls back at v
        A_st = ball - off(p_st)
        def angles(d):  # thigh angle from vertical (+ forward) and knee flexion for a hip->ankle vector
            dist = np.linalg.norm(d); al = np.arccos(np.clip((l1**2 + dist**2 - l2**2) / (2 * l1 * dist), -1, 1))
            kn = np.pi - np.arccos(np.clip((l1**2 + l2**2 - dist**2) / (2 * l1 * l2), -1, 1))
            return np.degrees(np.arctan2(d[2], -d[1]) + al), np.degrees(kn)
        keys = []
        for x in (0, c / 2, c):
            k = np.argmin(np.abs(uu - x)); th, kn = angles(A_st[k] - H[k]); keys.append((x, th, kn, p_st[k] + th - kn))
        # swing (u from toe-off): heel kicks up, tucks under the hips, the knee drives to near horizontal, the shin unfolds, paws down
        keys += [(c + 0.10, -20, 90, 35), (0.42, 5, 128, 20), (0.62, 55, 115, 0), (0.72, 72, 100, -10), (0.86, 48, 35, -5)]
        th, kn, an = (rad(spline([(k[0], k[i]) for k in keys], uu)) for i in (1, 2, 3))
        A_sw = H + np.stack([-s * 0.025 + 0 * uu, -l1 * np.cos(th) - l2 * np.cos(th - kn), l1 * np.sin(th) + l2 * np.sin(th - kn)], -1)
        A = np.where(st[:, None], A_st, A_sw)
        K, Wl = leg(nm(''), H, A, np.array([0, 0, 1.0])); W |= Wl                  # knee points forward
        shin = A - K; pitch = np.where(st, rad(p_st), -np.arctan2(shin[:, 2], -shin[:, 1]) + an)
        foot = qmul(qa(X, pitch), G['toe_in'])
        flat = np.where(st, 1, np.maximum(smooth(1 - (uu - c) / 0.06), smooth((uu - 0.96) / 0.04)))[:, None]  # toes flat while on the ground
        W[nm('Foot')] = qmul(foot, RQ[I[nm('Foot')]])
        W[nm('Toes')] = slerp(qmul(foot, RQ[I[nm('Toes')]]), qmul(G['toe_in'], RQ[I[nm('Toes')]]), flat)
    Q, P = solve(L, W)
    for s in (1, -1):  # each arm drives forward as the opposite foot comes down to land; the elbow closes in front, opens behind
        cs = np.cos(2 * np.pi * (u + 0.08 - (0 if s > 0 else 0.5)))
        W |= arm(Q, P, s, th=-6 + 56 * cs, al=12, ph=89 + 21 * cs, curl=(30, 40, 25))
    solve(L, W)
    print(f'RUN v {v} m/s, cycle {T} s ({2 / T:.2f} steps/s, step {v * T / 2:.2f} m), contact {c * T:.3f} s, '
          f'ball lands {legs[1]["zTD"]:.2f} m, leaves {legs[1]["zTO"]:.2f} m')
    return t, L

flat_feet()
write('Idle', *idle())
write('Walk', *walk())
t, L = run(); write('Run', t, L); write('Sprint', t, L)
g['asset']['extras'] = {**g['asset'].get('extras', {}), 'motion': 'tools/hero/motion.py'}
save(sys.argv[2], g, B)
print('MOTION wrote', sys.argv[2], 'animations', len(g['animations']))
