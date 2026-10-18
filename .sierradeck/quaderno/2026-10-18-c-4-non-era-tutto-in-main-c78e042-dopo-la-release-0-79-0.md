---
titolo: "c-4 non era tutto in main: c78e042 dopo la release 0.79.0"
quando: 2026-10-18T06:39:47.096Z
tag: ["autopilota"]
---

18/10: c-3 aveva scritto che c-4 era già tutto in main, ma git log main..ap/ap-f1e631f5/c-4 mostra il commit c78e042 (08:35), con correzioni alla gestione delle chat in Android, pagina e PC, più i test. Non è nella release v0.79.0 (06:31 UTC). La Revisione c-6 lo sta controllando; se si unisce, va in una 0.79.1. Trappola: prima di scrivere «già unito», controllare sempre con git log main..<ramo>.
