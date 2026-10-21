---
titolo: "0.84.0: domande chiare per sempre, domande superate chiuse da sole, domanda intera accanto alla risposta (c-61)"
quando: 2026-10-21T19:45:00+02:00
tag: ["0.84.0", "domande", "autopilota", "chiarezza", "c-61"]
---

**Perché.** Le domande vere arrivate a Nicholas dal 17 al 21/10 (lette nella memoria e nella scheda Domande del servizio, `%APPDATA%/SierraDeck/autopiloti/servizio/`):
- «Come vado avanti con questo pezzo?». Lui ha risposto «quale pezzo???» e «di che lavoro parli?». Questa domanda la scriveva **il programma stesso**, dopo due respinte della Revisione;
- «Chiudi tu a mano le chat c-7 e c-4…?» e «…così chiudo le chat finite c-7, c-10 e c-12?»: sigle;
- «Quell'autopilota con la tua richiesta su Nexora lo sposto…?»: riferimento vago;
- «Will you install the 0.80.0…?»: in inglese;
- 21/10, due domande «idle_prompt: Claude is waiting for your input» con «⚠ Domanda incompleta», da chat che avevano solo finito («la chat la chiudi tu»). Erano **ancora aperte** la sera, con le chat già chiuse;
- 19 risposte date dall'autopilota stesso, mostrate sotto «Claude is waiting for your input» invece che sotto la domanda vera.

# Come funziona
- **`src/shared/domanda-chiara.ts`** contiene le regole che il programma controlla da solo, senza un modello:
  - `SIGLA_CHAT`: «c-12», o il ramo «ap/ap-…/c-12». Non conta dentro un percorso (`consegne/c-440.md`) né dentro una parola;
  - `RIFERIMENTI_VAGHI`: «quel pezzo», «l'altra chat», «quell'autopilota», «come detto»…;
  - `senzaSigle` e `partiSenzaSigle`: la sigla diventa il compito della chat fra «», e una sigla sconosciuta diventa «una chat precedente»;
  - `partiDaChatFerma`: la domanda scritta dal programma quando il supervisore non risponde. Se il messaggio della chat finisce con una domanda vera si usa quella; altrimenti «Cosa deve fare adesso la chat che lavora a «…»?». Il messaggio intero va nel «perché».
- **`validaDomanda`** (`domanda-strutturata.ts`) adesso rimanda indietro anche:
  - sigle e riferimenti vaghi;
  - una scelta **qualunque** senza conseguenza (prima bastavano due);
  - l'inglese nelle scelte.
- **`domandaControllata(…, chat)`** sostituisce le sigle **prima** del controllo e **dopo** la riscrittura. Così le sigle non costano un giro del supervisore.
- **Nel servizio** (`server.ts`):
  - le domande del supervisore (fine turno) e delle notifiche passano le chat dell'autopilota;
  - lo scarto contro lo stato vero si fa **anche sulla domanda con le sigle**: «chiudo la c-15?» si riconosce solo da lì.
- **`ricontrollaDomande`** gira all'avvio del servizio e ogni 10 minuti (`index.ts`). Chiude una domanda quando:
  - l'autopilota non c'è più o ha finito;
  - **tutte** le chat che la aspettano (anche le `ancheChat`) sono chiuse o senza copia;
  - lo stato vero l'ha già risolta. In quel caso le chat bloccate ripartono con «Non serve più chiederlo: …».

  Le preparazioni e le domande `trattenuta` (con un hook che aspetta) non si toccano.
- **`registro.superata(id, motivo)`** non è una risposta di Nicholas: non va in memoria e non fa partire la risposta tardiva. Resta fra le risolte come «Superata, non serve più: …», con la domanda intera.
- **Le risolte** tengono 6000 caratteri (prima 1200). La domanda è quella vera, non la notifica.
- **Telefono:** chi risponde dalla notifica la vede restare per 10 minuti, con la domanda intera e «Hai risposto: …» sotto (`RispostaVeloce.testoDopoRisposta`). Prima la notifica spariva. **Tocca `android/`: alla 0.84.0 serve un APK nuovo.**

# Test
- `tests/shared/domanda-chiara.test.ts`: i casi veri del 19-21/10, sia quelli scartati sia quelli che passano. La domanda SSH di nexora-nas del 21/10 era già chiara e passa così com'è.
- `tests/autopilot-host/domande-chiare-servizio.test.ts`: nel servizio vero. Copre la notifica senza supervisore, le sigle nella domanda del supervisore, le risolte con la domanda vera, e il ricontrollo (chat chiusa, chat agganciate ancora vive, stato vero con ripresa, domanda trattenuta).
- Kotlin: `RispostaVeloceTest`.

# Revisione (21/10): 7 punti, tutti corretti
- `superata` **non** chiude una domanda se qualcuno la sta aspettando con `attendi`. Il caso è «Pubblico adesso?», che non porta `trattenuta`: chiuderla la faceva sembrare scaduta.
- **Gemelle**: la grezza (con le sigle) si confronta con la grezza, la domanda pronta con quella mostrata. Altrimenti due chat con la stessa domanda «c-7 e c-4» ne aprivano due.
- `nomeCompito` toglie le sigle anche dal compito della Revisione («Rivedi il ramo ap/…/c-12 della chat c-12 («…»)» → «Revisione di: …»).
- La domanda **generica** del programma («Cosa deve fare adesso la chat…?») non passa da `domandaDaScartare` né dalle gemelle. Altrimenti un «fermati» di ieri avrebbe risposto a ogni fermata nuova della stessa chat per 24 ore.
- La grezza è la domanda con le sigle in tutti e due i percorsi: così il ricontrollo riconosce «chiudo la c-15?».
- «Claude needs your permission to use X» diventa «Chiede il tuo permesso per usare X.».
- I nomi di file come `c-310.log` non sono sigle.

# Trappole
- Le domande vecchie in `domande-aperte.json` hanno la «grezza» con «idle_prompt…». Due grezze così si somigliavano abbastanza da diventare **gemelle** (`aperteSulloStesso`): il 21/10 la domanda di c-22 aveva agganciate c-44, c-8 e c-40. Con la domanda scritta dal programma ogni chat ha la sua.
- Gli hook ECC (GateGuard) erano attivi in questa copia: chiedono «i fatti» prima del primo Bash, Write ed Edit di ogni file. Sono il punto 3.5 della lista.
