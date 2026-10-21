---
titolo: "0.83.0: c-512 (velocità) sembrava un doppione di c-11, superata: l'ha finita c-48 (21/10)"
quando: 2026-10-21T12:55:00+02:00
tag: ["0.83.0", "android", "velocità", "coordinamento", "doppione"]
---

> **Superata (21/10 pomeriggio).** c-11 era chiusa dalle 10:40 UTC e il supervisore ha passato il lavoro a c-48. c-48 ha portato dentro il commit di c-11 e ha fatto i cinque punti elencati qui sotto. Com'è andata e i numeri sono in `velocita-app-0-83-0.md`. Trappola: da un contatore che scrive ancora non si capisce se una chat è viva; prima di dichiarare un doppione va chiesto al supervisore.

La consegna c-512 data a c-48 («Velocità 0.83.0: cache dell'ultimo stato, aggiornamenti solo di quello che cambia, liste pigre con chiavi, niente lavoro pesante sul thread principale, meno chiamate al PC, numeri prima e dopo») è **lo stesso compito di c-11**. Alle 12:51 c-11 ci stava ancora lavorando:
- ramo `ap/ap-f1e631f5/c-11-velocita`, commit 646673b1 delle 12:39, che nasce da c-46 (quattro voci) e da c-509 (schermata dell'autopilota);
- copia `ap-f1e631f5-c-11-android`: emulatore `sd11` acceso e contatore delle chiamate che scrive ancora (`note/prova-083/chiamate.log`);
- misure «prima» in `note/prova-083/misure/prima.json`.

c-48 si è fermata **senza toccare il codice**. Due chat sulla stessa parte vorrebbero dire due Gradle e due emulatori insieme, che falsano le misure di c-11 (regola: uno alla volta), e conflitti sugli stessi file appena divisi da c-46.

## Cosa ha già fatto c-11 (646673b1)

- R8 sull'APK di rilascio: da 16,8 a 4,2 MB;
- «Mi collego a…» compare solo se il collegamento tarda più di 1 s;
- lo stato letto per la prova della chiave si usa subito;
- stato, domande e Ronda decodificati fuori dal thread dello schermo;
- «Carico le chat…» al posto di «Nessuna chat».

## Cosa manca ancora rispetto a c-512, guardando c-11-velocita alle 12:51

1. **Cache dell'ultimo stato su disco, mostrata all'apertura:** nessuna. Le SharedPreferences sono usate solo per impostazioni, consegne e notifiche. È il punto che pesa di più sul «primo contenuto» (4,3 s nella misura di `prima.json`, 7,8 s nella mappa).
2. **Aggiornamenti solo di quello che cambia:** lo stato si rilegge e si sostituisce intero ogni 2 s.
3. **Liste con chiavi stabili:** 3 `items(...)` sono ancora senza `key =` (14 l'hanno già).
4. **Attese che continuano con l'app dietro:** `Drive.kt:81` (`delay(500)`) e `:99`, e `PannelloDrive.kt:349/351` usano ancora `delay` invece di `Davanti.pausa`.
5. **Numeri «dopo»:** c'è solo `dopo/12-autopilota.png`. Lo scorrimento «prima» ha `lista` vuota e il 100 % dei fotogrammi a scatti: va ricontrollato che si misuri davvero una lista lunga.

Per il supervisore: questi cinque punti vanno a c-11 (stesso emulatore, stesse misure). In alternativa si chiude c-48 come doppione, come è successo a c-510 con c-509.
