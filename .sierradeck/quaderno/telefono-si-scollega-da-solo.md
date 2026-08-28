---
titolo: "Il telefono si scollegava da solo: un 401 di troppo, e una revoca che non era una revoca"
quando: 2026-08-28T09:20:00+02:00
tag: ["client", "dispositivi", "android", "difetto", "concorrenza"]
---

## Il sintomo
«Ho aggiornato l'app Android e non funziona più molto: non si riesce neanche a
far cercare l'aggiornamento del programma Windows.» Alla domanda diretta, la
risposta: **il telefono non vede più il PC**.

Non era l'app aggiornata a essere rotta. Il telefono aveva **buttato via
l'accoppiamento** e non lo diceva a nessuno.

## Come si è visto, senza avere il telefono in mano
Tre misure, tutte dal PC:

- `dispositivi.json` → `ultimoAccesso` fermo a un'ora prima, mentre l'utente
  stava usando l'app *adesso*;
- il server risponde `200` su `/api/ciao` sia da `127.0.0.1` sia dall'IP di rete
  sia da Tailscale: il computer era raggiungibile;
- regole del firewall presenti e col percorso giusto dell'eseguibile.

Quindi: il computer c'era, e il telefono non ci parlava più. Il problema stava
nell'accoppiamento, non nella rete.

## Le due metà del difetto

**Lato computer — un file tenuto in movimento perpetuo.** `riconosci()` in
`src/main/dispositivi.ts` faceva, a **ogni** richiesta autenticata:
`leggi()` (readFileSync + JSON.parse) e poi `salva()` (scrittura atomica: temp +
rename) solo per aggiornare `ultimoAccesso`. Con l'app aperta le richieste sono
più di una al secondo (`/api/stato` ogni 2 s, `/api/aggiornamento` ogni 2 s,
`/api/storia` nella chat): `dispositivi.json` era quasi sempre in rinomina.

Una lettura che cade dentro una rinomina solleva. E il `catch` diceva:

```ts
// Un elenco illeggibile vale come nessun dispositivo
return []
```

Elenco vuoto → `riconosci` non trova nessuno → **401**.

**Lato telefono — una risposta sproporzionata.** In `App.kt`:

```kotlin
if (e.daRiaccoppiare) { onScollega(); break }
```

Un solo 401 e l'app cancellava indirizzo *e* chiave, tornando alla schermata del
codice QR. Senza dire perché: sembrava un'app che si era dimenticata di tutto da
sola.

## La lezione
**«Non riesco a leggere adesso» e «costui non è autorizzato» non sono la stessa
risposta**, e il codice le faceva finire nello stesso `return []`. Un errore
transitorio travestito da verdetto permanente produce un danno permanente — qui
il più costoso possibile lato utente, cioè rifare il pairing.

Corollario: **più il client diventa vivace, più le corse latenti sparano.**
Questo difetto esisteva da sempre; si è manifestato quando l'app ha cominciato a
fare tre polling invece di uno. Aggiungere un `LaunchedEffect` che interroga ogni
due secondi non è una modifica innocua.

## Come sta adesso (0.12.18 / app 2.7.0)
- `dispositivi.ts`: elenco ricordato in memoria, riletto solo quando `size` e
  `mtimeMs` cambiano; se la lettura **non riesce** si risponde con l'ultimo
  elenco valido invece che con nessuno. Un file **rotto** (contenuto che non è
  JSON) resta invece una revoca di tutti: è diverso da un file occupato.
- `ultimoAccesso` si riscrive al massimo una volta al minuto
  (`PASSO_ACCESSO_MS`): serve a riconoscere il telefono che non si usa da mesi,
  al minuto è già una precisione superflua.
- `App.kt`: servono `RIFIUTI_PER_ARRENDERSI = 5` rifiuti **di fila** (dieci
  secondi), e comunque non si cancella niente da soli — compare la schermata
  «Il computer non ti riconosce» con «Riprova» e «Rifai l'accoppiamento».
- Test in `tests/main/dispositivi.test.ts`: il file non si muove per cento
  richieste nello stesso minuto; una lettura fallita non revoca; un file rotto sì;
  una revoca fatta da un'altra finestra si vede al primo giro.

Vedi anche [[app-android-nativa]] e [[errori-invisibili-e-schermo-bianco]].
