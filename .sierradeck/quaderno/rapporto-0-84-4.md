---
titolo: "Rapporto 0.84.4 (in preparazione)"
quando: 2026-10-23T11:00:00+02:00
tag: ["0.84.4", "rapporto", "release", "c-123"]
---

# Rapporto 0.84.4

**Stato:** in preparazione (c-123, 23/10). Non ancora pubblicata. Non verrà mai
installata da noi: l'installazione la avvia solo Nicholas.

La 0.84.3 è stata pubblicata il 23/10 alle 03:22 UTC e installata da Nicholas
alle 06:44 UTC. La 0.84.4 è una patch.

## Cosa c'è dentro

| Voce | Chat | Stato |
|---|---|---|
| La Revisione non respinge un ramo perché nella copia mancano i pacchetti (`node_modules`): controlla l'ambiente, rimette il collegamento per il tempo della misura e scrive «problema di ambiente». Mai domande a Nicholas. Test coi rami respinti 4-5 volte il 23/10 | c-119 | al lavoro |
| Le risposte di Nicholas alle domande delle chat di questo PC vengono prese davvero: esito «presa»/«non presa» su PC, pagina e app, una riga nel registro per ogni passaggio. Se la chat non aspetta più, la risposta va al supervisore. Test col caso vero («rifallo ancora» tre volte) | c-120 | al lavoro |
| Una chat il cui terminale non parte viene riaperta o sostituita da sola (guasto del 23/10 09:47 UTC) | c-121 | al lavoro |
| Prova di 2 ore del «mai fermo» rivista e unita, con i numeri qui sotto | c-122 | al lavoro (rivede e unisce anche i rami sopra) |

## Procedura di pubblicazione (da seguire in quest'ordine)

1. `git fetch`, controllare che nessun altro PC abbia già fatto un bump a 0.84.4.
2. Versione 0.84.4 in `package.json` sul commit di `main` che ha tutti i rami uniti.
3. Tag `v0.84.4` su quel commit, push del tag, poi `gh release create v0.84.4`
   (non bozza) **prima** di `npm run pubblica` (trappola della v0.84.2:
   `tag-prima-di-pubblicare.md`).
4. `GH_TOKEN=$(gh auth token) npm run pubblica`.
5. `latest.yml` controllato su `releases/latest` (versione, size e sha512 dell'exe).
6. `npm run allega-apk`: APK nuovo solo se `android/` è cambiato dalla v0.84.3,
   altrimenti si riallega l'APK 2.84.3; sempre `app-android.json`.

## APK

Da decidere dopo l'unione: `git diff --stat v0.84.3 main -- android/`.

## Rami di questo lavoro

Da riempire dopo l'unione (c-119, c-120, c-121, c-122, c-123).

## Prova di 2 ore senza fermate

Numeri da c-122.
