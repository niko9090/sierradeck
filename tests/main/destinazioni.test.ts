import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apriDestinazioni, type Cassetta } from '../../src/main/trasferimenti/destinazioni'

let cartella: string

/**
 * Un portachiavi finto che si vede: cifrare qui vuol dire mettere un prefisso.
 *
 * Serve a due cose. La prima è provare la logica senza il portachiavi di
 * sistema. La seconda, meno ovvia, è **poter guardare il file** e verificare che
 * la password non ci sia in chiaro: con una cifratura vera il test direbbe solo
 * «c'è qualcosa che non riconosco», che non è la stessa cosa.
 */
const cassetta: Cassetta = {
  disponibile: () => true,
  // Base64 e non un prefisso: il primo tentativo cifrava mettendo davanti
  // «cifrato:», e il test che controlla il file trovava la password in chiaro
  // dentro la finta cifratura. Una finta che non nasconde niente non puo'
  // provare che qualcosa e' nascosto.
  cifra: (c) => 'b64:' + Buffer.from(c, 'utf8').toString('base64'),
  decifra: (c) => {
    if (!c.startsWith('b64:')) throw new Error('non e roba mia')
    return Buffer.from(c.slice(4), 'base64').toString('utf8')
  }
}

beforeEach(() => {
  cartella = mkdtempSync(join(tmpdir(), 'dest-'))
})

const apri = (): ReturnType<typeof apriDestinazioni> => apriDestinazioni(cartella, cassetta)

const base = {
  nome: 'produzione',
  cwd: 'E:\\Progetti\\SitoX',
  host: 'esempio.it',
  porta: 22,
  utente: 'nikof',
  metodo: 'password' as const
}

describe('le destinazioni stanno per progetto', () => {
  it('un progetto vede le sue e non quelle degli altri', () => {
    const a = apri()
    a.salva(base)
    a.salva({ ...base, nome: 'nas', cwd: 'E:\\Progetti\\Altro', host: 'nas.casa' })
    expect(a.perProgetto('E:\\Progetti\\SitoX').map((d) => d.nome)).toEqual(['produzione'])
    expect(a.perProgetto('E:\\Progetti\\Altro').map((d) => d.nome)).toEqual(['nas'])
  })

  it('senza nome si usa l host: una riga senza etichetta non serve a niente', () => {
    const d = apri().salva({ ...base, nome: '   ' })
    expect(d.nome).toBe('esempio.it')
  })

  it('una porta assurda torna alla 22 invece di far fallire il collegamento dopo', () => {
    expect(apri().salva({ ...base, porta: 0 }).porta).toBe(22)
    expect(apri().salva({ ...base, porta: 99999 }).porta).toBe(22)
  })
})

describe('i segreti', () => {
  it('non finiscono in chiaro nel file', () => {
    const a = apri()
    a.salva(base, { password: 'unaPasswordVera' })
    const testo = readFileSync(join(cartella, 'destinazioni.json'), 'utf8')
    expect(testo).not.toContain('unaPasswordVera')
    expect(testo).toContain('b64:')
  })

  it('si rileggono in chiaro solo passando dal portachiavi', () => {
    const a = apri()
    const d = a.salva(base, { password: 'segreta', passphrase: 'della chiave' })
    expect(a.segretoDi(d.id)).toEqual({ password: 'segreta', passphrase: 'della chiave' })
  })

  it('non si vedono nell elenco', () => {
    // L'elenco va all'interfaccia e, un giorno, al telefono: una password che
    // viaggia insieme al nome del server e' una password regalata.
    const a = apri()
    const d = a.salva(base, { password: 'segreta' })
    const dalElenco = a.perProgetto(base.cwd)[0] as unknown as Record<string, unknown>
    expect(dalElenco.password).toBeUndefined()
    expect(a.trova(d.id)).toBeDefined()
    expect((a.trova(d.id) as unknown as Record<string, unknown>).password).toBeUndefined()
  })

  it('rinominare non fa perdere la password', () => {
    // Chiedere di ridigitarla a ogni modifica e' il modo piu' rapido di far
    // scrivere «password1» a tutti.
    const a = apri()
    const d = a.salva(base, { password: 'segreta' })
    a.salva({ ...base, id: d.id, nome: 'produzione (nuova)' })
    expect(a.segretoDi(d.id).password).toBe('segreta')
  })

  it('una password vuota la toglie davvero', () => {
    const a = apri()
    const d = a.salva(base, { password: 'segreta' })
    a.salva({ ...base, id: d.id }, { password: '' })
    expect(a.segretoDi(d.id).password).toBeUndefined()
  })

  it('un segreto che il portachiavi non sa aprire non fa cadere niente', () => {
    // Succede per davvero: profilo Windows diverso, o dati copiati da un altro
    // computer. E' una password da ridigitare, non un guasto.
    const a = apriDestinazioni(cartella, {
      disponibile: () => true,
      cifra: (c) => c,
      decifra: () => { throw new Error('non e tua') }
    })
    const d = a.salva(base, { password: 'segreta' })
    expect(() => a.segretoDi(d.id)).not.toThrow()
    expect(a.segretoDi(d.id).password).toBeUndefined()
  })

  it('eliminando una destinazione se ne va anche il segreto', () => {
    const a = apri()
    const d = a.salva(base, { password: 'segreta' })
    a.elimina(d.id)
    expect(readFileSync(join(cartella, 'destinazioni.json'), 'utf8')).not.toContain('b64:')
    expect(a.segretoDi(d.id)).toEqual({})
  })
})

describe('l impronta del server', () => {
  it('si ricorda dopo che l hai accettata', () => {
    // Senza, un collegamento cifrato resta comunque aperto a chi si mette in
    // mezzo: la cifratura da sola dice «nessuno legge», non «stai parlando con
    // chi credi».
    const a = apri()
    const d = a.salva(base)
    expect(a.trova(d.id)?.improntaServer).toBeUndefined()
    a.fidatiDi(d.id, 'SHA256:abcdef')
    expect(a.trova(d.id)?.improntaServer).toBe('SHA256:abcdef')
  })

  it('fidarsi di una che non esiste non crea niente', () => {
    const a = apri()
    a.fidatiDi('mai-vista', 'SHA256:x')
    expect(a.tutte()).toEqual([])
  })
})
