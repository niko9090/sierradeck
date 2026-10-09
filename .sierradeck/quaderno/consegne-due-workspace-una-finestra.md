---
titolo: "Consegne degli autopiloti perse al riavvio: due workspace, una finestra (0.56.1)"
quando: 2026-10-09T14:20:00+02:00
tag: ["autopilota", "consegne", "workspace", "riavvio", "difetto"]
---

# La segnalazione (Nicholas, 09/10)

«I messaggi dell’autopilota non arrivano, la chat è ferma».

# La causa (dal registro del PC)

- Al riavvio dopo l’aggiornamento arrivano insieme due consegne per due chat governate in workspace diversi: NexoraOS e SierraDeck. La finestra del PC è una sola.
- Tutte e due trovano il loro riquadro sparito e chiamano `tornaNelSuoWorkspace`: la prima porta la finestra su «NexoraOS», mezzo secondo dopo la seconda la riporta su «SierraDeck».
- La prima chat non torna più a schermo. Dopo 90 s la consegna si arrende con «riquadro mai trovato»: il compito resta nel file `c-N.md` del progetto ma nella chat non viene scritto.
- Successo a tutti e due i riavvii del 09/10 (0.55.0 e 0.56.0). Non dipende dalle modifiche di quelle versioni: era una gara fra consegne.

# La correzione

`src/renderer/consegne-autopilota.ts`:
- **turno sul workspace della finestra:** una consegna alla volta lo cambia. Chi lo trova occupato da un’altra consegna in un altro workspace aspetta che quella abbia scritto, o si sia arresa, poi va nel suo;
- l’attesa del turno non conta per la resa, fino a 90 s; poi il turno si prende lo stesso;
- una consegna può tornare nel suo workspace fino a `TORNATE_MAX` volte, a distanza di `RIQUADRO_PERSO_MS`.

Test: `tests/renderer/consegne-due-workspace.test.ts`. Senza la correzione fallisce come nel caso reale; con la correzione tutte e due le chat ricevono il compito.

# Se succede ancora

Il compito non è perso: è nel file `.sierradeck/consegne/c-N.md` del progetto. Si apre la chat nel suo workspace e le si scrive «Leggi ed esegui le istruzioni in .sierradeck/consegne/c-N.md (dal tuo supervisore).».
