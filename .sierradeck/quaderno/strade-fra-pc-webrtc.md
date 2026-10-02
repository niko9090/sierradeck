---
titolo: "Strade fra PC: rete di casa, Tailscale, WebRTC, Drive (0.40.0)"
quando: 2026-10-02T14:30:00+02:00
tag: ["multi-pc", "remoto", "webrtc", "drive", "tailscale", "sicurezza", "decisione-nicholas", "limite"]
---

# La decisione (Nicholas, 02/10)

Le chat degli altri PC vanno raggiunte anche quando i PC sono su reti diverse e senza Tailscale.

- **Ordine dei tentativi**: rete di casa, poi Tailscale, poi WebRTC, poi la cassetta sul Drive.
- La cassetta è lenta e dichiarata: serve solo per leggere lo schermo e mandare un messaggio.
- Il riquadro remoto mostra la strada usata.
- Il telefono resta com'è, salvo mostrare la strada.

# Come funziona

- **La scelta è pura**, in `src/shared/strada-pc.ts`:
  - `indirizzoPreferito`: fra gli indirizzi che rispondono vince la rete di casa, poi Tailscale. Il bussare va su tutti insieme e Tailscale a volte arriva prima.
  - `prossimaMossa` dice se si chiama via `http`, `rtc`, `aspetta-rtc`, `drive` o `errore`, e se va avviato il WebRTC.
    - Dopo un WebRTC fallito lo si riprova ogni 2 minuti, e intanto si usa il Drive.
    - Con la chiave rifiutata (401) nessuna strada aiuta.
  - `etichettaStrada` e `stradaBreve` danno i testi del riquadro e del telefono.
- **Il client remoto**, `src/main/pc-remoto.ts`:
  - prima la strada diretta, poi le mosse;
  - `stradaDi(pcId)` dice la strada usata, e ogni `EsitoRemoto` la porta (`strada`);
  - usando WebRTC o Drive ribussa direttamente solo ogni 30 secondi (`RIBUSSA_OGNI_MS`).
  - Motivi nuovi: `collegando` (WebRTC in apertura, o schermo via Drive non ancora arrivato) e `lento` (via Drive non si può).
- **WebRTC**, in `src/main/rtc/`:
  - `ponte-rtc.ts`: una finestra **nascosta** con il preload `src/preload/ponte-rtc.ts`, che apre gli `RTCPeerConnection` di Chromium. Niente moduli nativi (Smart App Control).
    - Si crea al primo uso.
    - È esclusa da `finestreDiChat()` con `segnaFinestraDiServizio`.
    - Si chiude da sola quando restano solo finestre-ponte, così `window-all-closed` arriva come prima.
    - I messaggi oltre 60 KB si spezzano in pezzi.
  - `collegamento-rtc.ts` è la regia, senza Electron:
    1. chi chiama scrive `rtc-offerta-<lui>-<io>` nella scatola dei battiti;
    2. chi risponde guarda ogni 10 secondi (`cercaOfferte`, solo per i PC noti) e scrive `rtc-risposta-<lui>-<io>`;
    3. le due descrizioni SDP si scambiano **senza trickle**: si aspettano tutti i candidati, al massimo 6 secondi. Bastano due file sul Drive.
    4. Sul canale ci si saluta con un «ciao» sigillato, poi passano le richieste.
    - Offerta e risposta si cancellano dopo l'uso.
  - **Sicurezza**, in `cifra-canale.ts`. La chiave è la chiave di casa di chi risponde (`client-pc:<id>`), derivata con HKDF e usata con AES-256-GCM.
    - La SDP sul Drive è cifrata e autenticata, legata al giro e al verso. Siccome porta l'impronta DTLS, nessuno si mette in mezzo, nemmeno chi ha accesso al Drive.
    - Ogni messaggio del canale è cifrato una seconda volta, oltre al DTLS. Ha un numero crescente, quindi un messaggio ripetuto si scarta, e il verso entra nell'autenticazione.
    - Sul canale passano solo le rotte del riquadro remoto (`ROTTE_VIA_CANALE`); le altre ricevono 403.
    - Chi risponde esegue le richieste con le rotte del Client (`rottaPerAltriPc` in `index.ts`, dispositivo `pc`).
  - STUN pubblici (Google, Cloudflare), **nessun TURN**.
- **La cassetta sul Drive**:
  - `cassetta-drive.ts` è il lato di chi guarda. Scrive `schermo-chiesto-<id>` al massimo una volta al minuto e legge `schermo-<id>`.
    - Risponde come il Client: 425 vuol dire «aspetta», 405 «via Drive non si può».
    - `/api/scrivi` lascia una voce nella cassetta della posta di quel PC, con la sessione precisa.
  - Il postino (`progetti/posta.ts`) è il lato di chi è guardato. Se la richiesta ha meno di 3 minuti, scrive lo schermo (`fotografa`: 8 chat, 80 righe).
    - `giroVeloce` (ogni 10 secondi, solo mentre qualcuno guarda) riscrive lo schermo e consegna la posta.

# Limiti da ricordare

- **Niente TURN.** Dietro due NAT «simmetrici» (alcune reti aziendali, hotspot del telefono) il canale non si apre e si passa al Drive. Il registro dice «servirebbe un server TURN, che non usiamo». Aggiungerlo vorrebbe dire un server a pagamento o di terzi: la decisione spetta a Nicholas.
- **WebRTC e cassetta richiedono il Drive collegato** su tutti e due i PC, perché lo scambio iniziale passa da lì, e la **0.40.0 su tutti e due**.
- L'apertura richiede 10-90 secondi: la risposta passa dal Drive, controllato ogni 10 secondi, più i candidati. Intanto il riquadro dice «Cerco un'altra strada».
- Via Drive non si premono le opzioni e non si riaprono le chat.

# Prove

- **Vitest**:
  - `tests/shared/strada-pc.test.ts` (ordine, mosse, etichette, segnali, schermo);
  - `tests/main/cifra-canale.test.ts`;
  - `tests/main/collegamento-rtc.test.ts` (ponte finto: apertura, rotte vietate, altra cassaforte, nessuna risposta, NAT chiuso, chiusura, messaggi falsi);
  - `tests/main/cassetta-drive.test.ts` (i due lati con il postino);
  - `tests/main/pc-remoto-strade.test.ts`;
  - `tests/shared/domande-strada.test.ts`.
- **In Electron, a mano** (script di prova, non nel repository):
  - due ponti veri nello stesso processo, con un Drive in memoria;
  - il canale si apre (circa 10 secondi, soprattutto per la raccolta dei candidati);
  - 248 KB arrivano interi, una rotta vietata riceve 403, sul Drive non resta niente;
  - chiusa la finestra di chat, i ponti si chiudono e il programma esce.
  - Funziona con `contextIsolation: true` e `sandbox: true`.
- **Da fare con Nicholas**: la prova vera fra due PC su reti diverse, per esempio uno sull'hotspot del telefono.
