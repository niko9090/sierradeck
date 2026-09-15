---
titolo: "La stessa chat aperta su due PC: dove c'è la guardia e dove no (stato 0.27.0)"
quando: 2026-09-15T09:30:00+02:00
tag: ["drive", "multi-pc", "presenza", "testimone", "conflitti", "limite"]
---

Nicholas (15/09): «sto lavorando sulla stessa chat da più PC e non vedo
nessun impedimento, è corretto?». Verificato nel codice: sì, è così, e
il blocco esiste solo in un caso.

# Dove la guardia c'è: i «progetti sul Drive»

Solo per una cartella messa sul Drive come progetto (Account → «Progetti
sul Drive»). `ronda.primaDiAprire(cwd)` (`presenza.ts`) torna subito se
`progettoDi(cwd)` è vuoto. Dentro un progetto in mano a un altro PC:
`ModaleTestimone` «in uso su …», una volta per progetto; la chat **si apre
comunque** («Continua senza»), ma finché il progetto è `altro` `radiciLocali`
lo esclude dal salvataggio: il lavoro di qui non sale sul Drive finché non
si prende il testimone.

# Dove non c'è: tutte le altre chat

Una chat qualunque, arrivata con la sincronia nei due versi (0.26.0), si
apre su tutti e due i PC senza avviso. Ogni PC ha il suo `claude --resume`
sulla propria copia del `.jsonl`, quindi localmente nulla si rompe. Il
danno è al momento della sincronia: per il prefisso `chat` un file cambiato
da tutte e due le parti è un conflitto **senza copia** (tappa 3,
`incrementale.ts`: vince il più recente; nella fusione `VINCE_PIU_LUNGA`, la
più lunga). I turni fatti sull'altro PC spariscono, senza avviso.

Il battito `pc-<id>` della 0.27.0 (`posta.ts`) elenca le chat aperte di ogni
PC ma nessuno lo usa come guardia.

# Cosa si potrebbe fare (da decidere)

1. Usare il battito: all'apertura di una chat, se un altro PC vivo la ha
   fra le sue `chat` aperte, avviso «aperta su «torre» da …», con «Apri lo
   stesso». Costo basso, copre tutte le chat, non solo i progetti.
2. Nel conflitto sul prefisso `chat`, invece di far vincere una copia,
   tenere l'altra come conversazione a parte (copia `.jsonl` con uuid nuovo
   e titolo «… (da torre)»), così non si perde niente.
