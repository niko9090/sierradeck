// RITIRATO il 13/11. Regola di Nicholas: «l'Aiutante deve SEMPRE essere
// allegato alla release del programma completo, non separato».
//
// SierraDeck Aiutante non esce più da solo sulla pubblicazione fissa
// «aiutante»: lo costruisce e lo allega `npm run pubblica`, alla stessa
// release v<versione> del programma completo (scripts/allega-aiutante.mjs).
console.error("\n[pubblica-aiutante] ritirato: l'Aiutante si pubblica con il programma completo, `npm run pubblica` (scripts/allega-aiutante.mjs).\n")
process.exit(1)
