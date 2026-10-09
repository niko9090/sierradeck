---
titolo: "Drive «scollegato» il 09/10: 401 senza rinnovo per un'ora, avviso che copriva l'app (0.56.3)"
quando: 2026-10-09T14:05:00+02:00
tag: ["drive", "oauth", "401", "invalid_grant", "avviso", "telefono", "android", "pagina"]
---

# Cosa è successo (registro del PC fisso, 09/10)

- 10:09: la 0.56.1 parte e rinnova il token (vale un'ora).
- **10:20:47**: da qui ogni chiamata al Drive risponde **401** «Request had invalid authentication credentials». Giro progetti, case-chat, SALVA e ARRIVO ritentano ogni 2 minuti, sempre con lo stesso token.
- **11:19:48**: il token è scaduto per il nostro orologio e il programma prova il rinnovo. Google risponde `invalid_grant`, quindi `drive-scollegato.json` = `revocata` e i gettoni vengono buttati.

# La causa

**Il permesso l'ha tolto Google, verso le 10:20.** Un refresh token revocato invalida anche gli access token già dati: da qui il 401 con un token «non scaduto», e poi l'`invalid_grant` al rinnovo.

Il motivo della revoca non sta in nessun registro, come il 23/09 (scheda `drive-scollegato-dal-23-09.md`). Le cause note:
- l'accesso tolto dall'account Google;
- la password cambiata;
- più di 100 collegamenti dello stesso account con la stessa app OAuth: Google butta i più vecchi.

**Ipotesi scartata: due processi che si rubano i gettoni.**
- Il servizio degli autopiloti non tocca il Drive. `creaFornitoreToken` lo usa solo `conto-drive.ts` nel processo principale.
- I doppioni del servizio (0.56.2) non c'entrano.

**I difetti del programma:**
1. `creaFornitoreToken` rinnovava **solo guardando `scadeIl`**. Un 401 con il token «valido» non provocava nessun rinnovo, quindi un'ora di tentativi muti e il Drive fermo senza dirlo.
2. Ogni `magazzino()` e ogni `archivio()` creavano un fornitore proprio: trenta progetti con il token in scadenza facevano trenta rinnovi insieme.
3. `conRitenta` ritentava 4 volte anche quando il rinnovo diceva «revocata».
4. L'avviso compariva a **chiunque**: `configurato` vuol dire solo che il programma ha le credenziali OAuth incluse, quindi vale sempre. Era un riquadro rosso grande, e sul telefono copriva l'app senza potersi chiudere.

# Correzione (0.56.3)

- **Rinnovo:**
  - `oauth-google.ts`: `FornitoreToken` con `.rinnova(fallito)`. Un rinnovo alla volta (`inRinnovo`); chi riceve un 401 con un token già sostituito prende quello nuovo senza un altro rinnovo.
  - `google-drive.ts`: `conRinnovo(fetch, rinnova)` avvolge ogni chiamata con `Authorization: Bearer`. Su un 401 rinnova e ripete **una volta**. Se il rinnovo stesso fallisce, l'errore è `definitivo` e `conRitenta` non ritenta.
  - `conto-drive.ts`: un fornitore solo per conto (`tokenUnico`).
  - «Scollegato» resta solo su `invalid_grant` al rinnovo: `revocata()` in `conto-drive.ts` è l'unico posto.
- **Avviso** (`avvisoDriveScollegato` in `src/shared/scoperta-pc.ts`):
  - c'è solo con `dal.motivo === 'revocata'`. Mai a chi non l'ha mai collegato, a chi l'ha scollegato a mano o dal registro (`sconosciuto`), né mentre il programma ritenta;
  - campi nuovi `breve`, la riga, e `chiave`, il momento dello scollegamento;
  - chiuso con la ×, resta chiuso finché la `chiave` è la stessa:
    - PC (`App.tsx`): `localStorage` `sierradeck.driveChiuso`, tasti «Perché?» e «Ricollega il Drive»;
    - pagina (`driveScollegatoHtml`): `localStorage`, `<details>` per la spiegazione;
    - app (`DriveScollegato.kt`): SharedPreferences `driveChiuso`, `mostraAvvisoDrive`/`rigaDriveScollegato` pure.
  - I PC vecchi mandano l'avviso senza `breve` né `chiave`: l'app mostra il titolo in una riga, senza ×.
- **Test:**
  - `tests/main/drive-401-rinnovo.test.ts`: 401 → rinnovo → riprova riuscita; tre chiamanti, un rinnovo; `invalid_grant` scollega; nessun giro infinito;
  - `tests/shared/scoperta-pc.test.ts`;
  - `tests/main/client-pagina.test.ts`, che esegue `driveScollegatoHtml`;
  - `DriveScollegatoTest.kt`.

# Se ricapita

Nel registro, un 401 seguito subito da un rinnovo riuscito è normale. Un `invalid_grant` vuol dire che Google ha tolto il permesso: si ricollega dal PC, Impostazioni → Account → Drive → «Collega».
