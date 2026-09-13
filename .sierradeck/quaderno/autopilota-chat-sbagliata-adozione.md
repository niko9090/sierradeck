---
titolo: "Perché il mandato dell'autopilota è finito nella chat di Nicholas (l'adozione), e la regola nuova: sempre una chat sua"
quando: 2026-09-14T02:10:00+02:00
tag: ["autopilota", "consegna", "workspace", "trappola", "0.27.0"]
---

# Il sintomo

Il 13 settembre il primo mandato (`mandato-controllo-completo-2026-09-13.md`)
è stato consegnato **dentro la chat di Claude Code che Nicholas stava già
usando** in `E:\Users\nikof\Documents\SierraDeck` (sessione `ffea9ea8-…`),
non in una chat nuova dell'autopilota. La sua conversazione ha continuato con
l'autopilota sopra, il terminale è «rinato» sotto i suoi occhi e l'autopilota
ha registrato come `sessionId` quello della sua chat.

# La causa (ricostruita dal codice, non dai commenti)

La catena è: `avviaLavoro` nel servizio → `consegne.metti({sessionId: <uuid
deciso dal servizio>, cwd, workspace})` → il Gestore ritira (`avviaRitiro` in
`src/main/index.ts`) → `autopilota:consegna` alla finestra → `eseguiConsegna`
in `src/renderer/consegne-autopilota.ts`.

Lì, quando nessun riquadro aveva la sessione decisa dal servizio (cioè
**sempre**, per una chat che deve nascere), il codice chiamava
`ponte.adottabile(cwd, autopilotaId, workspace)`: **la prima chat aperta
sulla stessa cartella e nello stesso workspace, non governata da un altro
autopilota**. Era una scelta di prodotto scritta nel commento («chi attiva un
autopilota smette di operare lui: quella chat è sua», 0.12.x). `adotta()`
assegnava il riquadro all'autopilota, uccideva il terminale (`iberna` +
`pty.kill`) e lo faceva rinascere con `--resume <sessione di Nicholas>` e gli
hook `?ap=<id>`; al primo hook `Stop`, `suStop` in `server.ts` riscriveva
`sessionId` con quello della chat di Nicholas, buttando via il `randomUUID`
scelto alla creazione.

Il filtro sul workspace (aggiunto per un difetto simile) non bastava: il
mandato è stato lanciato **dallo stesso workspace** in cui Nicholas lavorava
sulla stessa cartella, che è il caso più normale che ci sia.

# La regola nuova (0.27.0)

**Un autopilota apre sempre una chat sua, nuova**, con la sessione decisa dal
servizio, nel workspace da cui è stato avviato (campo `workspace` deciso alla
creazione; se creato dall'API senza workspace, in quello attivo della finestra
che riceve la consegna). Mai la chat di una persona, mai un'adozione.

- `eseguiConsegna`: `if (gia === undefined) ponte.apri(c)`. Tolti
  `adottabile`, `adotta`, `terminaleDi`, `attendiInQuesto`, `RISVEGLIO_MS` e il
  parametro `workspaceAttivo` di `ponteReale`.
- Test: «mai la chat di qualcun altro» in
  `tests/renderer/consegne-autopilota.test.ts`.
- `assegnaAutopilota` nello store del layout resta (lo usa `apri` tramite
  `addPane` con `autopilota`), ma nessuno adotta più.

# Da ricordare

- Se un riquadro «rinasce» da solo mentre ci stai scrivendo, qualcuno lo sta
  adottando: non deve più succedere. Se succede, guardare `eseguiConsegna`.
- La strada per parlare con un autopilota è la scheda (dialogo, vedi
  `autopilota-dialogo.md`), non la sua chat: scrivere nella chat governata
  funziona (per la chat i messaggi sono uguali), ma il supervisore non lo
  vede come tuo.
