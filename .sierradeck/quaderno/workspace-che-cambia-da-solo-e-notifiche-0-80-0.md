---
titolo: "Workspace che cambia da solo e notifiche: registro, cause, correzioni (0.80.0)"
quando: 2026-10-19T16:10:00+02:00
tag: ["workspace", "notifiche", "autopilota", "consegne", "registro", "0.80.0", "per Nicholas"]
---

Nicholas, 19/10: «il workspace sullo schermo cambia da solo» e «arrivano mille notifiche quando un autopilota lavora». Nel registro non c'era nessuna traccia né dell'uno né dell'altro.

## Chi ha il codice (aggiornato 19/10 sera)
Tre chat hanno corretto la stessa cosa in parallelo. **Restano le versioni di main e di c-11.** Il codice di c-10 su questo argomento è stato ritirato nel merge `e270a0c` e nel commit successivo, per non avere doppioni:
- schermo: `cambiaSchermo` di main (`@shared/cambio-schermo`, righe `[schermo]`);
- notifiche: c-11 (`/api/avviso-mostrato`, righe `[avviso]`, `@shared/avvisi-raggruppati`, app con avvisi vicini in silenzio).

Di c-10 restano solo la riga `[notifica] Telegram` nel servizio e questa scheda, con le cause e la prova dal vero.

**Trappola trovata nel merge:** su main (`0c9d839`), la consegna per un workspace non davanti chiamava `inSottofondo(c)`. L'handler del Core la accettava solo con `c.sottofondo === true`, quindi rispondeva false, e il renderer non guardava la risposta: **la consegna non arrivava**. c-11 la corregge (l'handler accetta sempre). Chi tocca di nuovo quella strada deve guardare il valore che `inSottofondo` restituisce.

## Le cause trovate nel codice
1. **Consegne dell'autopilota** (`App.tsx`, `comePortare`). Dalla 0.72.0 una consegna per una chat di un altro workspace **portava la finestra lì**: aspettava solo che si smettesse di scrivere da 45 s. Con più chat al lavoro in più workspace, lo schermo saltava.
2. **Riquadro perso a metà consegna** (`consegne-autopilota.ts`): «torna nel suo workspace», fino a 3 volte.
3. **Chat riaperta da un altro PC o dal telefono** (`apriNelSuoWorkspace` in `index.ts`): la finestra andava nel workspace della chat.
4. **Domande «arrivate da sole»** (`mostraDomande` in `index.ts`): la finestra va **sopra le altre e lampeggia**, al massimo una volta ogni 10 s per autopilota. Non cambia workspace, ma è un «avviso» del PC. È candidato alle «mille notifiche» insieme agli avvisi del telefono «aspetta che tu scelga», che valgono anche per le chat governate.

## Da confermare con Nicholas
- Il 15/10 aveva scelto «la chat governata si vede sempre in un riquadro; il sottofondo solo se lo chiedo io» (0.72.0). Ora la chat è nel riquadro del suo workspace e in «Al lavoro in sottofondo» con Guarda, ma lo schermo non ci va da solo.
- «Aspetta che tu scelga» anche per le chat governate da un autopilota (scelta voluta nell'app: «l'autopilota non concede permessi al posto tuo»). Va deciso **dai numeri del registro** dopo l'installazione: se sono la maggior parte delle notifiche, si possono raggruppare per autopilota.

## Prova dal vero nella copia (19/10, build con le correzioni)
Copia di prova con le porte 47670/47671 e la pagina in Edge con il permesso delle notifiche.

La prova è stata fatta con il codice di c-10, poi ritirato: le righe avevano il prefisso `[workspace]`/`[notifica]` invece di `[schermo]`/`[avviso]`. Il comportamento provato (nessun cambio di schermo per un autopilota) è lo stesso di main.

**Dal telefono e con un clic vero** il registro scrive le tre righe attese:
- `[workspace] lo schermo di questo PC va su «Prova-080-b»: chiesto da tel:tel-prova`;
- `[workspace] la finestra passa … chiesto dal processo principale`;
- `[notifica] tel:tel-prova: «Prova 3 aspetta te»`.

Il clic sul nome dà «clic sul nome del workspace». Serve un evento vero del mouse: `element.click()` non basta.

**Autopilota vero** creato dal telefono nel workspace «Prova-080-b», con lo schermo su «Prova-080-a»:
- ha adottato le 2 chat già presenti e ha diviso il lavoro in 2 compiti;
- in 17 controlli, uno ogni 30 s: **0 cambi di workspace, 0 notifiche**, e lo schermo sempre su «Prova-080-a».

**Non provato dal vero:** una consegna vera a una chat non a schermo.
- Il **freno dei limiti** («settimana al 67%: non apro chat nuove») ha bloccato le chat nuove. È giusto che protegga la quota di Nicholas.
- Il dialogo («scrivi a Prova 5») non ha avuto risposta dal supervisore della copia (`duration_api_ms: 0`, uscito con 1, errore tagliato nel registro).
- La strada è coperta dai test (`consegna-visibile`, `consegna-in-sottofondo`, `consegne-layout`).
- Va riprovata con un autopilota vero quando il limite settimanale lo permette, o sul PC dopo l'installazione, leggendo le righe `[workspace]` e `[consegna]`.
