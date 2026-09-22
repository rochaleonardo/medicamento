import json
import re
import struct
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"

class Inspector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=[]; self.labels=[]; self.inputs=[]; self.refs=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if "id" in a: self.ids.append(a["id"])
        if tag=="label" and "for" in a: self.labels.append(a["for"])
        if tag in ("input","textarea","select") and "id" in a: self.inputs.append(a["id"])
        if tag in ("script","link"):
            ref=a.get("src") or a.get("href")
            if ref and not ref.startswith(("data:","http:","https:","#")): self.refs.append(ref)

html=(DIST/"index.html").read_text(encoding="utf-8")
parser=Inspector(); parser.feed(html)
assert len(parser.ids)==len(set(parser.ids)), "Há IDs HTML duplicados"
for ref in parser.refs:
    assert (DIST/ref).exists(), f"Recurso local ausente: {ref}"

manifest=json.loads((DIST/"manifest.json").read_text(encoding="utf-8"))
assert manifest["display"]=="standalone"
assert manifest["orientation"]=="portrait-primary"
assert manifest["start_url"]=="./" and manifest["scope"]=="./"
assert {i["sizes"] for i in manifest["icons"]} >= {"192x192","512x512"}
for icon in manifest["icons"]:
    assert (DIST/icon["src"]).exists(), f"Ícone ausente: {icon['src']}"

def png_size(path):
    data=path.read_bytes()
    assert data[:8]==b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II",data[16:24])

assert png_size(DIST/"icons/icon-192.png")== (192,192)
assert png_size(DIST/"icons/icon-512.png")== (512,512)
assert png_size(DIST/"icons/apple-touch-icon.png")== (180,180)

sw=(DIST/"service-worker.js").read_text(encoding="utf-8")
shell=re.search(r"const APP_SHELL = \[(.*?)\];",sw,re.S).group(1)
cached=re.findall(r'"\./([^"?]*)"',shell)
for ref in cached:
    if ref: assert (DIST/ref).exists(), f"Arquivo do cache ausente: {ref}"
assert "SKIP_WAITING" in sw and "caches.delete" in sw and "index.html" in sw

app=(DIST/"app.js").read_text(encoding="utf-8")
required=["indexedDB.open","exportCSV","exportJSON","importJSON","confirmDeleteAll","drawLineChart","baselineId","beforeinstallprompt","controllerchange"]
for token in required: assert token in app, f"Função essencial ausente: {token}"
assert app.count('["attention"')==1
assert len(re.findall(r'\["(?:insomnia|sleepiness|nausea|dryMouth|appetite|headache|dizziness|tingling|palpitations|anxiety|sweating|constipation)"',app))>=12

assert (ROOT/"README.md").exists()
print("VALIDAÇÃO OK: HTML, recursos, manifesto, ícones, cache offline, armazenamento, exportação, restauração e documentação.")
