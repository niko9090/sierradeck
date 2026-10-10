---
titolo: "0.59.0: autopiloti degli altri PC governabili da qui, e il workspace giusto quando una chat si apre a schermo"
quando: 2026-10-10T21:40:00Z
tag: ["autopiloti", "altri PC", "ponte", "workspace", "apertura", "decisione di Nicholas"]
---

# B. «Mi apre la chat in un workspace sbagliato»

**Cosa dice il registro di questo PC (10/10, 20:42 UTC, con la 0.58.3):**
- `[apertura] riapri là (…): chiedo al portatile di riaprire la chat…` → `ha accettato` → `apertura remota riuscita`;
- il riquadro di quella chat qui stava nel workspace del progetto di trading.

Il registro del portatile non si legge da qui: non c'è una rotta per i registri degli altri PC. La causa si ricava dal codice che il portatile ha eseguito.

**Causa:**
1. `/api/sessioni/riprendi` → `riprendiSessione` (`index.ts`) cercava il workspace solo con `workspaceDellaSessione(archivio di quel PC, sessione)`.
2. Sul portatile quella chat **non era salvata in nessun workspace**: il suo riquadro sta nei workspace di questo PC.
3. Quindi `dove` restava vuoto, `client:apri` partiva senza workspace, e la finestra apriva la chat in **quello che aveva davanti**.
4. In più il PC che chiedeva non mandava il workspace del suo riquadro.

**Correzione (`src/shared/workspace-apertura.ts`, `workspaceDiApertura`):** mai il workspace attivo. In quest'ordine:
1. il workspace dell'autopilota che governa la chat (`sessionId`);
2. quello in cui il riquadro è salvato su quel PC;
3. quello del riquadro sul PC (o telefono) che chiede (`workspace` nel corpo di `/api/sessioni/riprendi` e di `/api/sottofondo/avvia`);
4. quello del progetto, cioè dove stanno le altre chat (o un autopilota) della stessa cartella;
5. il nome della cartella.

Se il workspace non esiste, si crea con quel nome, senza cambiare l'attivo nell'archivio.

Lo usa `apriNelSuoWorkspace` (`index.ts`) per «Riapri là», il telefono, il ponte, un altro PC e «Mostra qui»; il sottofondo ricorda il workspace di chi la usa. Nel registro: `[apertura] «titolo» (sessione): … nel workspace «X» — perché`.

Test: `tests/shared/workspace-apertura.test.ts`.

# A. Gli autopiloti degli altri PC

**Niente logica nuova sul PC dove gira l'autopilota:** si usano le sue rotte di sempre (`/api/stato`, `/api/autopilota`, `/dialogo`, `/ferma`, `/riprendi`, `/vai`, `/api/rispondi`).
- **Dal PC:** con la firma di casa (`remoto.chiama`), IPC `autopiloti:altri` e `autopiloti:altroPc`. Sono permesse solo le rotte di `ROTTE_AUTOPILOTA_ALTRO_PC`: eliminare no.
- **Dal telefono e dalla pagina:** attraverso il ponte (`/api/ponte`). `/api/rispondi` è stato aggiunto a `ROTTE_PONTE`, al canale WebRTC e a `Ponte.ROTTE` dell'app.
- **Elenco:** `GET /api/autopiloti/altri` (solo telefono e pagina, non da un altro PC) restituisce, PC per PC, `autopilotiDaStato(/api/stato di quel PC)`. Se un PC non risponde: `erroreAltroPc`, con le strade provate e le prove degli indirizzi (`remoto.proveDi`).
- **PC:** «Su altri PC» in fondo al pannello Autopiloti (`AutopilotiAltriPc.tsx`), con «gira su <PC>». La scheda mostra stato, obiettivo, criteri, domande con le opzioni, ultime mosse e dialogo, più Ferma e Riprendi.
- **Pagina:** `altriApHtml()` e la scheda di sempre; con `apPc` ogni chiamata passa da `chiediAp` → ponte.
- **App 2.59.0:** in «Lavori», «SU ALTRI PC» (`AutopilotiAltri.kt`). La scheda è il `DettaglioAutopilota` di sempre, con `apiAccoppiato.suPc(pc)`.
- **Registro:** ogni azione verso un altro PC (anche dal telefono) scrive `[autopiloti] scrivo all’autopilota … su <PC>: fatto` oppure `NON riuscito — perché`.

**Trappola vista dal vero:** fermare un autopilota che lavora può far scadere la risposta del servizio (il fermo avviene comunque). La rotta diceva «guasto interno»; ora risponde 504 con il perché e «guarda lo stato prima di riprovare».

**Prova dal vero (copia di prova, autopilota di PROVA in una cartella di prova, poi eliminato):**
- creato;
- scheda letta;
- messaggio mandato, e lui ha risposto nel dialogo;
- riprendi → lavoro, ferma → sospeso.

Le chiamate con la firma di casa fra due PC sono provate in `tests/main/autopiloti-altri.test.ts`: un PC con un'altra chiave non legge e non comanda.

**Da fare con Nicholas:** installare la 0.59.0 sui due PC e scrivere all'autopilota del portatile dalla scheda di qui. Nel registro di questo PC deve comparire `[autopiloti] scrivo all’autopilota … su <portatile>: fatto`.
