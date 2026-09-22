---
titolo: "Chat dal vivo su un altro PC (riquadro remoto, 0.33.0)"
quando: 2026-09-22T16:10:00+02:00
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
