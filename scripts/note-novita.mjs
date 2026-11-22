// Le righe di novita.ts di una versione, in testo semplice (senza il
// grassetto **…**). Le usa app-android.json (0.43.0) per le note nella
// notifica dell'aggiornamento sul telefono. Pura: si prova con vitest.
// Le righe di una voce nel formato testo dell'Aiutante: una stringa fra apici per riga.
function noteDiTesto(blocco) {
  const righe = []
  for (const riga of blocco.split(/\r?\n/).slice(1)) {
    const m = /^\s*'((?:[^'\\]|\\.)*)'\s*,?\s*$/.exec(riga)
    if (m) righe.push(m[1].replace(/\\(.)/g, '$1').replace(/\*\*/g, ''))
  }
  return righe
}

// Come noteDi, ma una versione senza note è un errore con un messaggio chiaro.
export function noteDiOErrore(sorgente, versione, dove = 'il file delle novità') {
  const note = noteDi(sorgente, versione)
  if (note.length === 0) throw new Error(`mancano le novità della versione ${versione} in ${dove}: serve una voce \`versione: '${versione}'\` con le sue righe`)
  return note
}

export function noteDi(sorgente, versione) {
  const inizio = sorgente.indexOf(`versione: '${versione}'`)
  if (inizio < 0) return []
  const dopo = sorgente.indexOf('versione: ', inizio + 10)
  const blocco = sorgente.slice(inizio, dopo < 0 ? undefined : dopo)
  const apertura = /righe:\s*\[/.exec(blocco)
  // Formato di src/aiutante/novita-aiutante.txt: niente `righe: [`, le stringhe
  // stanno una per riga sotto `versione: '…'`, fino alla voce dopo.
  if (!apertura) return noteDiTesto(blocco)
  const righe = []
  // Legge le stringhe dell'array `righe: [...]`, su una riga o su più righe,
  // fino alla `]` che sta fuori dalle stringhe.
  const lettore = /'((?:[^'\\]|\\.)*)'|(\])/g
  lettore.lastIndex = apertura.index + apertura[0].length
  for (let m = lettore.exec(blocco); m && !m[2]; m = lettore.exec(blocco)) {
    // Toglie gli escape della stringa JS (\' e \\), non solo l'apice.
    righe.push(m[1].replace(/\\(.)/g, '$1').replace(/\*\*/g, ''))
  }
  return righe
}
