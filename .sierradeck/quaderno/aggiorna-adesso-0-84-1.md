---
titolo: "«Aggiorna adesso» e nessuna consegna dopo «Installa» (0.84.1)"
quando: 2026-10-22T10:55:00+02:00
tag: ["aggiornamenti", "installa", "autopilota", "0.84.1"]
---

Richiesta di Nicholas del 21/10 (riga 5a della `lista-lavori.md`), fatta da c-77 il 22/10.

## Cosa fa

- **Dopo «Installa» il servizio non dà più consegne, da nessuna strada.** La guardia sta in un punto solo: `avviaLavoro` in `src/autopilot-host/server.ts` (variabile `installaInCorso`, accesa da `POST /pausa-aggiornamento`, spenta da `{attiva:false}` e da `/gestore-avviato`). I messaggi presi dalla coda ci tornano e l'autopilota resta segnato `fermatoPerAggiornamento`, così al ritorno la ripresa lo rimette in moto.
  - Prima la pausa copriva solo chi era «al lavoro» nel momento del tasto e solo a fine turno. Restavano scoperti: le chat ferme con messaggi in coda (`consegnaAlleChatFerme`), il freno che faceva ripartire chi era in pausa per i limiti e apriva chat nuove (`rispettaFreno`), e gli autopiloti rimessi al lavoro dopo il tasto.
  - Anche `riprendiLavori` non fa niente mentre si installa e **non conta come ripresa fatta**: altrimenti la guardia «ripresa chiesta due volte a poca distanza» saltava la ripresa vera al ritorno del Gestore. Questa è la trappola trovata dal test.
- **Il tasto «Aggiorna adesso»** compare durante l'attesa della quiete: nella striscia in alto e in Impostazioni sul PC, e in Impostazioni sulla pagina del telefono. Interrompe l'attesa (`attendiQuiete` con `subito`), salva il lavoro di ogni chat con un commit sul suo ramo (`POST /salva-per-aggiornamento`, che usa `salvaLavoroAsincrono`: solo nelle copie `ap/…`, mai le chat finite), annota chi era a metà per la ripresa e installa. Se il salvataggio non riesce si installa lo stesso, perché le chat hanno già ricevuto l'ordine di fermarsi a fine passo.
  - Con la versione pronta e nessuna attesa in corso, fa «Installa» senza aspettare. Senza una versione pronta non fa niente.
  - L'installazione la avvia solo un tasto di Nicholas: non c'è nessuna strada automatica.
- **L'attesa dice da quanto aspetta** dal primo minuto: «… 1 chat al lavoro («X»), aspetto da 3 min».

## Cosa manca

- Il tasto nell'app Android nativa non c'è: lì si vede lo stato «attendo», ma non c'è il tasto. Va aggiunto quando si tocca di nuovo `android/`. La rotta è `POST /api/aggiornamento/aggiorna-adesso`.

Test: `tests/autopilot-host/nessuna-consegna-dopo-installa.test.ts`, `tests/main/aggiorna-adesso.test.ts`.
