// Le righe di novita.ts di una versione, in testo semplice (senza il
// grassetto **…**). Le usa app-android.json (0.43.0) per le note nella
// notifica dell'aggiornamento sul telefono. Pura: si prova con vitest.
export function noteDi(sorgente, versione) {
  const inizio = sorgente.indexOf(`versione: '${versione}'`)
  if (inizio < 0) return []
  const dopo = sorgente.indexOf('versione: ', inizio + 10)
  const blocco = sorgente.slice(inizio, dopo < 0 ? undefined : dopo)
  const apertura = /righe:\s*\[/.exec(blocco)
  if (!apertura) return []
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
