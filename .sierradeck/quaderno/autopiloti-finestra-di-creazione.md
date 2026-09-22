---
titolo: "Autopiloti: la finestra di creazione e i tetti dei testi lunghi (0.32.0, app 2.35.0)"
quando: 2026-09-22T15:20:00+02:00
tag: ["autopiloti", "ui", "limiti", "validazione", "telefono"]
---

Nicholas (22/09): «togli il limite dei 4000 caratteri per gli autopiloti e
migliora tutta la finestra per la creazione perché non si capisce nulla e non
si vede neanche tutto quello che scrivo».

## Com'è ora (PannelloAutopiloti.tsx, blocco `.nuovo-ap`)

- L'obiettivo è una `textarea` grande (`.campo--obiettivo`, 180px min,
  55vh max, ridimensionabile) con conteggio caratteri/parole. **Invio va a
  capo, Ctrl+Invio prepara**, Esc annulla la bozza.
- Campi con spiegazione sotto ognuno: cartella (scelta o scritta a mano),
  nome (facoltativo: se vuoto, le prime 8 parole dell'obiettivo), chat in
  parallelo (1–8), criteri di successo **uno per riga** (mandati come
  `criteri: string[]`).
- La bozza vive nello stato `Bozza` del pannello, non nel main: chiudere il
  pannello la perde. Non è un bug noto, è così.

## I tetti (dove sono, perché ci sono)

| Testo | Tetto | Dove |
|---|---|---|
| Obiettivo autopilota | 200.000 caratteri | `OBIETTIVO_MAX` in validation.ts e client-rotte.ts |
| Risposta a una domanda (IPC) | 100.000 | `RISPOSTA_MAX` in ipc.ts |
| Testi dal telefono (scrivi, delega, risposte) | 50.000 | `TESTO_MAX` in client-rotte.ts; l'app taglia con `take(50_000)` |

Il tetto non è «zero» ma «non si tocca mai a mano»: serve solo a non fare
ingoiare al main un payload da megabyte per errore. Il test «sterminato» in
validation.test.ts usa 200_001: se si alza il tetto, va alzato anche lui.

## Trappola

Il vecchio limite di 4.000 era in TRE posti (validation, rotta HTTP, e il
`maxLength` dell'input): alzarne uno solo non basta, la rotta del telefono
rifiuta con 400 «obiettivo troppo lungo» senza che la UI lo dica.
