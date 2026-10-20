---
titolo: "Rilascio 0.81.0 (c-19): in attesa, il lavoro non è ancora in main"
quando: 2026-10-20T19:00:00+02:00
tag: ["rilascio", "0.81.0", "autopilota"]
---

Consegna c-220 a c-19: rilasciare la 0.81.0 «quando tutto il resto è verde».
Al 20/10 sera **non lo è**: `main` è a 6297a3f (versione 0.80.1) e questi rami
hanno lavoro della 0.81.0 non ancora unito (commit di pochi minuti prima):

| ramo | cosa porta |
|---|---|
| c-3  | storico errori + «Errori arrivati» (9105e8a) |
| c-14 | stesso storico errori + **un altro** «Errori arrivati» (55c1056, 9051a6b) |
| c-10 | notifiche solo utili + righe brevi per gli eventi che contano |
| c-17 | le stesse notifiche di c-10 (c05ca0f) |
| c-12 | riquadro «Adesso» e «Hai risposto» su PC, pagina e app |

**Trappola:** c-3 e c-14 hanno fatto due volte «Errori arrivati» partendo dagli
stessi commit dello storico errori. Prima del rilascio se ne deve tenere uno
solo, sennò l'unione va in conflitto o il lavoro parte due volte.

Quindi non ho alzato la versione e non ho pubblicato niente. Quando i rami sono
uniti e i quattro controlli dei criteri sono verdi in `main`, il rilascio segue
`pubblicare-una-release.md`: git fetch, novità in `src/shared/novita.ts` solo
su quello che c'è davvero, `npm run allega-apk` (l'app è passata a 2.81.0 con
c-3, quindi l'APK va ricompilato), bozza → `--draft=false --latest`, verificare
latest.yml e app-android.json. Mai installare.

Da scrivere nel rapporto, in attesa di Nicholas: «Chat delle prove» sul Drive,
cartella prova-c2 su DESKTOP, testo sbagliato del portatile («questa chat là
non è aperta»).
