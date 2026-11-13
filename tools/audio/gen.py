#!/usr/bin/env python3
"""Make every sound in public/audio/ on this Mac, free: AudioGen (facebook/audiogen-medium) for effects and beds,
MusicGen (facebook/musicgen-medium) for the two 60 s themes (it extends past 30 s in windows). Run unsandboxed (the GPU, MPS, is not visible in the sandbox):
  python3 tools/audio/gen.py sfx [name ...]     # re-execs itself in ~/audio-skills-data/sfx/.venv
  python3 tools/audio/gen.py music [name ...]   # ... in ~/audio-skills-data/music-bgm/.venv
Writes public/audio/<name>[-i].m4a (AAC, Safari plays it), merges public/audio/sounds.json ({name: {files, loop}}, what
src/audio.js loads) and rewrites public/audio/CREDITS.md from SOUNDS (model + prompt behind every file).
Kinds: loop = a seamless loop (equal-power crossfade of its own tail into its head); one = one shot, silence trimmed;
hits = cut into single hits at their onsets (footsteps, wingbeats), each its own file so the game picks one at random."""
import json, os, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/audio'
MODE, ONLY = sys.argv[1], set(sys.argv[2:])
DATA = Path.home() / 'audio-skills-data' / {'sfx': 'sfx', 'music': 'music-bgm'}[MODE]
if Path(sys.prefix).resolve() != (DATA / '.venv').resolve():
    os.execv(str(DATA / '.venv/bin/python'), [str(DATA / '.venv/bin/python'), __file__, *sys.argv[1:]])
os.environ.update(HF_HOME=str(DATA / 'models'), HF_HUB_OFFLINE='1', NUMBA_CACHE_DIR=os.environ.get('TMPDIR', '/tmp') + '/numba',
                  # MusicGen's growing cache made the MPS allocator keep every size it ever used: a 151 GB footprint on one 30 s
                  # theme, killed. Collect cached blocks past ~15 % of the GPU's working set, refuse past ~35 % (an error, not a kill).
                  PYTORCH_MPS_LOW_WATERMARK_RATIO='0.15', PYTORCH_MPS_HIGH_WATERMARK_RATIO='0.35')

AG, MG = 'facebook/audiogen-medium', 'facebook/musicgen-medium'
# name: (model, prompt, seconds, kind, max seconds per hit / loop crossfade, gain dB on top of the normalisation)
SOUNDS = {
    'bed-day': (AG, 'gentle wind blowing through tall meadow grass, soft rustling, distant songbirds chirping, peaceful open countryside', 10, 'loop', 2.0),
    'bed-night': (AG, 'crickets chirping in a grassy meadow at night, soft gentle breeze, calm and quiet', 10, 'loop', 2.0),
    'chimes': (AG, 'soft glass wind chimes tinkling gently and slowly in a light breeze, delicate, sparse', 10, 'loop', 2.0),
    'water': (AG, 'small gentle waves lapping against a lake shore, calm water, soft splashes', 8, 'loop', 2.0),
    'town': (AG, 'distant medieval village ambience, people talking softly, market murmur, footsteps and a horse cart', 10, 'loop', 2.0),
    'wind': (AG, 'strong wind rushing past at high speed, howling airflow, flying through the sky', 8, 'loop', 2.0),
    'bell': (AG, 'a single large church bell tolling once in the distance, long ringing decay', 6, 'one', 6),
    'step-grass': (AG, 'footsteps of a person walking slowly through tall grass, boots on soft earth, grass rustling', 6, 'hits', 0.45),
    'step-stone': (AG, 'footsteps of leather boots walking slowly on stone pavement, clear separate steps', 6, 'hits', 0.4),
    'step-water': (AG, 'footsteps wading slowly through shallow water, splashing with each step', 6, 'hits', 0.6),
    'jump': (AG, 'quick cloth whoosh of a person jumping, short effort breath', 2, 'one', 0.8),
    'land': (AG, 'heavy boots landing on grassy ground after a jump, soft thud', 2, 'one', 0.8),
    'swing': (AG, 'a heavy sword swinging fast through the air, sharp whoosh, several separate swings', 5, 'hits', 0.6),
    'hit': (AG, 'a sword slashing into a large creature, heavy meaty impact, several separate hits', 5, 'hits', 0.7),
    'troll-grunt': (AG, 'a huge monster grunting and growling, deep guttural effort grunts', 5, 'hits', 1.4),
    'troll-impact': (AG, 'a huge stone slamming into the ground, deep heavy thud, earth rumble', 3, 'one', 2.0),
    'wingbeat': (AG, 'giant leathery wings flapping slowly, deep heavy whooshing wingbeats, separate flaps', 8, 'hits', 1.0),
    'roar': (AG, 'a huge dragon roaring, deep powerful growl, echoing over open land', 4, 'one', 4),
    'theme-day': (MG, 'gentle dreamy fantasy pastoral theme, soft harp arpeggios, warm wooden flute melody, light strings, '
                      'slow tempo, peaceful sense of wonder, mesmerizing, instrumental', 60, 'loop', 4.0),
    'theme-night': (MG, 'slow ethereal dreamy ambient lullaby, celesta and music box, soft warm synth pads, gentle harp, '
                        'mysterious and mesmerizing starry night, instrumental', 60, 'loop', 4.0),
}


def db(x): return 10 ** (x / 20)


def onsets(x, sr):
    """Start sample of each hit: peaks of a 20 ms RMS envelope, ≥ 0.18 s apart and above a third of the loudest,
    walked back to where the hit rises out of the floor."""
    import numpy as np
    hop, win = sr // 200, sr // 50
    env = np.sqrt(np.convolve(x ** 2, np.ones(win) / win, 'same'))[::hop]
    peaks, gap = [], int(0.18 * 200)
    for i in np.argsort(-env):
        if env[i] < env.max() / 3: break
        if all(abs(i - p) >= gap for p in peaks): peaks.append(i)
    starts = []
    for p in sorted(peaks):
        s = p
        while s > 0 and p - s < 16 and env[s - 1] > env[p] * 0.12: s -= 1
        starts.append(s * hop)
    return starts


def shape(name, x, sr):
    """Float mono → list of clips (one per file), normalised: loops to -20 dBFS RMS, shots to -1 dBFS peak."""
    import numpy as np
    kind, arg = SOUNDS[name][3], SOUNDS[name][4]
    x = x - x.mean()
    if kind == 'loop':  # tail crossfaded into the head: x[N-F..N) fades out over x[0..F), then x[F..N-F) runs on
        F = int(arg * sr); t = np.linspace(0, np.pi / 2, F)
        y = x[:len(x) - F].copy(); y[:F] = x[:F] * np.sin(t) + x[len(x) - F:] * np.cos(t)
        g = min(db(-20) / np.sqrt((y ** 2).mean()), db(-1) / np.abs(y).max())
        return [y * g]
    if kind == 'one': cuts = [np.argmax(np.abs(x) > np.abs(x).max() * 0.05)]
    else: cuts = onsets(x, sr)
    clips = []
    for k, s in enumerate(cuts):
        e = min(len(x), s + int(arg * sr), *(c for c in cuts[k + 1:] if c > s))
        c = x[max(0, s - sr // 200):e].copy()
        f = min(len(c) // 4, sr // 20); c[-f:] *= np.linspace(1, 0, f)  # 50 ms tail fade
        if len(c) > sr // 20: clips.append(c / np.abs(c).max() * db(-1))
    return sorted(clips, key=lambda c: -np.sqrt((c ** 2).mean()))[:6]  # the six fullest hits


def encode(clip, sr, path):
    import soundfile as sf
    wav = path.with_suffix('.wav')
    sf.write(wav, clip, sr, subtype='PCM_16')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'aac', '-b:a', '64k' if sr < 30000 else '96k',
                    '-movflags', '+faststart', path], check=True)
    wav.unlink()


def main():
    import numpy as np, torch
    try:  # audiocraft 1.3 + the MPS xformers stub: two calls it expects (same shim as the audio skills)
        from xformers.profiler import profiler as xfp
        import xformers.ops as xops
        if not hasattr(xfp, '_Profiler'): xfp._Profiler = type('P', (), {'_CURRENT_PROFILER': None})
        if not hasattr(xops, 'unbind'): xops.unbind = torch.unbind
    except Exception: pass
    from audiocraft.models import AudioGen, MusicGen
    dev = 'mps' if torch.backends.mps.is_available() else 'cpu'
    names = [n for n, s in SOUNDS.items() if (s[0] == AG) == (MODE == 'sfx') and (not ONLY or n in ONLY)]
    model = (AudioGen if MODE == 'sfx' else MusicGen).get_pretrained(AG if MODE == 'sfx' else MG, device=dev)
    OUT.mkdir(parents=True, exist_ok=True)
    man_path = OUT / 'sounds.json'
    man = json.loads(man_path.read_text()) if man_path.exists() else {}
    for i, n in enumerate(names):
        _, prompt, secs, kind, _ = SOUNDS[n]
        torch.manual_seed(1000 + list(SOUNDS).index(n))
        model.set_generation_params(duration=secs)
        model.set_custom_progress_callback(lambda done, total: done % 250 == 0 and print(f'  {n}: {done}/{total} steps', flush=True))
        x = model.generate([prompt], progress=True)[0, 0].detach().cpu().numpy().astype(np.float64)
        clips = shape(n, x, model.sample_rate)
        for old in OUT.glob(f'{n}*.m4a'): old.unlink()  # our own previous take of this sound
        files = [f'{n}.m4a'] if len(clips) == 1 and kind != 'hits' else [f'{n}-{k}.m4a' for k in range(len(clips))]
        for c, f in zip(clips, files): encode(c, model.sample_rate, OUT / f)
        man[n] = {'files': files, 'loop': kind == 'loop'}
        man_path.write_text(json.dumps(dict(sorted(man.items())), indent=1) + '\n')
        print(f'{i + 1}/{len(names)} {n}: {len(clips)} file(s), {sum(len(c) for c in clips) / model.sample_rate:.1f} s', flush=True)
    lines = ['# Sound credits', '', 'Every file here was generated on this Mac by `tools/audio/gen.py` (free, local, no paid service).',
             'AudioGen and MusicGen are Meta AudioCraft models (code MIT; weights CC-BY-NC 4.0). Original sounds; no samples.', '',
             '| sound | files | model | prompt |', '|---|---|---|---|']
    for n, (m, p, secs, kind, _) in SOUNDS.items():
        if n in man: lines.append(f'| {n} | {", ".join(man[n]["files"])} | {m} ({secs} s, {kind}) | {p} |')
    (OUT / 'CREDITS.md').write_text('\n'.join(lines) + '\n')


if __name__ == '__main__':
    main()
