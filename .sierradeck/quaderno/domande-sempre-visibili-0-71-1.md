---
titolo: "Le domande delle chat restano visibili finché hanno risposta (0.71.1)"
quando: 2026-10-13T18:30:00+02:00
tag: ["domande", "autopilota", "sottofondo", "0.71.1"]
---

Nicholas (13/10, sulla 0.71.0): «le domande spariscono e rimangono solo nella chat».

# Le cause (codice e registro vero, letto senza toccare niente)

1. **Domanda scritta = «ha finito».** Una chat che chiude il turno con una domanda in testo («Procedo con la B?») per le Domande era una chat che ha solo finito. Dalla 0.70.0 il filtro di partenza «Aspettano te» le nasconde. Questa era la causa principale per le chat non governate.
2. **Dialogo letto dai segnali ma non dallo schermo.** `chiedeSegnale` (`elicitation_dialog`, `permission_prompt`) non entrava in `raccogliDomande`, quindi la chat finiva fra le «ha finito», oppure spariva se era governata.
3. **L'autopilota che risponde da solo non lasciava traccia nelle Domande**, solo una riga nel diario. Succedeva in quattro casi:
   - il supervisore risponde alla notifica della chat;
   - «risposta già data»;
   - il tetto di 6 domande all'ora;
   - una domanda a fine turno a cui il supervisore risponde con le istruzioni.
4. **Il suggerimento di Claude Code.** È il testo in grigio nel campo «❯» (per esempio «Fammi un'altra domanda di prova»), introdotto da Claude Code 2.1.29x. Veniva letto come testo scritto, e così:
   - il sottofondo non consegnava più;
   - la chat non risultava ferma.
   L'ho visto nella prova dal vero.

# Cosa fa adesso

- `domandaInFondo` (in `shared/domande-telefono.ts`): una domanda è l'ultimo paragrafo che finisce con «?», oppure un elenco di scelte sotto un paragrafo che finisce con «?».
  - Il testo viene dal segnale `Stop` (`last_assistant_message`) e passa nel battito, quindi vale anche per le chat degli altri PC.
- Una chat con una domanda (scritta o dialogo) ha `chiede: true`: è una «domanda», conta nel numero e sta in «Aspettano te».
- **Risposte dell'autopilota**: il servizio le salva con `domande.risolta()`.
  - Si salvano in `servizio/domande-aperte.json` (campo `risolte`), quindi sopravvivono al riavvio.
  - Restano per 12 ore e si leggono da `GET /domande/risolte`.
  - Nelle Domande compaiono nella conversazione dell'autopilota come «La chat «…» ha chiesto: …» seguito da «risposta dall'autopilota: …», con tipo «risposta dall'autopilota».
  - Non contano nel numero e non sono «la prossima».
- Lo schermo salta le celle attenuate dopo «❯» (`testoDiRiga`).
- Le sessioni interne «Stai facendo da supervisore…» e «La domanda che vuoi fare…» non vengono più prese per chat.

# La prova dal vero (copia staccata, cartella «SierraDeck-prova-c2»)

Chat in sottofondo con Claude Code 2.1.296:
- la fiducia nella cartella è arrivata come «permesso»;
- la domanda scritta «Preferisci il rosso o il blu?» è arrivata come «domanda» in 2 s;
- dopo la risposta non aspettava più.

Il secondo messaggio era rimasto in coda per colpa del suggerimento in grigio; da lì è nata la correzione di `testoDiRiga`.

# Trappola

Le conversazioni di un autopilota hanno sempre `chiede: true`. Una con `chiede: false` è una «risposta dall'autopilota», e PC, pagina e app la mostrano invece di rimandare alla linguetta.
