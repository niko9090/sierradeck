import { describe, it, expect } from 'vitest'
import {
  alberoChat, comeConsegnare, frenoDaiLimiti, pianoPubblicazione, quanteChat, regolaPubblicazione, rilevaCloud, SOGLIE_FRENO
} from '@shared/harness'
import { nuovoAutopilota, parseAutopilota, TETTO_CHAT_MAX } from '@shared/autopilota'

const ORA = Date.parse('2026-09-30T12:00:00Z')

describe('il freno sui limiti del piano (T2)', () => {
  it('le soglie sono quelle decise da Nicholas: 60, 80, 95', () => {
    expect(SOGLIE_FRENO).toEqual({ nienteNuove: 60, una: 80, fermo: 95 })
  })

  it('sotto il 60% tutte le chat utili, fino al tetto tecnico', () => {
    const f = frenoDaiLimiti({ cinqueOre: { percento: 40 }, settimana: { percento: 10 } }, ORA)
    expect(f.livello).toBe('pieno')
    expect(f.tetto).toBe(TETTO_CHAT_MAX)
    expect(f.apriNuove).toBe(true)
  })

  it('fra 60 e 80 niente chat nuove, fra 80 e 95 una sola, oltre ci si ferma e si sa quando ripartire', () => {
    expect(frenoDaiLimiti({ cinqueOre: { percento: 65 } }, ORA)).toMatchObject({ livello: 'niente-nuove', apriNuove: false })
    expect(frenoDaiLimiti({ cinqueOre: { percento: 85 } }, ORA)).toMatchObject({ livello: 'una', tetto: 1 })
    const fermo = frenoDaiLimiti({ cinqueOre: { percento: 97, resettaIl: ORA + 3600_000 } }, ORA)
    expect(fermo).toMatchObject({ livello: 'fermo', tetto: 0, riparteIl: ORA + 3600_000 })
    expect(fermo.motivo).toContain('riparto alle')
  })

  it('la settimana frena con le stesse soglie, e vince la finestra peggiore', () => {
    expect(frenoDaiLimiti({ cinqueOre: { percento: 10 }, settimana: { percento: 96 } }, ORA).livello).toBe('fermo')
    expect(frenoDaiLimiti({ cinqueOre: { percento: 10 }, settimana: { percento: 82 } }, ORA).livello).toBe('una')
  })

  it('una finestra gia azzerata non frena piu', () => {
    expect(frenoDaiLimiti({ cinqueOre: { percento: 99, resettaIl: ORA - 1000 } }, ORA).livello).toBe('pieno')
  })

  it('senza limiti letti si lavora con una chat sola', () => {
    expect(frenoDaiLimiti(undefined, ORA)).toMatchObject({ livello: 'ignoto', tetto: 1 })
    expect(frenoDaiLimiti({}, ORA).livello).toBe('ignoto')
  })

  it('il numero di chat lo decide l utilita, dentro il freno; senza git una sola', () => {
    const pieno = frenoDaiLimiti({ cinqueOre: { percento: 10 } }, ORA)
    expect(quanteChat({ utili: 3, freno: pieno, attive: 0, git: true })).toBe(3)
    expect(quanteChat({ utili: 30, freno: pieno, attive: 0, git: true })).toBe(TETTO_CHAT_MAX)
    expect(quanteChat({ utili: 3, freno: pieno, attive: 0, git: false })).toBe(1)
    const nienteNuove = frenoDaiLimiti({ cinqueOre: { percento: 70 } }, ORA)
    expect(quanteChat({ utili: 5, freno: nienteNuove, attive: 2, git: true })).toBe(2)
    const una = frenoDaiLimiti({ cinqueOre: { percento: 90 } }, ORA)
    expect(quanteChat({ utili: 5, freno: una, attive: 3, git: true })).toBe(1)
  })
})

describe('la pubblicazione per progetto e il cloud (= le chat sul Drive di SierraDeck)', () => {
  const DRIVE = rilevaCloud({ driveAttivo: true })
  const NIENTE = rilevaCloud({})

  it('il cloud e il Drive di SierraDeck o la spunta «va sul cloud», nient altro', () => {
    // Correzione di Nicholas (30/09): «cloud» e' il Drive dove si salvano le chat.
    expect(NIENTE).toEqual({ attivo: false, segni: [] })
    expect(DRIVE.attivo).toBe(true)
    expect(DRIVE.segni).toEqual(['sincronizzazione Drive del progetto accesa'])
    expect(rilevaCloud({ vaSulCloud: true }).segni).toEqual(['spuntato «va sul cloud» nella creazione'])
  })

  it('remoto git, script e deploy dicono solo come consegnare', () => {
    expect(comeConsegnare({ remoti: [], script: {}, file: ['README.md'] })).toEqual({ segni: [] })
    const c = comeConsegnare({
      remoti: ['backup https://x/b.git', 'origin https://github.com/x/y.git'],
      script: { build: 'tsc', pubblica: 'npm run build && electron-builder --publish always' },
      file: ['vercel.json', '.github/workflows/deploy.yml']
    })
    expect(c.remoto).toBe('origin')
    expect(c.comandoPubblica).toBe('npm run pubblica')
    expect(c.segni).toEqual(['remoto git origin', 'script «pubblica»', 'file vercel.json', 'workflow deploy.yml'])
    expect(comeConsegnare({ remoti: ['upstream https://x'], script: {}, file: [] }).remoto).toBe('upstream')
  })

  it('senza Drive niente autonomia, anche con un remoto e uno script di pubblicazione', () => {
    const consegna = comeConsegnare({ remoti: ['origin https://github.com/x/y.git'], script: { pubblica: 'x' }, file: [] })
    const p = pianoPubblicazione({ regola: 'beta', cloud: NIENTE, consegna })
    expect(p).toMatchObject({ autonomia: false, commit: true, unisci: true, push: false, pubblica: 'no' })
  })

  it('con le chat sul Drive: autonomia completa, push solo se c e un remoto, pubblicazione secondo la regola', () => {
    const conRemoto = comeConsegnare({ remoti: ['origin https://g/y.git'], script: { pubblica: 'x' }, file: [] })
    const beta = pianoPubblicazione({ regola: 'beta', cloud: DRIVE, consegna: conRemoto })
    expect(beta).toMatchObject({ autonomia: true, push: true, pubblica: 'sempre' })
    expect(beta.istruzioni).toContain('npm run pubblica')
    expect(pianoPubblicazione({ regola: 'beta', cloud: DRIVE }).push).toBe(false)
    expect(pianoPubblicazione({ regola: 'stabile', cloud: rilevaCloud({ vaSulCloud: true }) })).toMatchObject({ autonomia: true, pubblica: 'chiedi' })
    expect(pianoPubblicazione({ regola: 'unica', cloud: DRIVE }).pubblica).toBe('progetto')
    // Senza regola scelta: prudente, chiede prima di pubblicare.
    expect(pianoPubblicazione({ cloud: DRIVE }).pubblica).toBe('chiedi')
    expect(regolaPubblicazione('beta')).toBe('beta')
    expect(regolaPubblicazione('boh')).toBeUndefined()
  })

  it('le scelte arrivano nell archivio e sopravvivono a una rilettura', () => {
    const a = nuovoAutopilota({ id: 'a1', nome: 'x', obiettivo: 'o', cwd: 'C:/p', criteri: [], iniziatoIl: '2026-09-30T00:00:00Z', pubblicazione: 'beta', vaSulCloud: true })
    const letto = parseAutopilota(JSON.parse(JSON.stringify({ ...a, versione: 1, cloud: { attivo: true, segni: ['sincronizzazione Drive del progetto accesa'] }, consegna: { remoto: 'origin', segni: ['remoto git origin'] }, chats: [{ id: 'c-1', compito: 'x', stato: 'pausa', cicli: 1, cartella: 'C:/p.sierradeck-wt/a1-c-1', ramo: 'ap/a1/c-1' }] })))
    expect(letto.autopilota?.pubblicazione).toBe('beta')
    expect(letto.autopilota?.vaSulCloud).toBe(true)
    expect(letto.autopilota?.cloud?.segni).toEqual(['sincronizzazione Drive del progetto accesa'])
    expect(letto.autopilota?.consegna?.remoto).toBe('origin')
    expect(letto.autopilota?.chats[0]).toMatchObject({ stato: 'pausa', ramo: 'ap/a1/c-1' })
  })
})

describe('l albero delle chat (T7)', () => {
  it('il coordinatore con le sue sotto-chat, ramo e parola dello stato', () => {
    const a = { ...nuovoAutopilota({ id: 'a1', nome: 'Sito', obiettivo: 'o', cwd: 'C:/p', criteri: [], iniziatoIl: '' }), chats: [
      { id: 'c-1', compito: 'pagina', stato: 'lavoro' as const, cicli: 2, ramo: 'ap/a1/c-1' },
      { id: 'c-2', compito: 'api', stato: 'pausa' as const, cicli: 1 }
    ] }
    const t = alberoChat(a)
    expect(t).toMatchObject({ tipo: 'coordinatore', titolo: 'Sito', parola: 'coordina' })
    expect(t.figli.map((f) => f.parola)).toEqual(['al lavoro', 'in pausa per i limiti del piano'])
    expect(t.figli[0]?.ramo).toBe('ap/a1/c-1')
  })
})
