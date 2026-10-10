---
titolo: "0.57.1: consegne sparite per gli id che ripartivano da c-1, chat scritta mentre lavorava, portatile non trovato su Tailscale"
quando: 2026-10-10T19:30:00+02:00
tag: ["consegne", "autopilota", "riavvio", "dedupe", "tailscale", "pc-remoto", "registro", "portatile"]
---

# B. Le consegne perse (10/10, terza volta)

## Cosa dice il registro

- **15:08 e 15:12 UTC**: il servizio (allora 0.56.3) decide le consegne c-3 e c-4 per la chat «App Android». Ci sono nella linguetta Istruzioni, ma nel registro del programma **non c'è nessuna riga** («ritirata», «scritta», niente).
- **15:39 UTC**: dopo l'aggiornamento alla 0.57.0 la c-2 («riprendi») trova il riquadro vivo, ma la chat **stava lavorando**: il terminale era sopravvissuto. Il programma scrive dopo 8 s («tetto di 8 s scaduto»), il testo resta nel campo, segue l'insistenza e poi «non consegnata».

## Le cause

1. **Gli id ripartivano da c-1 a ogni avvio del servizio** (`creaConsegne`: `prossimo = 0`). Il Gestore (`avviaRitiro`) ricorda gli id già scritti per non scriverli due volte, e resta vivo quando il servizio riparte. Il 10/10 il servizio è ripartito più volte (alle 14:27 anche per la copia di prova). Così la c-3 e la c-4 nuove sono state prese per quelle di prima: **confermate senza essere scritte**, quindi nessuna riga. In più il file `c-3.md` di una consegna più vecchia veniva sovrascritto.
2. **Il tetto di 8 s scriveva sopra un turno in corso.** La 0.56.4 allunga il tetto a 45 s solo per un terminale «giovane»; questo era vecchio e vivo, solo occupato. Prima di scrivere nessuno guardava se la chat stesse lavorando.
3. **Una consegna nuova per la stessa chat ne sostituiva una non ritirata** (`metti`): i messaggi di quella vecchia sparivano, e restavano «in volo» per sempre.
4. Sulla 0.56.3 non c'era ancora `inVolo`, che arriva con la 0.56.4: i messaggi tolti dalla coda andavano persi del tutto.

## La correzione

- **Numeri che continuano**: `creaConsegne(osserva, { primo, ricorda })`, con l'ultimo numero salvato in `<cartella autopiloti>/consegne-numero.json` (`autopilot-host/index.ts`).
- **Il Gestore deduplica con `chiaveConsegna`**: id + sessione + cosa + impronta del testo, non l'id da solo (`main/autopilota-consegne.ts`).
- **Chat che lavora**: `Ponte.lavora`, cioè lo schermo (`lavoraSulloSchermo`, la riga d'attività anche «(1m 4s · …)», o «esc to interrupt») oppure i segnali (`lavoraDaSegnali`, «lavora» da meno di 10 minuti). Mentre lavora non si scrive e il tetto non scatta, fino a `ATTESA_TURNO_MAX_MS` (45 minuti); nel registro c'è «la chat sta lavorando, aspetto che finisca il turno».
- **Terminale di cui la finestra non ha ancora visto niente** (`natoDa` = undefined): trattato come giovane, quindi 45 s.
- **Consegna sostituita prima del ritiro**: l'osservatore `sostituita` la rimette in coda (`riportaInCoda`). Una consegna già presa da una finestra non si sostituisce più: la sta scrivendo.
- Test: `tests/renderer/consegna-chat-al-lavoro.test.ts` e `tests/autopilot-host/consegne.test.ts` (numeri, sostituzione).

# A. Il portatile «sembra collegarsi, poi non risponde»

## Cosa si sa

- Da questo PC il portatile risponde a `/api/casa` con la prova, sia sulla rete di casa sia su Tailscale. Verificato il 10/10 con `curl` e con il `fetch` di Node.
- Il battito del portatile ha i suoi indirizzi (rete di casa e Tailscale) e la 0.57.0.
- Nel registro di questo PC non c'è nessuna riga `[remoto]` per il portatile. Il motivo: il bussare che finiva in **«muto»** o **«senza indirizzi»** non scriveva niente. Il passaggio a WebRTC («apro un collegamento diretto…», cioè il «sembra collegarsi») non scriveva niente. E il riquadro alla fine diceva «non risponde» senza dire cosa aveva provato.
- Su Tailscale il portatile ha un nome diverso da quello di Windows, e `indirizziTailscaleDi` lo cercava **solo per nome**. Su un PC con il battito vecchio (Drive scollegato dal limite dei 7 giorni) gli indirizzi giusti non arrivavano da nessuna parte.
- Il portatile si collegava a questo PC dalla rete di casa da un indirizzo che non era nel suo battito, e l'indirizzo non veniva imparato.

## La correzione

- `indirizziTailscaleDi(status, nome, noti)` riconosce il PC per **indirizzo del battito**, per `HostName` o per la prima parte di `DNSName`.
- Il bussare scrive nel registro, una volta per esito, **ogni indirizzo provato e cosa ha risposto** (`ProvaIndirizzo`, `testoProva`): nessuna risposta, non prova la chiave, cassaforte chiusa, errore N. Il passaggio a WebRTC e poi al Drive ha la sua riga. Il messaggio del riquadro (`statoPc`) aggiunge «Cosa ho provato: …», e lo vedono anche la pagina e l'app, che ricevono il testo dal PC.
- Gli indirizzi ricordati si provano anche senza nome.
- **Indirizzi imparati**: una richiesta firmata da un PC della stessa cassaforte (`visoreDaFirma` = il suo id) chiama `pcVisto`, che ricorda l'indirizzo in `pc-indirizzi.json`. Loopback e link-local sono esclusi. La sicurezza resta: si impara solo da chi ha la firma valida della chiave di casa.
- Test: `tests/main/portatile-non-raggiunto.test.ts`, con nomi e indirizzi d'esempio.

## Da verificare dal vero

Con la 0.57.1 sui due PC, si apre da questo PC una chat del portatile. Nel registro deve comparire una di queste righe:
- `[remoto] <portatile> risponde su …`, se è andata bene;
- `[remoto] <portatile>: bussato a N indirizzi, nessuno va bene — …`, con il motivo per ogni indirizzo.

Con queste righe si sa dove si rompe.
