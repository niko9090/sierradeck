---
titolo: "Notifiche solo utili (0.81.0): fermi che ripartono da soli, «ripreso», Telegram raggruppato"
quando: 2026-10-19T19:30:00+02:00
tag: ["notifiche", "autopilota", "telegram", "0.81.0", "PC", "pagina", "app"]
---

Seguito della scheda di c-7 «Notifiche 0.81.0: cosa è fatto e cosa resta». Ramo c-10, commit `a5772a1` e le correzioni della Revisione.

## La regola
`riparteDaSolo(a)` in `src/shared/autopilota.ts`: un autopilota **sospeso** che ripartirà senza Nicholas.
- La pausa per i limiti del piano (`pausaLimitiFinoA`) o per un aggiornamento (`fermatoPerAggiornamento`) **non avvisa**.
- Avvisano ancora:
  - la preparazione guastata;
  - le chat mute;
  - la preparazione che non conclude;
  - un «fallito», anche con una pausa rimasta addosso;
  - le domande, «pronto», «finito», lo stallo.

## Dove si applica
- **Servizio** (`server.ts`, `avvisaFermo`): i 7 punti che mandavano `avvisa('sospeso')` passano di qui. Una pausa scrive solo `[notifica] nessun avviso per … riparte da solo`.
  - Se la ripartenza dopo il freno fallisce, è un fermo vero e avvisa.
  - I tre fermi della preparazione avvisano con lo stato salvato (sospeso, con il motivo), non con quello di prima.
- **`/api/stato`** (`client-rotte.ts`) aggiunge `riparteDaSolo: true` a quei fermi. Pagina (`avvisaSeServe`) e app (`Avvisi.kt`) li saltano **senza segnarli come visti**: se poi il fermo resta vero con la stessa chiave, si annuncia. Un PC vecchio non manda il campo, e tutto resta come prima.
- **«Ripreso dopo un riavvio»** non è più un avviso (`server.ts`, tolto da `telegram.ts`): resta una riga nel registro.
- **Telegram** (`creaAvvisatore`):
  - il primo avviso parte subito;
  - quelli entro `AVVISI_VICINI_MS` (20 s) dall'ultimo invio partono insieme alla fine della finestra, come «N avvisi da SierraDeck»;
  - se il gruppo supera i 4000 caratteri parte un messaggio per avviso, perché troncare romperebbe l'HTML e Telegram rifiuterebbe tutto;
  - ogni avviso ha la sua riga `[notifica] Telegram: …`.
- **PC:** anche la notifica di Windows «aspetta per aggiornarsi» scrive `[avviso] PC: …` nel registro.

## Test
- Vitest: `tests/shared/notifiche-solo-utili.test.ts`, `tests/autopilot-host/telegram.test.ts`, `tests/autopilot-host/server.test.ts` (freno oltre il 95%: nessun avviso), `tests/autopilot-host/ripresa-al-ritorno.test.ts` (nessun «ripreso»), `tests/renderer/avvisi-chiusi.test.ts` (pagina).
- App: `AvvisiTest.kt`.

## Resta
- Gli avvisi Telegram in attesa (fino a 20 s) si perdono se il servizio esce proprio allora, per esempio durante un aggiornamento. Si risolve con uno svuotamento allo spegnimento ordinato. È bassa priorità e non è fatto.
- Il caso «ripartenza dopo il freno fallita, quindi avviso» non ha un test: serve un `riprendiAutopilota` che fallisce nel finto del server.
- La prova nella copia di prova con un autopilota al lavoro, e i numeri: non ancora con questa versione. Quella di c-11 (26 minuti, notifiche della pagina da 6 a 2) è nella scheda «workspace che cambia da solo e notifiche».
