---
titolo: "«Nicholas partecipe» (0.81.0): la prova dal vero nella copia, e come rifarla senza far lavorare chat vere"
quando: 2026-10-20T08:55:00Z
tag: ["0.81.0", "partecipe", "prove", "copia di prova", "autopilota"]
---

Consegna c-213 (20/10). I pezzi li hanno fatti tre chat diverse:
- c-13: nessuna domanda ripetuta, sempre in italiano;
- c-12: «Adesso» e «Hai risposto»;
- c-10: righe degli eventi, chat muta detta entro 5 minuti.

c-16 li ha provati **insieme**, nella copia di prova. La divisione del lavoro è in `2026-10-20-partecipe-chi-fa-cosa.md` (cartella principale).

# Come si rifà (circa 20 minuti, una sola chiamata vera al supervisore per domanda)
1. **Una cartella staccata con il codice da provare.** `git worktree add --detach <scratch>/insieme main`, poi si uniscono i rami. Si collega `node_modules` con `mklink /J` e si lancia `npm run build`.
2. **La copia.** Uno script impacchettato con esbuild (`--alias:@shared=./src/shared`) prepara:
   - `dati/SierraDeck/impostazioni.json` con le porte **dentro `preferenze`** (47680/47681: la 47650 era della copia di un'altra chat);
   - `dispositivi.json` con lo sha256 di una chiave nota;
   - una `claude/` con le credenziali senza `refreshToken`;
   - un progetto git minuscolo;
   - un autopilota scritto a mano in `dati/SierraDeck/autopiloti/<id>.json`, con stato `lavoro` e due chat. **Serve `versione: 1`**, altrimenti il servizio lo mette da parte come `.illeggibile-1`.
3. **Avvio.** `electron.exe . --remote-debugging-port=9373` con `SIERRADECK_PROVA=<copia>\dati` e `CLAUDE_CONFIG_DIR=<copia>\claude`. Il servizio parte da solo sulla 47681.
4. **Una chat che «chiede» senza farla lavorare.**
   - Si scrive la sua trascrizione in `claude/projects/<slug della cartella>/<sessionId>.jsonl`: una riga `{type:'assistant', message:{role:'assistant', content:[{type:'text', text:'…?'}]}}`.
   - Poi si manda `POST /hook/notification?ap=<id>&chat=c-2` con `{"notification_type":"attesa"}`.
   - Il supervisore (vero) legge la domanda da lì.
5. **Rispondere come Nicholas dal telefono.** `POST :47680/api/rispondi` con `Authorization: Bearer <chiave>` e `{domanda, risposta}`. Poi si legge `POST :47680/api/autopilota {autopilota}` → `chat` (la conversazione) e `adesso`.
6. **Spegnere.** `Stop-Process` sugli `electron.exe` che hanno la cartella della copia nella riga di comando.
   - Quello che tiene la 47680 a volte resta acceso: va chiuso con `taskkill /PID <pid> /T /F`.
   - Poi si controllano le porte. La 47630 è del programma vero e non si tocca.

# Cosa è uscito (20/10, 08:29–08:51 UTC)
- **Domanda.** Arrivata nelle Domande in 18 s, in italiano, con scelte e «se non rispondi».
- **Risposta dalla pagina.** Nella conversazione: «Hai risposto: No, non cancellarlo» e sotto «c-2 («Prepara la prova sul server») l'ha ricevuta e riprende il lavoro.».
- **Stessa domanda di nuovo dalla stessa chat.** Non è tornata a Nicholas, ma l'ha fermata il **supervisore**, che ha riusato la risposta. Il filtro di c-13 non è scattato, quindi non c'è la riga `[domande] … scartata`: quel filtro agisce solo quando il supervisore decide «chiedi». La riga è provata solo dai test.
- **Il primo tentativo è servito da lezione.** Una domanda su una chiave SSH che nella cartella non c'era: il supervisore ha guardato e ha risposto da solo, ed era giusto. Per provare il giro con Nicholas serve una domanda che **deve** arrivare a lui: un'azione che non si annulla, una spesa, un segreto.
- **Chat mai partita (c-1: 0 giri, nessuna sessione).**
  - Nella conversazione è stata detta a 10 minuti dall'avvio del servizio («non dà segnali da 5 minuti»): il silenzio si conta dall'ultimo salvataggio e non scatta mentre c'è una domanda aperta.
  - «Adesso» l'ha messa in rosso solo dopo 15 minuti.
- **Difetto trovato: «Adesso» e la conversazione si contraddicono.**
  - Alle 08:44 la conversazione diceva che c-2 non dava segnali da 5 minuti. Alle 08:50 «Adesso» la mostrava ancora verde, «al lavoro da 11 min».
  - Il motivo: `MUTA_DA_MS` (15 min, `adesso.ts`) contro `SILENZIO_DA_DIRE_MS` (5 min, `autopilota.ts`).
  - Sul PC anche «Specialisti» diceva «al lavoro» per tutte e due.
  - Segnalato a c-12 e c-10 nella scheda di coordinamento.

# Trappole
- c-10 e c-12 si scontrano in `server.ts` (riga di import da `@shared/autopilota`, inizio di `creaServer`) e in `server.test.ts` (opzioni di `server()`). Sono aggiunte indipendenti: si tengono tutte e due.
- `ultimoDetto` legge la trascrizione da `CLAUDE_CONFIG_DIR/projects/<cartella con ogni carattere non alfanumerico → '-'>/<sessionId>.jsonl`. Senza trascrizione il supervisore vede solo «Claude is waiting for your input».
- Rispondere a una chat finta fa aprire alla copia una chat vera in sottofondo nella cartella del progetto, che resta ferma sulla domanda di fiducia. Nel diario compaiono righe «programma: la chat … ha fatto una domanda». È solo un effetto della copia.
