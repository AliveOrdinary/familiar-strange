# Synthesized paper foley for the collage reels. Made from noise and sine
# waves in code, so it is ours outright (no samples, no licences).
import numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile
import sys, os
SR = 44100
rng = np.random.default_rng(7)
out = sys.argv[1]

def band(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=SR, output='sos'), x)

def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    return a * np.exp(-np.maximum(t - attack, 0) / decay)

def save(name, x, gain=0.8):
    x = x / (np.max(np.abs(x)) + 1e-9) * gain
    fade = int(0.004 * SR); x[-fade:] *= np.linspace(1, 0, fade)
    wavfile.write(os.path.join(out, name), SR, (x * 32767).astype(np.int16))

def pat(dur=0.16, lo=600, hi=5000, thump=110, weight=0.6):
    n = int(dur * SR); t = np.arange(n) / SR
    crackle = band(rng.standard_normal(n), lo, hi) * env(n, 0.002, 0.03)
    body = np.sin(2 * np.pi * thump * t) * env(n, 0.001, 0.025) * weight
    return crackle + body

# a cut-out landing on the table
save('pat.wav', pat(), 0.7)
save('pat2.wav', pat(lo=900, hi=6000, thump=140, weight=0.45), 0.65)
# a headline slab slapped down: sharper, with more body
save('slap.wav', pat(dur=0.22, lo=400, hi=7000, thump=90, weight=0.9), 0.85)

# a sheet sliding across the table (camera pan): band-passed noise swelling and fading, with fibre grain
n = int(0.42 * SR); t = np.arange(n) / SR
noise = rng.standard_normal(n) * (1 + 0.6 * band(rng.standard_normal(n), 20, 60, 2))
sweep = band(noise, 500, 3500) * np.sin(np.pi * t / t[-1]) ** 1.5
save('slide.wav', sweep, 0.6)

# turning the sheet over: a flutter of short swishes, then a soft land
n = int(0.5 * SR); t = np.arange(n) / SR
flutter = band(rng.standard_normal(n), 700, 5000) * (0.5 + 0.5 * np.sin(2 * np.pi * 18 * t)) * np.sin(np.pi * np.clip(t / 0.38, 0, 1))
landing = np.zeros(n); k = int(0.36 * SR); p = pat(0.14, 500, 4000, 100, 0.7); landing[k:k + len(p)] += p[: n - k] * 1.2
save('flip.wav', flutter + landing, 0.75)

# one typewriter key: a click with a tiny metallic ring
n = int(0.05 * SR); t = np.arange(n) / SR
click = band(rng.standard_normal(n), 2000, 9000) * env(n, 0.0005, 0.006) + np.sin(2 * np.pi * 2400 * t) * env(n, 0.0005, 0.012) * 0.25
save('key.wav', click, 0.5)
print('ok')
