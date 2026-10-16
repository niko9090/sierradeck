---
titolo: "App Android: analisi, correzioni e allineamento"
quando: 2026-10-16T10:39:47.733Z
tag: ["autopilota", "finito", "incompleto"]
sessione: 1ff78f5e-523c-43b4-b74f-044d9691131d
---

## Obiettivo

0.76.0: togliere davvero i difetti che tornano (l'autopilota che promette lavoro ma resta fermo, le consegne con molti tentativi, l'elenco delle chat che si scompone, il riquadro Documents di sistema, l'indicatore ferma/al lavoro inaffidabile) e dare ordine: il pannello dell'autopilota sempre in vista a sinistra, specialisti veri e visibili per tutti gli autopiloti, le domande brevi a lato della chat. Per ogni punto: causa provata, test, prova dal vero. Su PC, pagina e app. Una sola release 0.76.0, mai installata da noi; rapporto in italiano con numeri e foto. Proprietario: Nicholas Ferrari / Ferrari Consulenze.

## Come è finita

- ⬜ Autopilota che promette lavoro: ripresa obbligatoria se la risposta ha perLaChat o un cambio, altrimenti la scheda mostra «L'autopilota è fermo: Riprendi»; test
- ⬜ Consegne: causa trovata; 50 consegne di fila su una chat di prova, almeno il 95% al primo tentativo e nessuna persa; numeri nel rapporto
- ⬜ Indicatore ferma/al lavoro: una fonte sola (gli hook), lo schermo come riserva; uguale su PC, pagina e app entro 5 secondi; prova di 10 minuti con i numeri; test
- ⬜ Panoramica come prima linguetta di ogni workspace: obiettivo, stato e criteri in alto; dialogo con l'autopilota a sinistra; schede delle chat con stato, ultima azione e righe dal vivo in ordine stabile al centro; domande brevi a destra. Poi una linguetta per chat a tutta larghezza; su telefono una lista di schede. Revisione UI/UX, test, prova con clic veri e foto
- ⬜ Specialisti veri per tutti gli autopiloti, anche quelli esistenti: chat con il ruolo nel nome, visibili nella Panoramica; prova dal vero con foto
- ⬜ Domande brevi a destra nella Panoramica, con tasti e Scrivi tu; quelle lunghe solo nella sezione Domande; test
- ⬜ Nessun riquadro di cartelle di sistema; nessuna chat vera chiusa
- ⬜ Release 0.76.0 pubblicata con APK, latest.yml e app-android.json, non bozza, mai installata; rapporto in italiano con numeri e foto
- ✅ I test del programma passano
- ✅ Il TypeScript del programma compila senza errori
- ✅ L'app Android compila e i suoi test unitari passano

## Le mosse che contano

- **2026-10-16 07:53** — supervisore → finito: Ho verificato: sono tolti il dispositivo temporaneo (resta solo il telefono), lo script, che non gira più, e le copie in note/. La pulizia di questo PC e di DESKTOP è fatta e annullabile. La parte del portatile è scritta passo per passo nel quaderno e si potrà fare solo quando Nicholas lo accende: continuare adesso farebbe solo girare a vuoto.
- **2026-10-16 07:53** — scheda nel quaderno: Promemoria: portatile e proposta «Chat delle prove»
- **2026-10-16 08:14** — su tua richiesta: Hai ragione, e ti chiedo scusa: sono gli stessi problemi da troppo tempo. Questa volta ho guardato il registro di stamattina e ho trovato le cause vere, non delle ipotesi.

**1. «Ti dico che procedo ma la chat resta ferma».** Le cause sono due.
- **Quando l'autopilota ha già finito**, se gli scrivi 
- **2026-10-16 08:14** — ripreso su tua richiesta («Riprendi»)
- **2026-10-16 08:48** — su tua richiesta: Grazie, così è più chiaro. Aggiungo tutto allo stesso lavoro, in una sola versione che installi tu.

1. **L'indicatore «ferma» o «al lavoro» che va un po' a caso.** Diventa una regola sola: decidono i segnali che Claude Code manda quando inizia e quando finisce, e lo schermo serve solo come riserva.
- **2026-10-16 08:49** — la chat lavora e un messaggio aspettava da 2 min: glieli scrivo adesso, durante il turno
- **2026-10-16 08:51** — su tua richiesta: Bella domanda. Secondo me **sì, le linguette in alto funzionano meglio**, con un accorgimento.

**Come lo farei:**
- **In alto, una linguetta per ogni chat del workspace:** gli specialisti con il ruolo nel nome (Sviluppo, Collaudo, Revisione…) e le tue chat normali. Ogni linguetta ha il pallino dell
- **2026-10-16 09:10** — su tua richiesta: Sì, si può fare, ed è un'ottima idea: risolve proprio il problema di avere tutto sotto controllo. Lo farei così.

**Linguetta 1, «Panoramica» (la dashboard del progetto)**, dove vedi tutto in un colpo:
- **in alto**, una riga con l'obiettivo dell'autopilota, il suo stato (al lavoro, aspetta te, ferm
- **2026-10-16 09:48** — supervisore → prosegui: La 0.76.0 è pubblicata ma senza la Panoramica decisa da Nicholas, perché la decisione è arrivata dopo; l'unico pezzo che manca è quella vista, come 0.77.0.
- **2026-10-16 09:48** — supervisore → prosegui: La chat è ferma da tre giri ad aspettare la revisione: il lavoro sulle funzioni pure non dipende da quella e può andare avanti subito.
- **2026-10-16 10:39** — supervisore → finito: Ho verificato: la 0.77.0 è pubblicata (non bozza, con installer, latest.yml, APK 2.77.0 e app-android.json), non è installata ed è allineata con origin. Copre la Panoramica decisa da Nicholas e la 0.76.0 copre gli altri punti; i test passano. Quello che resta dipende solo da Nicholas.
- **2026-10-16 10:39** — scheda nel quaderno: Dopo la 0.77.0: in attesa di Nicholas

## In numeri

- interventi: 126
- cartella: `~\Documents\SierraDeck`
