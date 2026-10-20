---
titolo: "Chiusura dei rami della 0.81.0 (c-25): cosa è unito e cosa è scartato"
quando: 2026-10-20T22:30:00+02:00
tag: ["autopilota", "rami", "0.81.0", "rapporto"]
---

Consegna c-291 a c-25 (20/10 sera). Sono stati guardati i 14 rami `ap/ap-f1e631f5/*`
ancora avanti rispetto a main, con `git cherry -v main <ramo>` e `git diff main...<ramo>`.

**Trappola:** mentre si lavorava, l'autopilota univa in main i rami delle chat a fine
turno, più di 20 commit in pochi minuti. Un conteggio «avanti di N» vale solo per
quel momento. Prima di unire, rifare `git diff --name-only main...<ramo>`. Se è
vuoto, il ramo è già in main.

## Ramo per ramo

| ramo | esito | motivo |
|---|---|---|
| c-3 | **scartato, doppio** | La sua seconda versione di «Errori arrivati» (`errori-arrivati.ts` + `shared/errori-lavoro.ts`) è un doppione di quella in main di c-14 (55c1056b, `errori-arrivati-lavoro.ts`). Quella di main fa già il riepilogo prima, il recupero di 30 giorni dopo e la nota nel rapporto. Unirle avrebbe fatto partire il lavoro due volte. Lo storico errori di c-3 era già entrato in main tramite c-14 (1bc40d18). |
| c-10 | **unito** (38a82da4, nel ramo c-25) | Lavoro vero, approvato dalla Revisione. Righe brevi solo per gli eventi che contano: chat aperta, unita, mai partita, muta da 5 minuti (detta una volta per silenzio). «Ha finito» e «Si è fermato» compaiono nella conversazione su PC, pagina e app. Non partono notifiche nuove. Un solo conflitto, l'import in `server.ts` (`conStatiDatati` di main + `SILENZIO_DA_DIRE_MS`, `ultimoTraguardoDi` di c-10). |
| c-12 | già in main | Unito dall'autopilota (94584ef4): «Adesso» e «Hai risposto». |
| c-12-0-80-1 | già in main | I suoi 3 commit del quaderno sono un sottoinsieme di c-12. |
| c-12-verifica | già in main | Unito dall'autopilota (b6d56936): controllo dei file della 0.80.0. |
| c-18 | già in main | Unito dall'autopilota (0d72a7f7): correzioni del Drive e dei dati, e i numeri del 20/10. Aveva già la sua Revisione. |
| c-19 | **scartato, superato** | Una sola scheda del quaderno, «rilascio 0.81.0 in attesa, cinque rami non in main». Quella situazione oggi non c'è più. La trappola che conteneva (c-3 e c-14 con due «Errori arrivati») è qui sopra. |
| c-20 | già in main | Gli stessi 3 commit di c-231, entrati con c-24. |
| c-231 | già in main | Entrato con c-24. |
| c-24 | già in main | Contiene c-20/c-231: 20 minuti alla suite dei test nei criteri, tetto dell'hook 3600 s e `worktree.test.ts` col repository di partenza copiato. La Revisione lo ha approvato. |
| c-22 | già in main | Gli stessi 4 commit di c-241. |
| c-241 | già in main | Unito dall'autopilota (b8cc5b4b). |
| c-23 | **scartato, superato** | Era un'altra correzione di `worktree.test.ts` (fea2942c). Quella in main di c-24 (a850b52) risolve lo stesso rosso per tempo, e c-24 lo scrive: «fea2942c non serve». Unirle avrebbe dato un conflitto sullo stesso test. |
| c-248 | **scartato, superato** | È lo stesso commit di c-23. |
| c-10 (dopo, db268e9f) | **da unire** | Commit nuovo, arrivato dopo l'unione 38a82da4. Contiene solo docs: il riepilogo prima e dopo nel rapporto di analisi. |
| c-12-salva2 (c3abdd26) | **da unire dopo la Revisione** | Correzione vera: `salvaLavoro` riconosce la sottocartella del worktree anche quando le maiuscole sono diverse (nota di c-289). |
| c-28 | già in main | Unita alle 14:50. |

Le chat dei rami scartati o già in main non hanno altro da unire. Si possono
chiudere con `chiudiChat`, che chiude i rami già uniti o mancanti. Per c-3, c-19,
c-23 e c-248 il ramo non è unito: chiuderli vuol dire buttare quel lavoro, che
qui è doppio.

## Controlli dopo l'unione di c-10 (nel ramo c-25)

- Typecheck verde. Guardia delle cancellazioni verde.
- Primo giro delle suite, col PC carico (circa 20 minuti l'una):
  - `tests/main`: 1 file rosso, 1 test;
  - le altre suite: 2 file rossi, 4 test.
- Il rosso in `tests/autopilot-host/server.test.ts` («riprendere un autopilota in intervista…») è un tempo scaduto (20 s), non un difetto. Da solo passa: 17 s col ramo, 14,6 s col `server.ts` di main. Il test è lento di suo, c-10 non c'entra.
- Gli altri file rossi non sono stati identificati. Il secondo giro è stato lanciato ma non aspettato.
- **Esito dei test: lo misura il programma.**

## Trappola del worktree

Una copia nuova (`….sierradeck-wt/<id>`) non ha `node_modules`, e `npm run
typecheck` risponde «"tsc" non è riconosciuto». Per rimediare si crea una junction
verso quella della cartella principale:
`New-Item -ItemType Junction -Path node_modules -Target <principale>\node_modules`.
`node_modules` è già escluso da git.
