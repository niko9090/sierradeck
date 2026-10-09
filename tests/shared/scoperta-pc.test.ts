import { describe, it, expect } from 'vitest'
import {
  avvisoDriveScollegato, indirizziDaProvare, indirizziTailscaleDi, indirizzoUtile, leggiScollegamento,
  messaggioErroreRemoto, motivoDaStatoHttp, scollegamentoDalRegistro, statoPc
} from '@shared/scoperta-pc'
import { decidiApertura } from '@shared/apertura-chat'
import { descriviSilenzio } from '@shared/pc-remoto'
import type { BattitoPc } from '@shared/posta'

/**
 * I dati veri del 02/10. Il battito del LAPTOP in `pc-altrui.json` è fermo al
 * 23/09 03:34, con gli indirizzi di allora. Tailscale lo dà online a
 * 100.117.177.78, un indirizzo nuovo. Il portatile rispondeva sulla rete
 * locale (192.168.1.177) e su quel nuovo indirizzo.
 */
const ADESSO = Date.parse('2026-10-02T12:00:00Z')
const LAPTOP: BattitoPc = {
  pcId: '058be1ee679e', nome: 'LAPTOP-E60QM2D1', versione: '0.33.0', battito: '2026-09-23T03:34:56.764Z',
  cartelle: ['C:\\Users\\nikof\\Documents\\Trading\\Trading'],
  chat: [{ sessione: '2eedc5a4-7a19-4e2f-841e-d7f1527d9e5c', titolo: 'Spostamento progetto su PC fisso', cwd: 'C:\\Users\\nikof\\Documents\\Trading\\Trading', aspetta: true }],
  indirizzi: ['192.168.1.177', '100.72.165.79', '172.28.192.1', '169.254.206.169'],
  porta: 47640
}
const TAILSCALE = {
  Self: { HostName: 'PC-Fisso', TailscaleIPs: ['100.100.60.114'] },
  Peer: {
    a: { HostName: 'DESKTOP-G24D499', TailscaleIPs: ['100.113.83.97', 'fd7a:115c:a1e0::1333:5361'], Online: true },
    b: { HostName: 'LAPTOP-E60QM2D1', TailscaleIPs: ['100.117.177.78', 'fd7a:115c:a1e0::d201:b19a'], Online: true }
  }
}

describe('quali indirizzi provare', () => {
  it('Tailscale per nome, solo IPv4, maiuscole che non contano', () => {
    expect(indirizziTailscaleDi(TAILSCALE, 'laptop-e60qm2d1')).toEqual({ indirizzi: ['100.117.177.78'], online: true })
    expect(indirizziTailscaleDi(TAILSCALE, 'NESSUNO')).toEqual({ indirizzi: [] })
    expect(indirizziTailscaleDi(undefined, 'LAPTOP-E60QM2D1')).toEqual({ indirizzi: [] })
  })
  it('prima quello buono e i ricordati, poi Tailscale di adesso, poi il battito; senza doppioni e senza link-local', () => {
    const tutti = indirizziDaProvare({
      ricordati: ['192.168.1.177'],
      tailscale: indirizziTailscaleDi(TAILSCALE, LAPTOP.nome).indirizzi,
      battito: LAPTOP.indirizzi
    })
    expect(tutti).toEqual(['192.168.1.177', '100.117.177.78', '100.72.165.79', '172.28.192.1'])
    expect(tutti).not.toContain('169.254.206.169')
    expect(indirizziDaProvare({ buono: '10.0.0.5', battito: ['10.0.0.5', '10.0.0.6'] })).toEqual(['10.0.0.5', '10.0.0.6'])
    expect(indirizziDaProvare({})).toEqual([])
  })
  it('indirizzi inutili', () => {
    expect(indirizzoUtile('169.254.1.1')).toBe(false)
    expect(indirizzoUtile('0.0.0.0')).toBe(false)
    expect(indirizzoUtile('fd7a::1')).toBe(false)
    expect(indirizzoUtile('192.168.1.177')).toBe(true)
  })
})

describe('com e quel PC dopo il bussare: mai «spento» se non lo so', () => {
  const base = { nome: 'LAPTOP-E60QM2D1', ultimoSegno: LAPTOP.battito, porta: 47640 }
  it('risponde: acceso, anche con il battito vecchio e il Drive scollegato', () => {
    expect(statoPc({ ...base, ping: { esito: 'risponde', indirizzo: '192.168.1.177' }, battitoVivo: false, driveCollegato: false }).stato).toBe('acceso')
  })
  it('battito vecchio e nessuno risponde: «non so se è acceso», con cosa fare', () => {
    const s = statoPc({ ...base, ping: { esito: 'muto', provati: ['192.168.1.177 (rete locale)'] }, battitoVivo: false, driveCollegato: false })
    expect(s.stato).toBe('non-so')
    expect(s.titolo).toBe('Non so se LAPTOP-E60QM2D1 è acceso')
    expect(`${s.titolo} ${s.cosaFare}`).not.toMatch(/è spento/)
    expect(s.cosaFare).toContain('il Drive di questo PC è scollegato')
    expect(s.cosaFare).toContain('Account → Drive → Collega')
    expect(s.cosaFare).toContain('Tailscale')
  })
  it('battito fresco e nessuno risponde: acceso ma irraggiungibile (rete o firewall)', () => {
    const s = statoPc({ ...base, ping: { esito: 'muto', provati: ['x'] }, battitoVivo: true, driveCollegato: true })
    expect(s.stato).toBe('irraggiungibile')
    expect(s.cosaFare).toContain('firewall')
  })
  it('nessun indirizzo: lo dice chiaro invece di fallire in silenzio', () => {
    const s = statoPc({ ...base, ping: { esito: 'senza-indirizzi' }, battitoVivo: false, driveCollegato: false })
    expect(s.stato).toBe('senza-indirizzi')
    expect(s.cosaFare).toContain('Non ho nessun indirizzo')
  })
  it('chiave rifiutata e indirizzo rifiutato: il motivo vero', () => {
    expect(statoPc({ ...base, ping: { esito: 'chiave', indirizzo: 'x' }, battitoVivo: false, driveCollegato: false }).stato).toBe('chiave')
    expect(statoPc({ ...base, ping: { esito: 'rifiutato', indirizzo: 'x' }, battitoVivo: false, driveCollegato: false }).cosaFare).toContain('accetta anche da fuori la rete locale')
  })
})

describe('decidiApertura con il bussare diretto', () => {
  const dati = {
    sessione: '2eedc5a4-7a19-4e2f-841e-d7f1527d9e5c', cwd: 'C:\\Users\\nikof\\Documents\\Trading\\Trading',
    io: 'deb4db2834a7', trascrizioneQui: true, cartellaQui: true, battiti: [LAPTOP], adesso: ADESSO
  }
  it('il caso vero: battito di nove giorni fa, ma il portatile risponde → la chat si apre dal vivo', () => {
    expect(decidiApertura(dati).tipo).toBe('attesa')
    expect(decidiApertura({ ...dati, rispondono: ['058be1ee679e'] })).toMatchObject({ tipo: 'remoto', pc: { id: '058be1ee679e', nome: 'LAPTOP-E60QM2D1' } })
  })
  it('non risponde: in attesa, con lo stato «non so se è acceso» per il riquadro', () => {
    const stato = statoPc({ nome: LAPTOP.nome, ping: { esito: 'muto', provati: [] }, battitoVivo: false, driveCollegato: false, porta: 47640 })
    const a = decidiApertura({ ...dati, rispondono: [], statiPc: { '058be1ee679e': stato } })
    expect(a).toMatchObject({ tipo: 'attesa', statoPc: { stato: 'non-so' } })
  })
})

describe('gli errori del riquadro remoto con il motivo vero', () => {
  it('dallo stato HTTP', () => {
    expect(motivoDaStatoHttp(200)).toBeUndefined()
    expect(motivoDaStatoHttp(401)).toBe('chiave')
    expect(motivoDaStatoHttp(403)).toBe('rifiutato')
    expect(motivoDaStatoHttp(404)).toBe('chat')
    expect(motivoDaStatoHttp(500)).toBe('http')
  })
  it('chat chiusa là, chiave rifiutata, cassaforte chiusa', () => {
    expect(messaggioErroreRemoto('chat', 'LAPTOP', 'chat inesistente')).toContain('questa chat là non è aperta')
    expect(messaggioErroreRemoto('chiave', 'LAPTOP')).toContain('cassaforte')
    expect(messaggioErroreRemoto('cassaforte', 'LAPTOP')).toContain('Sbloccala')
  })
  it('il titolo del silenzio non dice mai «spento»', () => {
    expect(descriviSilenzio('spento', 'LAPTOP', 60_000).titolo).toBe('Non so se LAPTOP è acceso · non risponde da 60 secondi · riprovo da solo')
    expect(descriviSilenzio('non-so', 'LAPTOP', 0).titolo).toContain('Non so se')
    expect(descriviSilenzio('chat', 'LAPTOP', 0).titolo).toContain('questa chat là è stata chiusa')
  })
})

describe('la banda del Drive scollegato', () => {
  const registro23 = [
    '2026-09-23T10:51:32.318Z [info] [app] Drive configurato: true, connesso: true',
    '2026-09-23T10:51:47.607Z [info] [app] [progetti] giro su «gestionale-dev» fallito (non lo ripeto finche\' non torna a rispondere): Error: Google non riconosce più l’autorizzazione di SierraDeck al tuo Drive: ricollega Google Drive dal pannello Account.',
    '2026-09-23T10:51:47.608Z [info] [app] [progetti] giro su «Money» fallito: Error: Google Drive non connesso: manca l’autorizzazione'
  ].join('\n')
  it('dal registro vero: il 23/09 alle 10:51, rifiuto di Google', () => {
    expect(scollegamentoDalRegistro(['2026-09-22T11:44:42Z [info] niente', registro23])).toEqual({ quando: '2026-09-23T10:51:47.607Z', motivo: 'revocata' })
    expect(scollegamentoDalRegistro(['2026-09-24T08:00:00.000Z [info] [app] x: Google Drive non connesso: manca l’autorizzazione'])).toEqual({ quando: '2026-09-24T08:00:00.000Z', motivo: 'sconosciuto' })
    expect(scollegamentoDalRegistro(['niente'])).toBeUndefined()
  })
  it('dice da quanti giorni, il perché (Google) e il tasto', () => {
    const a = avvisoDriveScollegato({ configurato: true, connesso: false, dal: { quando: '2026-09-23T10:51:47.607Z', motivo: 'revocata' }, adesso: ADESSO })
    expect(a?.titolo).toBe('Drive scollegato da 9 giorni: gli altri PC non si vedono')
    expect(a?.giorni).toBe(9)
    expect(a?.testo).toContain('invalid_grant')
    expect(a?.testo).toContain('non è un guasto di questo PC')
    expect(a?.testo).toContain('Account → Drive → Collega')
  })
  it('collegato o non configurato: niente banda', () => {
    expect(avvisoDriveScollegato({ configurato: true, connesso: true, adesso: ADESSO })).toBeUndefined()
    expect(avvisoDriveScollegato({ configurato: false, connesso: false, adesso: ADESSO })).toBeUndefined()
  })
  it('0.56.3: mai a chi il Drive non l ha mai collegato, né a chi l ha scollegato a mano', () => {
    // «configurato» = il programma ha le credenziali OAuth: vale per tutti.
    expect(avvisoDriveScollegato({ configurato: true, connesso: false, adesso: ADESSO })).toBeUndefined()
    expect(avvisoDriveScollegato({ configurato: true, connesso: false, dal: { quando: '2026-09-23T10:51:47.607Z', motivo: 'a-mano' }, adesso: ADESSO })).toBeUndefined()
    // Dal registro, «manca l autorizzazione» lo scrive anche chi non l ha mai collegato.
    expect(avvisoDriveScollegato({ configurato: true, connesso: false, dal: { quando: '2026-09-23T10:51:47.607Z', motivo: 'sconosciuto' }, adesso: ADESSO })).toBeUndefined()
  })
  it('0.56.3: una riga breve e una chiave che cambia solo con un problema nuovo', () => {
    const a = avvisoDriveScollegato({ configurato: true, connesso: false, dal: { quando: '2026-09-23T10:51:47.607Z', motivo: 'revocata' }, adesso: ADESSO })
    expect(a?.breve).toContain('Google Drive scollegato da 9 giorni')
    expect(a?.breve).toContain('dal PC')
    expect(a?.chiave).toBe('2026-09-23T10:51:47.607Z')
    const b = avvisoDriveScollegato({ configurato: true, connesso: false, dal: { quando: '2026-10-09T11:19:48.000Z', motivo: 'revocata' }, adesso: ADESSO })
    expect(b?.chiave).not.toBe(a?.chiave)
  })
  it('il segno su disco si legge solo se è sano', () => {
    expect(leggiScollegamento({ quando: '2026-09-23T10:51:47.607Z', motivo: 'revocata' })).toEqual({ quando: '2026-09-23T10:51:47.607Z', motivo: 'revocata' })
    expect(leggiScollegamento({ quando: 'ieri' })).toBeUndefined()
    expect(leggiScollegamento({ quando: '2026-09-23T10:51:47.607Z', motivo: 'boh' })?.motivo).toBe('sconosciuto')
  })
})
