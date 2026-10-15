---
titolo: "0.72.0: l'autopilota scrive nelle chat — un solo messaggio in coda, chat governata sempre visibile, sottofondo solo su richiesta"
quando: 2026-10-15T11:40:00+02:00
tag: ["autopilota", "consegne", "sottofondo", "workspace", "decisione di Nicholas", "0.72.0"]
---

I difetti segnalati da Nicholas il 15/10:
- «l'autopilota spesso non riesce a scrivere nelle chat»;
- «la chat dell'autopilota è piena di messaggi inviati in alto»;
- «il lavoro in sottofondo è invisibile».

# Cosa dicevano i registri (12–15/10, sola lettura)
- **Sul PC le consegne partono quasi sempre.** Nel registro: ritirata → pronta → scritta → invio → partita.
- **I casi falliti sono nelle chat in sottofondo** (NexoraOS):
  - «non partita (il testo è ancora nel campo)», con 3–4 invii. Una delle cause era il suggerimento in grigio di Claude Code, corretto nella 0.71.1 (che Nicholas non aveva ancora installato).
  - Il resto erano chat che lavoravano **senza riquadro**: le istruzioni arrivavano, ma da fuori sembrava che l'autopilota non scrivesse. Il diario di ap-f1e631f5 lo dice: «gli ordini arrivavano, ma la chat lavorava in sottofondo… e tu non avevi modo di vederlo».
- **Il servizio non scriveva nel registro** (`stdio: 'ignore'`): delle sue consegne non restava traccia. Corretto, vedi `sicurezza-cancellazioni-0-72-0.md`.

# Un solo messaggio in coda (Claude Code)
**Causa.** Dalla 0.69.0 i messaggi in coda da più di 2 minuti si scrivono anche durante il turno.
- Con un turno di un'ora ne partiva uno ogni 2 minuti, e Claude Code li mostra tutti in alto, sopra il campo, come messaggi in coda.
- In più, il controllo «il testo si è perso» non vedeva il testo fra quelli in coda e lo **riscriveva**: un altro messaggio in alto.

**Adesso:**
- **Servizio** (`server.ts`, `scrittoNelTurno`): al massimo **una** scrittura durante un turno, per chat. La chiave si toglie con lo Stop o quando parte un turno nuovo. I messaggi che arrivano nel frattempo restano in `daConsegnare` e alla fine del turno partono **uniti** (`conPreambolo`). Vale anche per «Manda adesso».
- **Gestore** (`consegne-autopilota.ts`): mentre la chat lavora non si riscrive mai il testo.
- **Sottofondo** (`sottofondo.ts`):
  - un testo che sparisce dal campo mentre la chat lavora è **consegnato**, non perso;
  - `scrittoAlLavoro`: un solo testo «anche al lavoro» per turno.

# La chat governata si vede sempre
Nicholas, 15/10: «una chat governata da un autopilota è SEMPRE visibile in un riquadro del suo workspace. Il sottofondo va usato solo se Nicholas lo chiede, con un avviso chiaro e Guarda».

**Questo rovescia il default della 0.60.8** (`consegne-autopiloti-in-sottofondo-0-60-8.md`). Allora Nicholas aveva chiesto: «la deve aprire senza visualizzarla». Il meccanismo della 0.60.8 resta, ma solo su richiesta.

**Come funziona:**
- **Interruttore per autopilota**, `sottofondo?: boolean`, spento di serie.
  - Si cambia sul PC (pannello autopiloti), sulla pagina e nell'app (2.72.0), con `POST /autopiloti/<id>/sottofondo {si}` e `/api/autopilota/sottofondo`.
  - Il servizio lo mette nella consegna (`nel-mosaico.ts`).
- **Core** (`doveConsegnare`): senza `sottofondoChiesto` sceglie **sempre la finestra**. Con l'interruttore acceso valgono le regole della 0.60.8. Anche `autopilota:inSottofondo` rifiuta una consegna senza il segno.
- **Finestra** (`App.tsx` con `consegna-visibile.ts`, `comePortare`):
  - se il workspace della chat non è quello sullo schermo, la finestra ci va (`azioniDiFinestra().cambia`) e poi consegna;
  - **mai mentre scrivi**: se un tasto è stato premuto negli ultimi 45 s, aspetta, e intanto una banda in alto dice «L'autopilota deve scrivere nella chat «X», nel workspace «Y»…», con **Guarda** per andarci subito;
  - un riquadro sparito torna nel suo workspace (`tornaNelSuoWorkspace`), invece di passare al sottofondo.
- **Con il sottofondo chiesto:** la chat si vede in «⇄ Al lavoro in sottofondo» sul PC e con «in sottofondo · Guarda» sulla pagina e nell'app (0.69.0).
- **Trappola:** i workspace sono di tutto il PC, non della singola finestra (le altre finestre seguono). Aprire una finestra in più non mostra un altro workspace.
