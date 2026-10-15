---
titolo: "0.73.0: chat ferme davvero ferme, niente aperture da sole verso altri PC, lista autopiloti allineata, specialisti visibili (e il verdetto della Revisione)"
quando: 2026-10-15T17:00:00+02:00
tag: ["0.73.0", "autopilota", "specialisti", "revisione", "segnali", "altri PC", "sottofondo", "lista autopiloti"]
---

Consegne c-20 e c-21 (Nicholas, 15/10). Le Domande essenziali e le spunte stanno in `domande-essenziali-e-spunte-0-72-1.md`.

# D. Chat che restavano «in attesa» (o «al lavoro») anche da ferme
**Causa, dal vero.** Il 13/10 una chat governata ha smesso di rispondere senza mandare lo Stop. Per Claude Code era un turno interrotto, inghiottito. È rimasta «al lavoro» per 52 minuti, e il messaggio dell'autopilota non le è mai arrivato.
- Con i segnali, `statoChat` ignorava lo schermo. Un «lavora» senza fine durava per sempre, e un permesso a cui aveva risposto l'autopilota lasciava «chiede».
- Il battito andava al servizio al massimo una volta al minuto. Il servizio contava la fermata da quando lo veniva a sapere e aspettava altri 30 s: fino a circa 150 s anche con lo Stop arrivato.

**Correzione:**
- `statoChat({…, adesso})`: se lo schermo mostra il campo pronto da più di `SCHERMO_VINCE_DOPO_MS` (15 s), vince lo schermo.
- Uno Stop di una chat governata azzera `ultimoBattitoAlServizio`, quindi il battito parte al giro dopo, con `dal` (l'ora vera della fine del turno).
- `/battiti` usa `dal` per `fermaDal`. Un `dal` nel futuro o illeggibile vale «adesso».
- Una chat governata ma ferma si chiama «ferma», non «autopilota».

**Restano da fare:**
- lo schermo che vede «esc to interrupt» nel testo della conversazione e non solo nel piè di pagina (`ultime-righe.ts`).

# F. Una chat di un altro PC non si apre mai da sola
Analisi completa dei percorsi (allineamento, rispecchia, riprendi, sottofondo, ospite).

**Chiusi:**
- `workspace:apriDaAltroPc`: aprire qui un workspace di un altro PC avviava **là** in sottofondo tutte le sue chat chiuse (0.68.0). Adesso le chat chiuse restano chiuse e il registro lo dice. Si avviano con «Avvia là» nel riquadro.
- Dopo un riavvio, `sf.riprendi` ripartiva con tutte le chat in sottofondo. Adesso riparte solo il lavoro degli autopiloti di qui (`perChi.id` che comincia con `autopilota:`). Quelle chieste da un altro PC o dal telefono aspettano un comando: `nonRipartePerAltri` in `shared/apertura-solo-utente.ts`.

**Non toccati, perché sono comandi o solo viste:**
- scrivere in un riquadro remoto con la chat chiusa e premere «Manda» la avvia: è un comando;
- i riquadri remoti dal vivo (`rendiRemoto`) mostrano, non avviano.

**Da decidere con Nicholas:** se anche le viste dal vivo debbano partire chiuse, con un tasto «Apri».

# E. Lista degli autopiloti
**PC:**
- «Su altri PC» usa la `vista` del PC remoto (stato in una parola, da quanto, criteri, ultima azione) invece di «al lavoro — 0 interventi» ripetuto due volte.
- I conti delle linguette usano la stessa vista delle righe (prima una domanda aperta contava «Al lavoro»), con l'ultimo segno di vita.
- C'è un orologio di 30 s.

**Pagina:** le stesse parole del PC per le righe remote e per il dettaglio, senza «interventi».

**App:**
- ordine e riassunto dalla vista del PC (`urgenzaAp`), senza «n criteri su m» ripetuto;
- «pronto» e «guasto» come sul PC;
- «non risponde» in una riga, con il perché nel «?».

**Doppioni:** `unBattitoPerNome` tiene, per nome, il battito più recente. Un'identità vecchia dello stesso PC non fa più una seconda riga «non risponde». Le righe «X: nessun autopilota» sono tolte.

# G. Specialisti visibili
**Il riquadro.** Il riquadro di una chat della flotta si chiama con il ruolo davanti: «Sviluppo · Notte», «Revisione · Notte #2» (`titoloChatSpecialista` in `nel-mosaico.ts`).

**Cosa scrive il servizio:**
- `organizzazione` sull'autopilota: «Lavoro diviso fra specialisti…» oppure «Una chat sola: …», con il perché (piccolo, senza git, limiti del piano non letti, divisione illeggibile);
- l'ultima azione di ogni chat, cioè la prima riga utile del suo ultimo messaggio a fine turno (`ultimaAzione`, `ultimaAzioneChat`).

**La scheda** (PC `SpecialistiVista`, pagina `specialistiHtml`, app `SpecialistiVista`) mostra la riga e ogni specialista: ruolo con colore, stato, compito, ultima azione e «Guarda».
- Sul PC, «Guarda» chiude il pannello, va nel workspace e dà il fuoco al riquadro (`data-sessione`).
- Sulla pagina e nell'app apre la chat.

**La divisione:**
- le regole del prompt sono cambiate: un lavoro piccolo va in un compito; le parti distinte vanno ognuna in un compito con il suo ruolo; niente compiti per riempire;
- la risposta si legge con il lettore tollerante (`shared/json-tollerante.ts`);
- il risultato va nel registro: `divisione: N compiti (ruoli)`.

**Trappola: i limiti del piano.** Senza limiti letti (`freno.tetto = 1`) l'autopilota lavora sempre con una chat sola. I limiti arrivano dalla riga di stato di una chat viva. In una copia di prova appena partita, il primo autopilota resta quindi con una chat sola.

# Il verdetto della Revisione (difetto trovato dalla prova dal vero)
**Il difetto.** Con due Sviluppo, l'OK della Revisione veniva sempre respinto: si misuravano **i criteri dell'insieme** sul ramo, e «a.js e b.js esistono» non può passare su un ramo che fa solo a.js. Risultato: 6 rifacimenti e poi la domanda a Nicholas, con un lavoro giusto.

**La regola adesso.** Il ramo non deve **rompere** niente: `criteriPeggiorati(principale, ramo)` dà i criteri verdi sul principale e rossi sul ramo. I criteri dell'insieme si misurano dopo l'unione, come già succedeva.

**Provato dal vero:** due Sviluppo e due Revisione; tutti e due i rami approvati e uniti; criteri verdi; finito.
