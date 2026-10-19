---
titolo: "Workspace che cambia da solo e notifiche: registro, cause, correzioni (0.80.0)"
quando: 2026-10-19T14:40:00+02:00
tag: ["workspace", "notifiche", "autopilota", "consegne", "registro", "0.80.0", "per Nicholas"]
---

Nicholas, 19/10: «il workspace sullo schermo cambia da solo» e «arrivano mille notifiche quando un autopilota lavora». Nel registro non c'era nessuna traccia né dell'uno né dell'altro.

## Cosa scrive adesso il registro
- **`[workspace] la finestra passa da «A» a «B»: <causa>`**, a ogni cambio sullo schermo. Le cause possibili:
  - clic sul nome, scorciatoia, menu, pannello dei workspace;
  - consegna dell'autopilota;
  - «guarda la chat»;
  - chat aperta dal telefono;
  - «chiesto dal processo principale»;
  - un'altra finestra;
  - workspace creato o eliminato.

  Il punto unico è `cambia(nome, perché)` in `src/renderer/workspace-azioni.ts`. Senza un motivo scrive «motivo non detto»: se compare, manca una causa da qualche parte.
- **`[workspace] lo schermo di questo PC va su «X»: chiesto da tel:… / pc:…`**: lo scrive `/api/workspace` (dal telefono o da un altro PC). `/api/workspace/crea` scrive «creato e messo sullo schermo».
- **`[workspace] lo schermo resta su «A»: «chat» riparte in sottofondo nel suo workspace «B»`**: una ripresa chiesta da lontano.
- **`[notifica] …`**, una riga per ogni notifica:
  - domande dell'autopilota portate avanti, con dove e «sopra le altre e lampeggia»;
  - notifica di Windows;
  - Telegram, scritta dal servizio;
  - pagina e app del telefono, che segnalano con `/api/notifica` (`[notifica] tel:<id>: «titolo» (tag)`).

  Un PC più vecchio risponde 404 e va bene.

## Le cause trovate nel codice
1. **Consegne dell'autopilota** (`App.tsx`, `comePortare`). Dalla 0.72.0 una consegna per una chat di un altro workspace **portava la finestra lì**: aspettava solo che si smettesse di scrivere da 45 s. Con più chat al lavoro in più workspace, lo schermo saltava.
2. **Riquadro perso a metà consegna** (`consegne-autopilota.ts`): «torna nel suo workspace», fino a 3 volte.
3. **Chat riaperta da un altro PC o dal telefono** (`apriNelSuoWorkspace` in `index.ts`): la finestra andava nel workspace della chat.
4. **Domande «arrivate da sole»** (`mostraDomande` in `index.ts`): la finestra va **sopra le altre e lampeggia**, al massimo una volta ogni 10 s per autopilota. Non cambia workspace, ma è un «avviso» del PC. È candidato alle «mille notifiche» insieme agli avvisi del telefono «aspetta che tu scelga», che valgono anche per le chat governate.

## Corretto (ramo c-10, `f35f7b8`, `d42b943`)
- **Lo schermo cambia solo quando lo sceglie Nicholas.**
  - Una consegna per una chat non a schermo va al suo terminale nascosto o in sottofondo (regole della 0.60.8, `doveConsegnare`), e la chat è adottata nel suo riquadro quando si apre quel workspace.
  - Riquadro perso: sottofondo.
  - Ripresa da lontano: sottofondo se non è a schermo (`apriOSottofondo`).
  - Solo «Guarda» (un clic) porta la finestra lì.
- **Pagina: gli avvisi dello stesso giro partono in una notifica sola** («N avvisi da SierraDeck»). L'app li raggruppava già.

## Da confermare con Nicholas
- Il 15/10 aveva scelto «la chat governata si vede sempre in un riquadro; il sottofondo solo se lo chiedo io» (0.72.0). Ora la chat è nel riquadro del suo workspace e in «Al lavoro in sottofondo» con Guarda, ma lo schermo non ci va da solo.
- «Aspetta che tu scelga» anche per le chat governate da un autopilota (scelta voluta nell'app: «l'autopilota non concede permessi al posto tuo»). Va deciso **dai numeri del registro** dopo l'installazione: se sono la maggior parte delle notifiche, si possono raggruppare per autopilota.

## Prova dal vero nella copia (19/10, build con le correzioni)
Copia di prova con le porte 47670/47671 e la pagina in Edge con il permesso delle notifiche.

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
