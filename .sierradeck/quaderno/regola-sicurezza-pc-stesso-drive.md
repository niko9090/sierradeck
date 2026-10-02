---
titolo: "REGOLA: un PC vede, comanda o aggiorna solo i PC dello stesso Drive (chiave di casa)"
quando: 2026-10-02T19:30:00+02:00
tag: ["sicurezza", "regola", "chiave-di-casa", "pc-remoto", "tailscale", "webrtc"]
---

# La regola (Nicholas, 02/10)

> Un PC può vedere, comandare o aggiornare solo i PC dello STESSO Drive di
> SierraDeck, cioè stesso account e stessa cassaforte, provato dalla chiave di
> casa. Nessuna strada deve accettare un PC senza la chiave di casa valida.

Chiave di casa = `HMAC(chiave-maestra della cassaforte, 'client-pc:<id del PC che riceve>')`
(`sincronia.chiaveDiCasa`). Chi non ha aperto la stessa cassaforte non la sa.

# Strada per strada (verificato il 02/10, 0.47.0)

| Strada | Come respinge un estraneo | Test |
|---|---|---|
| Rete di casa / Tailscale (server) | 401 senza chiave, con chiave o firma di un'altra cassaforte, con firma ripetuta/vecchia/di un'altra rotta | `tests/main/sicurezza-strade.test.ts` |
| Ricerca per nome di Tailscale (client) | **Era un buco fino alla 0.46**: la chiave partiva in chiaro verso ogni candidato e bastava un 2xx/404. Ora prima `/api/casa?sfida=` → chi risponde deve dare `HMAC(chiave, sfida)`; poi richieste firmate (`x-sierradeck-casa`), la chiave non viaggia | idem + `pc-remoto*.test.ts` |
| WebRTC | segnalazione cifrata con la chiave di casa, ogni messaggio sigillato (no replay) | `cifra-canale`, `collegamento-rtc`, sicurezza |
| Cassetta sul Drive | `sincronia.scatola()` cifra con la chiave-maestra (AES-GCM): un'altra cassaforte non legge né scrive | sicurezza |
| Telefono | solo chiave di un dispositivo accoppiato dal PC (codice/QR sullo schermo), revocabile | sicurezza, `client-server` |
| «Installa là» | rotte `/api/aggiornamento/*` dietro chiave/firma | sicurezza |
| `/api/segnale`, `/api/polso` | solo loopback | sicurezza |

Solo il Client (porta 47640) ascolta sulla rete; autopilot-host e OAuth sono su 127.0.0.1.

# Compatibilità (il compromesso da sapere)

Un PC **prima della 0.47** non ha `/api/casa`: per lui si usa ancora la
chiave in chiaro, ma **solo agli indirizzi del suo battito** sul Drive (scritti
da lui, cifrati), mai a quelli trovati per nome o ricordati; e mai più per un
PC che ha già provato la chiave con il modo nuovo, o con battito ≥ 0.47.
Conseguenza: un PC vecchio il cui indirizzo Tailscale è cambiato (battito
vecchio) non si raggiunge finché non si aggiorna dal suo schermo.

Il server accetta ancora la chiave in chiaro dai PC vecchi (è comunque la chiave giusta).

# Se si aggiunge una strada nuova

Deve provare la chiave di casa **prima** di mandare o accettare qualunque
cosa, e va aggiunta a `sicurezza-strade.test.ts` con un PC estraneo.
