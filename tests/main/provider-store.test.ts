import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { apriProviderStore, ambienteDelProvider } from '../../src/main/provider-store'

function dir(): string {
  return mkdtempSync(join(tmpdir(), 'provider-'))
}

describe('apriProviderStore', () => {
  it('parte da Claude, senza niente di configurato', () => {
    const p = apriProviderStore(dir()).leggi()
    expect(p.attivo).toBe(false)
    expect(p.baseUrl).toBe('')
  })

  it('rilegge cio che ha scritto', () => {
    const d = dir()
    apriProviderStore(d).imposta({ attivo: true, baseUrl: 'https://api.esempio.it', token: 'segreto', modello: 'x-1' })
    const letto = apriProviderStore(d).leggi()
    expect(letto.attivo).toBe(true)
    expect(letto.baseUrl).toBe('https://api.esempio.it')
    expect(letto.modello).toBe('x-1')
  })

  it('non restituisce il token a chi legge', () => {
    // L'interfaccia non ha bisogno di rileggerlo per mostrarlo: mandarlo al
    // renderer significherebbe farlo passare per un processo in piu' e
    // ritrovarselo in memoria di una pagina web, senza guadagnarci niente.
    const d = dir()
    apriProviderStore(d).imposta({ attivo: true, baseUrl: 'https://x.it', token: 'segreto', modello: '' })
    const letto = apriProviderStore(d).leggi()
    expect(JSON.stringify(letto)).not.toContain('segreto')
    expect(letto.haToken).toBe(true)
  })

  it('un token vuoto non cancella quello gia salvato', () => {
    // Il campo nell'interfaccia parte vuoto perche' il token non si rilegge:
    // se il vuoto cancellasse, salvare il solo indirizzo perderebbe la chiave.
    const d = dir()
    const s = apriProviderStore(d)
    s.imposta({ attivo: true, baseUrl: 'https://x.it', token: 'segreto', modello: '' })
    s.imposta({ attivo: true, baseUrl: 'https://y.it', token: '', modello: '' })
    expect(s.leggi().haToken).toBe(true)
    expect(s.env().ANTHROPIC_AUTH_TOKEN).toBe('segreto')
  })

  it('si puo togliere il token di proposito', () => {
    const d = dir()
    const s = apriProviderStore(d)
    s.imposta({ attivo: true, baseUrl: 'https://x.it', token: 'segreto', modello: '' })
    s.imposta({ attivo: true, baseUrl: 'https://x.it', token: '', modello: '', togliToken: true })
    expect(s.leggi().haToken).toBe(false)
  })

  it('regge un file illeggibile tornando a Claude', () => {
    const d = dir()
    writeFileSync(join(d, 'provider.json'), 'non sono JSON', 'utf8')
    expect(apriProviderStore(d).leggi().attivo).toBe(false)
  })

  it('scrive il file in modo che lo legga solo l utente', () => {
    // Contiene una chiave: sta sul disco locale come ci stanno le credenziali
    // di Claude Code, ma senza lasciarlo leggibile a chiunque sul sistema.
    const d = dir()
    apriProviderStore(d).imposta({ attivo: true, baseUrl: 'https://x.it', token: 'segreto', modello: '' })
    const contenuto = readFileSync(join(d, 'provider.json'), 'utf8')
    expect(contenuto).toContain('segreto')
  })
})

describe('ambienteDelProvider', () => {
  it('spento non tocca niente', () => {
    // Senza questa regola, un provider configurato e poi disattivato
    // continuerebbe a dirottare tutte le chat.
    expect(ambienteDelProvider({ attivo: false, baseUrl: 'https://x.it', token: 't', modello: 'm' })).toEqual({})
  })

  it('acceso passa indirizzo, chiave e modello come li vuole Claude Code', () => {
    const env = ambienteDelProvider({ attivo: true, baseUrl: 'https://x.it', token: 't', modello: 'm' })
    expect(env).toEqual({
      ANTHROPIC_BASE_URL: 'https://x.it',
      ANTHROPIC_AUTH_TOKEN: 't',
      ANTHROPIC_MODEL: 'm'
    })
  })

  it('senza indirizzo non e configurato, e non si applica', () => {
    expect(ambienteDelProvider({ attivo: true, baseUrl: '', token: 't', modello: '' })).toEqual({})
  })

  it('il modello resta facoltativo', () => {
    const env = ambienteDelProvider({ attivo: true, baseUrl: 'https://x.it', token: 't', modello: '' })
    expect(env.ANTHROPIC_MODEL).toBeUndefined()
  })
})
