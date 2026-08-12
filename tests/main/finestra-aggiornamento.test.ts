import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  argomentiFinestra, avviaFinestraAggiornamento, percorsoDati, percorsoLancio,
  percorsoPowerShell, percorsoScript, scriptFinestraAggiornamento, scriptLancio,
  TIMEOUT_S, type Avvio, type DatiFinestra
} from '../../src/main/finestra-aggiornamento'

const DATI: DatiFinestra = {
  esePath: 'C:\\Users\\qualcuno\\Programs\\SierraDeck\\SierraDeck.exe',
  versione: '0.3.7',
  pidVecchio: 4242
}

function finto(): { avvia: Avvio; chiamate: Parameters<Avvio>[]; unref: () => void } {
  const chiamate: Parameters<Avvio>[] = []
  const unref = vi.fn()
  const avvia: Avvio = (comando, argomenti, opzioni) => {
    chiamate.push([comando, argomenti, opzioni])
    return { unref }
  }
  return { avvia, chiamate, unref }
}

describe('avviaFinestraAggiornamento', () => {
  it('non chiede `detached`, che su Windows impedisce a PowerShell di partire', async () => {
    // Misurato sul campo: con `detached` la finestra non nasce mai — il flag
    // crea il processo senza console e PowerShell muore in silenzio. Senza,
    // nasce in 750 ms. E' il difetto per cui la finestra non si vedeva.
    const { avvia, chiamate } = finto()
    const temp = mkdtempSync(join(tmpdir(), 'sd-agg-'))
    await avviaFinestraAggiornamento(DATI, avvia, temp, () => Promise.resolve())
    const [comando, , opzioni] = chiamate[0] ?? []
    expect(comando).toContain('powershell.exe')
    expect(opzioni).not.toHaveProperty('detached', true)
    expect(opzioni).toMatchObject({ stdio: 'ignore' })
  })

  it('se la prima strada non si fa viva, ne prova una seconda', async () => {
    // La finestra scrive di esserci: senza quel segno non si va avanti, perche'
    // «non si vede» e «non e' partita» sono la stessa frase per chi guarda.
    const { avvia, chiamate } = finto()
    const temp = mkdtempSync(join(tmpdir(), 'sd-agg-'))
    const viva = await avviaFinestraAggiornamento(DATI, avvia, temp, () => Promise.resolve())
    expect(viva).toBe(false)
    expect(chiamate).toHaveLength(2)
    expect(chiamate[1]?.[1].join(' ')).toContain('lancio')
  })

  it('scrive lo script prima di avviarlo', async () => {
    const { avvia } = finto()
    const temp = mkdtempSync(join(tmpdir(), 'sd-agg-'))
    await avviaFinestraAggiornamento(DATI, avvia, temp, () => Promise.resolve())
    expect(readFileSync(percorsoScript(temp), 'utf8')).toContain('System.Windows.Forms')
    expect(readFileSync(percorsoLancio(temp), 'utf8')).toContain('Win32_Process')
    // I dati vanno scritti prima dell'avvio: la finestra li legge appena nasce,
    // e trovarli a meta' sarebbe peggio che non trovarli.
    expect(JSON.parse(readFileSync(percorsoDati(temp), 'utf8'))).toEqual(DATI)
    expect(existsSync(percorsoScript(temp))).toBe(true)
  })

  it('un avvio fallito non impedisce l aggiornamento', async () => {
    // Restare senza finestra e' brutto; non aggiornarsi perche' la finestra non
    // si e' aperta sarebbe assurdo.
    const rotto: Avvio = () => { throw new Error('powershell non trovato') }
    const temp = mkdtempSync(join(tmpdir(), 'sd-agg-'))
    await expect(avviaFinestraAggiornamento(DATI, rotto, temp, () => Promise.resolve())).resolves.toBe(false)
  })
})

describe('argomentiFinestra', () => {
  it('avvia il lanciatore, non la finestra', () => {
    // La finestra la crea WMI: se la avviassimo noi tornerebbe a essere una
    // nostra figlia, ed e' proprio la parentela che la uccideva.
    const argomenti = argomentiFinestra('C:\\temp\\lancio.ps1')
    expect(argomenti[argomenti.indexOf('-File') + 1]).toBe('C:\\temp\\lancio.ps1')
  })

  it('parte anche dove la politica di esecuzione vieta gli script', () => {
    const argomenti = argomentiFinestra('C:\\temp\\lancio.ps1')
    expect(argomenti[argomenti.indexOf('-ExecutionPolicy') + 1]).toBe('Bypass')
    expect(argomenti).toContain('-NoProfile')
  })

  it('non mostra una console nera accanto alla finestra', () => {
    expect(argomentiFinestra('C:\\temp\\lancio.ps1')).toContain('Hidden')
  })

  it('i dati non entrano nel testo degli script', () => {
    // Un percorso di Windows contiene di tutto: se finisse dentro il codice per
    // interpolazione, potrebbe smettere di essere un percorso e diventare
    // istruzioni. Viaggia in un file di dati, e lo script lo legge.
    expect(scriptFinestraAggiornamento()).not.toContain(DATI.esePath)
    expect(scriptLancio()).not.toContain(DATI.esePath)
    expect(scriptFinestraAggiornamento()).toContain('ConvertFrom-Json')
  })
})

describe('scriptLancio', () => {
  it('fa creare la finestra al servizio di sistema', () => {
    // E' l'unico modo perche' non erediti il nostro job: creata da WMI, di noi
    // non le resta niente da ereditare, e sopravvive alla nostra chiusura.
    expect(scriptLancio()).toContain('Win32_Process')
    expect(scriptLancio()).toContain('Invoke-CimMethod')
  })

  it('se WMI non risponde ripiega su un avvio normale', () => {
    // Una finestra che forse sopravvive e' meglio di nessuna finestra.
    expect(scriptLancio()).toContain('Start-Process powershell.exe')
  })
})

describe('scriptFinestraAggiornamento', () => {
  const script = scriptFinestraAggiornamento()

  it('comincia con il BOM, o gli accenti arrivano storti', () => {
    expect(script.startsWith('\ufeff')).toBe(true)
  })

  it('aspetta le tre cose che succedono davvero', () => {
    // La percentuale non e' piu' una finta sul tempo: chiusura del vecchio,
    // sostituzione dell'eseguibile, avvio del nuovo.
    expect(script).toContain('Get-Process -Id $PidVecchio')
    expect(script).toContain('ProductVersion')
    expect(script).toContain('StartsWith($Versione)')
  })

  it('si chiude quando la nuova versione e partita, non prima', () => {
    expect(script).toContain('$s.fase = 4')
    expect(script).toContain('$form.Close()')
  })

  it('ha un tempo massimo, per non restare orfana per sempre', () => {
    expect(script).toContain(`$TimeoutS = ${TIMEOUT_S}`)
    expect(script).toContain('$TimeoutS * 5')
  })

  it('non tiene aperto l eseguibile che l installer deve sostituire', () => {
    // Un processo che lo tenesse aperto bloccherebbe proprio l'installazione
    // che sta guardando: lo si legge, non lo si esegue e non lo si apre.
    expect(script).not.toContain('Start-Process -FilePath $Exe')
    expect(script).not.toContain('& $Exe')
  })
})

describe('percorsoPowerShell', () => {
  it('usa il percorso intero, non il nome nudo', () => {
    // `powershell.exe` da solo si affida al PATH del processo, e il PATH di
    // un'applicazione impacchettata non e' quello del terminale di prova: un
    // avvio fallito cosi' non dice niente, la finestra semplicemente non c'e'.
    const p = percorsoPowerShell({ SystemRoot: 'C:\Windows' })
    expect(p).toContain('System32')
    expect(p).toContain('powershell.exe')
  })

  it('senza SystemRoot ripiega su una radice sensata', () => {
    expect(percorsoPowerShell({})).toContain('Windows')
  })
})

describe('avvio muto', () => {
  it('ascolta l errore di spawn, che arriva dopo e non solleva', async () => {
    // Senza questo ascolto il fallimento resta invisibile, e dal di fuori
    // sembra solo una finestra che non compare.
    let ascoltato = ''
    const avvia: Avvio = () => ({ unref: () => undefined, on: ((evento: string) => { ascoltato = evento; return undefined }) as never })
    const temp = mkdtempSync(join(tmpdir(), 'sd-agg-'))
    await avviaFinestraAggiornamento(DATI, avvia, temp, () => Promise.resolve())
    expect(ascoltato).toBe('error')
  })
})
