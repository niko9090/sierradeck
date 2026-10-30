import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { storiaRemotaSicura } from '@shared/pc-remoto'
import { azioneTastoDomande, decidiColonnaDomande, eDomandaDelProgramma, haLinguetta, type Conversazione } from '@shared/domande-conversazioni'
import {
  eFinitaDiAutopilota, leggiChiusaSenzaCartella, messaggioChiusaSenzaCartella, motivoChiusaSenzaCartella, PREFISSO_CHIUSA_SENZA_CARTELLA
} from '@shared/chiusa-senza-cartella'
import { creaAggancio } from '../../src/renderer/aggancio'

/**
 * I tre errori dell'interfaccia del 21/10 (0.84.1), dal registro degli errori
 * del PC: «Cannot read properties of undefined (reading 'join')» in
 * RiquadroRemoto (2 volte), «id di autopilota deve essere alfanumerico
 * (ricevuto "sierradeck:al-telefono")» (12 volte), e la chat c-34 finita che
 * ripartiva nella sua copia di lavoro cancellata a ogni cambio di workspace
 * (18 + 14 + 4 volte).
 */

const radice = join(__dirname, '..', '..')

describe('RiquadroRemoto senza «grezze»', () => {
  it('una risposta senza grezze usa le righe pulite, e non si rompe', () => {
    const s = storiaRemotaSicura({ chat: 'c1', totale: 3, da: 1, righe: ['a', 'b'] }, 'c1')
    expect(s.grezze).toEqual(['a', 'b'])
    expect(s.grezze.join('\n')).toBe('a\nb')
    expect(s).toMatchObject({ chat: 'c1', totale: 3, da: 1, righe: ['a', 'b'] })
  })

  it('una risposta vuota o strana dà uno schermo vuoto, non un errore', () => {
    for (const x of [undefined, null, 'testo', 42, {}, { grezze: 'non una lista' }, { righe: [1, null, 'x'] }]) {
      const s = storiaRemotaSicura(x, 'c9')
      expect(Array.isArray(s.grezze)).toBe(true)
      expect(Array.isArray(s.righe)).toBe(true)
      expect(s.chat).toBe('c9')
      expect(() => s.grezze.join('\n')).not.toThrow()
    }
    expect(storiaRemotaSicura({ righe: [1, null, 'x'] }, 'c9').grezze).toEqual(['x'])
  })

  it('una risposta buona resta com\'è, con le scelte e l\'ora', () => {
    const buona = {
      chat: 'c1', totale: 10, da: 8, righe: ['p'], grezze: ['\x1b[1mp\x1b[0m'], scritto: '2026-10-21T22:24:42.580Z',
      scelte: { opzioni: [{ numero: 1, testo: 'Sì', scelta: true }], corrente: 0 }
    }
    expect(storiaRemotaSicura(buona, 'c1')).toEqual(buona)
  })

  it('il riquadro e il PC passano dalla messa in forma', () => {
    const riquadro = readFileSync(join(radice, 'src/renderer/components/RiquadroRemoto.tsx'), 'utf8')
    expect(riquadro).toContain('setStoria(storiaRemotaSicura(r.dati, f.chat.id))')
    const main = readFileSync(join(radice, 'src/main/index.ts'), 'utf8')
    expect(main).toMatch(/storiaRemotaSicura\(await remoto\.chiama\(testo\(pc\), '\/api\/storia'/)
  })
})

describe('Domande del programma («sierradeck:al-telefono»)', () => {
  // La domanda vera del 21/10: un file da mandare al telefono, fuori dalla cartella della chat.
  const alTelefono: Conversazione = {
    chiave: 'ap:sierradeck:al-telefono', tipo: 'autopilota', autopilota: 'sierradeck:al-telefono',
    titolo: 'Manda al telefono · App Android', sotto: 'foto-0-83-0.png → Telefono', chiede: true, messaggi: [],
    risposta: { via: 'rispondi', domanda: 'al-telefono:x1' }, segnaposto: '', quante: 1
  }
  const autopilotaVero: Conversazione = { ...alTelefono, chiave: 'ap:ap-f1e631f5', autopilota: 'ap-f1e631f5', titolo: 'App Android' }

  it('non sono linguette di un autopilota: stanno nella colonna', () => {
    expect(eDomandaDelProgramma('sierradeck:al-telefono')).toBe(true)
    expect(eDomandaDelProgramma('sierradeck:rimozione')).toBe(true)
    expect(eDomandaDelProgramma('ap-f1e631f5')).toBe(false)
    expect(haLinguetta(alTelefono)).toBe(false)
    expect(haLinguetta(autopilotaVero)).toBe(true)
  })

  it('una domanda del programma apre la colonna e non chiede al PC di mostrare una linguetta', () => {
    const d = decidiColonnaDomande({ conversazioni: [alTelefono], viste: new Set(), aperta: false, avvio: true })
    expect(d.linguette).toEqual([])
    expect(d.apri).toBe(true)
    expect(d.evidenzia).toBe('ap:sierradeck:al-telefono')
    expect(azioneTastoDomande([alTelefono], false)).toEqual({ tipo: 'colonna' })
  })

  it('le domande di un autopilota vero vanno ancora alla sua linguetta', () => {
    const d = decidiColonnaDomande({ conversazioni: [alTelefono, autopilotaVero], viste: new Set(), aperta: false, avvio: true })
    expect(d.linguette).toEqual(['ap-f1e631f5'])
    expect(azioneTastoDomande([autopilotaVero], false)).toEqual({ tipo: 'linguetta', autopilota: 'ap-f1e631f5' })
  })
})

describe('Chat chiusa con la cartella cancellata', () => {
  const no = { cartellaEsiste: false, chiusa: false, nelRecupero: false, finitaDiAutopilota: false }

  it('il caso vero: c-34 finita, copia di lavoro tolta → non riparte', () => {
    expect(motivoChiusaSenzaCartella({ ...no, finitaDiAutopilota: true })).toContain('finito il suo compito')
    expect(motivoChiusaSenzaCartella({ ...no, chiusa: true })).toContain('era chiusa')
    expect(motivoChiusaSenzaCartella({ ...no, nelRecupero: true })).toContain('recupero')
  })

  it('con la cartella al suo posto, o una chat non chiusa, tutto come prima', () => {
    expect(motivoChiusaSenzaCartella({ cartellaEsiste: true, chiusa: true, nelRecupero: true, finitaDiAutopilota: true })).toBeUndefined()
    // Non chiusa con la cartella sparita: la diagnosi di sempre, con «Scegli la cartella».
    expect(motivoChiusaSenzaCartella(no)).toBeUndefined()
  })

  it('riconosce la chat finita dall\'elenco degli autopiloti', () => {
    const autopiloti = [{ chats: [{ sessionId: 'd653be68', stato: 'finita' }, { sessionId: 'aaaa', stato: 'lavoro' }] }, {}]
    expect(eFinitaDiAutopilota(autopiloti, 'd653be68')).toBe(true)
    expect(eFinitaDiAutopilota(autopiloti, 'aaaa')).toBe(false)
    expect(eFinitaDiAutopilota(autopiloti, 'zzzz')).toBe(false)
  })

  it('il messaggio attraversa l\'invoke di Electron', () => {
    const c = { sessionUuid: 'd653be68', cwd: 'E:\\p\\x.sierradeck-wt\\ap-1-c-34', perche: 'aveva finito' }
    const m = messaggioChiusaSenzaCartella(c)
    expect(m.startsWith(PREFISSO_CHIUSA_SENZA_CARTELLA)).toBe(true)
    expect(leggiChiusaSenzaCartella(new Error(`Error invoking remote method 'pty:spawn': Error: ${m}`))).toEqual(c)
    expect(leggiChiusaSenzaCartella(new Error('cwd non accessibile'))).toBeUndefined()
    expect(leggiChiusaSenzaCartella(PREFISSO_CHIUSA_SENZA_CARTELLA + 'non json')).toBeUndefined()
  })

  it('il riquadro si toglie invece di scrivere la riga rossa', async () => {
    const scritti: string[] = []
    const esiti: unknown[] = []
    const tolta = vi.fn()
    const c = { sessionUuid: 'd653be68', cwd: 'E:\\p\\x.sierradeck-wt\\ap-1-c-34', perche: 'aveva finito' }
    const a = creaAggancio({
      dimensioni: () => ({ cols: 80, rows: 24 }),
      spawn: () => Promise.reject(new Error(`Error invoking remote method 'pty:spawn': Error: ${messaggioChiusaSenzaCartella(c)}`)),
      attach: () => undefined, write: () => undefined, resize: () => undefined, kill: () => undefined,
      ascolta: () => () => undefined, scarta: () => undefined,
      scrivi: (t) => { scritti.push(t) },
      annunciaId: () => undefined,
      suChiusaSenzaCartella: tolta,
      suEsito: (e) => { esiti.push(e) }
    })
    a.avvia()
    await new Promise((r) => setTimeout(r, 0))
    expect(tolta).toHaveBeenCalledWith(c)
    expect(scritti).toEqual([])
    expect(esiti).toEqual([])
  })

  it('il PC chiede prima di convalidare, solo con la cartella sparita', () => {
    const ipc = readFileSync(join(radice, 'src/main/ipc.ts'), 'utf8')
    const i = ipc.indexOf("ipcMain.handle('pty:spawn'")
    const corpo = ipc.slice(i, i + 1200)
    expect(corpo).toContain('!existsSync(cwd)')
    expect(corpo.indexOf('chiusaSenzaCartella(sessionUuid, cwd)')).toBeLessThan(corpo.indexOf('spawnConvalidato(event, raw)'))
    const main = readFileSync(join(radice, 'src/main/index.ts'), 'utf8')
    expect(main).toContain('impostaChiusaSenzaCartella(async (sessione, cwd) => motivoChiusaSenzaCartella({')
    const term = readFileSync(join(radice, 'src/renderer/components/Terminal.tsx'), 'utf8')
    expect(term).toMatch(/suChiusaSenzaCartella: \(c\) => \{[\s\S]{0,400}closePane\(paneId\)/)
  })
})
