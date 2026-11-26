import { describe, it, expect } from 'vitest'
import { eseguiAsincrono } from '../../src/main/esegui-asincrono'
import {
  claudeDaAggiornare, notaClaude, piuVecchia, versioneInstallata, versioneUltima
} from '../../src/main/claude-versione'

describe('piuVecchia', () => {
  it('confronta numero per numero, non alfabeticamente', () => {
    // «2.9.0» viene dopo «2.10.0» in ordine alfabetico: e' la trappola che fa
    // proporre aggiornamenti all'indietro.
    expect(piuVecchia('2.9.0', '2.10.0')).toBe(true)
    expect(piuVecchia('2.10.0', '2.9.0')).toBe(false)
  })

  it('due versioni uguali non sono una piu vecchia dell altra', () => {
    expect(piuVecchia('2.1.228', '2.1.228')).toBe(false)
  })

  it('una versione con meno pezzi non fa esplodere il confronto', () => {
    expect(piuVecchia('2.1', '2.1.1')).toBe(true)
  })
})

describe('versioneInstallata', () => {
  it('prende il numero e lascia stare il resto', async () => {
    // L'uscita cambia forma nel tempo: il numero e' l'unica cosa che serve.
    expect(await versioneInstallata('claude', () => '2.1.228 (Claude Code)')).toBe('2.1.228')
  })

  it('un comando che non risponde non inventa una versione', async () => {
    expect(await versioneInstallata('claude', () => { throw new Error('non trovato') })).toBeUndefined()
  })
})

describe('versioneUltima', () => {
  it('legge la versione dal registro', async () => {
    expect(await versioneUltima(() => '2.2.0\n')).toBe('2.2.0')
  })

  it('senza rete non inventa niente', async () => {
    expect(await versioneUltima(() => { throw new Error('offline') })).toBeUndefined()
  })
})

describe('claudeDaAggiornare', () => {
  it('propone solo quando c e davvero qualcosa di piu nuovo', async () => {
    expect(await claudeDaAggiornare('claude', { installata: '2.1.228', ultima: '2.2.0' })).toBe('claude')
    expect(await claudeDaAggiornare('claude', { installata: '2.2.0', ultima: '2.2.0' })).toBeUndefined()
    expect(await claudeDaAggiornare('claude', { installata: '2.3.0', ultima: '2.2.0' })).toBeUndefined()
  })

  it('nel dubbio non tocca niente', async () => {
    // Se una delle due versioni non si e' potuta stabilire, proporre di
    // sostituire qualcosa sarebbe farlo senza sapere se serve.
    expect(await claudeDaAggiornare('claude', { ultima: '2.2.0' })).toBeUndefined()
    expect(await claudeDaAggiornare('claude', { installata: '2.1.0' })).toBeUndefined()
  })
})

describe('notaClaude', () => {
  it('dice che e gia aggiornato, con la versione', async () => {
    // Un controllo che non si vede, per chi guarda non e' avvenuto: la
    // finestra passava dall'installazione all'avvio come se Claude Code non
    // fosse mai stato guardato.
    expect(await notaClaude('claude', { installata: '2.2.0', ultima: '2.2.0' })).toContain('2.2.0')
  })

  it('tace quando c e da aggiornarlo: lo dira l updater mentre lo fa', async () => {
    expect(await notaClaude('claude', { installata: '2.1.0', ultima: '2.2.0' })).toBe('')
  })

  it('tace quando la verifica non e riuscita', async () => {
    // Raccontare una verifica non riuscita come riuscita e' peggio che tacere.
    expect(await notaClaude('claude', { ultima: '2.2.0' })).toBe('')
    expect(await notaClaude('claude', { installata: '2.2.0' })).toBe('')
  })
})

describe('versioni asincrone', () => {
  it('accettano un esecutore asincrono, e un rifiuto vale «non lo so»', async () => {
    expect(await versioneInstallata('claude', async () => '2.1.228 (Claude Code)')).toBe('2.1.228')
    expect(await versioneUltima(async () => '2.2.0')).toBe('2.2.0')
    expect(await versioneInstallata('claude', () => Promise.reject(new Error('non trovato')))).toBeUndefined()
    expect(await versioneUltima(() => Promise.reject(new Error('offline')))).toBeUndefined()
  })

  it('mentre una chiamata lunga e in corso un timer scatta (l event loop e libero)', async () => {
    let scattato = false
    setTimeout(() => { scattato = true }, 10)
    const esito = await versioneInstallata('claude', () => new Promise<string>((r) => setTimeout(() => r('2.0.1'), 80)))
    expect(scattato).toBe(true)
    expect(esito).toBe('2.0.1')
  })
})

describe('eseguiAsincrono', () => {
  it('restituisce l uscita di un comando vero', async () => {
    expect((await eseguiAsincrono(process.execPath, ['-e', 'process.stdout.write("2.3.4")'], { timeout: 20_000 })).trim()).toBe('2.3.4')
  })

  it('un codice d uscita diverso da zero solleva, con l uscita attaccata', async () => {
    await expect(eseguiAsincrono(process.execPath, ['-e', 'console.log("perche"); process.exit(3)'], { timeout: 20_000 }))
      .rejects.toMatchObject({ code: 3, stdout: expect.stringContaining('perche') })
  })

  it('un comando che non esiste solleva', async () => {
    await expect(eseguiAsincrono('comando-che-non-esiste-sd', [], { timeout: 5_000 })).rejects.toBeDefined()
  })

  it('oltre il tetto di tempo il processo viene terminato e si solleva', async () => {
    await expect(eseguiAsincrono(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { timeout: 300 }))
      .rejects.toMatchObject({ killed: true })
  })

  it('mentre il comando gira, un timer scatta', async () => {
    let scatti = 0
    const t = setInterval(() => { scatti += 1 }, 20)
    await eseguiAsincrono(process.execPath, ['-e', 'setTimeout(() => {}, 400)'], { timeout: 20_000 })
    clearInterval(t)
    expect(scatti).toBeGreaterThan(3)
  })
})
