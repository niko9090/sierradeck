---
titolo: "0.80.0: correzioni di velocità e codice (c-11), con i numeri prima e dopo"
quando: 2026-10-19T13:47:00+02:00
tag: ["0.80.0", "prestazioni", "errori silenziosi", "registro", "c-11"]
---

# Correzioni di velocità e codice della 0.80.0 (ramo c-11)

Le voci si riferiscono a `analisi-0-80-0.md` (sezione 3). Ogni correzione ha il suo test.
Revisione indipendente: **APPROVE**, senza problemi gravi. I due punti minori sono trattati qui sotto.

## Fatte, con i numeri

| Voce | Cosa | Prima | Dopo | Test |
|---|---|---|---|---|
| (a) | `chiudiChat` con il ramo già unito o tolto (`unisciRamo`: ramo mancante o già contenuto = niente da unire; gli avvisi LF/CRLF non sono conflitti) | la chat restava aperta per sempre | si chiude | `worktree.test.ts` |
| 3 | `progetti-drive.json` e `pc.json` tenuti in memoria per mtime+dimensione; hostname letto una volta | 1,14 ms e 1,05 ms a lettura, per chat, a ogni `/api/stato` | 0,062 ms e 0,052 ms | `memoria-di-file.test.ts` |
| 13 | Pagina del telefono composta una volta, gzip, ETag/304 | 417 KB a ogni apertura (97 ms la prima composizione) | 118 KB (−72%); 0 byte alla riapertura | `client-server.test.ts` |
| — | JSON sopra 1 KB compressi (solo a chi chiede gzip), fuori dal thread principale | `/api/stato` 35 KB | 7,8 KB (−78%) | idem |
| 5 (in parte) | Pannello del Drive: la **vista** usa il valore scaduto da meno di 10 min e intanto rilegge; date dei file lette 16 alla volta | 3,3 s di Drive a ogni minuto; 670 `statSync` di fila | subito; asincrone | `memoria-breve.test.ts` |
| — | Salvataggio sul Drive: `stat` 16 alla volta (`statInParallelo`) in `firmaRadici`, `pesaRadici`, `elencaFileProgetto` | 1.234 file veri: 20-24 s | 0,4 s (×50). Sono ~13.600 file, due giri ogni 5-30 min | `stat-in-parallelo.test.ts` |
| — | Rilettura dell'indice: le richieste in attesa si uniscono | N richieste = N letture complete | 1 | `richiesta-unita.test.ts` |
| — | PIN dei riquadri | 4 IPC ogni 3 s per riquadro | ogni 30 s (3 s solo se protetta e aperta) | `pin-rilettura.test.ts` |
| — | Trascinare un divisore | una scrittura di `workspaces.json` (131 KB) per fotogramma | una al rilascio | `persistenza-layout.test.ts` |
| — | App: `Davanti.pausa` nei controlli delle schermate; schermo della chat con `remember`; regex della Panoramica compilate una volta | con l'app dietro 1-3 richieste al secondo | 0 (resta solo `/api/stato` ogni 15 s, come prima) | `DavantiTest.kt` |
| 2 | `workspaces.json`, `chiuse.json` e `workspaces-eliminati.json` che non si leggono un istante | si riscrivevano vuoti: tutti i workspace sparivano | si riprova; poi l'ultimo letto bene, o la scrittura si rifiuta e lo dice | `workspace-store-illeggibile.test.ts` |
| 1 | `console.error` e `console.warn` del processo principale anche nel registro | solo in console | nel registro (ERRORE / info) | `console-nel-registro.test.ts` |
| — | `collegamento-rtc.test.ts:208`, l'unico rosso in main | attesa fissa di 2 s, cadeva a suite intera | tempi larghi per aprire, attese sulla condizione | 3 su 3 |

`npm test` sul ramo: 4.212 passati, 2 saltati. Typecheck verde. Android `testDebugUnitTest assembleDebug` verde.

## Dalla Revisione
- Con il ramo che non c'è più, la Revisione approvava scrivendo «unito nel ramo principale». Ora scrive «il ramo non c'è più: niente unito qui».
- Dopo un'azione (Porta qui, Togli), la **prima** vista del pannello può mostrare ancora il Drive di prima. La rilettura parte subito in sottofondo e la vista dopo (2 s durante un lavoro) è giusta. Le azioni (trasloco, residenza, workspace per i progetti) non usano mai il valore vecchio.

## Controllato e lasciato com'è
- `polso-chat.json`: 23 KB, 49 chat, nessuna più vecchia di 30 giorni. Potarlo cambierebbe lo storico della spesa.
- Le date delle chat nel pannello non si prendono dall'indice: decidono quale copia è «più nuova», e l'indice può essere indietro.

## Trappole incontrate
- **Python e `\b`**: scrivendo codice con uno script Python, `"\\b"` in una stringa normale è diventato il carattere di controllo backspace dentro una regex TS. Controllare con `od -c`, oppure usare lo strumento Edit.
- **I file sono CRLF**: le sostituzioni su più righe fatte con script non trovano il testo e non scrivono niente. Usare Edit.
- **Mai `git checkout -- .` in un comando composto**: butta le modifiche non salvate. Il controllo dei comandi l'ha fermato.
- Una chat dell'autopilota **non può** chiamare `/api/workspace/elimina`: è un divieto di Nicholas, e il controllo lo blocca.

## Restano dall'elenco (velocità e codice)
- 4: download dal Drive ogni 10 s per `driveAttivoAdesso`.
- 5: `/api/chat/gestione/spazio` 2 s a ogni chiamata; il pannello manda 537 KB.
- 6: `decisioni` degli autopiloti senza tetto.
- 7: `/api/domande` moltiplica le chiamate al servizio.
- APK non ridotto (R8): va provato con un'installazione fatta da Nicholas.
