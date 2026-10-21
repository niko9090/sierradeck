---
titolo: "Apri cartella: percorso visibile anche per chat col PIN (da decidere dopo la 0.82.0)"
quando: 2026-10-21T00:12:48.517Z
tag: ["autopilota"]
---

La revisione di c-37 ha notato che /api/file/cartella restituisce il percorso della cartella anche per una chat protetta dal PIN. Il contenuto dei file resta dietro il PIN e la rotta risponde solo a dispositivi già collegati. Per la 0.82.0 resta così. In una versione successiva si può nascondere anche il percorso finché il PIN non è inserito. Intanto il criterio «altri test» è diventato rosso dopo l'unione di c-38 (599852f9): va misurato sul commit di main, una suite alla volta, prima del rilascio (c-39).
