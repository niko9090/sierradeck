---
titolo: "Rapporto 0.84.4 (in preparazione)"
quando: 2026-10-23T13:00:00+02:00
tag: ["0.84.4", "rapporto", "release", "c-123", "c-122"]
---

# Rapporto 0.84.4

**Stato:** in preparazione (c-123, 23/10). Non ancora pubblicata. Non verrà mai
installata da noi: l'installazione la avvia solo Nicholas.

La 0.84.3 è stata pubblicata il 23/10 alle 03:22 UTC e installata da Nicholas
alle 06:44 UTC. La 0.84.4 è una patch.

## Cosa c'è dentro

| Voce | Chat | Stato |
|---|---|---|
| La Revisione non respinge un ramo perché nella copia mancano i pacchetti (`node_modules`): controlla l'ambiente, rimette il collegamento per il tempo della misura e scrive «problema di ambiente». Mai domande a Nicholas. Test coi rami respinti 4-5 volte il 23/10 | c-119 | **unito** (rivisto da c-122) |
| Le risposte di Nicholas alle domande delle chat di questo PC vengono prese davvero: esito «presa»/«non presa» su PC, pagina e app, una riga nel registro per ogni passaggio. Se la chat non aspetta più, la risposta va al supervisore. Test col caso vero («rifallo ancora» tre volte) | c-120 | **unito**, con la correzione di c-122 sotto |
| Una chat il cui terminale non parte viene riaperta o sostituita da sola (guasto del 23/10 09:47 UTC) | c-121 | **unito**, con le correzioni di c-122 sotto |
| Prova di 2 ore del «mai fermo» rivista e unita, con i numeri qui sotto | c-122 | prova in corso (sotto); rami rivisti |

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

**Serve un APK nuovo.** `git diff --stat v0.84.3 -- android/` sul ramo c-122
(23/10): 2 file, `SchedaDomandaVista.kt` e `SceltaSpiegataTest.kt`. È la
correzione della Revisione di c-95, «Ti scrivo io cosa provare» che apre il
campo. Le tre voci della 0.84.4 non toccano `android/`: l'app mostra già
«Presa», «Non presa» e «Ricevuta: la sto portando», perché le legge dal campo
`chat` di `/autopiloti/:id`. È la stessa `conversazione(a)` del PC e della
pagina (`client-rotte.ts:1569`), e il dettaglio della risposta si vede in
`PartiAutopilota.kt:339`.

## Release (c-942)

**Preparata, non pubblicata** (23/10, 11:15 UTC), sul ramo `ap/ap-f1e631f5/c-942`, commit `44ed0e43`:
- `git fetch`: main locale avanti a `origin/main` senza divergenze. Nessun altro PC ha fatto il bump.
- `package.json` 0.84.4. `package-lock.json` è fermo a 0.77.0 da mesi e non si tocca.
- App 2.84.4, versionCode 143. `npm run allega-apk -- --solo-verifica`: APK release firmato
  «CN=Nicholas Ferrari, O=Ferrari Consulenze», non debug.
- Voce 0.84.4 in `src/shared/novita.ts`: sono anche le note della release e di `app-android.json`.
  La riga «Provato per 2 ore senza fermate» resta solo se la prova finisce con 0 fermate.
- Misure sul ramo: TypeScript senza errori; principale 1949 verdi (2 saltati); servizio, renderer,
  condivisi e pty 3187 verdi; Android `testDebugUnitTest assembleDebug` riuscito; Kotlin sotto 800
  righe; guardia delle cancellazioni pulita.

**Si pubblica solo dopo i numeri finali della prova qui sotto, uniti in main.** Ordine: fetch → unione
del ramo c-942 → tag → `gh release create` → `npm run pubblica` → `latest.yml` → `npm run allega-apk`
→ non in bozza. Mai installata da noi.

## Rami di questo lavoro

Piano e pre-revisione: `piano-unione-0-84-4.md`.

| Ramo | Cosa | Scelta |
|---|---|---|
| c-119 (`a214afd0`) | ambiente della copia: `ambiente-copia.ts`, junction temporanea, «problema di ambiente» invece di «il ramo rompe» | **unito** prima nel ramo c-122 (`326be090`), poi in main. Rivisto: la junction si toglie con `unlinkSync` (provato su Windows: i file veri restano), i difetti veri (`TS2307` su un file del ramo) restano del ramo |
| c-121 (`9f9af3d9`) | chat il cui terminale non nasce: `non-nata.ts` | **unito in main dall'autopilota** (`4b5edc30`) prima della revisione di c-122. La revisione ha trovato due difetti, corretti da c-122 in `c54fbcd7`. 1) Una copia sparita dal disco ma ancora registrata in git non si rimetteva (`worktree add` rifiuta): adesso `creaWorktree` fa `git worktree prune` prima. Test con git vero, rosso senza la correzione. 2) Se la copia non si rimetteva, la chat nuova lavorava nella cartella principale, contro la regola del 19/10: adesso una riga a Nicholas, nessuna domanda e nessuna chat. Il terzo punto del piano, il nome della copia uguale a quello della chat nuova, era già giusto: tutti e due sono `c-${chats.length+1}` sullo stesso autopilota |
| c-120 (`1cf9d85a`, unione `a9c82ddc`) | risposte di Nicholas prese davvero: `risposte-in-viaggio.ts` | **unito in main dall'autopilota** (`c0ce4263`). Il conflitto previsto su `/consegne/esito` non era di testo ma di logica: una risposta a una chat non nata si riconsegnava alla chat vecchia, già chiusa. Corretto da c-122 in `c54fbcd7`: prima si sostituisce la chat, poi la risposta va alla chat che ha il suo compito (segue `sostituisce`); se nessuna chat aspetta, va al supervisore. Test: «rifallo ancora» tre volte con una riga per passaggio (3 arrivate, 3 in viaggio, 3 prese), non nata più risposta, nessuna chat che aspetta |
| c-118 | Revisione del ramo di c-98, che non c'è più; terminale mai partito | **chiusa dal supervisore senza unire**: superata. È proprio il caso che c-121 ora chiude da solo |
| c-123 | release 0.84.4 | **chiusa prima di pubblicare** (23/10): nessun tag `v0.84.4`, nessuna release su GitHub. La release è da rifare con una chat nuova, dopo la prova |
| c-122 | revisione e unione, prova di 2 ore | unito a ogni turno (`c54fbcd7` e `cc3d2ca3` in main con `c832824a`) |

Misure sul ramo c-122 dopo le tre unioni e le correzioni (`c54fbcd7`, 23/10):
- TypeScript: nessun errore;
- programma principale: 1949 test verdi, 2 saltati;
- servizio, renderer, condivisi e pty: 3187 verdi;
- Android: `testDebugUnitTest assembleDebug` riuscito, 450 test unitari, 0 falliti;
- Kotlin: nessun file oltre le 800 righe;
- guardia delle cancellazioni pulita.

## Prova di 2 ore senza fermate

Stesso metodo della 0.84.3 (`prova-due-ore-mai-fermo.md`):
- `creaServer` vero e orologi veri;
- riavvio del servizio a metà;
- 4 chat simulate con seme fisso;
- dati di prova (`SIERRADECK_PROVA`) e porta 47683.

Mai il servizio vero, mai «Installa».

- Giro di fumo di 3 minuti sul codice `c54fbcd7`: pulito (0 minuti fermi, 0 doppioni).
- **Prova vera partita alle 2026-10-23T10:40:24Z** sullo stesso codice, cioè con
  c-119, c-120 e c-121 dentro e le correzioni di c-122.

### Numeri

| Misura | Valore |
|---|---|
| Durata | _in arrivo_ |
| Minuti con lavoro da finire e nessuna chat al lavoro (tratto più lungo) | _in arrivo_ |
| Tratti oltre 15 minuti | _in arrivo_ |
| Chat muta più a lungo | _in arrivo_ |
| Doppioni | _in arrivo_ |
| Giri da soli (e quanti dicono «apro» senza aprire) | _in arrivo_ |
| Chat riprese / sostituite / messe da parte | _in arrivo_ |
| «Finito» con chat aperte | _in arrivo_ |
| Risposte prese / non prese | **non misurate dalla prova**: le chat simulate non fanno domande e il PC simulato non manda esiti di consegna. Le coprono i test di servizio: `risposte-prese-0-84-4.test.ts` (8 casi, «rifallo ancora» tre volte compreso) e `non-nata-0-84-4.test.ts` (15 casi). Allargare la prova a domande e terminali che non nascono è una cosa da fare dopo, non in questa release |
