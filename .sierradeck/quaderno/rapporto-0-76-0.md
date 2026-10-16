---
titolo: "Rapporto 0.76.0 per Nicholas: i difetti che tornavano da settimane, con i numeri"
quando: 2026-10-16T12:30:00+02:00
tag: ["rapporto", "0.76.0", "per Nicholas", "autopilota", "consegne", "elenco", "domande"]
---

La 0.76.0 (app 2.76.0) è pubblicata con installer, latest.yml, APK firmato e app-android.json. **Non l'ho installata: la installi tu.** Per ogni difetto riporto la causa, provata dal registro o dal vero, la correzione e la prova. Le foto e i numeri grezzi sono in `note/foto-0-76-0/`.

## A. «Procedo», ma la chat resta ferma
- **Causa (registro):** il 15/10 alle 21:50:59 l'autopilota era «finito». Gli hai chiesto se aveva finito; ha risposto «quasi tutto» e ha aggiunto il lavoro che mancava, ma non è ripartito, perché ripartiva solo con un ordine esplicito. La chat è rimasta ferma finché non hai riscritto «vai».
- **Adesso:** se la risposta porta un messaggio per la chat o un cambio, l'autopilota fermo o finito riparte da solo e lo scrive nel registro. Se aveva una domanda aperta, quello che hai scritto vale come risposta. Se resta fermo dopo aver promesso, la scheda mostra «L'autopilota è fermo» con «Riprendi», su PC, pagina e app.
- **Prova:** test sul tuo caso (finito, tu scrivi, risposta con messaggio per la chat): riparte e il messaggio arriva alla chat.

## B. Le consegne che servivano otto invii
- **Causa (provata con Claude Code 2.1.301):** se testo e Invio arrivano a Claude Code insieme, un testo da 70 caratteri in su vale come incollato e l'Invio non manda; nemmeno il primo Invio dopo. Il 16/10 alle 07:27 la consegna c-26 è arrivata mentre il riquadro si rimontava e ridisegnava: il segnale diceva «pronta», ed è partito l'Invio 200 ms dopo il testo. Poi il programma credeva il testo perso e lo riscriveva: per questo è arrivato cinque volte nello stesso messaggio.
- **Adesso:** si scrive solo a terminale quieto. L'Invio parte solo quando il testo si vede nel campo, e se il testo è nel campo non si riscrive mai. Vale anche per le chat in sottofondo.
- **Prova dal vero** (Claude Code vero, lo stesso codice di consegna del programma, i segnali veri). **50 consegne su 50 al primo Invio, nessuna persa, nessuna doppia:**
  - 20 a chat ferma, di cui 10 mentre Claude Code ridisegna e legge in ritardo, simulato per 1,5 s;
  - 15 a chat al lavoro;
  - 15 a chat appena aperta.

  Lo stesso banco con il codice della 0.75.3, a chat che ridisegna: 0 consegne su 5 al primo Invio, 3 invii ciascuna.

## C. L'elenco a sinistra che «scazza»
- **Cause:**
  - le righe seguivano l'ordine in cui i riquadri entravano in memoria, che cambia quando un riquadro si riapre;
  - la stessa chat poteva comparire due volte;
  - la chat davanti, se non l'avevi scelta tu, saltava da sola a chi lavorava o chiedeva;
  - la scelta valeva una sola per tutti i workspace.
- **Adesso:** le righe seguono l'ordine del workspace, una chat è una riga, e la chat davanti resta la tua scelta per ogni workspace.
- **Prova con clic veri** (copia dei dati veri, autopilota con 6 specialisti al lavoro): 4 minuti, 60 clic, **0 cambi d'ordine, 0 doppioni**. In 57 clic su 60 la chat toccata è rimasta davanti; nei 3 restanti era uno specialista che in quel momento finiva e chiudeva la sua chat.

## D. Il riquadro «Documents»
- **Causa:** una riparazione della 0.65.1 aveva rifatto il riquadro di «visitafacile» con il percorso `…\Documents`, cioè la cartella di sistema, guardando DESKTOP. A ogni avvio si riapriva.
- **Adesso:** all'avvio i riquadri remoti in una cartella di sistema escono dalla lista. La chat resta sul suo PC e non si chiude niente.
- **Prova sulla copia dei tuoi dati:** toglie solo quel riquadro.

## E. «Ferma / al lavoro» a caso
- **Cause:**
  - sul PC l'indicatore veniva solo da «il terminale ha scritto da poco»;
  - dopo 15 secondi una domanda a scelte veniva presa per un campo pronto e la chat diventava «ferma»;
  - dopo una risposta a una domanda nessun segnale diceva «riprende».
- **Adesso:** una sola fonte, i segnali di Claude Code (anche quelli nuovi PreToolUse per AskUserQuestion e PostToolUse); lo schermo solo se mancano. Stesso stato su PC, pagina e app, entro pochi secondi.
- **Prova dal vero, 10 minuti** (22 compiti: risposte, comando muto di 45 s, domanda AskUserQuestion, attese, lavoro con output): giusto in **550 secondi su 552 (99,6%)**, **nessun errore che duri più di 5 secondi**. La regola vecchia: 96,7%.

## F. Il pannello dell'autopilota
Nella vista a elenco sta fisso a sinistra, accanto all'elenco, e non sparisce più quando porti davanti un'altra chat (foto `f-01`).

## G. Gli specialisti
- **Cause:**
  - la divisione si sceglieva solo alla prima partenza: l'autopilota di SierraDeck, nato con una chat sola, non si divideva mai;
  - dopo ogni avvio, finché i limiti del piano non erano letti, nessun autopilota si divideva.
- **Adesso:**
  - alla ripresa con un lavoro nuovo l'autopilota rifà la scelta;
  - senza limiti letti si arriva a 2 specialisti, e appena i limiti si leggono vale la soglia vera;
  - gli specialisti sono in ordine di ruolo (Sviluppo, Interfaccia, Collaudo, Revisione, Rilascio) in ogni workspace.
- **Prova dal vero:** un autopilota di prova finito con una chat sola, al tuo messaggio con tre parti nuove, si è diviso in 3 Sviluppo più le loro 3 Revisioni (foto `01-avvio`, `c-99-fine`).

## H. Le domande brevi a lato
- **Regola:** al massimo 200 caratteri e 4 scelte («Scrivi tu» non conta).
  - **PC:** la domanda compare accanto alla chat, con i tasti e «Scrivi tu»; se la colonna Domande è aperta, sta lì.
  - **Pagina e app:** compare in cima alla chat aperta.
  - **Domande lunghe:** restano nella sezione Domande.
- **Prova dal vero:** «Preferisci il rosso o il blu?» compare a lato con Rosso, Blu e «Scrivi tu» (foto `h-02`).

## In più, trovati durante le prove
- Quando uno specialista faceva una domanda, la scheda diceva «il compito non risulta partito», con un tasto «Invio» che avrebbe scelto al posto tuo. Adesso è una nota nel diario.
- **Le chat di prova tolte stamattina sono tornate:** alle 07:36 la sincronia le ha riscaricate dal Drive («ARRIVO: 10 chat»). Adesso una cartella nel recupero non torna dal Drive.

## Dopo che hai installato la 0.76.0
1. In Progetti → Spazio sul Drive conferma «Chat delle prove»: toglie dal Drive le chat di prova. Vanno nel recupero e si annulla.
2. Le quattro cartelle di storie di prova ricomparse su questo PC (prova-c2, prova-c3, prova-collaudo, e la copia di prova-c2 arrivata da DESKTOP) le mando di nuovo nel recupero io, quando me lo dici.
3. Il portatile resta da pulire quando lo accendi: vedi la scheda «Pulizia del portatile, da fare quando si accende».
