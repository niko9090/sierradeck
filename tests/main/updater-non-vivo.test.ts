import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  chiudiRimasti, diagnosiUpdater, diariUpdater, leggiProcessiUpdater, motivoCompilazione,
  provaUpdater, rimastiNostri, spiegaUscita, trovaCompilatore, updaterVivo
} from '../../src/main/updater/compila'
import { sorgenteUpdater, VERSIONE_UPDATER } from '../../src/main/updater/sorgente'

/**
 * 26/11: su un PC «Installa» scriveva «l updater non si e fatto vivo» e non
 * succedeva niente, senza un perché. Qui i pezzi che ora lo dicono e lo
 * riparano: i rimasti da prima si chiudono, i codici di Windows si spiegano,
 * la prova dice se l'eseguibile può partire.
 */
describe('updater che non si fa vivo: il perché', () => {
  it('legge i processi «pid|percorso» e ignora le righe vuote o storte', () => {
    expect(leggiProcessiUpdater('123|C:\\Dati\\updater\\SierraDeckUpdate.exe\r\n\r\nxx|y\n456|\n')).toEqual([
      { pid: 123, percorso: 'C:\\Dati\\updater\\SierraDeckUpdate.exe' },
      { pid: 456 }
    ])
  })

  it('chiude solo i rimasti con il nostro stesso eseguibile, non quelli dell Aiutante o senza percorso', () => {
    const nostro = 'C:\\Dati\\SierraDeck\\updater\\SierraDeckUpdate.exe'
    const processi = [
      { pid: 1, percorso: 'c:/dati/sierradeck/updater/sierradeckupdate.exe' },
      { pid: 2, percorso: 'C:\\Dati\\SierraDeck Aiutante\\updater\\SierraDeckUpdate.exe' },
      { pid: 3 }
    ]
    expect(rimastiNostri(processi, nostro).map((p) => p.pid)).toEqual([1])
    const uccisi: number[] = []
    const r = chiudiRimasti(nostro, () => processi, (pid) => { uccisi.push(pid) })
    expect(uccisi).toEqual([1])
    expect(r.chiusi).toEqual([1])
    expect(r.altri.map((p) => p.pid)).toEqual([2, 3])
    // Non riuscire a elencarli non ferma niente e non uccide niente.
    expect(chiudiRimasti(nostro, () => undefined, () => { throw new Error('mai') })).toEqual({ chiusi: [], altri: [] })
  })

  it('spiega i codici con cui Windows non lascia partire un eseguibile', () => {
    expect(spiegaUscita('UNKNOWN')).toContain('Smart App Control')
    expect(spiegaUscita('EACCES')).toContain('antivirus')
    expect(spiegaUscita(4551)).toContain('criterio di Windows')
    expect(spiegaUscita(-2147020345)).toContain('0x800711C7')
    expect(spiegaUscita(0xC0000135)).toContain('.NET Framework')
    expect(spiegaUscita(3)).toContain('cartella temporanea')
    expect(spiegaUscita(42)).toBe('codice 42 (0x0000002A)')
    expect(spiegaUscita(undefined)).toBe('nessun codice')
  })

  it('il motivo di una compilazione fallita porta il testo del compilatore, non solo «Command failed»', () => {
    const err = Object.assign(new Error('Command failed: csc.exe'), { status: 1, stdout: Buffer.from('x.cs(3,1): error CS1002: ; expected\r\n'), stderr: Buffer.from('') })
    expect(motivoCompilazione(err)).toBe('codice 1: x.cs(3,1): error CS1002: ; expected')
    expect(motivoCompilazione(Object.assign(new Error('spawn csc.exe EPERM'), { code: 'EPERM' }))).toBe('EPERM: spawn csc.exe EPERM')
  })

  it('cerca il diario anche nella cartella temporanea dell utente scritta per esteso', () => {
    const diari = diariUpdater({ TEMP: 'C:\\Altro', TMP: 'C:\\Altro', LOCALAPPDATA: 'C:\\Utente\\AppData\\Local' })
    expect(diari).toContain(join('C:\\Utente\\AppData\\Local', 'Temp', 'sierradeck-update.log'))
  })

  it('l attesa del segno di vita si può allungare', async () => {
    let giri = 0
    expect(await updaterVivo(async () => { giri += 1 }, () => false, 60)).toBe(false)
    expect(giri).toBe(60)
  })

  it('la diagnosi mette insieme eseguibile, processi, diario e prova', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'sd-diagnosi-'))
    const exe = join(cartella, 'SierraDeckUpdate.exe')
    writeFileSync(exe, 'MZ')
    writeFileSync(join(cartella, 'versione.txt'), String(VERSIONE_UPDATER))
    const testo = await diagnosiUpdater(exe, {
      processi: () => [{ pid: 7, percorso: exe }, { pid: 8, percorso: 'C:\\altro.exe' }],
      prova: async () => ({ ok: false, perche: 'UNKNOWN: Windows rifiuta di avviarlo' })
    })
    expect(testo).toContain('eseguibile di 2 byte')
    expect(testo).toContain(`versione ${VERSIONE_UPDATER}`)
    expect(testo).toContain('7 (nostro), 8 (un altro)')
    expect(testo).toContain('la prova non parte: UNKNOWN')
    const senza = await diagnosiUpdater(join(cartella, 'manca.exe'), { processi: () => undefined, prova: async () => ({ ok: true }) })
    expect(senza).toContain('eseguibile assente')
    expect(senza).toContain('processi non elencati')
    expect(senza).not.toContain('la prova')
  })

  it('un eseguibile più vecchio della 15 non si prova: partirebbe l installazione vera', async () => {
    const cartella = mkdtempSync(join(tmpdir(), 'sd-vecchio-'))
    const exe = join(cartella, 'SierraDeckUpdate.exe')
    writeFileSync(exe, 'MZ')
    writeFileSync(join(cartella, 'versione.txt'), '14')
    expect(await provaUpdater(exe)).toEqual({ ok: false, perche: 'eseguibile della versione 14, senza prova' })
  })

  it('l updater compilato davvero risponde alla prova ed esce con zero, senza diario', async () => {
    const compilatore = trovaCompilatore()
    if (compilatore === undefined) {
      expect(process.platform).not.toBe('win32')
      return
    }
    const cartella = mkdtempSync(join(tmpdir(), 'sd-prova-'))
    const cs = join(cartella, 'SierraDeckUpdate.cs')
    writeFileSync(cs, sorgenteUpdater(), 'utf8')
    const exe = join(cartella, 'SierraDeckUpdate.exe')
    execFileSync(compilatore, ['/nologo', '/target:winexe', '/reference:System.dll', '/reference:System.Drawing.dll', '/reference:System.Windows.Forms.dll', `/out:${exe}`, cs], { windowsHide: true, timeout: 60_000 })
    writeFileSync(join(cartella, 'versione.txt'), String(VERSIONE_UPDATER))
    // Senza aggiornamento.txt: se la prova non fosse riconosciuta, l'updater
    // scriverebbe «parametri mancanti» nel diario e uscirebbe lo stesso con zero.
    const esito = await provaUpdater(exe)
    expect(esito.ok).toBe(true)
    if (esito.ok) expect(esito.temporanea ?? '').not.toBe('')
  }, 90_000)
})
