---
titolo: "Colori fissi delle attività e riga per agente (0.82.0)"
quando: 2026-10-21T01:30:00+02:00
tag: ["0.82.0", "colori", "panoramica", "autopilota", "pagina", "app", "come funziona"]
---

Consegna c-364 (ramo `ap/ap-f1e631f5/c-35`): un colore fisso per cosa fa una chat, uguale su PC, pagina e app, mai solo colore; una riga per agente con colore, ruolo, cosa fa e da quanto.

## La tabella unica
`src/shared/colori-attivita.ts` — otto attività, ognuna con nome, parola, simbolo, colore, spiegazione:

| attività | simbolo | colore |
|---|---|---|
| sviluppo | ✎ | blu `#4aa3ff` |
| interfaccia | ◧ | viola `#b48cff` |
| collaudo | ◎ | acqua `#3cc8c0` |
| revisione | ◈ | rosa `#f283c0` |
| rilascio | ▲ | lime `#b4d454` |
| aspetta te | ◆ | ambra `#e0a33c` |
| ferma o errore | ■ | rosso `#f2857c` |
| finita | ✓ | grigio `#9aa1a9` |

- **Decisione:** Revisione era ambra e Rilascio rosso, gli stessi colori di «aspetta te» ed «errore». Ora i ruoli prendono il colore dalla tabella (`RUOLI[r].colore = ATTIVITA[r].colore`), e ambra/rosso vogliono dire solo «ti aspetta» / «si è fermata».
- `attivitaDi(ruolo, stato)`: lo stato vince sul ruolo (chiede/bloccata/attesa → aspetta; pausa/sospeso/fallito → ferma; finita/finito → finita); al lavoro conta il ruolo; senza ruolo = sviluppo.
- Nella scheda dell'autopilota (`specialistiDi(a, ora)`): con l'autopilota fermo è ferma anche la chat segnata «lavoro»; con l'autopilota finito sono finite tutte.
- Il contrasto è provato (≥ 4,5:1) contro i fondi di `tavolozza()` a ogni chiarore, nei due stili, e contro i fondi fissi dell'app. Il rosso è più chiaro del `--rosso` (#dc5f5f non passava sul fondo più chiaro).

## Come arriva ai tre lati
- **PC**: importa la tabella. `SegnoAttivita` e `LegendaAttivita` in `src/renderer/components/SegnoAttivita.tsx`; usati in `SpecialistiVista`, `RiassuntoAlLavoro` (Panoramica). I vecchi `COLORE`/`coloreRuolo` sparsi ora chiamano `coloreDi`.
- **Pagina**: `var ATT = ${JSON.stringify(...)}` dentro lo script (`client-pagina.ts`), con `segnoAttivita`, `parolaStatoAtt`, `legendaAttivita`, `coloreNome`.
- **App**: `ColoriAttivita.kt` è **generato** dal test `tests/shared/colori-attivita.test.ts` (`AGGIORNA=1` lo riscrive; senza, il test fallisce se le due tabelle divergono). Non modificarlo a mano. `Attivita.kt` ha i composable e il ricavo per i PC vecchi.
- I dati: `Specialista` ha `attivita`, `cosa`, `quanto`; `RigaAlLavoro` ha `attivita`. Il testo di «cosa fa» è `cosaFaChat` in `panoramica.ts` (uno solo per scheda e Panoramica).

## Trappole
- Un PC di prima della 0.82.0 non manda `attivita`: pagina e app ricavano l'attività da ruolo e stato (`Attivita.diSpecialista`, `diRiga`) o tornano al pallino di prima.
- I test della pagina che compongono funzioni estratte dallo script (`client-pagina-domande-a-lato`, `ruolo-visibile`) devono includere anche `var ATT` e le nuove funzioni, altrimenti `ReferenceError`.
- Una voce nuova in `FunzionePc` (app) faceva comparire la fascia «PC indietro» anche a versioni uguali (c-37, «Apri cartella» 0.82.0). Ora `PcIndietro.testo` elenca solo ciò che il PC collegato ha già (b2fb4b96): una voce nuova non va più esclusa a mano.
- `node_modules` nella copia: giunzione verso quello della cartella principale (vedi `chiusura-rami-0-81-0.md`).
