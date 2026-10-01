---
titolo: "Chat dal vivo su un altro PC (riquadro remoto, 0.33.0; apertura automatica 0.36.1)"
quando: 2026-10-01T12:00:00+02:00
tag: ["multi-pc", "client", "drive", "tailscale", "sicurezza"]
---

# Cosa fa

Una chat la cui cartella sta su un altro PC si **guarda e si comanda dal vivo** da qui, senza aprire un `claude.exe` in una cartella vuota. Il riquadro (`RiquadroRemoto.tsx`) bussa al **Client di quel PC** (porta 47640, le stesse rotte del telefono: `/api/stato`, `/api/storia`, `/api/scrivi`, `/api/scegli`, `/api/sessioni/riprendi`) e mostra le righe vestite del suo terminale (`ansiInHtml`), rilette ogni 2 s.

Tre ingressi: il riquadro «chat di un altro PC» (bottone «Guarda dal vivo su …», che trasforma il riquadro in place con `rendiRemoto`), Account → Altri computer → «Chat aperte», e «Riprendi una conversazione» (etichetta «su X · acceso, dal vivo / spento, sola lettura»; con PC acceso apre direttamente il riquadro remoto).

# Come si trovano e si riconoscono i PC (nessun accoppiamento)

- **Dove bussare**: il battito `pc-<id>` sul Drive porta `indirizzi` (da `indirizziLocali`, principale davanti, Tailscale peso 45, schede virtuali in fondo) e `porta`. Versioni < 0.33.0 non li hanno → errore `senza-indirizzi` con il testo «aggiornalo alla 0.33.0».
- **Chiave di casa**: `sincronia.chiaveDiCasa(scopo)` = HMAC-SHA256(maestra, scopo) in base64url. Chi bussa a B usa `client-pc:<idB>`; il server di B accetta la stessa (`DipendenzeClient.chiaveDiCasa`) e la richiesta entra come dispositivo `{id:'pc', nome: header x-sierradeck-pc}`. Niente viaggia sul Drive, niente su disco; **a cassaforte chiusa (da una delle due parti) non si entra** → 401 → motivo `chiave`.
- Il primo muro (rete locale) resta: Tailscale 100.64/10 è già accettato da `daReteLocale`. Da una rete pubblica serve «accetta anche da fuori la rete locale» su quel PC (403 → motivo `rifiutato`).

# Il client (`src/main/pc-remoto.ts`)

`creaClientPcRemoto` prova gli indirizzi in fila (4 s ciascuno, `AbortController`), ricorda quello che risponde (`indirizzoBuono`), e lancia `ErroreRemoto` con un `motivo` (`sconosciuto`, `cassaforte`, `spento`, `senza-indirizzi`, `irraggiungibile`, `chiave`, `rifiutato`, `chat`, `http`) e un messaggio per esteso che dice cosa fare. L'IPC `remoto:*` restituisce `EsitoRemoto<T>` (`{ok, dati} | {ok:false, motivo, messaggio}`) invece di lanciare: attraverso l'IPC l'errore perderebbe il motivo. `spento` non prova neanche gli indirizzi (evita 8 s di attesa a ogni giro).

# Nel layout

`PaneData`/`PaneSalvato.remoto = { pcId, pcNome, cwd, sessione? }` (parsePane scarta il campo se incompleto). `App.tsx` **non annuncia** i riquadri remoti come chat aperte (altrimenti il battito di qui direbbe di avere aperta la chat dell'altro PC). Niente ⏸ per un riquadro remoto; ✕ chiude solo il riquadro, la chat resta là.

# Trappole viste

- Non si può provare end-to-end finché il PC in ascolto gira una versione < 0.33.0 (niente `chiaveDiCasa` nel server): il test `pc-remoto.test.ts` accende un `creaServerClient` vero su 127.0.0.1 e ci bussa con il client remoto.
- Il portatile pubblica indirizzi 192.168.x + 100.x (Tailscale): a casa risponde il primo, fuori il secondo; il riquadro dice su quale sta parlando.
- `leggiAltrui` deve togliere `indirizzi`/`porta` dallo spread prima di rivalidarli, o un battito con `porta: "x"` passa (test «battito rotto»).

# 0.36.1 — si apre dal vivo da sola, niente errore (difetto di Nicholas, 01/10)

**Il difetto.** Aprendo un workspace con chat che vivono su un altro PC si vedeva un errore invece di lavorarci a distanza. Le cause erano due:
- (a) lo spawn locale si fermava con «Questa chat lavora su X» e chiedeva di scegliere (guarda dal vivo / apri qui lo stesso);
- (b) una chat nata là, senza trascrizione qui, partiva lo stesso e finiva nella diagnosi «la trascrizione non c'è».

Inoltre una chat **aperta** su un altro PC, con cartella e trascrizione anche qui, si apriva qui: due copie.

**La correzione.** Il riquadro decide *prima* di aprire. La funzione pura `src/shared/apertura-chat.ts` → `decidiApertura` restituisce `locale | remoto | attesa`, e ogni strada che monta `Terminal` (ripristino, «Torna a com'era», «Riprendi») passa da lì. La raggiunge via IPC `chat:daDove` (`window.gestore.remoto.daDove`), registrato in `index.ts` accanto ad `altrove()`.
- **Prove** che la chat è di un altro PC, in ordine:
  1. il battito di quel PC la elenca fra le chat aperte (vince il più recente);
  2. la cartella qui non c'è e i battiti o il registro dei progetti dicono di chi è.
- **Senza prove si apre qui.** Una chat nuova (senza trascrizione) con la cartella qui resta locale, anche se un altro PC ha la stessa cartella.
- **PC vivo** (battito < 5 min) → `rendiRemoto` subito.
- **PC che tace** → riquadro d'attesa «su X · spento o non risponde», con `daQuandoTace` e le quattro strade spiegate: aspetta, Porta qui (la scheda Drive si apre con l'evento `sierradeck:apri-pannello`), chat nuova, apri qui lo stesso. Ogni 20 s richiede `daDove` e diventa remoto da solo quando quel PC torna.
- **Eccezioni:** un riaggancio a un pty vivo e le chat di autopilota non chiedono. Se `daDove` fallisce, si apre qui come prima.
- **Fallback:** anche `suAltrove` (lo spawn che scopre la cartella altrove) passa da `daDove`. Il vecchio pannello di scelta resta solo se la risposta è «locale».
- **RiquadroRemoto:** se quel PC smette di rispondere a metà non passa all'errore. Tiene l'ultimo schermo, mostra `descriviSilenzio` («non risponde da N secondi · riprovo da solo»), blocca l'invio e riprova a ogni giro (2 s).
- **Telefono/pagina:** il 409 di `/api/sessioni/riprendi` per una chat di un altro PC dice «su X · acceso / spento o non risponde» e cosa farà il computer. Il testo arriva uguale a app e pagina, quindi l'APK non cambia.

**Test:** `tests/shared/apertura-chat.test.ts` (PC vivo → remoto, spento → attesa, locale, trascrizione qui ma aperta là → remoto, chat nuova resta locale, silenzio del riquadro remoto) e il caso nuovo in `tests/main/client-rotte.test.ts`.

**Non fatto (P1 nell'analisi dell'app):** dal telefono una chat di un altro PC non si guarda ancora dal vivo. Serve il ponte sul PC accoppiato.
