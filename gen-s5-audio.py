"""
S5 IRON SIEGE — offline sample pack renderer.

Renders the fixed sound contract used by src/app/s5/games/_shared/{audio,sfx}.ts
to public/s5-art/audio/<name>.mp3 (mono 44.1k).

Everything is synthesised here rather than in the browser because offline we can
afford time-varying filters, convolution tails and wrap-crossfaded loop material
that a realtime WebAudio pluck synth cannot do. The browser synth stays as the
fallback for any file that fails to load.

Deterministic: one seeded Generator, no wall-clock, so a re-run is byte-stable.
"""
import math
import os
import struct
import subprocess
import sys
import wave

import numpy as np

SR = 44100
RNG = np.random.default_rng(20260726)

# Media files are BUILD INTERMEDIATES and deliberately do NOT live under
# public/. Serving /s5-art/audio/hurt.mp3 makes download-manager extensions
# pop a "save this file?" dialog mid-game, which is what happened on the
# first real playtest. The runtime fetches ONE application/json pack
# instead, which no download manager touches.
_ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_MP3 = os.path.join(_ROOT, "audio_build")
OUT_WAV = os.path.join(OUT_MP3, "_wav")
PACK_OUT = os.path.join(_ROOT, "public", "s5-art", "audio", "pack.json")

try:
    from scipy.signal import lfilter as _lfilter  # type: ignore

    HAVE_SCIPY = True
except Exception:  # pragma: no cover - scipy is optional
    HAVE_SCIPY = False


# ---------------------------------------------------------------- primitives

def n_samples(dur):
    return int(round(dur * SR))


def t_axis(dur):
    return np.arange(n_samples(dur), dtype=np.float64) / SR


def noise(dur, seed=None):
    g = RNG if seed is None else np.random.default_rng(seed)
    return g.standard_normal(n_samples(dur))


def env_ad(dur, attack, decay, curve=3.0):
    """Attack ramp then exponential-ish decay. attack+decay may exceed dur."""
    n = n_samples(dur)
    a = max(1, n_samples(attack))
    out = np.ones(n)
    a = min(a, n)
    out[:a] = np.linspace(0.0, 1.0, a) ** 0.7
    d = np.arange(n - a) / max(1.0, n_samples(decay))
    out[a:] = np.exp(-curve * d)
    return out


def env_hold(dur, attack, hold, release):
    n = n_samples(dur)
    a, h = n_samples(attack), n_samples(hold)
    r = max(1, n - a - h)
    out = np.zeros(n)
    if a > 0:
        out[:a] = np.linspace(0, 1, a) ** 0.6
    out[a:a + h] = 1.0
    tail = np.linspace(0, 1, r) ** 1.0
    out[a + h:a + h + r] = np.exp(-4.0 * tail)[:max(0, n - a - h)]
    return out


def sweep(f0, f1, dur, curve="exp", phase0=0.0):
    """Phase-continuous frequency sweep -> sine."""
    t = t_axis(dur)
    if curve == "exp":
        f0 = max(1e-6, f0)
        f1 = max(1e-6, f1)
        k = (f1 / f0) ** (1.0 / max(1e-9, dur))
        lk = math.log(k)
        # lk is NEGATIVE for a falling sweep. Flooring it at +1e-9 (the obvious
        # divide-by-zero guard) turns every drop into aliased broadband noise
        # instead of a pitch fall, which is most of the pack: explosions,
        # impacts, the bomb whistle, the ricochet.
        if abs(lk) < 1e-12:
            phase = 2 * np.pi * f0 * t
        else:
            phase = 2 * np.pi * f0 * (k ** t - 1.0) / lk
    else:
        phase = 2 * np.pi * (f0 * t + 0.5 * (f1 - f0) / max(1e-9, dur) * t * t)
    return np.sin(phase + phase0)


def saw(freq, dur, harmonics=14):
    """Band-limited-ish sawtooth by additive synthesis."""
    t = t_axis(dur)
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if freq * k > SR * 0.45:
            break
        out += np.sin(2 * np.pi * freq * k * t) / k
    return out * (2.0 / np.pi)


def square(freq, dur, harmonics=13):
    t = t_axis(dur)
    out = np.zeros_like(t)
    for k in range(1, harmonics * 2, 2):
        if freq * k > SR * 0.45:
            break
        out += np.sin(2 * np.pi * freq * k * t) / k
    return out * (4.0 / np.pi) * 0.5


def onepole_lp(x, fc):
    """Time-varying one-pole lowpass. fc may be scalar or per-sample array."""
    fc = np.asarray(fc, dtype=np.float64)
    if fc.ndim == 0:
        a = 1.0 - math.exp(-2 * math.pi * float(fc) / SR)
        if HAVE_SCIPY:
            return _lfilter([a], [1.0, -(1.0 - a)], x)
        a_arr = np.full(len(x), a)
    else:
        a_arr = 1.0 - np.exp(-2 * np.pi * np.clip(fc, 5, SR * 0.45) / SR)
    y = np.empty_like(x)
    prev = 0.0
    for i in range(len(x)):
        prev += a_arr[i] * (x[i] - prev)
        y[i] = prev
    return y


def lp(x, fc, poles=2):
    for _ in range(poles):
        x = onepole_lp(x, fc)
    return x


def hp(x, fc, poles=1):
    return x - lp(x, fc, poles)


def bp(x, fc, width=2.0, poles=2):
    return lp(hp(x, fc / width, 1), fc * width, poles)


def resonator(x, freq, q=40.0):
    """Two-pole resonant bandpass, gives metals their ring."""
    w = 2 * math.pi * freq / SR
    r = math.exp(-w / (2 * q))
    b0 = (1 - r * r) * 0.5
    a1 = -2 * r * math.cos(w)
    a2 = r * r
    if HAVE_SCIPY:
        return _lfilter([b0, 0, -b0], [1.0, a1, a2], x)
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        v = b0 * x[i] - b0 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, x[i]
        y2, y1 = y1, v
        y[i] = v
    return y


def reverb(x, dur=0.5, mix=0.3, seed=7, pre=0.01):
    """Cheap convolution tail: exponentially decaying noise IR."""
    n = n_samples(dur)
    g = np.random.default_rng(seed)
    ir = g.standard_normal(n) * np.exp(-5.0 * np.arange(n) / n)
    ir = lp(ir, 3500, 1)
    ir[:n_samples(pre)] = 0.0
    ir /= np.max(np.abs(ir)) + 1e-9
    wet = np.convolve(x, ir)
    out = np.zeros(len(wet))
    out[: len(x)] += x * (1 - mix * 0.5)
    out += wet / (np.max(np.abs(wet)) + 1e-9) * np.max(np.abs(x)) * mix
    return out


def pulse_train(dur, rate, width=0.004):
    """Deterministic impulse grid; rate*dur must be an integer for seamless loops."""
    n = n_samples(dur)
    out = np.zeros(n)
    step = SR / rate
    w = max(1, n_samples(width))
    k = 0
    while True:
        i = int(round(k * step))
        if i >= n:
            break
        seg = min(w, n - i)
        out[i:i + seg] += np.exp(-np.arange(seg) / (w * 0.35))
        k += 1
    return out


def fit(x, dur):
    n = n_samples(dur)
    if len(x) >= n:
        return x[:n]
    return np.pad(x, (0, n - len(x)))


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def edges(x, fade_in=0.0006, fade_out=0.012):
    # fade_in must stay sub-millisecond: it exists only to kill the DC click at
    # sample 0. A 3ms ramp audibly softens the attack transient of percussive
    # sounds (it cost clank 66% of its peak and fire 30% of its crack).
    a, b = n_samples(fade_in), n_samples(fade_out)
    a = min(a, len(x) // 2)
    b = min(b, len(x) // 2)
    if a > 0:
        x[:a] *= np.linspace(0, 1, a)
    if b > 0:
        x[-b:] *= np.linspace(1, 0, b)
    return x


def finish(x, peak=0.9, softclip=True, fades=True):
    x = np.asarray(x, dtype=np.float64)
    x = x - np.mean(x)
    if softclip:
        x = np.tanh(x * 1.15) / math.tanh(1.15)
    # Fade FIRST, normalise second. The other order lets the sub-millisecond
    # de-click ramp clip the attack transient of a percussive sound and then
    # bakes that loss in (it halved clank and cost fire a third of its crack).
    if fades:
        x = edges(x)
    m = np.max(np.abs(x))
    if m > 1e-9:
        x = x / m * peak
    return x


def wrap_loop(x, dur, fade=0.12):
    """Take dur seconds of x and crossfade its own tail into its head so any
    interior loop point (and the file ends) are seamless."""
    n = n_samples(dur)
    f = n_samples(fade)
    if len(x) < n + f:
        x = np.pad(x, (0, n + f - len(x)))
    body = x[:n].copy()
    tail = x[n:n + f]
    ramp = np.linspace(0, 1, f)
    body[:f] = body[:f] * ramp + tail * (1 - ramp)
    return body


# ---------------------------------------------------------------- one-shots

def s_tap():
    x = square(760, 0.05) * env_ad(0.05, 0.001, 0.018)
    return finish(x, 0.34)


def s_fire():
    """MG round: click transient + bandpassed body + a little sub."""
    body = bp(noise(0.09), 1500, 2.4) * env_ad(0.09, 0.0008, 0.022, 4.0)
    crack = hp(noise(0.012), 4200) * env_ad(0.012, 0.0002, 0.004, 5.0)
    sub = sweep(240, 120, 0.045) * env_ad(0.045, 0.001, 0.012)
    return finish(mix(body * 1.0, crack * 0.9, sub * 0.25), 0.6)


def s_cannon():
    """Main gun: crack, lowpass-swept body, sub drop, room tail."""
    crack = hp(noise(0.02), 3000) * env_ad(0.02, 0.0003, 0.006, 5.0)
    fc = np.geomspace(1100, 110, n_samples(0.55))
    body = lp(noise(0.55), fc, 2) * env_ad(0.55, 0.002, 0.16, 3.2)
    sub = sweep(98, 32, 0.45) * env_ad(0.45, 0.003, 0.13, 3.0)
    x = mix(crack * 0.8, body * 1.0, sub * 1.2)
    return finish(reverb(fit(x, 0.6), 0.42, 0.26, seed=11), 0.97)


def s_hit():
    """Round on armour: metal ring over a dull thud."""
    imp = lp(noise(0.14), 1600, 2) * env_ad(0.14, 0.0005, 0.035, 4.0)
    ring = (resonator(noise(0.16), 430, 55) + resonator(noise(0.16), 690, 45) * 0.6)
    ring *= env_ad(0.16, 0.0004, 0.05, 3.5)
    thud = sweep(230, 110, 0.085) * env_ad(0.085, 0.001, 0.026)
    return finish(mix(imp * 0.8, ring * 1.0, thud * 0.32), 0.66)


def s_hurt():
    fc = np.geomspace(1400, 260, n_samples(0.34))
    grind = lp(noise(0.34), fc, 2) * env_ad(0.34, 0.004, 0.11, 3.0)
    tone = saw(150, 0.3) * env_ad(0.3, 0.006, 0.09)
    tone = lp(tone, np.geomspace(900, 220, n_samples(0.3)), 1)
    return finish(mix(grind * 0.9, tone * 0.8), 0.72)


def s_pickup():
    a = np.sin(2 * np.pi * 660 * t_axis(0.07)) * env_ad(0.07, 0.002, 0.03)
    b = np.sin(2 * np.pi * 990 * t_axis(0.13)) * env_ad(0.13, 0.002, 0.05)
    x = mix(a, np.pad(b, (n_samples(0.06), 0)))
    return finish(reverb(x, 0.18, 0.18, seed=3), 0.58)


def s_score():
    t = t_axis(0.22)
    x = (np.sin(2 * np.pi * 880 * t) + 0.5 * np.sin(2 * np.pi * 1320 * t)) * env_ad(0.22, 0.003, 0.07)
    return finish(reverb(x, 0.2, 0.2, seed=5), 0.6)


def s_boost():
    up = sweep(180, 940, 0.42) * env_hold(0.42, 0.05, 0.2, 0.17)
    air = bp(noise(0.42), 1800, 2.6) * env_hold(0.42, 0.08, 0.16, 0.18)
    air = air * np.linspace(0.4, 1.0, n_samples(0.42))
    return finish(mix(up * 0.8, air * 0.9), 0.62)


def s_ko():
    fc = np.geomspace(1500, 180, n_samples(0.5))
    body = lp(noise(0.5), fc, 2) * env_ad(0.5, 0.002, 0.15, 3.0)
    fall = saw(0, 0) if False else sweep(420, 62, 0.42) * env_ad(0.42, 0.003, 0.12)
    thump = sweep(90, 38, 0.3) * env_ad(0.3, 0.002, 0.09)
    x = mix(body * 0.9, fall * 0.7, thump * 0.9)
    return finish(reverb(fit(x, 0.55), 0.3, 0.22, seed=13), 0.82)


def s_clank():
    x = np.zeros(n_samples(0.13))
    exc = noise(0.13) * env_ad(0.13, 0.0002, 0.002, 6.0)
    for f, q, g in ((1180, 70, 1.0), (1690, 60, 0.7), (2310, 55, 0.45)):
        x += resonator(exc, f, q) * g
    x *= env_ad(0.13, 0.0003, 0.035, 3.0)
    return finish(x, 0.55)


def s_alarm():
    seg = 0.1
    parts = []
    for i in range(4):
        f = 520 if i % 2 == 0 else 680
        parts.append(square(f, seg) * env_hold(seg, 0.006, seg * 0.7, seg * 0.2))
    x = lp(np.concatenate(parts), 2400, 1)
    return finish(x, 0.45)


def s_reload():
    def click(f, dur=0.012):
        return bp(noise(dur), f, 2.6) * env_ad(dur, 0.0002, 0.003, 5.0)

    a = click(3400)
    b = click(2300, 0.016)
    thunk = sweep(200, 120, 0.05) * env_ad(0.05, 0.001, 0.015)
    x = mix(a, np.pad(b, (n_samples(0.055), 0)), np.pad(thunk * 0.22, (n_samples(0.05), 0)))
    return finish(fit(x, 0.12), 0.5)


def s_explode():
    crack = hp(noise(0.02), 2600) * env_ad(0.02, 0.0004, 0.007, 5.0)
    fc = np.geomspace(2600, 170, n_samples(0.62))
    body = lp(noise(0.62), fc, 2) * env_ad(0.62, 0.003, 0.2, 3.0)
    sub = sweep(75, 40, 0.45) * env_ad(0.45, 0.003, 0.14)
    x = mix(crack * 0.7, body * 1.0, sub * 0.9)
    return finish(reverb(fit(x, 0.7), 0.4, 0.28, seed=17), 0.88)


def s_blast():
    crack = hp(noise(0.03), 2200) * env_ad(0.03, 0.0005, 0.01, 4.5)
    fc = np.geomspace(3000, 95, n_samples(1.2))
    body = lp(noise(1.2), fc, 3) * env_ad(1.2, 0.004, 0.42, 2.6)
    sub = sweep(62, 26, 0.9) * env_ad(0.9, 0.004, 0.3, 2.6)
    deb = np.zeros(n_samples(1.2))
    g = np.random.default_rng(91)
    for _ in range(26):
        i = n_samples(float(g.uniform(0.25, 1.0)))
        d = 0.03
        seg = bp(noise(d, seed=int(g.integers(1, 1 << 30))), 1100, 2.2) * env_ad(d, 0.0003, 0.008, 5.0)
        end = min(len(deb), i + len(seg))
        deb[i:end] += seg[: end - i] * float(g.uniform(0.15, 0.5))
    x = mix(crack * 0.7, body * 1.0, sub * 1.1, deb * 0.3)
    return finish(reverb(fit(x, 1.35), 0.8, 0.32, seed=23), 0.98)


def s_flak():
    crack = hp(noise(0.018), 1600) * env_ad(0.018, 0.0002, 0.005, 6.0)
    body = bp(noise(0.28), 900, 3.0) * env_ad(0.28, 0.001, 0.07, 3.5)
    ring = resonator(noise(0.28), 2400, 30) * env_ad(0.28, 0.0006, 0.04, 4.0)
    x = mix(crack * 1.0, body * 0.8, ring * 0.35)
    return finish(reverb(fit(x, 0.38), 0.3, 0.3, seed=29), 0.85)


def s_bombdrop():
    dur = 1.05
    t = t_axis(dur)
    vib = 1.0 + 0.012 * np.sin(2 * np.pi * 5.5 * t)
    x = sweep(1350, 360, dur) * vib
    x = bp(x, 800, 4.0, 1)
    amp = np.clip(np.linspace(0.0, 1.0, len(t)) * 2.2, 0, 1) * np.linspace(1.0, 0.75, len(t))
    air = bp(noise(dur), 2200, 2.0) * 0.12 * amp
    return finish(mix(x * amp, air), 0.62)


def s_bombhit():
    crack = hp(noise(0.03), 1800) * env_ad(0.03, 0.0006, 0.012, 4.0)
    fc = np.geomspace(2400, 70, n_samples(1.4))
    body = lp(noise(1.4), fc, 3) * env_ad(1.4, 0.005, 0.5, 2.4)
    sub = sweep(52, 21, 1.1) * env_ad(1.1, 0.005, 0.4, 2.2)
    earth = lp(noise(1.4), 90, 2) * env_ad(1.4, 0.02, 0.6, 2.0)
    x = mix(crack * 0.6, body * 0.95, sub * 1.2, earth * 0.8)
    return finish(reverb(fit(x, 1.55), 0.9, 0.34, seed=31), 1.0)


def s_ricochet():
    dur = 0.45
    t = t_axis(dur)
    wob = 1.0 + 0.06 * np.sin(2 * np.pi * 11 * t) + 0.03 * np.sin(2 * np.pi * 27 * t)
    x = sweep(2700, 850, dur) * wob
    x = bp(x, 1800, 3.0, 1) * env_ad(dur, 0.002, 0.16, 2.8)
    return finish(reverb(x, 0.25, 0.22, seed=37), 0.62)


def s_casing():
    out = np.zeros(n_samples(0.3))
    g = np.random.default_rng(101)
    for i, (delay, f) in enumerate(((0.0, 2350), (0.062, 3120), (0.108, 2680), (0.15, 3450))):
        exc = noise(0.05, seed=int(g.integers(1, 1 << 30))) * env_ad(0.05, 0.0002, 0.0015, 6.0)
        ping = resonator(exc, f, 60) * env_ad(0.05, 0.0003, 0.012, 4.0)
        j = n_samples(delay)
        end = min(len(out), j + len(ping))
        out[j:end] += ping[: end - j] * (0.9 ** i)
    return finish(out, 0.4)


def s_powerup():
    notes = (523.25, 659.25, 783.99, 1046.5)
    out = np.zeros(n_samples(0.55))
    for i, f in enumerate(notes):
        d = 0.28
        v = (np.sin(2 * np.pi * f * t_axis(d)) + 0.35 * saw(f, d)) * env_ad(d, 0.004, 0.09)
        v = lp(v, 4200, 1)
        j = n_samples(0.055 * i)
        end = min(len(out), j + len(v))
        out[j:end] += v[: end - j] * 0.8
    return finish(reverb(out, 0.35, 0.3, seed=41), 0.78)


def s_banner():
    swell = bp(noise(0.5), 900, 3.0) * np.linspace(0, 1, n_samples(0.5)) ** 2
    hit_t = 0.34
    stack = np.zeros(n_samples(0.42))
    for f, g in ((87.31, 1.0), (130.81, 0.7), (174.61, 0.5)):
        stack += saw(f, 0.42) * g
    stack = lp(stack, 1100, 2) * env_ad(0.42, 0.012, 0.13, 2.6)
    out = mix(swell * 0.5, np.pad(stack, (n_samples(hit_t), 0)))
    return finish(reverb(fit(out, 0.8), 0.45, 0.28, seed=43), 0.82)


def s_boss():
    dur = 1.3
    stack = np.zeros(n_samples(dur))
    for f, g in ((55.0, 1.0), (82.41, 0.75), (110.0, 0.55), (164.81, 0.3)):
        stack += saw(f, dur) * g
    fc = np.geomspace(400, 1400, n_samples(dur))
    stack = lp(stack, fc, 2) * env_hold(dur, 0.09, 0.55, 0.66)
    hit = lp(noise(0.5), np.geomspace(1800, 120, n_samples(0.5)), 2) * env_ad(0.5, 0.002, 0.16, 3.0)
    sub = sweep(58, 30, 0.7) * env_ad(0.7, 0.004, 0.22)
    x = mix(stack * 1.0, hit * 0.55, sub * 0.9)
    return finish(reverb(fit(x, 1.45), 0.85, 0.3, seed=47), 0.94)


def s_fanfare():
    seq = ((392.0, 0.0, 0.3), (523.25, 0.2, 0.3), (659.25, 0.4, 0.95))
    out = np.zeros(n_samples(1.5))
    for f, at, d in seq:
        v = np.zeros(n_samples(d))
        for k, g in ((1, 1.0), (2, 0.5), (3, 0.28), (4, 0.14)):
            v += np.sin(2 * np.pi * f * k * t_axis(d)) * g
        v = lp(v, 3200, 1) * env_hold(d, 0.018, d * 0.45, d * 0.5)
        j = n_samples(at)
        end = min(len(out), j + len(v))
        out[j:end] += v[: end - j] * 0.55
    return finish(reverb(out, 0.6, 0.3, seed=53), 0.88)


def s_pb():
    notes = ((1046.5, 0.0), (1318.5, 0.09), (1568.0, 0.18), (2093.0, 0.27))
    out = np.zeros(n_samples(1.15))
    for f, at in notes:
        d = 0.8
        v = (np.sin(2 * np.pi * f * t_axis(d)) + 0.3 * np.sin(2 * np.pi * f * 2.76 * t_axis(d)))
        v *= env_ad(d, 0.002, 0.22, 3.0)
        j = n_samples(at)
        end = min(len(out), j + len(v))
        out[j:end] += v[: end - j] * 0.5
    return finish(reverb(out, 0.7, 0.36, seed=59), 0.8)


def s_door():
    servo = saw(58, 0.55) * env_hold(0.55, 0.06, 0.34, 0.15)
    servo = lp(servo, 620, 2) * 0.5
    servo += bp(noise(0.55), 420, 2.0) * env_hold(0.55, 0.08, 0.3, 0.17) * 0.25
    slam_at = 0.52
    slam = lp(noise(0.6), np.geomspace(1400, 90, n_samples(0.6)), 2) * env_ad(0.6, 0.001, 0.16, 3.0)
    sub = sweep(80, 32, 0.5) * env_ad(0.5, 0.002, 0.15)
    clang = resonator(noise(0.4), 780, 45) * env_ad(0.4, 0.0006, 0.09, 3.5)
    hitmix = mix(slam * 0.9, sub * 1.0, clang * 0.35)
    x = mix(servo, np.pad(hitmix, (n_samples(slam_at), 0)))
    return finish(reverb(fit(x, 1.2), 0.6, 0.3, seed=61), 0.86)


def s_breaker():
    a = sweep(210, 130, 0.06) * env_ad(0.06, 0.0008, 0.018)
    b = sweep(130, 82, 0.12) * env_ad(0.12, 0.001, 0.035)
    mech = lp(noise(0.18), 700, 2) * env_ad(0.18, 0.0006, 0.03, 4.0)
    spark = hp(noise(0.04), 5000) * env_ad(0.04, 0.0002, 0.008, 5.0)
    x = mix(a * 0.9, np.pad(b, (n_samples(0.055), 0)) * 1.0, mech * 0.7,
            np.pad(spark, (n_samples(0.05), 0)) * 0.4)
    return finish(reverb(fit(x, 0.34), 0.25, 0.2, seed=67), 0.74)


def s_warn():
    seg = 0.11
    beep1 = square(880, seg) * env_hold(seg, 0.004, seg * 0.6, seg * 0.3)
    beep2 = square(860, seg) * env_hold(seg, 0.004, seg * 0.6, seg * 0.3)
    x = mix(beep1, np.pad(beep2, (n_samples(0.17), 0)))
    return finish(lp(fit(x, 0.32), 3000, 1), 0.45)


def s_rumble():
    dur = 1.9
    bed = lp(noise(dur), 120, 3)
    swell = np.clip(np.linspace(0, 1, n_samples(dur)) * 3.0, 0, 1) * np.exp(
        -2.2 * np.linspace(0, 1, n_samples(dur))
    )
    sub = sweep(38, 28, dur) * swell * 0.8
    return finish(mix(bed * swell * 1.0, sub), 0.66)


def s_splash():
    fc = np.geomspace(3000, 400, n_samples(0.35))
    body = lp(noise(0.35), fc, 2) * env_ad(0.35, 0.002, 0.1, 3.0)
    drops = np.zeros(n_samples(0.5))
    g = np.random.default_rng(103)
    for _ in range(6):
        i = n_samples(float(g.uniform(0.08, 0.42)))
        d = 0.06
        v = sweep(float(g.uniform(700, 1600)), float(g.uniform(1800, 2600)), d)
        v *= env_ad(d, 0.001, 0.014)
        end = min(len(drops), i + len(v))
        drops[i:end] += v[: end - i] * 0.3
    return finish(mix(fit(body, 0.5), drops), 0.62)


# -------------------------------------------------------------------- loops

LOOP_DUR = 2.0


def l_engine(rate, thump_f, bed_fc, bed_gain, ring_q=12, bright=0.0, seed=5):
    """Reciprocating engine: firing pulses + resonant body + filtered air bed.
    rate*LOOP_DUR must be an integer so the pulse grid wraps exactly."""
    gen = LOOP_DUR + 0.3
    pt = pulse_train(gen, rate, 0.005)
    body = resonator(pt, thump_f, ring_q) * 1.0 + lp(pt, thump_f * 3, 2) * 0.6
    bed = lp(noise(gen, seed=seed), bed_fc, 2) * bed_gain
    air = bp(noise(gen, seed=seed + 1), 2600, 2.0) * bright
    x = mix(body, bed, air)
    return finish(wrap_loop(x, LOOP_DUR), 0.62, fades=False)


def l_eng_tank():
    return l_engine(rate=22, thump_f=58, bed_fc=320, bed_gain=0.20, ring_q=9, bright=0.02, seed=11)


def l_eng_truck():
    return l_engine(rate=34, thump_f=86, bed_fc=520, bed_gain=0.16, ring_q=11, bright=0.05, seed=13)


def l_eng_prop():
    gen = LOOP_DUR + 0.3
    pt = pulse_train(gen, 40, 0.004)
    cyl = resonator(pt, 128, 14) * 1.0 + lp(pt, 420, 2) * 0.5
    drone = (saw(120, gen, 10) * 0.5 + saw(240.0, gen, 6) * 0.2)
    drone = lp(drone, 1500, 2) * 0.35
    t = np.arange(n_samples(gen)) / SR
    chop = 0.6 + 0.4 * np.sin(2 * np.pi * 40 * t)
    airbed = bp(noise(gen, seed=17), 1700, 2.4) * 0.22 * chop
    x = mix(cyl, drone, airbed)
    return finish(wrap_loop(x, LOOP_DUR), 0.6, fades=False)


def l_eng_hover():
    gen = LOOP_DUR + 0.3
    a = saw(90.0, gen, 8) * 0.5
    b = saw(91.5, gen, 8) * 0.4
    hum = lp(a + b, 900, 2)
    sub = np.sin(2 * np.pi * 45 * t_axis(gen)) * 0.4
    t = np.arange(n_samples(gen)) / SR
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * 3.0 * t)
    air = bp(noise(gen, seed=19), 2100, 2.2) * 0.18 * trem
    return finish(wrap_loop(mix(hum, sub, air), LOOP_DUR), 0.46, fades=False)


def l_mg():
    """Sustained MG at exactly MG_CD (0.11s), so 10 shots fill a 1.1s loop and
    the grid wraps precisely. A held trigger firing 9 identical one-shots a
    second reads as a robotic stutter and eats the voice cap; a loop does not.
    Per-shot jitter in tone and level keeps it from sounding stamped."""
    dur = 1.1
    gen = dur + 0.25
    n = n_samples(gen)
    out = np.zeros(n)
    g = np.random.default_rng(31337)
    k = 0
    while True:
        i = n_samples(k * 0.11)
        if i >= n:
            break
        d = 0.085
        body = bp(noise(d, seed=int(g.integers(1, 1 << 30))),
                  1500 * float(g.uniform(0.93, 1.07)), 2.4) * env_ad(d, 0.0008, 0.020, 4.0)
        crack = hp(noise(0.010, seed=int(g.integers(1, 1 << 30))), 4200) * env_ad(0.010, 0.0002, 0.0035, 5.0)
        sub = sweep(230, 120, 0.04) * env_ad(0.04, 0.001, 0.011)
        shot = mix(body, crack * 0.9, sub * 0.22) * float(g.uniform(0.85, 1.0))
        end = min(n, i + len(shot))
        out[i:end] += shot[: end - i]
        k += 1
    return finish(wrap_loop(out, dur), 0.6, fades=False)


def l_klaxon():
    """Two 0.5s tones = a 1.0s period, twice, so the file loops by construction."""
    seg = 0.5
    parts = []
    for i in range(4):
        f = 520 if i % 2 == 0 else 680
        v = square(f, seg) * env_hold(seg, 0.02, seg * 0.62, seg * 0.34)
        parts.append(v)
    x = lp(np.concatenate(parts), 2200, 1)
    return finish(fit(x, LOOP_DUR), 0.42, fades=False)


def l_rumble():
    gen = LOOP_DUR + 0.3
    bed = lp(noise(gen, seed=23), 130, 3)
    t = np.arange(n_samples(gen)) / SR
    und = 0.7 + 0.3 * np.sin(2 * np.pi * (1.0 / LOOP_DUR) * t)
    sub = np.sin(2 * np.pi * 33 * t_axis(gen)) * 0.5
    grit = lp(noise(gen, seed=29), 400, 2) * 0.12
    return finish(wrap_loop(mix(bed * und * 1.2, sub * und, grit), LOOP_DUR), 0.5, fades=False)


# ---------------------------------------------------------------- rendering

ONESHOTS = {
    "tap": s_tap, "fire": s_fire, "hit": s_hit, "hurt": s_hurt, "pickup": s_pickup,
    "score": s_score, "boost": s_boost, "ko": s_ko, "cannon": s_cannon, "clank": s_clank,
    "alarm": s_alarm, "reload": s_reload, "explode": s_explode, "blast": s_blast,
    "flak": s_flak, "bombdrop": s_bombdrop, "bombhit": s_bombhit, "ricochet": s_ricochet,
    "casing": s_casing, "powerup": s_powerup, "banner": s_banner, "boss": s_boss,
    "fanfare": s_fanfare, "pb": s_pb, "door": s_door, "breaker": s_breaker,
    "warn": s_warn, "rumble": s_rumble, "splash": s_splash,
}

LOOPS = {
    "eng-tank": l_eng_tank, "eng-truck": l_eng_truck, "eng-prop": l_eng_prop,
    "eng-hover": l_eng_hover, "mg-loop": l_mg, "klaxon-loop": l_klaxon, "rumble-loop": l_rumble,
}


def write_wav(path, x, rate=SR):
    d = np.clip(x, -1.0, 1.0)
    pcm = (d * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())


def halve(x):
    """Anti-aliased decimate by 2 -> 22.05k. Loop content is all below 8kHz,
    so this halves the PCM payload for no audible cost.

    The filter is pre-rolled over the signal's own tail. Filtering from zero
    state would attenuate the head differently from the settled tail and
    reopen the loop seam that wrap_loop just closed (it cost eng-hover a
    0.191 discontinuity against a 0.060 typical step: an audible 2s tick)."""
    k = 4096
    y = lp(np.concatenate([x[-k:], x]), 9000, 2)[k:]
    return y[::2]


def seam_report(name, x):
    """A loop is only seamless if the wrap from the last sample back to the
    first is no more discontinuous than the signal's own step size."""
    d = np.abs(np.diff(x))
    typical = float(np.percentile(d, 99))
    wrap = float(abs(x[0] - x[-1]))
    return f"{name}: wrap-step {wrap:.5f} vs p99 in-signal step {typical:.5f}"


def write_pack():
    """Bundle every rendered clip into one base64 JSON served as
    application/json: one request instead of 35, and nothing on the wire looks
    like a downloadable media file. Always packs the FULL set, so re-rendering
    a single name on the CLI still produces a complete pack."""
    import base64, json
    clips = {}
    for name in list(ONESHOTS) + list(LOOPS):
        ext = "wav" if name in LOOPS else "mp3"
        f = os.path.join(OUT_MP3, name + "." + ext)
        if not os.path.exists(f):
            print("  pack: MISSING " + name + "." + ext + ", skipped")
            continue
        with open(f, "rb") as fh:
            clips[name] = base64.b64encode(fh.read()).decode("ascii")
    os.makedirs(os.path.dirname(PACK_OUT), exist_ok=True)
    with open(PACK_OUT, "w", encoding="utf-8") as fh:
        json.dump({"v": 1, "clips": clips}, fh, separators=(",", ":"))
    print("")
    print("pack.json: %d clips, %.1f KB" % (len(clips), os.path.getsize(PACK_OUT) / 1024))



def main():
    only = set(sys.argv[1:])
    os.makedirs(OUT_WAV, exist_ok=True)
    os.makedirs(OUT_MP3, exist_ok=True)
    import imageio_ffmpeg

    ff = imageio_ffmpeg.get_ffmpeg_exe()

    total = 0
    rows = []
    seams = []
    for group, table in (("one-shot", ONESHOTS), ("loop", LOOPS)):
        for name, fn in table.items():
            if only and name not in only:
                continue
            x = fn()
            if group == "loop":
                seams.append(seam_report(name, x))
                out = os.path.join(OUT_MP3, name + ".wav")
                write_wav(out, halve(x), SR // 2)
            else:
                wav = os.path.join(OUT_WAV, name + ".wav")
                out = os.path.join(OUT_MP3, name + ".mp3")
                write_wav(wav, x)
                cmd = [ff, "-y", "-hide_banner", "-loglevel", "error", "-i", wav,
                       "-codec:a", "libmp3lame", "-q:a", "5", "-ac", "1", "-ar", str(SR), out]
                subprocess.run(cmd, check=True)
            size = os.path.getsize(out)
            total += size
            rows.append((group, name, round(len(x) / SR, 3), round(float(np.max(np.abs(x))), 3),
                         round(float(np.sqrt(np.mean(x ** 2))), 4), size))

    w = max(len(r[1]) for r in rows) + 1
    print(f"{'kind':9} {'name':{w}} {'sec':>6} {'peak':>6} {'rms':>7} {'bytes':>7}")
    for g, n, s, p, r, b in rows:
        print(f"{g:9} {n:{w}} {s:6.3f} {p:6.3f} {r:7.4f} {b:7d}")
    print(f"\n{len(rows)} files, {total/1024:.1f} KB total -> {OUT_MP3}")
    write_pack()


if __name__ == "__main__":
    main()
