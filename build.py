"""Arma index.html a partir de src/app.html + src/dsp.js.
Uso: python build.py"""
from pathlib import Path
raiz = Path(__file__).parent
app = (raiz / "src" / "app.html").read_text(encoding="utf-8")
dsp = (raiz / "src" / "dsp.js").read_text(encoding="utf-8")
assert "/*DSP*/" in app, "Falta el marcador /*DSP*/ en src/app.html"
(raiz / "index.html").write_text(app.replace("/*DSP*/", dsp), encoding="utf-8")
print("index.html generado")
