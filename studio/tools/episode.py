"""Episode audio pipeline.

    python tools/episode.py <episode_dir>

1. Generates each line with ElevenLabs (cached in <episode>/audio/, regenerated only when the text changes).
2. Places the lines on a timeline (trimmed silences, gaps), resolves word cues, shot cuts, subtitles, screen typing
   and what the whiteboard shows (images, or frames extracted from screen recordings into <episode>/cache/).
3. Writes <episode>/timeline.json (read by the renderer) and <episode>/mix.wav (voices + sound effects + bed).
"""
import base64
import json
import os
import re
import subprocess
import sys

import numpy as np

import el

SR = 44100
FPS = 30
VOICES = os.path.join(os.path.dirname(__file__), "..", "..", "voix", "voices.json")


def decode(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def tts(ep, script, cfg):
    os.makedirs(os.path.join(ep, "audio"), exist_ok=True)
    out = []
    for i, line in enumerate(script["lines"], 1):
        voice = cfg["voices"][line["who"]]["voice_id"]
        base = os.path.join(ep, "audio", f"{i:02d}_{line['who']}")
        meta = {"say": line["say"], "voice_id": voice, "model_id": cfg["model_id"], "language_code": cfg["language"]}
        cached = json.load(open(base + ".json", encoding="utf-8")) if os.path.exists(base + ".json") else {}
        if any(cached.get(k) != v for k, v in meta.items()) or not os.path.exists(base + ".mp3"):
            res = el.call("POST", f"/v1/text-to-speech/{voice}/with-timestamps", {"output_format": "mp3_44100_128"},
                          {"text": line["say"], "model_id": cfg["model_id"], "language_code": cfg["language"]})
            open(base + ".mp3", "wb").write(base64.b64decode(res["audio_base64"]))
            cached = {**meta, "alignment": res.get("alignment") or res.get("normalized_alignment")}
            json.dump(cached, open(base + ".json", "w", encoding="utf-8"), ensure_ascii=False)
            print(f"  tts {i:02d} {line['who']:<6} {line['say']}")
        out.append((base + ".mp3", cached["alignment"]))
    return out


def words_of(alignment):
    """Spoken words with times, the [tags] removed: [{w, start, end}]."""
    words, cur, depth = [], None, 0
    for ch, s, e in zip(alignment["characters"], alignment["character_start_times_seconds"],
                        alignment["character_end_times_seconds"]):
        if ch == "[":
            depth += 1
        if depth or ch.isspace():
            if cur:
                words.append(cur)
                cur = None
        else:
            cur = cur or {"w": "", "start": s, "end": e}
            cur["w"] += ch
            cur["end"] = e
        if ch == "]":
            depth = max(0, depth - 1)
    if cur:
        words.append(cur)
    return words


def norm(w):
    return re.sub(r"[^\w']", "", w.lower())


def voiced_bounds(x):
    """First and last sample above a loudness floor (ElevenLabs pads both ends with silence)."""
    hop = SR // 100
    rms = np.sqrt(np.convolve(x ** 2, np.ones(hop) / hop, mode="same"))[::hop]
    on = np.nonzero(rms > max(0.01, rms.max() * 0.05))[0]
    return on[0] * hop, (on[-1] + 1) * hop


def envelope(track, n_frames):
    """Loudness per video frame, 0..1 (~1 on stressed syllables)."""
    win = int(SR * 0.04)
    out = np.zeros(n_frames)
    for f in range(n_frames):
        c = int(f / FPS * SR)
        seg = track[max(0, c - win // 2): c + win // 2]
        out[f] = np.sqrt(np.mean(seg ** 2)) if len(seg) else 0
    voiced = out[out > 0.01]
    return np.clip(out / (np.percentile(voiced, 90) if len(voiced) else 1), 0, 1)


def typing_times(t0, text, cps):
    """One key press per character, with a slightly irregular human rhythm."""
    rng = np.random.default_rng(len(text))
    steps = (1 / cps) * rng.uniform(0.6, 1.4, len(text))
    steps[[i for i, c in enumerate(text) if c == " "]] *= 1.3
    return [round(t0 + float(s), 3) for s in np.concatenate([[0], np.cumsum(steps)[:-1]])]


# ------------------------------------------------------------------------------------------------ sound design

def noise(n, seed):
    return np.random.default_rng(seed).uniform(-1, 1, n)


def lowpass(x, cutoff):
    """One-pole low-pass; cutoff may be an array (sweeps)."""
    a = np.exp(-2 * np.pi * np.broadcast_to(cutoff, x.shape) / SR)
    y, acc = np.empty_like(x), 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def key_click(seed):
    n = int(SR * 0.035)
    t = np.arange(n) / SR
    rng = np.random.default_rng(seed)
    click = np.diff(noise(n + 1, seed)) * np.exp(-t * 260) * 0.5
    thock = np.sin(2 * np.pi * rng.uniform(150, 220) * t) * np.exp(-t * 90)
    return (click + thock * 0.5) * rng.uniform(0.6, 1.0)


def typing(seconds, cps=11):
    """A burst of key presses."""
    out = np.zeros(int(SR * (seconds + 0.1)))
    for k, t in enumerate(typing_times(0, "x" * int(seconds * cps), cps)):
        place(out, key_click(200 + k), t)
    return out


def cash():
    """Cash register "cha-ching"."""
    t = np.arange(int(SR * 1.0)) / SR
    cha = lowpass(noise(len(t), 3), 5000) * np.exp(-t * 40) * 0.6
    ching = sum(np.sin(2 * np.pi * f * np.clip(t - 0.08, 0, None)) * np.exp(-np.clip(t - 0.08, 0, None) * 5) * (t > 0.08)
                for f in (2637, 3136, 3951)) * 0.25
    return cha + ching


def ding():
    t = np.arange(int(SR * 0.9)) / SR
    return (np.sin(2 * np.pi * 1568 * t) * np.exp(-t * 6) + 0.6 * np.sin(2 * np.pi * 2093 * t) * np.exp(-t * 9)) * 0.5


def whoosh():
    n = int(SR * 0.5)
    t = np.arange(n) / SR
    env = np.sin(np.pi * t / t[-1]) ** 2
    return lowpass(noise(n, 7), 300 + 4000 * env) * env * 2.2


def pad(n):
    """Soft chord bed, Fmaj7 > Em7 > Dm7 > Cmaj7, 4 s each."""
    chords = [[174.61, 220.0, 261.63, 329.63], [164.81, 196.0, 246.94, 293.66],
              [146.83, 174.61, 220.0, 261.63], [130.81, 164.81, 196.0, 246.94]]
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(int(np.ceil(n / SR / 4)) + 1):
        w = np.clip(1 - np.abs(t - k * 4 - 2) / 2.6, 0, 1) ** 1.5  # overlapping chord windows
        for f in chords[k % 4]:
            for d in (0.997, 1.003):
                out += w * (np.sin(2 * np.pi * f * d * t) + 0.25 * np.sin(4 * np.pi * f * d * t))
    return lowpass(out, 900) / 8


def place(track, clip, t, gain=1.0):
    i = int(round(t * SR))
    if i >= len(track):
        return
    clip = clip[: len(track) - i]
    track[i: i + len(clip)] += clip * gain


def subtitle_text(ws):
    """French typography: no line break before ! ? : ; and thousands grouped (1120 -> 1 120)."""
    out = ""
    for w in ws:
        out += (" " if re.fullmatch(r"[!?:;»]+", w["w"]) else " ") + w["w"] if out else w["w"]
    return re.sub(r"\d{4,}", lambda m: f"{int(m.group()):,}".replace(",", " "), out)


def subtitle_chunks(words, max_chars=60):
    """Splits a line into subtitles (two rows at most): a new one after a sentence end, or before overflowing."""
    chunks, cur = [], []
    text = subtitle_text
    for w in words:
        if cur and len(text(cur + [w])) > max_chars and not re.fullmatch(r"[!?:;.…]+", w["w"]):
            chunks.append(cur)
            cur = []
        cur.append(w)
        if re.search(r"[.!?…]$", w["w"]) and len(text(cur)) >= 20:
            chunks.append(cur)
            cur = []
    if cur:
        chunks.append(cur)
    return [{"text": text(c), "start": c[0]["start"], "end": c[-1]["end"]} for c in chunks]


def board_timeline(ep, media, events, duration, sfx):
    """What the whiteboard shows over time. Videos are cut into JPEG frames (cached) for the renderer."""
    out = []
    for k, e in enumerate(events):
        spec = e["board"] if isinstance(e["board"], dict) else {"media": e["board"]}
        m = media[spec["media"]]
        if "image" in m:
            out.append({"t": e["t"], "image": m["image"]})
            continue
        start, speed = spec.get("from", 0), spec.get("speed", 1)  # speed > 1 plays the recording faster
        dur = (events[k + 1]["t"] if k + 1 < len(events) else duration) - e["t"]
        folder = f"cache/{spec['media']}_{start:.2f}_{dur:.2f}" + (f"_x{speed}" if speed != 1 else "")
        path = os.path.join(ep, folder)
        if not os.path.isdir(path):
            os.makedirs(path)
            subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-t", f"{(dur + 0.2) * speed:.2f}", "-i", os.path.join(ep, m["video"]),
                            "-vf", f"crop={m.get('crop', 'iw:ih:0:0')},scale=2048:-2,setpts=PTS/{speed},fps={FPS}", "-q:v", "3",
                            os.path.join(path, "%05d.jpg")], check=True)
        out.append({"t": e["t"], "frames": folder, "count": len(os.listdir(path))})
        if m.get("audio") and speed == 1:  # the recording's own sound (the game), faded in and out under the voices
            raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(start), "-t", f"{dur:.2f}", "-i", os.path.join(ep, m["video"]),
                                  "-f", "f32le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
            clip = np.frombuffer(raw, dtype=np.float32).copy()
            fade = min(len(clip) // 2, int(0.3 * SR))
            clip[:fade] *= np.linspace(0, 1, fade)
            clip[len(clip) - fade:] *= np.linspace(1, 0, fade)
            place(sfx, clip, e["t"], m["audio"])
    return out


# ------------------------------------------------------------------------------------------------ main

DIRECTION = ("toi", "claude", "toiLook", "claudeLook", "board", "pointer", "sfx", "card")
SFX = {"ding": (ding, 0.35), "cash": (cash, 0.4), "whoosh": (whoosh, 0.25), "typing": (lambda: typing(4.5), 0.18)}


def direction(d):
    return {k: d[k] for k in DIRECTION if k in d}


def main(ep):
    script = json.load(open(os.path.join(ep, "script.json"), encoding="utf-8"))
    cfg = json.load(open(VOICES, encoding="utf-8"))
    clips = tts(ep, script, cfg)

    # Shots and direction events (expressions, looks, screen) on the timeline. A line can have a shot
    # "before" it (during its gapBefore) and a reaction shot "then" after it.
    lines, shots, events, searches = [], [], [], []
    t, prev_end = 0.35, None
    for i, (line, (mp3, alignment)) in enumerate(zip(script["lines"], clips)):
        x = decode(mp3)
        a, b = voiced_bounds(x)
        a, b = max(0, a - int(0.04 * SR)), min(len(x), b + int(0.12 * SR))
        gap = line.get("gapBefore", script["gap"]) if i else 0
        t += gap
        offset = t - a / SR
        words = [{"w": w["w"], "start": round(w["start"] + offset, 3), "end": round(w["end"] + offset, 3)}
                 for w in words_of(alignment)]
        if "cut" in line:  # interrupted: the voice stops partway through a word ("expéri—"), the next line talks over it
            target = line["cut"]["word"]
            k, hit = next((k, w) for k, w in enumerate(words) if norm(w["w"]).endswith(norm(target)))  # "l'expérience."
            keep = line["cut"].get("keep", 0.5)
            stop = hit["start"] + (hit["end"] - hit["start"]) * keep
            b = min(b, int((stop - offset) * SR))
            letters = hit["w"].lower().rfind(target.lower()) + max(1, round(len(target) * keep))
            words = words[:k] + [{"w": hit["w"][:letters] + "—", "start": hit["start"], "end": round(stop, 3)}]
            x = x.copy()
            fade = int(0.012 * SR)
            x[b - fade:b] *= np.linspace(1, 0, fade)
        before = line.get("before")
        if before:
            pre = prev_end + 0.4
            shots.append({"name": before["shot"], "t": round(pre, 3)})
            events.append({"t": round(pre, 3), **direction(before)})
            if "search" in before:
                searches.append({"t": pre, **before["search"]})
        cut = t - min(0.12, gap / 2) if i else 0  # a few frames before the line
        shots.append({"name": line["shot"], "t": round(cut, 3)})
        events.append({"t": round(cut, 3), **direction(line)})
        for c in line.get("cues", []):
            hit = next(w for w in words if norm(w["w"]) == norm(c["word"]))
            if "shot" in c:  # cut inside the line, just before the word
                shots.append({"name": c["shot"], "t": round(hit["start"] - 0.08, 3)})
            events.append({"t": hit["start"], **direction(c)})
        end = t + (b - a) / SR
        if "then" in line:
            then = line["then"]
            shots.append({"name": then["shot"], "t": round(end + then.get("delay", 0.3), 3)})
            events.append({"t": round(end + then.get("delay", 0.3), 3), **direction(then)})
        lines.append({"who": line["who"], "text": " ".join(w["w"] for w in words), "start": round(t, 3),
                      "end": round(end, 3), "words": words, "subs": subtitle_chunks(words), "_audio": x[a:b],
                      **({"punch": True} if line.get("punch") else {})})
        prev_end = t = end
    shots.sort(key=lambda s: s["t"])
    shots = [s for k, s in enumerate(shots) if k == 0 or s["name"] != shots[k - 1]["name"]]  # same shot continues
    events.sort(key=lambda e: e["t"])
    duration = round(t + script["tail"], 3)
    n = int(duration * SR) + 1
    n_frames = int(np.ceil(duration * FPS))

    voices = {"toi": np.zeros(n), "claude": np.zeros(n)}
    for ln in lines:
        place(voices[ln["who"]], ln.pop("_audio"), ln["start"])

    # Screen: typing the fix on a "screen: fix" cue, typing a search query when a search shot starts.
    sfx, screen = np.zeros(n), [{"t": 0, "mode": "code"}]
    for e in events:
        if e.get("screen") == "fix":
            times = typing_times(e["t"], ");", 9)
            screen.append({"t": e["t"], "mode": "code", "typed": ");", "times": times, "fixedAt": round(times[-1] + 0.18, 3)})
            for k, tt in enumerate(times):
                place(sfx, key_click(k), tt, 0.2)
            place(sfx, ding(), times[-1] + 0.18, 0.35)
    for s in searches:
        times = typing_times(s["t"] + 0.35, s["query"], 24)
        screen.append({"t": round(s["t"], 3), "mode": "search", "query": s["query"], "times": times,
                       "suggestions": s.get("suggestions", [])})
        for k, tt in enumerate(times):
            place(sfx, key_click(100 + k), tt, 0.13)
        place(sfx, whoosh(), s["t"] - 0.25, 0.25)
    screen.sort(key=lambda e: e["t"])

    for e in events:
        if e.get("sfx"):
            make, gain = SFX[e["sfx"]]
            place(sfx, make(), e["t"], gain)
    board = board_timeline(ep, script.get("media", {}), [e for e in events if "board" in e], duration, sfx)

    speech = voices["toi"] + voices["claude"]
    mix = speech + sfx + pad(n) * 0.05
    mix *= 0.9 / np.abs(mix).max()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-",
                    os.path.join(ep, "mix.wav")], input=mix.astype(np.float32).tobytes(), check=True)

    timeline = {
        "fps": FPS, "duration": duration, "frames": n_frames, "lines": lines, "shots": shots, "events": events,
        "set": script.get("set", "salon"), "screen": screen, "board": board,
        "env": {who: [round(float(v), 3) for v in envelope(trk, n_frames)] for who, trk in voices.items()},
    }
    json.dump(timeline, open(os.path.join(ep, "timeline.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for sh in shots:
        print(f"  {sh['t']:6.2f}  plan {sh['name']}")
    for ln in lines:
        print(f"  {ln['start']:6.2f}-{ln['end']:6.2f}  {ln['who']:<6} {ln['text']}")
    print(f"  durée {duration:.2f} s, {n_frames} images -> timeline.json, mix.wav")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(os.path.abspath(sys.argv[1]))
