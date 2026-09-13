---
titolo: "Mandato 2 per l'autopilota: controllo completo di TUTTO il programma, dialogo con gli autopiloti, difetti lasciati aperti (2026-09-14)"
quando: 2026-09-14T00:30:00+02:00
tag: ["autopilota", "mandato", "controllo", "dialogo", "telefono", "aggiornamenti"]
---

# Chi sei e cosa devi fare

Sei l'autopilota di SierraDeck che lavora sul codice di SierraDeck stesso
(`E:\Users\nikof\Documents\SierraDeck`, branch `main`). Il primo mandato
(`mandato-controllo-completo-2026-09-13.md`, rapporto in
`rapporto-autopilota-2026-09-13.md`) ha corretto i quattro difetti sul
Drive e le chat, ma il controllo del resto del programma è stato **parziale**.
Nicholas (2026-09-14): «hai controllato tutto in generale o solo quel
problema? istruisci l'autopilota per fare tutto quello che ho chiesto».
Questo mandato è il controllo completo, davvero, di tutto il programma, più
una funzione che Nicholas vuole. Leggi prima questo file per intero, poi il
rapporto del primo mandato (sezione 4: difetti trovati e non corretti), poi
le schede del quaderno man mano che tocchi un'area.

Il rapporto finale va in `.sierradeck/quaderno/rapporto-autopilota-2-2026-09-14.md`
con le stesse sei sezioni del primo (Cosa ho trovato, Cosa ho cambiato,
Cosa ho controllato e va bene, Difetti trovati e NON corretti, Cosa deve
fare Nicholas, Cose lasciate aperte).

# Parte A — Dialogare con l'autopilota fuori dalla chat (funzione nuova)

Nicholas: «quando uso gli autopiloti devo poter dialogare con loro, non
nella chat, perché è lui che deve portare a termine il compito». Oggi
esiste `POST /autopiloti/:id/parla` (`src/autopilot-host/server.ts`,
`chiediCambio`) e la casella «digli cosa cambiare, a parole» in
`src/renderer/components/SchedaAutopilota.tsx`: serve a cambiare obiettivo
e criteri, non a conversare. Deve diventare un **dialogo vero**:

- Nicholas scrive un messaggio all'autopilota (dalla scheda sul PC e dal
  telefono, pagina servita `src/main/client-pagina.ts` + rotte
  `src/main/client-rotte.ts` + app Android `android/…/Autopiloti.kt` o dove
  stanno oggi gli autopiloti); l'autopilota risponde con parole sue (tramite
  il supervisore, `deps.interroga`, con il contesto: obiettivo, criteri,
  diario, ultimo messaggio della chat governata) e, se il messaggio è
  un'istruzione, la applica (cambio di obiettivo/criteri, un compito in
  più, «fermati», «riprendi», «spiegami dove sei») e la consegna nella chat
  governata al momento giusto (quando la chat aspetta, non mentre lavora:
  vedi `autopilota-domande.md` e la logica di consegna in `server.ts`).
- La conversazione resta salvata nell'archivio dell'autopilota
  (`src/autopilot-host/archivio.ts`, campo nuovo, con migrazione per i
  vecchi) e si vede nella scheda, nel diario e sul telefono, distinta dalla
  chat governata.
- La chat governata NON è il posto dove Nicholas scrive: se scrive lì, il
  programma non deve rompersi, ma la strada consigliata è la scheda.
- Testi UI completi (regola di Nicholas): la scheda spiega cosa succede a un
  messaggio, quando arriva alla chat, cosa non fa.
- **Un difetto da capire e correggere prima**: il primo mandato è stato
  consegnato nella chat di Claude Code che Nicholas stava già usando in
  quella cartella (sessione `ffea9ea8-…`), non in una chat nuova
  dell'autopilota; `suStop` in `server.ts` lega `sessionId` alla prima chat
  che manda un hook con `?ap=<id>`. Ricostruisci come è potuto succedere
  (chi ha lanciato quella chat con le impostazioni dell'autopilota? la
  consegna ha scelto un riquadro esistente nella stessa cartella?
  `destinazioni-autopilota.ts`, `consegne-autopilota.ts`, `nel-mosaico.ts`,
  `src/main/index.ts` `client:apri` con `autopilota`) e fai in modo che un
  autopilota apra SEMPRE una chat sua, nuova, nel workspace da cui è stato
  avviato (o in quello attivo se creato dall'API senza workspace), mai
  quella di una persona. Scrivi una scheda nel quaderno.

# Parte B — Il controllo completo, area per area

Per ogni area: leggi il codice (non i commenti), verifica il percorso
completo di ogni sospetto, correggi ciò che è senza rischio, descrivi il
resto nel rapporto con file:riga, scenario, causa, correzione proposta,
rischio. Aree, tutte, in quest'ordine:

1. **Avvio e chiusura** (`src/main/index.ts`): `before-quit`, riavvio
   automatico, tetto dei 45 s, cosa succede se il PTY host non risponde,
   se il DB è bloccato, se `%APPDATA%` è su un disco lento.
2. **Aggiornamenti** (`aggiornamenti.ts`, `pausa-aggiornamento.ts`,
   `finestra-aggiornamento.ts`, `updater/`, `apk-disponibile.ts`): i due
   percorsi (finestra / silenzioso alla chiusura), l'attesa della quiete e
   del lavoro Drive, cosa vede l'utente in ogni fase, cosa succede se
   SierraDeck Update non parte, se l'installer fallisce, se la rete cade a
   metà download.
3. **Drive e sincronizzazione** (`src/main/cassaforte/*`): rileggi il
   rapporto 1 sezione 4 e correggi i punti 1 (ripristino completo e file
   per-PC: copia di sicurezza delle impostazioni) e 2 («Togli il workspace
   dal Drive»); valuta il punto 3 (stessa chat sotto due slug) e il 4
   (sessioni observer di claude-mem: escluderle dall'elenco e dal Drive, o
   sezione a parte — proponi, e se è chiaro fallo). Gare fra timer
   (auto-save 5/15 min, ronda 30 s, ricerca aggiornamenti 6 h) e lavori
   esclusivi; OAuth e token scaduti; `google-drive.ts` con 404/429/5xx;
   cosa vede l'utente quando il Drive è scollegato.
4. **Progetti** (`src/main/progetti/*`): registro, presenza/testimone,
   ronda, cartella-di-chat, rimappa-di-massa: cambiare la cartella dei
   progetti a programma avviato, un progetto tolto dal Drive mentre l'altro
   PC lo sta ripristinando, due PC con lo stesso nome.
5. **Chat e terminali** (`src/main/ipc.ts`, `src/pty-host/*`,
   `src/renderer/components/Terminal.tsx`, `aggancio.ts`, `pty-bus.ts`):
   spawn che fallisce (cartella, comando `claude` assente, versione
   vecchia), riaggancio dopo ricaricamento, chat >1 h, chiusura di una chat
   con processo vivo, `--resume` a vuoto.
6. **Workspace e layout** (`src/renderer/state/layout.ts`,
   `persistenza-layout.ts`, `workspace-azioni.ts`, `src/main/ipc.ts`
   workspace): rinomina, elimina, due finestre, preset, chat cedute fra
   finestre, `unaChatUnWorkspace`.
7. **Indice delle chat** (`src/main/indexer/*`, `db.ts`): file corrotti,
   uuid doppi sotto due slug (dopo la rimappatura), prestazioni con 1500+
   file, «Rileggi».
8. **Telefono**: pagina servita + rotte + app Android, parità funzione per
   funzione (elenco, chat, scelte, coda, Drive, autopiloti, aggiornamenti,
   impostazioni). Ogni correzione su ENTRAMBI i lati. Se `android/` cambia,
   NON compilare: dillo nel rapporto.
9. **Servizio autopiloti** (`src/autopilot-host/*`): oltre alla Parte A,
   ripresa dopo riavvio, domande scadute, flotta (tettoChat > 1), criteri
   con bash sbagliata (`autopilota-criteri-e-bash.md`), Telegram.
10. **Negozio, quaderno, impostazioni, registro** (`src/main/negozio/*`,
    `registro.ts`, preferenze): errori visibili, testi che promettono cose
    che il codice non fa.
11. **Promesse senza catch**, scritture non atomiche, migrazioni dei file
    di stato, percorsi Windows vs slug, stringhe UI incoerenti: un giro con
    grep su tutto `src/`.

# Regole di lavoro (di Nicholas, non negoziabili)

- Typecheck a 0 (`npm run -s typecheck`) e suite verde
  (`npx vitest run > file 2>&1`, poi la riga in chiaro `Tests N passed` del
  reporter `tests/riepilogo-semplice.ts`; mai in pipe) prima di ogni commit.
- Test per ogni funzione pura nuova; testi UI completi; ogni correzione al
  telefono su entrambi i lati; schede nel quaderno (una per argomento,
  intestazione YAML `titolo`, `quando`, `tag`), aggiornando quelle esistenti.
- Commit locali, uno per tema, messaggi in italiano nello stile del repo,
  ognuno che finisce con
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` e
  `Claude-Session: https://claude.ai/code/session_01P8j5iNp8ypXAkqLvrqjQx`.
- NON cambiare `package.json`, NON compilare l'APK, NON pubblicare, NON
  fare push, NON riavviare SierraDeck, NON toccare `%APPDATA%\sierradeck`.
  Le funzioni nuove vanno in `src/shared/novita.ts` come versione `0.27.0`
  in cima; le correzioni nella stessa voce.
- Per patch multi-riga usa script Python scritti con il tool Write.
- Lavora nella TUA chat: se scopri di essere dentro una chat che non è la
  tua (una conversazione con storia di un'altra persona), fermati e dillo
  nel rapporto.

# Il rapporto

`.sierradeck/quaderno/rapporto-autopilota-2-2026-09-14.md`, sei sezioni
come sopra, committato. Il mandato è finito quando: Parte A fatta e
provata, tutte le 11 aree della Parte B passate (nel rapporto ogni area ha
la sua voce: cosa hai guardato, cosa hai trovato, cosa hai fatto),
typecheck a 0, suite verde, tutto committato.
