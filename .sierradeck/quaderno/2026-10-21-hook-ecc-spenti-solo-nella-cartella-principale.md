
**Ricontrollo del 21/10, ore 16:45 (c-52, consegna c-524), solo lettura:**
- nella cartella principale `.claude/settings.local.json` ha ancora `ECC_HOOKS_ENABLED=false` e `ECC_GATEGUARD=off`;
- `.claude/settings.json` del progetto non c'è;
- lo spegnimento c'è in 7 copie su 56 (a-c, c-11-android, c-3, c-4-ws, c-1-chiudichat, c-1-test, c-241-notifiche); manca nelle copie attive c-48 e c-52 e in prova-unione-c48.

c-52 lavora dalla cartella principale, quindi per lei gli hook sono spenti; le sue copie le usa solo per git e per i test. Non ho cambiato hook, plugin o impostazioni. La scelta fra A, B e C resta a Nicholas.
