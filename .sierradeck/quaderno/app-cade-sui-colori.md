---
titolo: "L'app che si chiudeva leggendo una chat, e la nota che nessuno leggeva"
quando: 2026-08-27T23:40:00+02:00
tag: ["android", "ansi", "crash", "diagnosi"]
---

## Il guasto
L'app nativa si chiudeva da sola **mentre si guardava una chat**. Non lasciava
niente a schermo: si tornava alla home di Android.

## La causa: `Ansi.kt` si fidava dei numeri che arrivavano dalla rete
Il parser dei colori prendeva i numeri di una sequenza `ESC[...m` e li passava
dritti a `Color(r, g, b)`, che **accetta 0..255 e solleva su tutto il resto**.
Quei numeri non li scriviamo noi: arrivano dal flusso di un terminale, dove una
sequenza troncata o malformata produce valori qualunque. Tre strade allo stesso
schianto:
- `38;2;300;10;10` → componente fuori scala → `IllegalArgumentException`;
- `38;5;999` → ramo dei grigi → `8 + (999-232)*10` = **7678** → stessa eccezione;
- un numero **negativo** → `base16[n]` → indice prima dell'inizio dell'elenco.

Non c'entrava l'aggiornamento dell'app né il rilascio: il difetto era lì da
prima, e si è visto quando una chat vera ha mandato la riga giusta.

## Le correzioni
- `canale(x) = x.coerceIn(0, 255)` su **ogni** componente, e il numero della
  tavolozza riportato in 0..255 prima di essere interpretato.
- `ansiAnnotato` è ora una rete di sicurezza attorno a `vestiRiga`: qualunque
  cosa sfugga lì dentro produce la riga **nuda** invece di chiudere l'app. Si
  perde il colore di una riga, non la conversazione.
- Lo spogliatore delle sequenze è un ciclo, non una `Regex`: nel testo di questo
  progetto una barra rovescia non sopravvive al viaggio fino al file, e una
  regex sbagliata lì è peggio di un ciclo esplicito. Stesso motivo per cui si
  usa `Char(27)` e `Char(91)` invece degli escape.

## La scoperta che vale più del guasto
`Guasti.kt` scriveva la nota della caduta su file «per mostrarla al riavvio
successivo» — e **`Guasti.ultimo()` non era chiamato da nessuna parte**. Modulo
scritto, documentato, e mai collegato: l'app cadeva e non restava una parola,
esattamente la cosa che quel modulo esisteva per evitare. Ora c'è
`DialogoGuasto`, che all'avvio la mostra, la fa **copiare** (senza un cavo USB è
l'unico modo per far arrivare una traccia a chi ripara) e poi la archivia.

Regola: un modulo di diagnosi che non è collegato è peggio di uno che non esiste
— fa credere che il problema sia coperto. Vale la pena, quando se ne scrive uno,
verificare che qualcuno lo *chiami*.

## Rilascio
APK **2.0.1** (codice 21) pubblicato; la 2.0.0 è stata tolta dagli allegati.
L'app la propone da sola al primo avvio: `Aggiornamenti.controlla` gira a ogni
apertura e tiene la versione più alta fra gli allegati delle ultime venti
pubblicazioni. Vedi [[app-android-nativa]] [[telefono-schermo-e-invio]].
