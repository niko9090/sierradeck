/**
 * I comandi dei criteri, controllati **quando si scrivono** (0.44.0).
 *
 * La trappola del 01/10 (quaderno: `2026-10-01-trappola-comandi-dei-criteri-
 * con-bash-c-tra-virgolette-doppi.md`): il supervisore scrisse nel dialogo
 *
 *     bash -c "v=$(node -p \"require('./package.json').version\") && echo $v | grep -qE '^0\.37\.[0-9]+$' && …"
 *
 * La shell che lancia il criterio espande `$(…)` e `$v` **prima** che `bash -c`
 * li veda: `$v` arriva vuoto e il comando boccia anche a lavoro fatto. La rete
 * di sicurezza rifiuta giustamente di «correggere» un criterio che boccia, e
 * l'unica uscita era chiedere a Nicholas. Adesso il comando si guarda prima
 * che entri nel lavoro, e chi lo scrive riceve un messaggio chiaro.
 *
 * Controlli:
 * - **virgolette sbilanciate** (singole, doppie, apici inversi): il comando non
 *   si chiude, e la shell lo legge diverso da come è scritto → errore;
 * - **`$` dentro `bash -c "…"`** (o `sh -c`): una variabile o un `$(…)` non
 *   protetto viene espanso dalla shell esterna → errore;
 * - **`node -e` / `node -p` che non si compila**: il JavaScript, letto come lo
 *   passerebbe la shell, ha un errore di sintassi → errore;
 * - **file che non esistono** (`test -f`, `[ -f ]`, `node script.js`,
 *   `readFileSync('…')`, `require('./…')`, l'ultimo argomento di `grep`/`cat`):
 *   solo un **avviso**, perché un criterio può aspettare un file che il lavoro
 *   deve ancora creare (la scheda del progetto, un nuovo test).
 *
 * Puro: `esiste` lo passa chi chiama (relativo alla cartella del progetto).
 */

export type Problema = { gravita: 'errore' | 'avviso'; tipo: 'virgolette' | 'dollaro' | 'node' | 'file'; messaggio: string }
export type Esame = { ok: boolean; problemi: Problema[] }

/** Lo stato delle virgolette alla fine del comando, letto come una shell POSIX. */
export function virgoletteAperte(cmd: string): "'" | '"' | '`' | undefined {
  let stato: "'" | '"' | '`' | undefined
  for (let i = 0; i < cmd.length; i += 1) {
    const c = cmd[i]
    if (stato === "'") { if (c === "'") stato = undefined; continue }
    if (c === '\\') { i += 1; continue }
    if (stato === '"') { if (c === '"') stato = undefined; continue }
    if (stato === '`') { if (c === '`') stato = undefined; continue }
    if (c === "'" || c === '"' || c === '`') stato = c
  }
  return stato
}

/**
 * Gli argomenti tra virgolette doppie che seguono `bash -c` / `sh -c`, come
 * sono scritti (senza le virgolette esterne).
 */
function argomentiDoppiDopo(cmd: string, prima: RegExp): { inizio: number; testo: string }[] {
  const fuori: { inizio: number; testo: string }[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(prima.source, 'g')
  while ((m = re.exec(cmd)) !== null) {
    const da = m.index + m[0].length
    if (cmd[da] !== '"') continue
    let i = da + 1
    let testo = ''
    for (; i < cmd.length; i += 1) {
      const c = cmd[i] as string
      if (c === '\\' && i + 1 < cmd.length) { testo += c + (cmd[i + 1] as string); i += 1; continue }
      if (c === '"') break
      testo += c
    }
    fuori.push({ inizio: da, testo })
  }
  return fuori
}

/** I `$` che la shell esterna espanderebbe dentro un testo tra virgolette doppie (non quelli con `\$`, non `$/`, `$'`…). */
export function dollariNonProtetti(testoDoppio: string): string[] {
  const fuori: string[] = []
  for (let i = 0; i < testoDoppio.length; i += 1) {
    const c = testoDoppio[i]
    if (c === '\\') { i += 1; continue }
    if (c !== '$') continue
    const dopo = testoDoppio.slice(i + 1)
    const m = /^(\(|\{|[A-Za-z_][A-Za-z0-9_]*|[0-9@*#?!-])/.exec(dopo)
    if (m !== null) fuori.push('$' + (m[0] === '(' ? '(…)' : m[0] === '{' ? '{…}' : m[0]))
  }
  return fuori
}

/** Il testo tra virgolette doppie come lo riceve il programma: `\"`, `\\`, `\$`, `` \` `` perdono la barra. */
function comeLoPassaLaShell(testoDoppio: string): string {
  return testoDoppio.replace(/\\(["\\$`])/g, '$1')
}

/** Lo script di `node -e`/`node -p`, come lo riceve node. `undefined` se non si trova. */
export function scriptNode(cmd: string): { modo: 'e' | 'p'; script: string }[] {
  const fuori: { modo: 'e' | 'p'; script: string }[] = []
  const re = /\bnode\s+(?:--\S+\s+)*-(e|p|-eval|-print)\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cmd)) !== null) {
    const modo: 'e' | 'p' = m[1] === 'p' || m[1] === '-print' ? 'p' : 'e'
    const da = m.index + m[0].length
    const q = cmd[da]
    if (q === "'") {
      const fine = cmd.indexOf("'", da + 1)
      if (fine > da) fuori.push({ modo, script: cmd.slice(da + 1, fine) })
    } else if (q === '"') {
      let i = da + 1
      let testo = ''
      for (; i < cmd.length; i += 1) {
        const c = cmd[i] as string
        if (c === '\\' && i + 1 < cmd.length) { testo += c + (cmd[i + 1] as string); i += 1; continue }
        if (c === '"') break
        testo += c
      }
      fuori.push({ modo, script: comeLoPassaLaShell(testo) })
    }
  }
  return fuori
}

/** Il JavaScript si compila? `undefined` se sì, altrimenti il messaggio dell'errore. */
export function erroreDiSintassi(script: string, modo: 'e' | 'p'): string | undefined {
  try {
    // Solo compilato, mai eseguito: `new Function` costruisce e basta.
    new Function(modo === 'p' ? `return (${script}\n)` : script)
    return undefined
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/** I file che il comando legge, relativi alla cartella del progetto. */
export function fileLetti(cmd: string): string[] {
  const fuori = new Set<string>()
  const aggiungi = (p: string | undefined): void => {
    if (p === undefined) return
    const x = p.replace(/^['"]|['"]$/g, '')
    if (x === '' || x.startsWith('-') || /[$*?{}<>|;&]/.test(x) || /^[a-z]+:\/\//i.test(x)) return
    fuori.add(x)
  }
  for (const m of cmd.matchAll(/(?:\btest|\[)\s+-[fesd]\s+(\S+)/g)) aggiungi(m[1])
  for (const m of cmd.matchAll(/\bnode\s+(?!-)(\S+\.(?:m?js|cjs))\b/g)) aggiungi(m[1])
  for (const m of cmd.matchAll(/readFileSync\(\s*['"]([^'"]+)['"]/g)) aggiungi(m[1])
  for (const m of cmd.matchAll(/require\(\s*['"](\.{1,2}\/[^'"]+)['"]/g)) aggiungi(m[1])
  for (const m of cmd.matchAll(/\b(?:grep|cat)\s+[^|&;]*?\s(['"]?[\w./-]+\.[A-Za-z0-9]{1,6}['"]?)(?=\s*(?:$|[|&;)]))/g)) aggiungi(m[1])
  return [...fuori]
}

/** L'esame di un comando, con un messaggio per esteso per chi lo ha scritto. */
export function esaminaComando(cmd: string, esiste?: (percorso: string) => boolean): Esame {
  const problemi: Problema[] = []
  const aperta = virgoletteAperte(cmd)
  if (aperta !== undefined) {
    problemi.push({
      gravita: 'errore', tipo: 'virgolette',
      messaggio: `Le virgolette non si chiudono (${aperta === "'" ? 'apice singolo' : aperta === '"' ? 'virgolette doppie' : 'apice inverso'} aperto): la shell leggerebbe il comando diverso da come è scritto. Chiudile, o usa node -e con apici singoli fuori e doppi dentro.`
    })
  }
  for (const a of argomentiDoppiDopo(cmd, /\b(?:bash|sh)\s+-c\s+/)) {
    const d = dollariNonProtetti(a.testo)
    if (d.length > 0) {
      problemi.push({
        gravita: 'errore', tipo: 'dollaro',
        messaggio: `Dentro bash -c "…" tra virgolette doppie c'è ${[...new Set(d)].join(', ')}: la shell che lancia il criterio lo espande prima che bash -c lo veda, quindi arriva vuoto e il criterio boccia anche a lavoro fatto (la trappola del 01/10). Usa apici singoli: bash -c '…', oppure scrivi i percorsi per esteso, oppure node -e '…'.`
      })
    }
  }
  for (const n of scriptNode(cmd)) {
    const e = erroreDiSintassi(n.script, n.modo)
    if (e !== undefined) {
      problemi.push({
        gravita: 'errore', tipo: 'node',
        messaggio: `Il JavaScript di node -${n.modo}, come lo riceve node dopo la shell, non si compila: ${e}. Di solito sono virgolette o barre mangiate dalla shell: metti lo script tra apici singoli e usa le doppie dentro.`
      })
    }
  }
  if (esiste !== undefined) {
    for (const f of fileLetti(cmd)) {
      if (!esiste(f)) {
        problemi.push({
          gravita: 'avviso', tipo: 'file',
          messaggio: `Il file ${f} adesso non c'è nella cartella del progetto. Va bene se è il lavoro a doverlo creare; se no, il percorso è sbagliato e il criterio boccerà sempre.`
        })
      }
    }
  }
  return { ok: !problemi.some((p) => p.gravita === 'errore'), problemi }
}

/** Il messaggio per chi ha scritto il criterio: quale criterio, cosa non va, cosa fare. */
export function messaggioCriterio(descrizione: string, comando: string, e: Esame): string {
  const righe = e.problemi.map((p) => `- ${p.gravita === 'errore' ? 'Errore' : 'Attenzione'}: ${p.messaggio}`)
  return `Il comando del criterio «${descrizione}» ${e.ok ? 'ha un avviso' : 'non va bene e non l\'ho preso'}:\n${comando}\n${righe.join('\n')}`
}

/**
 * I criteri passati al vaglio: quelli con un comando sbagliato restano fuori
 * (con il messaggio), gli altri entrano; gli avvisi passano, ma si dicono.
 */
export function vagliaCriteri<T extends { descrizione: string; comando?: string }>(criteri: T[], esiste?: (p: string) => boolean): { buoni: T[]; scartati: { criterio: T; messaggio: string }[]; avvisi: string[] } {
  const buoni: T[] = []
  const scartati: { criterio: T; messaggio: string }[] = []
  const avvisi: string[] = []
  for (const c of criteri) {
    if (c.comando === undefined || c.comando.trim() === '') { buoni.push(c); continue }
    const e = esaminaComando(c.comando, esiste)
    if (!e.ok) { scartati.push({ criterio: c, messaggio: messaggioCriterio(c.descrizione, c.comando, e) }); continue }
    if (e.problemi.length > 0) avvisi.push(messaggioCriterio(c.descrizione, c.comando, e))
    buoni.push(c)
  }
  return { buoni, scartati, avvisi }
}
