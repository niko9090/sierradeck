---
titolo: "0.60.8: una consegna di un autopilota non cambia mai il workspace sullo schermo (chat in sottofondo e adozione)"
quando: 2026-10-11T12:40:00+02:00
tag: ["autopilota", "consegne", "sottofondo", "workspace", "decisione di Nicholas", "0.60.8"]
---

# La regola

Nicholas: la chat dell'autopilota «la deve aprire senza visualizzarla… andiamo avanti nei PC in progetti diversi». Una consegna **non cambia mai** il workspace sullo schermo.

**Prima.** Il renderer (`suConsegna` in `App.tsx`) portava la finestra nel workspace della consegna con `cambia`, e le altre finestre seguivano. Se il riquadro spariva, `tornaNelSuoWorkspace` la riportava indietro. Con due autopiloti in workspace diversi c'era anche il turno («la finestra è nel workspace di un'altra consegna, aspetto»).

# Come funziona adesso

**Chi decide: il Core** (`consegna` in `avviaRitiro`, `index.ts`), con `doveConsegnare` in `autopilota-consegne.ts`:
- la chat è in un riquadro che si vede → la finestra (quella che ha la chat, poi quella che mostra il suo workspace: con due finestre la prima avrebbe cambiato workspace);
- è già in sottofondo, o ha un pty acceso in un workspace che la finestra tiene nascosto → il sottofondo;
- il suo workspace non è sullo schermo di nessuna finestra → il sottofondo;
- nessun workspace suo → la finestra, come sempre.

**In sottofondo** (`consegnaInSottofondo`):
1. `sottofondo.avvia` con `autopilota: {id, chat}`. Il pty nasce con gli hook dell'autopilota (`componiImpostazioni`: Stop, Notification, PreToolUse), come un riquadro. La voce lo salva in `sottofondo.json`, quindi dopo un riavvio riparte con gli stessi hook.
2. Il testo va in coda con id `idTestoConsegna` (stabile per la stessa istruzione) e parte solo con il campo pronto, mai sopra un turno (`campoPronto`, `lavoraSulloSchermo`). Resta su disco finché non è partito; quando parte, `[consegna] … partita, in sottofondo`.
3. La chat entra nel layout salvato del suo workspace, con `workspace:chatArrivata` alle finestre, perché la memoria delle finestre vince sul disco.
4. «interrompi» diventa Ctrl+C sul pty in sottofondo.

**Pty già acceso in un workspace nascosto:** `ptyDiSessione` (`ipc.ts`, mappa pty → conversazione) lo trova. Il sottofondo lo **prende** (`ptyGia`): `agganciaPtyAlSottofondo` toglie il pty alla finestra e ne chiede lo scrollback. Niente secondo `claude --resume`. Quando la finestra torna in quel workspace e riaggancia il pty, `impostaPrimaDiRiagganciare` lo fa cedere.

**Adozione:** aprendo il workspace, il riquadro nasce e `pty:spawn` lo adotta (`impostaAdozioneSottofondo` → `cedi`) senza riavviarlo. Le istruzioni ancora in coda vanno alla finestra che ora mostra la chat, come consegne normali (`riconsegnaDopoAdozione`): il servizio le ha già date per consegnate, quindi non devono perdersi.

**Renderer:** non cambia più workspace. Una consegna per un altro workspace e un riquadro sparito tornano al Core con `autopilota:inSottofondo` (`passaAlSottofondo`), e il registro scrive `[consegna] … passa in sottofondo, senza cambiare lo schermo`.

# Prove

- **Test:** `tests/main/consegna-in-sottofondo.test.ts`, che copre:
  - la decisione;
  - il renderer che passa al sottofondo senza tornare nel workspace;
  - gli hook dell'autopilota, il testo consegnato e la riga nel registro;
  - l'adozione con le istruzioni rimaste;
  - il pty nascosto preso senza un secondo avvio;
  - l'elenco su disco che tiene l'autopilota.
- **Dal vero (11/10)** nella copia `SIERRADECK_PROVA`, porte 47650/47651; il servizio vero sulla 47630 non è stato toccato.
  - Workspace «Altro» sullo schermo, autopilota di PROVA in «Prova AP».
  - Registro: `il suo workspace «Prova AP» non è sullo schermo: lavora in sottofondo, senza cambiare workspace`, poi la domanda di fiducia della cartella nuova (risposta con `/api/scegli`), poi `partita, in sottofondo`.
  - La chat ha scritto nel LEGGIMI. L'hook Stop è arrivato al servizio e l'autopilota è passato a «finito». Lo schermo è rimasto su «Altro» tutto il tempo.
  - Poi `POST /api/workspace {nome:'Prova AP'}` → `passa in un riquadro di questo PC, senza riavviarsi`.
  - Copia fermata e cartelle cancellate.

**Trappola:** nella copia la cartella del progetto è nuova, quindi Claude Code chiede la fiducia e la chat in sottofondo aspetta una scelta. Sul PC vero, con la configurazione di sempre, di solito la fiducia c'è già.
