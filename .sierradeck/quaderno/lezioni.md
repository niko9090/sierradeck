# Lezioni del progetto

<!-- SierraDeck: una riga per voce; una voce che torna aumenta «confermata N×». Tetto 200 voci o 32 KB: escono prima le meno confermate e più vecchie. Si può scrivere anche a mano. -->

## pty-host

- Lo stderr dell'host passa da `leggiStderrAtteso` in pty-host-client.ts: i rumori attesi di node-pty o dello spegnimento si aggiungono lì, il resto resta errore. _(2026-10-30)_

## test

- `racconta` senza l'opzione `log` scrive in console.error: per provare che una riga è raccontata e non errore, il test deve passare `log`. _(2026-10-30)_

## worktree

- un agente isolato in un worktree non può eseguire git nella cartella principale: i compiti che chiedono commit su main vanno dati a chi lavora fuori dal worktree. _(2026-10-30)_

## errori

- Lo stderr dei figli arriva a pezzi arbitrari: riconoscere le righe attese una per una, mai con `^` sul pezzo intero (0.88.2 sfuggiva, prefisso doppio). _(2026-10-30)_

## consegne

- Una cartella sparita va controllata anche al ritiro (`ritira`), non solo alla lettura della coda: una consegna già in coda riapriva il riquadro a ogni tentativo. _(2026-10-30)_

## chiusura

- I gruppi su 0.88.1/0.88.2 possono essere già corretti nella 0.88.3: confrontare la versione dell'errore con il commit prima di intervenire. _(2026-10-30)_
