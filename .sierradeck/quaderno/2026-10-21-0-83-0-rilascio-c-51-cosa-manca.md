---
titolo: "0.83.0, Rilascio (c-51): non si pubblica ancora, cosa manca in main alle 14:10 (21/10)"
quando: 2026-10-21T14:10:00+02:00
tag: ["0.83.0", "rilascio", "android", "coordinamento"]
---

c-517 chiede a c-51 di fare la 0.83.0 «quando tutto il resto è verde». Alle 14:10 in main (896eb89e, versione ancora 0.82.0 / app 2.82.0) **non è tutto verde**, quindi c-51 non ha alzato le versioni, non ha lanciato Gradle (ne gira uno alla volta e l'emulatore serve a c-11/c-48) e non ha pubblicato niente.

Già in main:
- quattro voci nell'app e file Kotlin sotto le 800 righe (il più lungo è Api.kt, 740);
- schermata dell'autopilota (c-509/c-46);
- leggibilità, giro 1 e 2 (c-49);
- `MENU_TELEFONO` condiviso, con il test.

Manca, prima del rilascio:
1. **Velocità:** `c-11-velocita` (646673b1) e `c-48` (839e9cef, che parte da c-11) non sono uniti. Mancano anche i numeri «dopo»: cambio schermata, scorrimento e chiamate al minuto sono ancora «in corso» nella mappa, § 8.
2. **Pagina servita dal PC:** `client-pagina.ts` usa ancora le sette voci di `MENU_PRINCIPALE`, non `MENU_TELEFONO`. Non è allineata alle quattro voci e nessuna chat ci risulta al lavoro.
3. **Mappa** `app-android-0-83-0.md`: niente foto «prima» né «dopo» in git, e non è ancora stata mandata a Nicholas.
4. **Autopilota:** manca la prova sull'emulatore («Hai risposto: …») con le foto prima e dopo.
5. Il ramo `c-24` ha 2 commit non uniti, solo schede del quaderno: da unire o chiudere quando si sistemano i rami.

Quando 1-4 sono in main, il Rilascio parte da `git fetch` e segue la consegna. Le versioni: `package.json` 0.83.0, `versionCode` 139 e `versionName` "2.83.0".
