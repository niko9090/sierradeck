---
titolo: "Crash silenziosi e «schermo bianco»: mancava il contenimento errori"
quando: 2026-08-26T22:20:00+02:00
tag: ["crash", "renderer", "affidabilità", "diagnostica"]
---

## Il sintomo
Segnalato: «continui a chiuderti» + «i workspace non si riescono più a
selezionare». Nel registro (`userData/log/sierradeck-AAAA-MM-GG.log`) **una sola**
riga «sessione avviata» e nessun errore → l'app **non** si era riavviata: il
processo era ancora vivo. Nessun crash dump (niente cartella `Crashpad`).

## La causa vera (architetturale, non un singolo bug)
Mancavano due reti di sicurezza:

1. **Renderer senza ErrorBoundary.** `main.tsx` faceva
   `createRoot(el).render(<App/>)` nudo. In React un `throw` durante il render di
   *qualunque* componente (una modale, il mosaico, un pannello) smonta **tutto**
   l'albero → finestra vuota, niente più cliccabile, **barra dei workspace
   compresa**. Da fuori sembra «si è chiuso», ma l'errore muore nella console del
   renderer e non lascia traccia nel file di log.
2. **Main senza `uncaughtException`/`unhandledRejection`.** Un'eccezione non
   gestita nel processo main faceva chiudere Electron di colpo, senza una riga.

→ Ecco perché «si chiude senza motivo»: i guasti erano **invisibili**.

## Cosa è stato fatto — RILASCIATO come 0.12.7 (commit d89121f, 26/08)
- `src/renderer/components/ConfineErrori.tsx`: ErrorBoundary che mostra una
  schermata di recupero con il **messaggio vero**, lo scrive nel registro e offre
  «Ricarica» (rimonta l'app senza chiudere il programma).
- `src/renderer/main.tsx`: avvolge `<App/>` nel ConfineErrori + listener
  `window.error` / `unhandledrejection` → registro.
- `src/main/index.ts`: `process.on('uncaughtException'|'unhandledRejection')` che
  logga e **non** chiude; `registroGlobale` visibile ai gestori.
- Nuovo ponte `log.errore(msg)` → IPC `log:errore` → `registro.errore` (preload +
  `env.d.ts`).

## Importante — questo NON trova il trigger, lo rende visibile
Le modifiche sono contenimento + diagnostica: il **prossimo** guasto scriverà la
causa reale nel registro invece di sparire con l'UI. Per la causa radice:
- diagnosi immediata senza rebuild: aprire DevTools in SierraDeck (Ctrl+Shift+I),
  scheda Console, leggere gli errori rossi quando la barra non risponde;
- oppure ripacchettare (`npm run pacchetto`) + reinstallare e riprodurre: la
  schermata di recupero mostrerà lo stack.

## Sospetti da controllare quando arriva lo stack
I commit 0.12.2→0.12.6 hanno toccato **solo** il pannello Negozio; il codice dei
workspace (`workspace-azioni.ts`, `Console.tsx`) è robusto e cattura i suoi
errori. Se lo schermo si svuota, guardare cosa lancia in render tra i componenti
sempre montati (`Console`, `Mosaic`, `DomandaModale`).
