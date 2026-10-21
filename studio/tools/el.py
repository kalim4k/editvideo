"""Minimal ElevenLabs client. Reads the key from the project .env, never prints it."""
import json
import sys
import urllib.parse
import urllib.request

ENV = r"C:\Users\SURFACE\CLAUDE VIDEO EDIT\.env"
BASE = "https://api.elevenlabs.io"


def key():
    for line in open(ENV, encoding="utf-8-sig"):
        if line.strip().startswith("ELEVENLABS_API_KEY"):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("ELEVENLABS_API_KEY missing in .env")


def call(method, path, params=None, body=None, raw=False):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("xi-api-key", key())
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            out = r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(f"HTTP {e.code} on {path}: {e.read().decode(errors='replace')[:500]}")
    return out if raw else json.loads(out)


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sub = call("GET", "/v1/user/subscription")
    print("tier:", sub.get("tier"), "| chars used:", sub.get("character_count"), "/", sub.get("character_limit"),
          "| can clone:", sub.get("can_use_instant_voice_cloning"), "| voice slots:", sub.get("voice_slots_used"), "/", sub.get("voice_limit"))
    print("\nMODELS")
    for m in call("GET", "/v1/models"):
        if m.get("can_do_text_to_speech"):
            langs = [l["language_id"] for l in m.get("languages", [])]
            print(f"  {m['model_id']:<28} fr={'fr' in langs}  {m.get('name')}")
    print("\nACCOUNT VOICES")
    for v in call("GET", "/v2/voices", {"page_size": 100})["voices"]:
        lab = v.get("labels") or {}
        print(f"  {v['voice_id']}  {v['name'][:40]:<40} {v.get('category')}  {lab.get('gender','')} {lab.get('age','')} {lab.get('accent','')}")
