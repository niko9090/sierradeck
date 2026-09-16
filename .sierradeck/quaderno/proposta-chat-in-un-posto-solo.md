---
titolo: "Proposta: ogni chat vive su un PC solo, gli altri la guardano dal vivo (come fa il telefono)"
quando: 2026-09-16T17:30:00+02:00
tag: ["drive", "sync", "multi-pc", "architettura", "proposta", "decisione-da-prendere"]
---

Nicholas (16/09): «la parte di drive e la soluzione in generale di condividere in
questo modo le chat non sta funzionando benissimo. mi trovi delle soluzioni
migliori? se facessimo come per l'app che le altre chat possiamo vederle in
remoto come se fossimo collegati a quel pc?». Questa scheda è la risposta
ragionata; **nessuna decisione presa ancora**.

## Perché il Drive fa fatica (com'è oggi)

- Tutto il multi-PC passa dal Drive come **copia di file**: i `.jsonl` di
  `~/.claude/projects` salgono cifrati ogni 5 minuti, ogni PC li riscarica, e
  «continuare una chat su un altro PC» vuol dire avere **due processi
  claude.exe su due copie dello stesso file**. Da qui: gemelli sotto due slug,
  conflitti su `chat/` senza copia (vince il più lungo), chat adottate in
  cartelle vuote, testimoni, fusioni, lapidi, 30+ schede di quaderno di
  rimedi. Il modello è sbagliato alla radice: una conversazione con un processo
  vivo non è un documento da sincronizzare.
- È lento per natura (5–15 minuti) e costoso in chiamate (la ronda faceva 3
  ricerche per progetto ogni 30 s → 403 dal Drive).
- Il telefono invece funziona con un modello **diverso e sano**: non copia
  niente, guarda lo schermo dell'xterm del PC via HTTP (`/api/storia`,
  `/api/dentro`) e scrive con `/api/scrivi`. Una verità sola, nessun conflitto.

## Proposta A (consigliata): «una chat, una casa»

1. **Ogni chat ha un PC di casa**: dove gira il claude.exe e dove sta la
   cartella. Non si copia mai su un altro PC in automatico.
2. **Un PC può fare da Client di un altro PC** con la stessa API del
   telefono (`client-server.ts`, porta 47640, chiave per dispositivo). Il
   fisso apre nel mosaico un **riquadro remoto** della chat del portatile: si
   legge lo schermo dal vivo e si scrive, esattamente come dall'app. Il
   riquadro dice «su Portatile» e ha i suoi tasti (Riprendi, Ferma, Posta).
3. **Indirizzi e accoppiamento**: il battito `pc-<id>` sul Drive (già c'è)
   porta anche gli indirizzi del PC (LAN + Tailscale) e la porta; si
   accoppia una volta come si fa col telefono (codice/QR) e la chiave resta.
   Fuori dalla LAN: **Tailscale** su PC e telefono, che il codice accetta già
   (100.64/10 in `rete-locale.ts` e `Indirizzi.kt`): zero righe da scrivere,
   gratis, e il telefono funziona da ovunque (oggi solo in LAN).
4. **PC spento** = il riquadro dice «Portatile è spento dalle 18:40», mostra
   l'ultima copia dal Drive **in sola lettura** (transcript) e offre «Scrivile
   là» (la posta, già fatta): quando si accende, esegue.
5. **Il Drive diventa archivio e catalogo**, non motore di sincronia:
   backup cifrato delle chat (già c'è), catalogo di tutte le chat di tutti i
   PC (scheda Drive, già c'è), copia per PC spento. Spariscono: fusione,
   testimone, adozione, conflitti su `chat/`, `altroveQui`, gemelli. Restano
   posta e battiti.
6. **Spostare la casa di una chat** resta un gesto esplicito («Porta qui»):
   copia il `.jsonl`, la cartella arriva via git (sotto), e da lì la chat è
   di qui. Mai automatico.

Tappe: (1) accoppiamento PC↔PC + riquadri remoti in lettura/scrittura,
riusando le rotte del telefono; (2) l'arrivo automatico dal Drive smette di
aprire qui le chat di altri PC (le mostra come remote o «spento»); (3) push
con WebSocket/SSE al posto del polling ogni 2 s, per PC e telefono; (4)
cartelle di codice via **git** (un remoto, branch per PC, commit automatico)
invece dei blob sul Drive con il testimone: git sa fondere, il Drive no.

## Alternative viste

- **B — Un solo PC che lavora (il fisso), gli altri sono terminali.** La più
  semplice: niente multi-PC. Portatile e telefono aprono solo riquadri
  remoti. Serve il fisso sempre acceso e raggiungibile (Tailscale + Wake on
  LAN). È A con una regola in più; si può iniziare così.
- **C — Un relay proprio** (piccolo VPS o Cloudflare Tunnel) per raggiungere
  i PC da ovunque senza Tailscale. Più codice, un servizio da tenere su, un
  costo; Tailscale dà il 90% gratis. Da fare solo se Tailscale non va bene
  (rete aziendale che lo blocca).
- **D — Remote Control di Claude Code** (claude.ai/code guida una sessione
  locale). Copre «una chat da lontano» ma non il mosaico, i workspace, gli
  autopiloti, la posta: SierraDeck perderebbe il suo motivo. Utile come
  ripiego per una chat singola, non come architettura.
- **E — Tenere il Drive e continuare a rattoppare.** Ogni scheda del
  quaderno degli ultimi 20 giorni dice che non converge.

## Cosa chiedere a Nicholas prima di partire

- Va bene **Tailscale** su tutti e tre i dispositivi? (È l'unica cosa da
  installare a mano; senza, tutto vale solo in LAN.)
- Si parte da **B** (solo il fisso lavora) o subito da **A** (entrambi i PC
  possono avere chat di casa)?
- Le cartelle di codice: **git** al posto dei progetti sul Drive?
