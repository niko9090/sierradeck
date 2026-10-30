import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'
import { vistaAutopilota } from '@shared/autopiloti-vista'
import { COLORE_DAL_VIVO } from '@shared/stato-dal-vivo'
import { paginaClient } from '../../src/main/client-pagina'

/**
 * La rifinitura grafica della 0.80.0 (`grafica-prima-0-80-0.md`): le stesse
 * parole con lo stesso colore e gli stessi numeri su PC, pagina e app.
 */
const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))
const estrai = (inizio: string): string => {
  const i = script.indexOf(inizio)
  if (i < 0) throw new Error(`manca ${inizio}`)
  let profondita = 0
  for (let j = script.indexOf('{', i); j < script.length; j++) {
    if (script[j] === '{') profondita++
    else if (script[j] === '}' && --profondita === 0) return script.slice(i, j + 1)
  }
  throw new Error('non si chiude')
}
const esc = 'function esc(s) { return String(s) }'

const ORA = Date.parse('2026-10-19T12:00:00Z')
function ap(over: Partial<Autopilota> = {}): Autopilota {
  return {
    ...nuovoAutopilota({ id: 'ap-1', nome: 'Prova', obiettivo: 'o', cwd: 'C:/prova', criteri: [{ descrizione: 'a', soddisfatto: false }], iniziatoIl: '2026-10-19T10:00:00.000Z' }),
    ultimoEvento: '2026-10-19T11:58:00.000Z',
    ...over
  }
}

describe('1. «fermo» ha un colore solo', () => {
  it('nella vista calcolata dal PC è rosso, come il LED; «guasto» resta rosso e «finito» si spegne', () => {
    expect(vistaAutopilota(ap({ stato: 'sospeso', motivoSospensione: 'fermato da te' }), ORA).stato).toMatchObject({ parola: 'fermo', colore: 'rosso' })
    expect(vistaAutopilota(ap({ stato: 'fallito' }), ORA).stato.colore).toBe('rosso')
    expect(COLORE_DAL_VIVO).toEqual({ 'al lavoro': 'verde', 'aspetta te': 'ambra', fermo: 'rosso', finito: 'quieto' })
  })

  it('la riga dal vivo della pagina usa gli stessi colori', () => {
    const dalVivoHtml = new Function(`${esc}; ${estrai('function dalVivoHtml(')}; return dalVivoHtml`)() as (v: unknown) => string
    expect(dalVivoHtml({ etichetta: 'fermo', da: '1 g' })).toContain('var(--rosso')
    expect(dalVivoHtml({ etichetta: 'finito' })).toContain('var(--testo-quieto')
    expect(dalVivoHtml({ etichetta: 'al lavoro' })).toContain('var(--verde')
  })
})

describe('2. «aspettano te» è un numero solo, come sul PC', () => {
  it('una chat che ha finito il turno è «ferma» e non entra nei conti di chi aspetta te', () => {
    const p = new Function(`${estrai('function statoChat(')}; ${estrai('function riassuntoChat(')}; return { statoChat, riassuntoChat }`)() as {
      statoChat: (c: object) => { tono: string; parola: string }
      riassuntoChat: (c: object[]) => string
    }
    // Le due chat della foto «prima»: ferme a fine turno. Sul PC «Aspettano te 0».
    const finite = [{ aspetta: true, viva: true }, { aspetta: true, viva: true }]
    expect(finite.filter((c) => p.statoChat(c).tono === 'attesa')).toHaveLength(0)
    expect(p.riassuntoChat(finite)).toBe('2 ferme')
    // Una scelta aperta invece aspetta te, ovunque.
    expect(p.statoChat({ chiede: true }).tono).toBe('attesa')
  })
})

describe('3. un autopilota fermo non ha chat «al lavoro»', () => {
  it('la tabella, l albero (pagina e app) e i LED usano la stessa regola', async () => {
    const { chatAlLavoro } = await import('@shared/autopilota')
    const { alberoChat } = await import('@shared/harness')
    const chats = [
      { id: 'c-1', compito: 'Spiega', stato: 'finita' as const, cicli: 1 },
      { id: 'c-2', compito: 'Scrivi', stato: 'lavoro' as const, cicli: 2 }
    ]
    const fermo = ap({ stato: 'sospeso', chats })
    expect(vistaAutopilota(fermo, ORA).chat).toMatchObject({ totali: 2, alLavoro: 0, testo: '2' })
    expect(alberoChat(fermo).figli[1]).toMatchObject({ stato: 'ferma', parola: 'ferma: l’autopilota è fermo' })
    expect(chatAlLavoro(fermo, { stato: 'lavoro' })).toBe(false)
    const inMoto = ap({ stato: 'lavoro', chats })
    expect(vistaAutopilota(inMoto, ORA).chat.testo).toBe('2 · 1 al lavoro')
    expect(alberoChat(inMoto).figli[1]).toMatchObject({ stato: 'lavoro', parola: 'al lavoro' })
  })
})

describe('4. l’accordo della riga del collegamento', () => {
  it('la pagina dice «linea ottima», non «collegamento ottima»; le parole della qualità sono femminili', async () => {
    const { qualita } = await import('@shared/collegamento')
    const lineaHtml = estrai('function lineaHtml(')
    expect(lineaHtml).toContain("'linea ' + q.parola")
    expect(lineaHtml).not.toContain("'collegamento ' + q.parola")
    // Tutte femminili: stanno bene dopo «linea» e dopo «qualità» (PC e app).
    const parole = new Set([0, 50, 400, 2000].map((ms) => qualita([{ ok: true, ms, alle: 1 }] as never).parola))
    for (const p of parole) expect(p).toMatch(/a$|non ancora misurata|non arriva niente/)
  })
})

describe('6. il prossimo passo anche sul PC', () => {
  it('i passi con il tasto restano tasti; gli altri diventano una riga, come sulla pagina', async () => {
    const { passoSulPc, vistaAccount } = await import('@shared/account-vista')
    const ora = Date.parse('2026-10-19T12:00:00Z')
    const senzaPassphrase = vistaAccount({ utente: { email: 'prova@esempio.it' }, drive: { configurato: true, connesso: true }, sync: { haCassaforte: false, sbloccato: false }, ora })
    expect(passoSulPc(senzaPassphrase.prossimo)).toEqual({ tasto: false, testo: 'Crea la passphrase' })
    expect(passoSulPc(vistaAccount({ ora }).prossimo)).toEqual({ tasto: false, testo: 'Entra' })
    const daCollegare = vistaAccount({ utente: { email: 'prova@esempio.it' }, drive: { configurato: true, connesso: false }, sync: { haCassaforte: false, sbloccato: false }, ora })
    expect(passoSulPc(daCollegare.prossimo)).toEqual({ tasto: true, testo: 'Collega il Drive' })
    // Drive non configurato in questa build: niente passo, su nessun lato.
    expect(passoSulPc(vistaAccount({ utente: { email: 'prova@esempio.it' }, drive: { configurato: false, connesso: false }, sync: { haCassaforte: false, sbloccato: false }, ora }).prossimo)).toBeUndefined()
  })
})

describe('Revisione delle voci 1-6 (0.80.0)', () => {
  it('la pagina: l elenco degli altri PC dice «ferma» come la regola delle chat; il LED è un selettore .led.ferma', () => {
    expect(script).not.toContain("c.aspetta ? 'aspetta te' : 'al lavoro'")
    expect(script).toContain("c.aspetta ? 'ferma' : 'al lavoro'")
    expect(html).toContain('.led.ferma {')
  })
})

describe('Impostazioni: la riga della trasformazione dei workspace (0.80.0)', () => {
  it('niente più «(0)»: il numero sono gli autopiloti nuovi, detto per quello che è', async () => {
    const { testoMigrazione } = await import('@shared/migrazione-elenco')
    const d = { workspace: 'w', chat: 0 }
    expect(testoMigrazione({ stato: 'fatta', dormienti: [] })).toBe('Fatta: ogni workspace aveva già il suo autopilota.')
    expect(testoMigrazione({ stato: 'fatta', dormienti: [d] })).toBe('Fatta: Panoramica nuova in 1 workspace, parte quando le scrivi.')
    expect(testoMigrazione({ stato: 'fatta', dormienti: [d, d] })).toBe('Fatta: Panoramica nuova in 2 workspace, parte quando le scrivi.')
    expect(testoMigrazione({ stato: 'fallita', motivo: 'disco pieno', dormienti: [] })).toContain('disco pieno')
  })
})

describe('Voci ancora aperte, fatte nella 0.81.0', () => {
  const css = readFileSync('src/renderer/console.css', 'utf8')
  it('Salute: la riga d errore non porta l id della sessione e la cartella; intero resta nella spiegazione', async () => {
    const { componiSalute, titoloErrore } = await import('@shared/salute')
    const msg = '[app] [chat] «Media con i test» (11111111-0800-4000-8000-000000000001, C:\\prova\\cartella) non si apre'
    expect(titoloErrore(msg)).toBe('[app] [chat] «Media con i test» non si apre')
    expect(titoloErrore('sessione 11111111-0800-4000-8000-000000000001 persa')).toBe('sessione 11111111… persa')
    // Dalla Revisione: una cartella con le parentesi non lascia pezzi di percorso nel titolo.
    expect(titoloErrore('«Media» (11111111-0800-4000-8000-000000000001, C:\\Program Files (x86)\\x) non si apre')).toBe('«Media» non si apre')
    expect(titoloErrore('x'.repeat(130))).toHaveLength(121)
    const s = componiSalute({ adesso: ORA, versione: '0.81.0', drive: { configurato: true, connesso: true }, pc: [], errori: [{ messaggio: msg, volte: 1, ultimo: '2026-10-19T11:50:00Z', primo: '2026-10-19T11:50:00Z' }], consegne: [], oreErrori: 24 })
    const v = s.voci.find((x) => x.chiave === 'errore:0')
    expect(v?.titolo).toBe('10 minuti fa: [app] [chat] «Media con i test» non si apre')
    expect(v?.spiegazione).toContain('11111111-0800-4000-8000-000000000001')
  })
  it('PC: le linguette dell autopilota vanno a capo intere; le Impostazioni scorrono a tutta larghezza', () => {
    expect(css).toMatch(/\.diario__schede \{[^}]*flex-wrap: wrap/)
    expect(css).toMatch(/\.diario__scheda \{[^}]*white-space: nowrap/)
    expect(css).toContain('.impostazioni-vista__destra .impostazioni__corpo > * { max-width: 960px; }')
    expect(css).not.toContain('.impostazioni-vista__destra .impostazioni__corpo { max-width')
  })
  it('PC: gli anelli dell Account sono alti uguali, il workspace attivo si legge, un solo «Strumenti ▾» per schermata', () => {
    expect(css).toMatch(/\.account__anello-e-freccia \{[^}]*align-items: stretch/)
    expect(css).toMatch(/\.ws__voce--attivo \{[^}]*max-width: 240px/)
    const account = readFileSync('src/renderer/components/PannelloAccount.tsx', 'utf8')
    expect(account).not.toContain('>Strumenti ▾<')
    expect(account).toContain('>Account ▾<')
    expect(readFileSync('src/shared/account-vista.ts', 'utf8')).not.toContain('Strumenti ▾')
  })
  it('pagina e app: il campo di ricerca dei progetti non si taglia', () => {
    expect(script).toContain('placeholder="Cerca progetto o PC"')
    expect(readFileSync('android/app/src/main/java/it/ferrariconsulenze/sierradeck/PannelloDrive.kt', 'utf8')).toContain('Text("Cerca progetto o PC"')
  })
})
