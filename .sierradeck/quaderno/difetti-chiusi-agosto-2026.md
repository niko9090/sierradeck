---
titolo: "Nove difetti chiusi, e cosa insegnano"
quando: 2026-08-29T19:05:00+02:00
tag: ["bug", "autopilota", "android", "rilasci", "verifica"]
---

Le versioni 0.12.29, 0.12.30 e 0.12.31 non aggiungono niente: correggono. Vale la
pena tenerne traccia perché quasi tutti questi difetti hanno la **stessa forma** —
funzionano nel caso normale e sbagliano in quello storto, senza dire niente.

## L'autopilota (0.12.29)

**Un criterio non misurato non è un criterio verde.** `fallitiDavvero` esclude i
criteri il cui comando non è nemmeno partito, e giustamente: un comando rotto non
boccia niente, e contarlo fra i bocciati manderebbe la chat a correggere codice
sano. Ma questo lasciava aperta la porta di «finito», e il lavoro si chiudeva con
una parte mai controllata.

Le due strade ovvie sono tutte e due sbagliate: chiudere è il fallimento
silenzioso peggiore che questo sistema possa produrre; insistere vuol dire girare
finché non scade un tetto, perché il comando rotto resta rotto (la riparazione
automatica ha già provato, in quello stesso giro). **Si chiede all'utente.** È una
domanda breve — «questo comando non parte, chiudo lo stesso o lo sistemi?» — e
l'autopilota resta vivo ad aspettarla.

Il cambio ha riscritto un test che pinnava la regola opposta, col perché dentro.
Un test che pinna una decisione non è intoccabile: è il posto dove si scrive che
la decisione è cambiata, e perché.

**Il timeout deve portarsi via anche i figli.** `figlio.kill()` uccideva la sola
shell. Un criterio come `npm run dev & sleep 6; curl …` lascia in piedi un albero
che la morte della shell non tocca: resta acceso, tiene la porta occupata, e il
giro dopo lo stesso criterio fallisce per «indirizzo già in uso». Il timeout,
invece di ripulire, **avvelenava i tentativi successivi** — e il sintomo appariva
in un posto che col timeout non c'entrava niente.

`taskkill /PID <pid> /T /F` su Windows (`/T` è tutta la differenza), `SIGKILL` al
gruppo altrove — per questo su POSIX il figlio nasce `detached`: senza, non c'è
nessun gruppo da prendere.

**Le istruzioni non si perdono più per strada.** `GET /consegne` svuotava la coda
nell'istante della risposta: la coda si fidava della rete. Una risposta persa, il
Gestore chiuso un attimo dopo, o nessuna finestra dove mettere l'istruzione, e
l'istruzione spariva — con l'autopilota fermo ad aspettare la risposta a un
messaggio che nessuno aveva mai scritto.

Adesso resta in coda finché non arriva la conferma. Il prezzo è che una consegna
può arrivare **due volte**, e per questo chi la riceve scarta gli id già visti:
*consegnare due volte si rimedia con una riga, perdere un'istruzione no.*

## Il guardiano (0.12.30)

C'era, e guardava l'autopilota nel suo insieme. Con una flotta bastava che **una**
chat chiudesse i suoi turni perché tutte le altre risultassero vive: quella
impiantata restava appesa per sempre, e il pannello diceva «al lavoro» perché le
sorelle rispondevano.

La chiave del turno adesso è `autopilota::chat`. E il motivo della sospensione
dice **quale** tace e da quanto — senza, chi guarda non sa dove guardare.

Dettaglio che vale per ogni misura nuova su dati vecchi: serve un **ripiego a due
passi**. Le flotte nate prima hanno segnato i turni sotto la sola id
dell'autopilota; senza ripiego, al primo giro dopo l'aggiornamento sarebbero state
sospese tutte insieme.

## L'app Android (0.12.31)

- **`pulisci()` cercava i due punti in tutto l'indirizzo.** Con un percorso dietro
  la porta finiva in coda — `http://192.168.1.5/deck:47640` — e due punti dentro
  un frammento (il QR ne ha) facevano credere che la porta ci fosse già, con la
  richiesta che finiva sulla 80. La porta si guarda **solo nell'autorità**; e
  l'IPv6 è pieno di due punti dentro le quadre, quindi si guarda dopo la quadra
  chiusa.
- **I numeri delle notifiche si sovrapponevano.** 100, 500 e 900 con dodici bit
  d'impronta sopra: bande larghe 4096 distanti 400. Un autopilota che finiva
  poteva cancellare l'avviso di uno che si era fermato — cioè proprio quello che
  chiedeva qualcosa. E le domande avevano un id fisso: la seconda domanda aperta
  cancellava la prima, che restava senza risposta perché nessuno la vedeva.
- **L'APK arrivava da un indirizzo non vincolato.** È l'unica cosa che l'app
  installa. Ora deve venire dalle nostre pubblicazioni e **in https**, controllato
  in due punti — quando si sceglie l'allegato e appena prima di scaricarlo —
  perché fra i due passa del tempo e una risposta di rete.
- **`runOnUiThread` accodava anche a Activity morta.** La guardia va messa due
  volte: prima di accodare e dentro la coda. Fra i due c'è un giro, ed è lì che
  l'Activity muore.

## Il mosaico (0.12.31)

`ceduti` cresceva di una voce a ogni spostamento fra finestre: il ramo di successo
non toglieva niente. Si toglie **dopo** l'attesa della consegna — `ceduti` è
l'unico segnale che dice al `Terminal` di staccare invece di chiudere, e la
pulizia del suo effetto parte un istante dopo lo stacco.

## Cosa si è imparato sui rilasci

**Pre-creare la release con `gh release create` prima di `npm run pubblica`
elimina la race di electron-builder.** Tre pubblicazioni di fila, nessuna 422 e
nessuna release doppia — mentre la 0.12.28, pubblicata senza pre-crearla, l'ha
presa. In più il titolo resta quello giusto: electron-builder, creandola lui, lo
scrive **senza la `v`**.

Checklist dopo ogni pubblicazione, tutte e quattro le volte utile:
una sola release · titolo `vX.Y.Z` · exe + latest.yml + blockmap · lo `sha512`
dentro `latest.yml` uguale a quello dell'installer in `dist` (se non combacia,
l'aggiornamento automatico non parte e nessuno se ne accorge).

## 0.12.32 — i due che si sono visti sul campo

**«Cannot set properties of undefined (setting 'isWrapped')».** Nel registro due
volte, dentro `lineFeed` → `parse` → `write`. Sembra un difetto della scrittura,
e non lo è: `FitAddon.fit()` sta in un `ResizeObserver`, e quando il riquadro non
è a schermo il contenitore è alto zero, la proposta è **zero righe**, e il
terminale ci va davvero. Un terminale a zero righe non ha buffer, e a farlo
cadere è la **prima riga che arriva dal processo** — mezzo minuto dopo, in un
punto che con il ridimensionamento non c'entra niente.

È il motivo per cui era rimasto in giro: *lo stack non nomina mai il colpevole.*

La regola: **zero non è una misura piccola, è nessuna misura.** Un contenitore
senza dimensioni non dice «fammi piccolo», dice «adesso non sono a schermo», e la
risposta è non toccare niente. E il processo si avvisa **solo** se l'adattamento
è avvenuto: mandare `0×0` al pty sarebbe un secondo guasto in un altro processo.
Guardia in `renderer/adatta-terminale.ts`, usata da tutti e tre i terminali.

**Il guardiano ha fermato un autopilota perché stava lavorando.** Mezz'ora di
silenzio era una stima, scritta nel codice come «sotto la mezz'ora ci stanno i
turni lunghi veri». Sul campo ha sbagliato: un turno che compila un'app Android e
pubblica tre volte passa i quaranta minuti senza essere fermo un istante, e si è
visto sospendere.

Il numero si sceglie guardando **l'asimmetria del danno**, non la media dei
turni: sospendere per sbaglio ferma del lavoro che andava bene, accorgersi tardi
di una chat impiantata costa **solo attesa**. Fra i due errori si sceglie di
sbagliare per pazienza — un'ora.

E il motivo non indovina più. «Forse è ferma su un comando che non finisce» è una
delle due spiegazioni possibili presentata come la sola, e manda a cercare il
guasto dalla parte sbagliata: la stessa lezione già imparata sul negozio vuoto.

## 0.12.34 — il guardiano che sospendeva chi stava aspettando te

**Una chat bloccata su una domanda veniva contata fra quelle mute.** `chiTace`
saltava solo le chat `finita`, non le `bloccata` — cioè quelle ferme ad aspettare
una risposta dell'utente. Passato il limite di silenzio, l'autopilota si
sospendeva **per la lentezza dell'utente**, scrivendo pure che era la chat a non
dare segnali. Una domanda può arrivare di notte e trovare risposta la mattina: chi
aspetta una persona non è fermo.

**E ripartire non faceva ripartire l'orologio.** Il silenzio si misura
dall'ultimo turno *chiuso*. Quando un turno **comincia** — una chat ripresa dopo
una risposta, una chat di flotta appena aperta — l'ultimo turno chiuso può essere
di ore prima: il primo giro del guardiano sospendeva l'autopilota un minuto dopo
averlo rimesso al lavoro. Ora ogni avvio di turno passa da un involucro che segna
l'ora, e ogni hook che arriva — non solo `stop` — vale come prova di vita.

Lezione generale sul misurare: **il segnale che si misura dev'essere uno che il
caso sano può dare.** Il `Stop` è esattamente il segnale che una chat dentro un
turno lungo non può mandare, ed era l'unico che contava.

## Il servizio che moriva in silenzio

Il Gestore aveva la rete di sicurezza (`uncaughtException` / `unhandledRejection`
in `main/index.ts`); **il servizio dell'autopilota no** — ed è quello che ne ha
più bisogno: gira staccato, per giorni, e se muore si fermano tutti gli
autopiloti insieme. Peggio: è lanciato `detached` con `stdio: 'ignore'`, quindi
nessun `console.error` di lì dentro finisce da qualche parte. Adesso apre il
registro (lo stesso file del Gestore: una sola cronologia) e ci scrive il motivo
invece di sparire.

Nota: il pty-host non ha questo problema — `pty-host-client` lo sorveglia e lo
riavvia con attese crescenti. Il servizio autopiloti viene ripreso solo da
`assicuraServizio`, che gira quando il pannello legge l'elenco: cioè **solo con
una finestra aperta**, e la finestra chiusa è proprio il caso per cui il servizio
esiste.

## Le letture che non finivano mai

`leggiCorpo` esisteva in due copie quasi uguali — server del Client e servizio —
e ascoltavano solo `data` e `end`. Una richiesta che muore a metà (il telefono
che esce dalla galleria, il cavo staccato) non manda nessun `end`: la promessa
non si risolveva **mai**, e chi l'aspettava restava lì per sempre. Su processi
che restano accesi per giorni è memoria che non torna indietro. In più il
servizio non aveva **nessun tetto** sulla dimensione del corpo.

Ora è una sola funzione provata (`shared/corpo-richiesta.ts`): si risolve sempre,
per una delle quattro strade — finito, chiuso, in errore, oltre il tetto.
