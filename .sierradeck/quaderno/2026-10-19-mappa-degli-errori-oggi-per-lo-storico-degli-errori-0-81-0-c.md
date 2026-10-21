---
titolo: "Mappa degli errori oggi, per lo Storico degli errori 0.81.0 (c-7, 19/10)"
quando: 2026-10-19T15:49:01.370Z
tag: ["autopilota"]
---

Dove finiscono oggi gli errori:
- main: index.ts:633 uncaughtException e 637 unhandledRejection → registro.errore. console-nel-registro.ts:17 copia console.error e console.warn.
- renderer: main.tsx:12 e 16, ConfineErrori.tsx:28 → registro del main tramite window.gestore.log.errore.
- servizio: autopilot-host/index.ts:187-188 reteDiSicurezza e 199 console → registro suo.
- Formato del registro: «ISO [livello] [chi] messaggio», un file al giorno in dati/log/sierradeck-AAAA-MM-GG.log, tenuti 14 giorni (registro.ts:39, 106). Manca «cosa si faceva» e i ripetuti non vengono raggruppati.
- Pagina: client-pagina.ts:1379 (promise rifiutate) e 6041 (prima del disegno) mostrano solo il messaggio sullo schermo. Niente stack e niente invio al PC.
- App: Guasti.kt:31 scrive ultimo-guasto.txt, che MainActivity.kt:55 mostra al riavvio tagliato a 1500 caratteri. I 10 Log.e vanno solo in logcat. Niente invio al PC.
- Segreti: nessuno li toglie. registro.ts non filtra token, chiavi, Bearer, x-sierradeck-chiave né l'URL di Telegram con il token. oscuraChat (pin-chat.ts:142) nasconde solo le chat protette dal PIN.
- Catch vuoti: circa 334 fra main, servizio e renderer, 22 nell'app, 4 nella pagina. Da guardare per primi: index.ts:2706 (chiusura delle chat di un ws), 2615 e 2945 (il manifesto del Drive dà undefined, letto come «niente sul Drive»), 2374 e 5716 (stato della sincronia), residenza.ts:440 (registro dell'unione perso), cassaforte/sincronia.ts:1360 (cancellazione sul Drive fallita letta come «già sparito»), Consegne.kt:192, App.kt:424, i 4 catch vuoti in client-pagina.ts.
- Proposta: un punto unico registraErrore({dove, cosaFacevo, messaggio, stack}) che toglie i segreti prima di scrivere; una rotta /api/errori dove pagina e app mandano i loro errori; raggruppare gli errori uguali per impronta (dove + messaggio senza numeri).
