import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sorgenteUpdater, VERSIONE_UPDATER } from '../../src/main/updater/sorgente'
import { trovaCompilatore } from '../../src/main/updater/compila'

const sorgente = sorgenteUpdater()

describe('il sorgente dell updater', () => {
  /**
   * Si compila davvero.
   *
   * Il C# vive dentro un template JavaScript, e da lì un errore non si vede in
   * nessun modo: il programma parte, l'aggiornamento non compila, e l'unica
   * traccia è una finestra che non compare mai. È già successo due volte — una
   * virgoletta scappata male, e un backtick dentro un commento che chiudeva la
   * stringa — ed è la ragione per cui questo test esiste.
   *
   * Senza compilatore il test si salta invece di fallire: su una macchina che
   * non è Windows non c'è niente da provare.
   */
  it('e C# valido, non solo testo che gli somiglia', () => {
    const compilatore = trovaCompilatore()
    if (compilatore === undefined) {
      expect(process.platform).not.toBe('win32')
      return
    }
    const cartella = mkdtempSync(join(tmpdir(), 'sd-updater-'))
    const cs = join(cartella, 'Aggiornamento.cs')
    writeFileSync(cs, sorgente, 'utf8')
    const eseguibile = join(cartella, 'prova.exe')
    execFileSync(compilatore, [
      '/target:winexe',
      '/nologo',
      '/reference:System.dll',
      '/reference:System.Drawing.dll',
      '/reference:System.Windows.Forms.dll',
      `/out:${eseguibile}`,
      cs
    ], { stdio: 'pipe' })
    expect(existsSync(eseguibile)).toBe(true)
  }, 120_000)

  it('legge tutti i parametri che gli vengono scritti', () => {
    // Il file dei parametri e il codice che li legge stanno in due posti
    // diversi: aggiungerne uno da una parte sola lo farebbe arrivare e non
    // servire a niente, in silenzio.
    for (const indice of ['args[0]', 'args[1]', 'args[2]', 'args[3]', 'args[4]', 'args[5]']) {
      expect(sorgente).toContain(indice)
    }
  })

  it('guarda Claude Code prima di riaprire il programma (nel percorso riuscito)', () => {
    // L'ordine conta: aggiornarlo dopo la riapertura vorrebbe dire farlo
    // mentre le chat lo tengono aperto, cioè non farlo. Quindi dopo
    // `AggiornaClaude()` ci dev'essere la riapertura della nuova versione.
    // Un `Avvia()` *prima* è lecito ed è un percorso diverso: la riapertura
    // della versione VECCHIA quando l'installazione fallisce (Fix #2), dove
    // Claude non si tocca perché l'aggiornamento non c'è stato.
    const claude = sorgente.indexOf('AggiornaClaude();')
    expect(claude).toBeGreaterThan(-1)
    expect(sorgente.indexOf('Avvia();', claude)).toBeGreaterThan(claude)
  })

  it('non scambia un installer fallito per riuscito: guarda il codice d uscita', () => {
    // Il difetto «si è riavviato ancora con la versione vecchia»: prima si
    // considerava l'installazione finita con `installazione == null ||
    // installazione.HasExited`, senza mai guardare `ExitCode`. Un installer
    // fallito usciva comunque, e il programma riapriva il binario vecchio dicendo
    // «Pronto». Ora solo `ExitCode == 0` è un successo; null o codice ≠ 0 è un
    // fallimento dichiarato.
    expect(sorgente).toContain('installazione.ExitCode')
    // La vecchia condizione che trattava «uscito comunque» come successo non c'è più.
    expect(sorgente).not.toContain('installazione == null || installazione.HasExited')
    // Il fallimento riapre la versione attuale (meglio del nulla) ma NON dice «Pronto».
    expect(sorgente).toContain('ExitCode != 0')
  })

  it('misura il tempo di ogni fase, non quello totale', () => {
    // È il cuore della barra: senza, la fase più lunga si mangiava il tempo di
    // tutte le altre, che comparivano già finite — e la barra restava ferma al
    // 65 per mezzo minuto prima di saltare al 100.
    expect(sorgente).toContain('giriPasso = 0')
    expect(sorgente).toContain('giriPasso++')
  })

  it('non mostra piu i secondi: un numero che sale non dice a che punto sei', () => {
    expect(sorgente).not.toContain('(giri / 5)')
  })

  it('ogni fase comincia dove finisce la precedente', () => {
    // Estrae i tratti dal sorgente e controlla che si tocchino: due numeri
    // scelti a mano che non combaciano sono un salto della barra, e un salto
    // è esattamente quello che si sta togliendo.
    const numeri = (metodo: string): number[] => {
      const da = sorgente.indexOf(`int ${metodo}() {`)
      const fine = sorgente.indexOf('}', da)
      return [...sorgente.slice(da, fine).matchAll(/return (\d+);/g)].map((m) => Number(m[1]))
    }
    const da = numeri('Da')
    const a = numeri('A')
    expect(da.length).toBe(a.length)
    // Ogni «da» è l'«a» della fase precedente: la prima parte da zero,
    // l'ultima arriva a cento.
    expect(da[0]).toBe(0)
    expect(a[a.length - 1]).toBe(100)
    for (let i = 1; i < da.length; i += 1) expect(da[i]).toBe(a[i - 1])
  })

  it('ha una versione, che e il segno per ricompilarlo', () => {
    expect(VERSIONE_UPDATER).toBeGreaterThan(0)
  })
})
