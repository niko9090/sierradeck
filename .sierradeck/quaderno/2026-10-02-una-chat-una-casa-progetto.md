---
titolo: "Progetto «una chat, una casa» (0.42.0)"
quando: 2026-10-02T15:20:00+02:00
tag: ["drive", "sync", "multi-pc", "architettura", "progetto", "decisione-nicholas"]
---

# Da dove viene

La proposta del 16/09 (`proposta-chat-in-un-posto-solo.md`), «Proposta A», è stata approvata da Nicholas il 02/10. Il problema era nella radice: il Drive faceva da **motore di sincronia**. La stessa conversazione veniva copiata su più PC, con due `claude.exe` su due copie, e da lì nascevano gemelli, conflitti, adozioni in cartelle vuote e rimbalzi.

Le altre strade ci sono già:
- guardare dal vivo una chat di un altro PC (0.33–0.40: rete di casa, Tailscale, WebRTC, cassetta via Drive);
- la posta per un PC spento.

Manca il resto: ogni chat ha **una casa**, e il Drive diventa un **salvataggio**.

# 1. La regola della casa

Ogni chat (una conversazione, cioè un `.jsonl` di Claude Code) ha un PC di casa: è lì che gira il suo `claude.exe` e che sta la sua cartella. La casa, una volta decisa, **si memorizza** e non cambia più da sola. Cambia solo con «Sposta progetto», con il riordino confermato da Nicholas, o con l'annullamento di uno dei due.

Per una chat senza casa memorizzata la si decide così, in ordine (funzione pura `decidiCasa`, `src/shared/una-casa.ts`):

1. **Dove è nata.** Una chat nuova (dalla 0.42.0) che non è mai stata sul Drive è nata qui: la sua casa è questo PC. Si scrive al suo primo salvataggio.
2. **La cartella (lo slug).** Se la cartella in cui lavora la chat (il suo `cwd`) esiste **su un PC solo** fra quelli noti, la casa è quello. Lo dicono il disco di qui e le cartelle nel battito degli altri PC. Una chat senza la sua cartella non può lavorare.
3. **L'ultima attività reale.** Se la cartella c'è su più PC, vince quello dove la chat ha lavorato per ultimo davvero:
   - è aperta adesso su quel PC (battito);
   - oppure la copia di qui è la più avanti (più lunga di quella sul Drive), con l'ultimo messaggio scritto qui.
   Le date dei file non contano, perché la sincronia le cambiava.
4. **Altrimenti** resta dov'è (unica copia conosciuta).

Ogni decisione porta il **motivo** in parole («la cartella C:\…\Trading c'è solo su LAPTOP»), e da dove viene: `regola`, `nascita`, `nicholas` (riordino confermato), `sposta`.

**Dove si memorizza:** l'oggetto cifrato `case-chat` nella scatola del Drive, accanto ai battiti, con una copia locale `case-chat.json`. Si unisce voce per voce: una decisione di Nicholas o di «Sposta» vince su una della regola. Fra due della stessa forza vince la prima.

# 2. Il riordino («Riordina le chat»)

Una finestra, su ogni PC. Elenca le chat che stanno qui ma hanno casa altrove («fuori casa»), raggruppate per casa proposta, ognuna con il motivo.

- Nicholas spunta quelle da riordinare e conferma. Le chat aperte adesso non si spostano: vanno chiuse prima.
- Le copie fuori casa **non si cancellano mai**: si spostano in una cartella di recupero, `dati/recupero-riordino/<id>/<slug>/<file>`.
- Ogni riordino ha un registro (`dati/riordini/<id>.json`) con «da → a» per ogni file.
- Le case confermate diventano `nicholas`.
- **Si annulla** dalla stessa finestra («Annulla questo riordino»): i file tornano dov'erano. Se nel frattempo al loro posto è comparsa un'altra copia, quella non si tocca: la copia di recupero resta e lo si dice.

# 3. Il Drive come salvataggio per PC

- **Ogni PC carica solo le sue chat**, quelle di cui è la casa (o senza casa e nate qui). Ogni voce del manifesto porta il suo proprietario (`pc`): è lo «spazio» di quel PC.
  - Una copia fuori casa non sale più, così non sovrascrive quella di casa.
- **Niente più discesa automatica** delle chat degli altri PC: l'arrivo automatico porta giù solo chat la cui casa è questo PC (per esempio dopo una reinstallazione).
  - Le chat degli altri PC si guardano dal vivo (riquadro remoto) o nel catalogo, in sola lettura.
  - «Porta qui» del catalogo resta solo dentro la procedura «Sposta progetto».
- **Migrazione** della struttura esistente, una volta per PC, alla prima apertura della 0.42.0 con Drive e cassaforte aperti:
  1. copia di sicurezza del manifesto del Drive (`sierradeck.manifesto.prima-0.42-<pc>-<data>`), mai cancellata;
  2. le case delle chat che questo PC conosce, decise con la regola, scritte in `case-chat`;
  3. il manifesto riscritto con il proprietario su ogni chat di cui si sa la casa.
  - **Nessun file sul Drive viene cancellato** o rinominato.
  - Prima di scrivere si verifica (`verificaMigrazione`) che ogni voce di prima ci sia ancora, con lo stesso file e la stessa dimensione; se ne manca anche una, non si scrive niente e lo si dice nel registro.
  - Si torna indietro con la copia di sicurezza del manifesto, e togliendo `case-chat`.

# 4. «Sposta progetto da un PC all'altro»

Una finestra guidata, a passi, sul PC dove il progetto sta adesso. Ogni passo ha il suo testo per esteso: cosa fa, cosa controlla, cosa non tocca.

1. **Scelta:** il progetto (la cartella, con le sue chat di qui) e il PC di destinazione.
2. **Controlli:**
   - nessuna chat del progetto aperta o al lavoro qui;
   - nessun autopilota al lavoro su quella cartella;
   - lavoro salvato (se è una cartella git: niente modifiche non salvate in un commit);
   - Drive e cassaforte aperti;
   - il PC di destinazione raggiungibile (rete di casa, Tailscale o WebRTC) e con la 0.42.0.
   - Se qualcosa non va lo si dice, con cosa fare, e non si prosegue.
3. **Trasferimento:**
   - si salva tutto sul Drive: le chat, e la cartella se è un progetto sul Drive. Se non lo è, si mette sul Drive, dopo averlo chiesto;
   - poi si chiede al PC di destinazione di portarlo da sé, con il suo «Porta qui» (rotta `/api/sposta/ricevi`, solo con la chiave di casa).
4. **Verifica:** il PC di destinazione dice dimensione e impronta di ogni chat che ha ricevuto; si confrontano con quelle di qui. Se anche una non torna, ci si ferma qui: niente è cambiato.
5. **Cambio della casa:** le chat del progetto hanno casa sul PC di destinazione (`sposta`).
6. **Copia archiviata sul PC vecchio:** le chat di qui vanno nella cartella di recupero, come nel riordino. Non si cancellano.
   - La cartella del codice resta dov'è, intatta.

# 5. Come si torna indietro

- **Riordino:** «Annulla questo riordino» rimette i file al loro posto.
- **Sposta progetto:** «Annulla lo spostamento» rimette le chat archiviate e riporta la casa sul PC di prima. Sul PC di destinazione la copia resta: lì risulterà fuori casa, e si riordina come le altre.
- **Migrazione:** il manifesto di prima resta sul Drive come copia di sicurezza. La 0.41.0 e precedenti ignorano proprietari e case, quindi tornare a una versione vecchia non perde niente.
- **Mai, da nessuna parte, una chat cancellata.**

# Cosa non cambia

- Battiti, posta, riquadri remoti, strade fra PC.
- I progetti sul Drive: le cartelle continuano a viaggiare come prima, e il testimone resta.
- Il telefono.
