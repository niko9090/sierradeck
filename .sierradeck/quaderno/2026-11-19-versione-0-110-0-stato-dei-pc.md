# Versione 0.110.0: stato dei PC in un posto solo

Funzione nuova, quindi minor. Dentro k-p1…k-p4.

- Una regola sola per lo stato dei PC (acceso, spento, da togliere): src/shared/stato-pc.ts, usata da Rete dei PC, Altri PC, Salute, rapporto del controllo, pagina del telefono e app.
- Un PC spento da più di 30 giorni si toglie da solo dalla lista. Si cancella solo la sua registrazione, mai i suoi progetti. Un PC con l'orologio sbagliato non si toglie mai.
- Frase unica per i PC spenti, per esempio «spento da 3 giorni · si toglie fra 27 giorni».
- Rapporto «Controllo di tutti i PC»: i PC spenti hanno una riga corta e non sono più criticità.
- Versioni: programma 0.110.0, app Android 3.2.0 (versionCode 161), Aiutante resta 1.2.2 (il suo codice non è cambiato dalla 0.109.2).
