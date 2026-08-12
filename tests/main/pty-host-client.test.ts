import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { PtyHostClient } from '../../src/main/pty-host-client'
import type { HostToCore } from '@shared/protocol'

const dir = mkdtempSync(join(tmpdir(), 'ptyhost-'))
const percorso = (nome: string): string => join(dir, nome)

/** Corpo comune: legge il protocollo a righe e risponde `spawned` a tutto. */
const RISPONDE = `let b='';process.stdin.setEncoding('utf8');
   process.stdin.on('data',c=>{b+=c;const p=b.split('\\n');b=p.pop();
   for(const l of p){if(!l.trim())continue;const m=JSON.parse(l);
   process.stdout.write(JSON.stringify({id:m.id,kind:'spawned',pid:4242})+'\\n');}});`

const fakeHost = percorso('fake-host.cjs')
writeFileSync(fakeHost, RISPONDE)

const hostMorente = percorso('host-morente.cjs')
writeFileSync(hostMorente, `process.stdin.on('data',()=>{process.exit(3)});`)

// Onora lo spegnimento ordinato lasciandone traccia su disco: e' la prova che
// il messaggio e' arrivato e che l'host ha potuto eseguire la propria pulizia
// prima di uscire. Un semplice kill() non produrrebbe questo file.
const marcaSpegnimento = percorso('spegnimento-ricevuto.txt')
const hostChiudibile = percorso('host-chiudibile.cjs')
writeFileSync(
  hostChiudibile,
  `const fs=require('fs');let b='';process.stdin.setEncoding('utf8');
   process.stdin.on('data',c=>{b+=c;const p=b.split('\\n');b=p.pop();
   for(const l of p){if(!l.trim())continue;const m=JSON.parse(l);
   if(m.kind==='shutdown'){fs.writeFileSync(${JSON.stringify(marcaSpegnimento)},'ricevuto');process.exit(0);}
   process.stdout.write(JSON.stringify({id:m.id,kind:'spawned',pid:4242})+'\\n');}});`
)

// Ignora tutto, spegnimento compreso, e non esce mai da solo.
const hostSordo = percorso('host-sordo.cjs')
writeFileSync(hostSordo, `process.stdin.on('data',()=>{});setInterval(()=>{},100000);`)

// Muore subito a ogni avvio, e ogni avvio lascia una riga: il conteggio dice
// quante volte il Core ha davvero riprovato.
const conteggioAvvii = percorso('avvii.txt')
const hostMuoreSempre = percorso('host-muore-sempre.cjs')
writeFileSync(
  hostMuoreSempre,
  `require('fs').appendFileSync(${JSON.stringify(conteggioAvvii)},'avvio\\n');process.exit(7);`
)

// Muore solo la prima volta: la seconda istanza e' un host funzionante.
const segnoPrimaMorte = percorso('gia-morto-una-volta.txt')
const hostMuoreUnaVolta = percorso('host-muore-una-volta.cjs')
writeFileSync(
  hostMuoreUnaVolta,
  `const fs=require('fs');
   if(!fs.existsSync(${JSON.stringify(segnoPrimaMorte)})){fs.writeFileSync(${JSON.stringify(segnoPrimaMorte)},'1');process.exit(9);}
   ${RISPONDE}`
)

const SPAWN = {
  kind: 'spawn' as const,
  sessionUuid: 'u',
  cwd: process.cwd(),
  command: 'cmd.exe',
  args: [] as string[],
  cols: 80,
  rows: 24
}

let client: PtyHostClient | undefined
let diagnostica: string[]

/**
 * Un client con un host fittizio già avviato, per i test che devono
 * controllare esattamente cosa "risponde" l'host senza scrivere uno script
 * apposta per ognuno. `hostSordo` non risponde mai da solo, quindi non c'e'
 * una risposta automatica in corsa con quella che il test inietta. `rispondi`
 * usa la stessa tecnica gia' in uso sopra per stdin (emettere direttamente
 * l'evento sull'EventEmitter del figlio): dal punto di vista del client,
 * un evento 'data' su child.stdout e' indistinguibile da una risposta vera.
 */
function clientConHostFinto(): { client: PtyHostClient; rispondi: (msg: HostToCore) => void } {
  client = new PtyHostClient({
    nodePath: process.execPath,
    hostScript: hostSordo,
    shutdownTimeoutMs: 50
  })
  client.start()
  const interno = client as unknown as { child: { stdout: NodeJS.EventEmitter } }
  return {
    client,
    rispondi: (msg: HostToCore) => interno.child.stdout.emit('data', JSON.stringify(msg) + '\n')
  }
}

beforeEach(() => {
  // La diagnostica del client va raccolta, non stampata: i test la
  // interrogano dove il vincolo "nessun fallimento silenzioso" lo richiede, e
  // l'output della suite resta leggibile.
  diagnostica = []
  vi.spyOn(console, 'error').mockImplementation((...parti: unknown[]) => {
    diagnostica.push(parti.map((p) => String(p)).join(' '))
  })
})

afterEach(async () => {
  await client?.stop()
  client = undefined
  vi.restoreAllMocks()
})

describe('PtyHostClient', () => {
  it('avvia il processo host e riceve le risposte', async () => {
    const ricevuti: unknown[] = []
    client = new PtyHostClient({ nodePath: process.execPath, hostScript: fakeHost })
    client.on((msg) => ricevuti.push(msg))
    client.start()
    expect(client.isRunning()).toBe(true)

    client.send({ id: 'p1', ...SPAWN })

    await vi.waitFor(() => expect(ricevuti).toHaveLength(1), { timeout: 10000 })
    expect(ricevuti[0]).toEqual({ id: 'p1', kind: 'spawned', pid: 4242 })
  })

  it('riporta isRunning false dopo stop', async () => {
    client = new PtyHostClient({ nodePath: process.execPath, hostScript: fakeHost })
    client.start()
    await client.stop()
    expect(client.isRunning()).toBe(false)
  })

  it('segnala il fallimento di avvio invece di far terminare il processo', async () => {
    const ricevuti: HostToCore[] = []
    client = new PtyHostClient({
      nodePath: percorso('eseguibile-inesistente.exe'),
      hostScript: fakeHost,
      restartDelaysMs: []
    })
    client.on((m) => ricevuti.push(m))
    client.start()
    client.send({ id: 'p8', ...SPAWN })

    await vi.waitFor(
      () => expect(ricevuti.some((m) => m.id === 'p8' && m.kind === 'error')).toBe(true),
      { timeout: 10000 }
    )
  })

  it('avvisa le sessioni vive quando l host muore inaspettatamente', async () => {
    const ricevuti: HostToCore[] = []
    client = new PtyHostClient({
      nodePath: process.execPath,
      hostScript: hostMorente,
      restartDelaysMs: []
    })
    client.on((m) => ricevuti.push(m))
    client.start()
    client.send({ id: 'p9', ...SPAWN })

    await vi.waitFor(
      () => expect(ricevuti.some((m) => m.id === 'p9' && m.kind === 'error')).toBe(true),
      { timeout: 10000 }
    )
  })

  it('toglie l id da live se la scrittura verso l host fallisce', async () => {
    const ricevuti: HostToCore[] = []
    client = new PtyHostClient({ nodePath: process.execPath, hostScript: fakeHost })
    client.on((m) => ricevuti.push(m))
    client.start()

    // La pipe puo' rompersi fra il controllo e la scrittura. Simularlo dalla
    // sola API pubblica non e' possibile: si sostituisce la write del figlio.
    const interno = client as unknown as { child: { stdin: { write: (s: string) => boolean } } }
    interno.child.stdin.write = () => {
      throw new Error('pipe rotta')
    }

    client.send({ id: 'p10', ...SPAWN })

    expect(ricevuti.some((m) => m.id === 'p10' && m.kind === 'error')).toBe(true)
    expect(client.livePtyIds()).not.toContain('p10')
  })

  it('un riaggancio fallito non lascia il pty fra i vivi', () => {
    const { client, rispondi } = clientConHostFinto()
    client.send({ id: 'p1', kind: 'attach' })
    expect(client.livePtyIds()).toEqual(['p1'])
    rispondi({ id: 'p1', kind: 'assente' })
    expect(client.livePtyIds()).toEqual([])
  })

  it('un riaggancio riuscito lascia il pty fra i vivi', () => {
    const { client, rispondi } = clientConHostFinto()
    client.send({ id: 'p1', kind: 'attach' })
    rispondi({ id: 'p1', kind: 'scrollback', data: 'x' })
    expect(client.livePtyIds()).toEqual(['p1'])
  })

  it('non abbatte il processo se la pipe verso l host emette un errore', () => {
    client = new PtyHostClient({ nodePath: process.execPath, hostScript: fakeHost })
    client.start()
    const interno = client as unknown as { child: { stdin: NodeJS.EventEmitter } }

    // Scrivere su una pipe rotta non solleva: emette 'error' in modo
    // asincrono. Senza ascoltatore EventEmitter lo rilancia, e nel processo
    // main di Electron l'applicazione si chiude.
    expect(() => interno.child.stdin.emit('error', new Error('EPIPE'))).not.toThrow()
    expect(diagnostica.join('\n')).toContain('scrittura verso il PTY host fallita')
  })

  describe('spegnimento ordinato', () => {
    it('chiede all host di chiudere i terminali invece di terminarlo', async () => {
      rmSync(marcaSpegnimento, { force: true })
      client = new PtyHostClient({ nodePath: process.execPath, hostScript: hostChiudibile })
      const ricevuti: HostToCore[] = []
      client.on((m) => ricevuti.push(m))
      client.start()
      client.send({ id: 'p11', ...SPAWN })
      await vi.waitFor(() => expect(ricevuti).toHaveLength(1), { timeout: 10000 })

      await client.stop()

      // Se stop() si limitasse a kill(), su Windows l'host verrebbe terminato
      // senza eseguire nulla e questo file non esisterebbe.
      expect(existsSync(marcaSpegnimento)).toBe(true)
      expect(client.isRunning()).toBe(false)
    })

    it('termina l host che non risponde allo spegnimento, e lo dichiara', async () => {
      client = new PtyHostClient({
        nodePath: process.execPath,
        hostScript: hostSordo,
        shutdownTimeoutMs: 200
      })
      client.start()
      const pid = (client as unknown as { child: { pid: number } }).child.pid

      const inizio = Date.now()
      await client.stop()

      expect(Date.now() - inizio).toBeGreaterThanOrEqual(150)
      expect(client.isRunning()).toBe(false)
      // Lo scadere del tempo e' un fallimento parziale — i terminali possono
      // essere sopravvissuti — e non deve restare muto.
      expect(diagnostica.join('\n')).toContain('non uscito entro')

      await vi.waitFor(() => {
        expect(() => process.kill(pid, 0)).toThrow()
      }, { timeout: 5000 })
    })

    it('non riavvia l host dopo uno spegnimento voluto', async () => {
      client = new PtyHostClient({
        nodePath: process.execPath,
        hostScript: fakeHost,
        restartDelaysMs: [20, 20]
      })
      client.start()
      await client.stop()

      await new Promise((r) => setTimeout(r, 200))
      expect(client.isRunning()).toBe(false)
      expect(diagnostica.join('\n')).not.toContain('riavvio fra')
    })
  })

  describe('supervisione', () => {
    it('riavvia l host e lo rende di nuovo utilizzabile', async () => {
      rmSync(segnoPrimaMorte, { force: true })
      const ricevuti: HostToCore[] = []
      client = new PtyHostClient({
        nodePath: process.execPath,
        hostScript: hostMuoreUnaVolta,
        restartDelaysMs: [20, 20]
      })
      client.on((m) => ricevuti.push(m))
      client.start()

      // La prima istanza muore da sola appena avviata. L'attesa e' sulla riga
      // di diagnostica e non su `isRunning() === false`: quello stato dura
      // quanto il ritardo di riavvio, venti millisecondi, e una macchina
      // carica lo attraversa fra due sondaggi di waitFor senza vederlo mai —
      // il test falliva a intermittenza per questo, non per il codice.
      await vi.waitFor(() => expect(diagnostica.join('\n')).toContain('riavvio fra'), {
        timeout: 10000
      })
      // La seconda deve arrivare da sola, senza che nessuno chiami start().
      await vi.waitFor(() => expect(client?.isRunning()).toBe(true), { timeout: 10000 })

      client.send({ id: 'p12', ...SPAWN })
      await vi.waitFor(
        () => expect(ricevuti.some((m) => m.id === 'p12' && m.kind === 'spawned')).toBe(true),
        { timeout: 10000 }
      )
    })

    it('avvisa i riquadri e non porta id di pty morti dentro il nuovo host', async () => {
      const errori: string[] = []
      client = new PtyHostClient({
        nodePath: process.execPath,
        hostScript: hostMorente,
        restartDelaysMs: [50, 50]
      })
      client.on((m) => {
        if (m.kind === 'error') errori.push(m.id)
      })
      client.start()
      client.send({ id: 'p13', ...SPAWN })

      await vi.waitFor(() => expect(errori).toContain('p13'), { timeout: 10000 })
      expect(diagnostica.join('\n')).toContain('riavvio fra')
      // L'avviso deve precedere il riavvio, e la prova osservabile e' questa:
      // quando il nuovo host e' in piedi, nessun id del vecchio e' rimasto in
      // `live`. Se sopravvivesse, il Core crederebbe vivo un pty che il nuovo
      // host non ha mai creato, e alla morte successiva lo riavviserebbe.
      await vi.waitFor(() => expect(client?.isRunning()).toBe(true), { timeout: 10000 })
      expect(client.livePtyIds()).toEqual([])
    })

    it('smette di riavviare dopo il numero di tentativi previsto', async () => {
      rmSync(conteggioAvvii, { force: true })
      client = new PtyHostClient({
        nodePath: process.execPath,
        hostScript: hostMuoreSempre,
        restartDelaysMs: [20, 20]
      })
      client.start()

      const avvii = (): number =>
        existsSync(conteggioAvvii)
          ? readFileSync(conteggioAvvii, 'utf8').split('\n').filter((r) => r !== '').length
          : 0

      // Avvio iniziale piu' due riavvii: poi il Core deve arrendersi.
      await vi.waitFor(() => expect(avvii()).toBe(3), { timeout: 10000 })
      await new Promise((r) => setTimeout(r, 300))
      expect(avvii()).toBe(3)
      expect(client.isRunning()).toBe(false)
      // Arrendersi in silenzio lascerebbe l'utente senza terminali e senza
      // spiegazione: il motivo deve essere scritto da qualche parte.
      expect(diagnostica.join('\n')).toContain('riavvio abbandonato')
    })
  })
})
