---
titolo: "La spia dell'updater: chi racconta l'installazione al telefono"
quando: 2026-08-28T17:20:00+02:00
tag: ["aggiornamenti", "updater", "telefono", "architettura"]
---

## Il problema, e il tentativo sbagliato
Dal telefono, durante l'installazione, non si vedeva niente: SierraDeck è chiuso,
ed è proprio lui che parla col telefono.

Il primo tentativo è stato un **racconto parallelo**: dedurre a che punto fosse
l'installazione dal silenzio (risponde / non risponde / è tornato) e disegnare
una percentuale con la stessa regola della finestra sul computer. Sembrava
ragionevole. Non lo era, per due motivi:

1. **Avevo rispecchiato la finestra sbagliata.** Quella che si vede è l'updater
   C# (`SierraDeck Update`), con **cinque** passi — chiusura, installazione,
   *aggiornamento di Claude Code*, avvio, pronto — e una curva asintotica per
   tratto. Io avevo copiato la finestra PowerShell di *riserva*, che ne ha
   quattro e sale a gradini fissi.
2. Anche azzeccando la tavola, sarebbero rimaste **due copie da tenere
   allineate**, in due linguaggi diversi, che divergono al primo cambiamento.

E il difetto non è estetico: **due indicatori della stessa cosa che dicono numeri
diversi tolgono fiducia a entrambi.** Chi guarda non sa più quale credere, e la
risposta onesta diventa nessuno dei due.

## La soluzione: chi sa, parla
C'è un programma vivo esattamente in quei trenta secondi, ed è l'installer. E c'è
una porta libera esattamente in quei trenta secondi, ed è quella del Client —
libera *perché* SierraDeck l'ha lasciata.

Quindi l'updater se la prende in prestito: `TcpListener` su `IPAddress.Any`, la
stessa porta, la stessa rotta `/api/aggiornamento`, la stessa forma di risposta.
Il telefono continua a chiedere le stesse cose allo stesso indirizzo, e per
quei trenta secondi gli risponde qualcun altro. **Zero simulazione, zero
allineamento da mantenere.**

## Quattro decisioni che valgono più del codice

**`TcpListener` e non `HttpListener`.** Il secondo, su Windows, vuole una
prenotazione dell'URL o i diritti di amministratore. Un aggiornamento non è il
momento di chiederli, e la risposta HTTP è abbastanza semplice da scriverla a
mano.

**La porta si molla *prima* di riaprire, non alla fine.** È il rischio serio di
tutta l'idea: se la spia tenesse la porta mentre la versione nuova parte, quella
troverebbe la porta occupata e resterebbe **senza Client** — cioè l'aggiornamento
romperebbe proprio la cosa che stavi guardando dal telefono. `spiaViva = false`
è la prima riga di `Avvia()`, e il ciclo della spia lo controlla ogni decimo di
secondo.

**Non può far fallire l'aggiornamento.** Thread di sfondo, tutto dentro un try
che ingoia, e se la porta non si prende nessuno se ne accorge. Un aggiornamento
che si rompe per mostrare una percentuale sarebbe il peggior baratto possibile.

**Niente sequenze di fuga nel C#.** Quel sorgente vive dentro una stringa
TypeScript: ogni `\` e ogni `"` attraversa due linguaggi e ne perde uno strato
per strada — dieci errori «nuova riga nella costante» al primo tentativo. Il JSON
si costruisce con `(char)34` e `(char)92`. Stessa regola già imparata col Kotlin
e `Char(92)`: **quando un sorgente è dentro un altro sorgente, i caratteri si
nominano per numero.**

Attenzione anche a `using System.Threading`: rende `Timer` ambiguo con quello di
WinForms. Si qualifica `System.Threading.Thread` e basta.

## Come si verifica
Non a occhio. Il sorgente C# si rende su file e si compila davvero col `csc.exe`
di .NET Framework (`%WINDIR%\Microsoft.NET\Framework64\v4.0.30319`), poi si lancia
l'updater con un `aggiornamento.txt` finto — installer lento, porta di prova —
e si interroga la spia:

```
RISPOSTA: {"fase":"installo","versione":"9.9.9","percento":26,
           "testo":"Installazione della versione 9.9.9..."}
```

Fatto davvero, ed è così che si è scoperto che il primo giro non compilava.

## Una cosa da sapere
`VERSIONE_UPDATER` è passata a 13, ma l'updater lo compila la versione **in
esecuzione**: il primo aggiornamento verso la 0.12.24 usa ancora quello vecchio,
senza spia. Si vede dal secondo in poi. È la stessa trappola di
[[app-android-nativa]] (2.11.0): una funzione che ha bisogno delle due metà
aggiornate insieme non si vede al giro in cui la si installa.
