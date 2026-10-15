---
titolo: "Rapporto 0.73.0 per Nicholas: domande essenziali, spunte, specialisti visibili, chat ferme, aperture solo su tuo comando"
quando: 2026-10-15T17:15:00+02:00
tag: ["rapporto", "0.73.0", "per Nicholas"]
---

# In breve
La 0.73.0 (app 2.73.0) è pubblicata, con l'installer, latest.yml, l'APK firmato e app-android.json. **Non l'ho installata:** la installi tu.

Il lavoro chiesto per la 0.72.1 è confluito qui, come richiesto: una sola release.

Le foto stanno sul PC in `note/prova-0721/foto/` (domande e spunte) e in `note/prova-073/foto/` (specialisti). Non sono nel repository, perché mostrano percorsi del PC.

# Cosa vedi di diverso
**A. Niente più righe «consegnato alle».**
- Un messaggio arrivato alla chat è una spunta ✓; passandoci sopra (o toccandola sul telefono) leggi l'ora e il testo.
- Una riga compare solo se qualcosa è fermo: «in attesa da 7 min · 2 messaggi» con «Manda adesso».
- Foto: `prima-04-scheda` (10 righe) e `dopo-04-scheda` (2 righe).

**B. Domande essenziali.** Una scheda per domanda:
- in piccolo, chi chiede e il progetto;
- in grande, la domanda in una frase;
- le risposte come tasti, con la consigliata segnata ★;
- «Scrivi tu»;
- dietro il «?», cosa sta facendo, perché, cosa succede con ogni scelta e se non rispondi.

Niente più cronologia. Foto: `prima-01-domande-autopilota` contro `dopo-01` e `dopo-02` (il «?» aperto), e sulla pagina `pagina-prima-02` contro `pagina-dopo-02`.

**C. La risposta dell'autopilota non si perde più.**
- Le due volte di oggi la causa erano le tue parole citate con le virgolette dritte (`"consegnato alle"`), che rompevano il JSON.
- Ora il testo si ripara, e se una parte resta illeggibile la risposta arriva comunque.
- Le due risposte perse di oggi ora si leggono intere.

**D. Chat che restavano «in attesa».**
- Il 13/10 una chat ferma è rimasta «al lavoro» per 52 minuti, e il messaggio dell'autopilota non le è mai arrivato.
- Ora, se la chat è ferma sul campo, dopo 15 secondi risulta «ferma» e la sua coda parte al giro dopo.

**E. Lista degli autopiloti.**
- Gli autopiloti degli altri PC usano le stesse parole di quelli di qui, sul PC, sulla pagina e nell'app.
- I numeri delle linguette tornano con le righe.
- Un PC compare una volta sola.
- Via le righe vuote «nessun autopilota».

**F. Una chat di un altro PC si apre solo con un tuo comando.**
- Aprire qui un workspace di un altro PC non avvia più là le sue chat chiuse: si avviano con «Avvia là».
- Dopo un riavvio, le chat chieste da un altro PC o dal telefono non ripartono da sole.

**G. Specialisti visibili.**
- L'autopilota decide se dividere il lavoro. Ogni specialista ha la sua chat, con il ruolo nel nome del riquadro: «Sviluppo · Prova flotta».
- La scheda dice come è organizzato il lavoro, oppure perché c'è una chat sola. Mostra ogni specialista con stato, compito, ultima azione e «Guarda», che porta al suo riquadro.

# La prova dal vero degli specialisti (copia di prova)
1. **«Prova piccola»** (crea un file): una chat sola. La scheda lo dice, con il motivo. Foto `g-01-scheda-piccolo`.
2. **«Prova tre specialisti»:** due Sviluppo e un Collaudo, più le Revisioni. Ha trovato un **difetto della 0.71**, che ho corretto:
   - la Revisione approvava, ma il programma respingeva il ramo, perché su un ramo che fa solo un pezzo misurava i criteri di tutto il lavoro;
   - così 6 rifacimenti, poi una domanda per te. Adesso un ramo si respinge solo se rompe qualcosa che prima passava.
   - Foto `g-03-mosaico-specialisti` e `g-04-scheda-specialisti`.
3. **«Prova flotta», dopo la correzione:** due Sviluppo e due Revisione. Tutti e due i rami approvati e uniti, i criteri verdi, finito.
   - Foto `g-06-mosaico-flotta` (i riquadri con il ruolo nel nome) e `g-07-scheda-flotta`.
   - Sulla pagina: `pagina-g-01-specialisti` e `pagina-g-03-guarda-chat`, dove «Guarda» apre la chat.

# Punti aperti
1. **App Android senza foto:** su questo PC non c'è un emulatore né un telefono collegato, e installarne uno non è permesso. L'app è coperta dai test unitari e dalla build.
2. **I riquadri «dal vivo» delle chat di altri PC** si mostrano ancora da soli quando apri un workspace: mostrano, non avviano niente. Se li vuoi chiusi, con un tasto «Apri», dimmelo.
3. **Telefono che non si collega** (dalla c-19): il messaggio con il motivo (Tailscale, rete di casa, chiave) è per la prossima versione. Intanto accendi Tailscale sul telefono.
4. **Le cartelle `note/prova-072`, `note/prova-0721` e `note/prova-073`** sono copie di prova, senza credenziali. Puoi cancellarle.
