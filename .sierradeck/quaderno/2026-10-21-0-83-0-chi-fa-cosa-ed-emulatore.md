---
titolo: "0.83.0: chi fa la mappa e l'app, e l'emulatore Android ora c'è (21/10)"
quando: 2026-10-21T08:55:00+02:00
tag: ["0.83.0", "android", "emulatore", "foto", "trappola"]
---

## Chi fa cosa

Le consegne del 21/10 portano tutte in testa lo stesso avviso: «la 0.83.0 ristruttura l'app Android… il primo passo è la mappa». È un avviso mandato a tutte le chat, non un compito per ciascuna.

Le parti della 0.83.0, secondo la consegna c-481:
- **c-10**: la mappa prima e dopo (`app-android-0-83-0.md`);
- **c-11 e c-439**: l'app.

Una chat che ha già finito la sua parte non deve rifare la mappa. Prima di partire, controlla a chi è stata data.

c-4, che si occupava dell'interfaccia della gestione delle chat (0.79.0), ha finito il suo lavoro, e il suo ramo è già in main.

## Emulatore

Le schede della 0.82.0 dicono «niente foto dell'app: né emulatore né telefono». Non è più vero. Dal 21/10 alle 08:36 in `E:/Android/Sdk` ci sono:
- `emulator`;
- `system-images/android-35/google_apis/x86_64`.

Un AVD non c'era ancora (manca `~/.android/avd`): va creato con `avdmanager` prima di fare foto o misure.
