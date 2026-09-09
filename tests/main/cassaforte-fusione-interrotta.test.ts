import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriSincronia } from '../../src/main/cassaforte/sincronia'
import { magazzinoInMemoria, type Magazzino } from '../../src/main/cassaforte/magazzino'
import { archivioInMemoria, type Archivio } from '../../src/main/cassaforte/archivio'
import { creaLavoro } from '../../src/main/cassaforte/lavoro-in-corso'

/**
 * La fusione che si vede, si ferma e si riprende — e quella che NON cancella.
 *
 * Nicholas (2026-09-08): «sembra avviarsi ma non si capisce perché non c'è
 * nulla di visualizzabile… ho premuto fuori e non so cosa sia successo… se
 * ci sono operazioni a metà devo poterle sovrascrivere». E leggendo il codice
 * per farlo: una chat lasciata «com'è» solo sul Drive spariva dal Drive al
 * salvataggio dopo.
 */

function driveCondiviso(): { magazzino: (nome?: string) => Magazzino; archivio: () => Archivio } {
  const mags = new Map<string, Magazzino>()
  const arch = archivioInMemoria()
  return {
    magazzino: (nome = 'sierradeck.cassaforte') => {
      let m = mags.get(nome)
      if (m === undefined) { m = magazzinoInMemoria(); mags.set(nome, m) }
      return m
    },
    archivio: () => arch
  }
}

function pc(nome: string): { dati: string; claude: string } {
  const radice = mkdtempSync(join(tmpdir(), `sd-fus-${nome}-`))
  const dati = join(radice, 'dati')
  const claude = join(radice, 'claude')
  mkdirSync(dati, { recursive: true })
  mkdirSync(join(claude, 'projects', 'progetto'), { recursive: true })
  return { dati, claude }
}

const temp: string[] = []
afterEach(() => { for (const t of temp.splice(0)) rmSync(t, { recursive: true, force: true }) })

function apri(p: { dati: string; claude: string }, drive: ReturnType<typeof driveCondiviso>, lavoro = creaLavoro()): ReturnType<typeof apriSincronia> {
  temp.push(join(p.dati, '..'))
  return apriSincronia({
    dati: p.dati, radiceClaude: p.claude,
    driveConnesso: () => true, magazzino: drive.magazzino, archivio: drive.archivio,
    lavoro
  })
}

const chat = (p: { claude: string }, nome: string, righe: number): void => {
  writeFileSync(join(p.claude, 'projects', 'progetto', `${nome}.jsonl`), Array.from({ length: righe }, (_, i) => `{"riga":${i}}`).join('\n') + '\n', 'utf8')
}

const sulDrive = async (s: ReturnType<typeof apriSincronia>): Promise<string[]> => {
  const piano = await s.anteprimaFusione()
  if (!piano.ok) throw new Error(piano.messaggio)
  return piano.piano.chat.filter((v) => v.dove !== 'pc').map((v) => v.percorso).sort()
}

describe('la fusione interrotta e ripresa', () => {
  it('IL PUNTO: una chat lasciata «com e» solo sul Drive resta sul Drive anche dopo il salvataggio', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); const b = pc('B')
    chat(a, 'solo-a', 3)
    const syncA = apri(a, drive)
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)

    chat(b, 'solo-b', 2)
    const syncB = apri(b, drive)
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)
    const piano = await syncB.anteprimaFusione()
    expect(piano.ok).toBe(true)
    if (!piano.ok) return
    const vociB = piano.piano.chat
    const soloDrive = vociB.find((v) => v.dove === 'drive')
    const soloPc = vociB.find((v) => v.dove === 'pc')
    expect(soloDrive?.percorso).toContain('solo-a')
    expect(soloPc?.percorso).toContain('solo-b')
    // B porta la sua sul Drive, e lascia quella di A dov'e' (non la vuole qui).
    const r = await syncB.eseguiFusione({
      voci: { [soloPc!.percorso]: 'carica', [soloDrive!.percorso]: 'salta' },
      workspace: { modo: 'unione', escludi: [] }
    })
    expect(r.ok).toBe(true)
    expect(existsSync(join(b.claude, 'projects', 'progetto', 'solo-a.jsonl'))).toBe(false)
    // Il salvataggio dopo (l'automatico) non deve buttare via la chat di A.
    chat(b, 'solo-b', 4)
    expect((await syncB.salva()).ok).toBe(true)
    expect(await sulDrive(syncB)).toEqual([soloDrive!.percorso, soloPc!.percorso].sort())
  })

  it('«Annulla» ferma fra una voce e l altra; il manifesto e coerente e la ripresa trova le scelte', async () => {
    const drive = driveCondiviso()
    const a = pc('A'); const b = pc('B')
    for (let i = 0; i < 6; i += 1) chat(a, `a${i}`, 2)
    const syncA = apri(a, drive)
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    expect((await syncA.salva()).ok).toBe(true)

    const lavoro = creaLavoro()
    const syncB = apri(b, drive, lavoro)
    expect((await syncB.sblocca('passphrase-robusta-1')).ok).toBe(true)
    const piano = await syncB.anteprimaFusione()
    if (!piano.ok) throw new Error(piano.messaggio)
    const voci: Record<string, 'scarica'> = {}
    for (const v of piano.piano.chat) voci[v.percorso] = 'scarica'
    // Si annulla mentre la terza voce e' in lavorazione (due fatte): quella in
    // corso si finisce, poi ci si ferma. Quello che si vede (fase, conteggio,
    // dettaglio) e' quello che arriva alla striscia.
    const visti: string[] = []
    let giaAnnullato = false
    lavoro.onCambio((s) => {
      if (s.inCorso === undefined) return
      visti.push(`${s.inCorso.fase}:${s.inCorso.fatto ?? '-'}/${s.inCorso.totale ?? '-'}:${s.inCorso.dettaglio ?? ''}`)
      if (s.inCorso.fatto === 2 && !giaAnnullato) { giaAnnullato = true; lavoro.annulla() }
    })
    const r = await syncB.eseguiFusione({ voci, workspace: { modo: 'unione', escludi: [] } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.esito.annullato).toBe(true)
    // Le voci si lavorano a piu' alla volta: quelle gia' partite finiscono,
    // quelle non partite no. Quante, dipende dal momento: conta che sia meno
    // del totale e che il conto torni.
    expect(r.esito.fatti).toBeLessThan(r.esito.totale)
    // Sei chat piu' i due file dell'assetto (workspace e registro) che salgono sempre.
    expect(r.esito.totale).toBe(8)
    expect(visti.some((v) => v.startsWith('carico:1/8:'))).toBe(true)
    expect(lavoro.stato().inCorso).toBeUndefined()
    expect(lavoro.stato().ultimo?.esito).toBe('annullato')
    // Lo stato ricorda l'interruzione e le scelte, per la ripresa.
    const st = await syncB.stato()
    expect(st.ultimaFusione?.esito).toBe('interrotta')
    expect(st.ultimaFusione?.scelte?.voci).toEqual(voci)
    // Ripresa: le chat scaricate risultano uguali, le altre sono ancora solo sul Drive.
    const dopo = await syncB.anteprimaFusione()
    if (!dopo.ok) throw new Error(dopo.messaggio)
    expect(dopo.piano.chat.filter((v) => v.dove === 'drive')).toHaveLength(6 - r.esito.scaricati)
    expect(dopo.piano.chat.filter((v) => v.dove === 'entrambi' && !v.diverse)).toHaveLength(r.esito.scaricati)
    const fine = await syncB.eseguiFusione({ voci, workspace: { modo: 'unione', escludi: [] } })
    expect(fine.ok && fine.esito.annullato !== true).toBe(true)
    expect((await syncB.stato()).ultimaFusione?.esito).toBe('ok')
  })

  it('un secondo lavoro non parte mentre il primo e in corso', async () => {
    const drive = driveCondiviso()
    const a = pc('A')
    chat(a, 'a', 2)
    const lavoro = creaLavoro()
    const syncA = apri(a, drive, lavoro)
    expect((await syncA.creaPassphrase('passphrase-robusta-1')).ok).toBe(true)
    const presa = lavoro.avvia('ripristino')
    const r = await syncA.salva()
    expect(r.ok).toBe(false)
    expect(r.messaggio).toMatch(/LAVORO_IN_CORSO/)
    presa.fine('ok', '')
    expect((await syncA.salva()).ok).toBe(true)
  })
})
