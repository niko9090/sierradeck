// Le righe di novita.ts di una versione, in testo semplice (senza il
// grassetto **…**). Le usa app-android.json (0.43.0) per le note nella
// notifica dell'aggiornamento sul telefono. Pura: si prova con vitest.
export function noteDi(sorgente, versione) {
  const inizio = sorgente.indexOf(`versione: '${versione}'`)
  if (inizio < 0) return []
  const dopo = sorgente.indexOf('versione: ', inizio + 10)
  const blocco = sorgente.slice(inizio, dopo < 0 ? undefined : dopo)
  const righe = []
  for (const m of blocco.matchAll(/^\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)) {
    righe.push(m[1].replace(/\\'/g, "'").replace(/\*\*/g, ''))
  }
  return righe
}
