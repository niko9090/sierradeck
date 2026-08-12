import { describe, it, expect } from 'vitest'
import {
  componiImpostazioni, componiArgomenti, creaLavori, ambienteChat, type AvvioProcesso
} from '../../src/autopilot-host/lavoro'
import { nuovoAutopilota, type Autopilota } from '@shared/autopilota'

function ap(id = 'ap-1'): Autopilota {
  return nuovoAutopilota({
    id, nome: 'Test verdi', obiettivo: 'Fai passare la suite', cwd: 'C:\\p',
    criteri: [{ descrizione: 'i test passano', comando: 'npm test', soddisfatto: false }],
    iniziatoIl: '2026-08-09T10:00:00.000Z'
  })
}

function finto() {
  const avviati: { comando: string; args: string[]; cwd: string }[] = []
  const uccisi: number[] = []
  const chiudi: ((codice: number) => void)[] = []
  const avvia: AvvioProcesso = (comando, args, cwd) => {
    const indice = avviati.length
    avviati.push({ comando, args, cwd })
    return {
      uccidi: () => { uccisi.push(indice) },
      finito: new Promise<number>((ris) => { chiudi.push(ris) })
    }
  }
  return {
    avvia, avviati, uccisi,
    chiudiProcesso: (i: number, codice: number) => chiudi[i]?.(codice)
  }
}

/** Lascia girare le promise già risolte, senza attendere tempo vero. */
function cedi(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0))
}

describe('componiImpostazioni', () => {
  it('produce hook http verso la porta del servizio, con l id nell URL', () => {
    const s = JSON.parse(componiImpostazioni('ap-1', 47630))
    expect(s.hooks.Stop[0].hooks[0].type).toBe('http')
    expect(s.hooks.Stop[0].hooks[0].url).toBe('http://127.0.0.1:47630/hook/stop?ap=ap-1')
    expect(s.hooks.Notification[0].hooks[0].url).toBe('http://127.0.0.1:47630/hook/notification?ap=ap-1')
  })

  it('da all hook il tempo di eseguire i comandi di verifica', () => {
    // Una verifica lenta piu' il giudizio del supervisore possono avvicinarsi al
    // limite, e un hook scaduto lascia la chat ferma senza che nessuno lo sappia.
    const s = JSON.parse(componiImpostazioni('ap-1', 47630))
    expect(s.hooks.Stop[0].hooks[0].timeout).toBeGreaterThanOrEqual(600)
  })
})

describe('componiArgomenti', () => {
  it('lancia la chat in modalita non interattiva con obiettivo e impostazioni', () => {
    const args = componiArgomenti(ap(), '{"hooks":{}}')
    expect(args).toContain('-p')
    expect(args.join(' ')).toContain('Fai passare la suite')
    expect(args[args.indexOf('--settings') + 1]).toBe('{"hooks":{}}')
  })

  it('elenca i criteri con i comandi che li verificano', () => {
    expect(componiArgomenti(ap(), '{}').join(' ')).toContain('npm test')
  })

  it('non chiede permessi, altrimenti resterebbe ferma ad aspettarli', () => {
    expect(componiArgomenti(ap(), '{}')).toContain('--dangerously-skip-permissions')
  })

  it('riprende la sessione quando ne conosce una gia scritta su disco', () => {
    const args = componiArgomenti({ ...ap(), sessionId: 's-7' }, '{}', undefined, undefined, () => true)
    expect(args[args.indexOf('--resume') + 1]).toBe('s-7')
  })

  it('non passa --resume quando non c e ancora una sessione', () => {
    expect(componiArgomenti(ap(), '{}')).not.toContain('--resume')
  })
})

describe('creaLavori', () => {
  it('avvia un processo per autopilota e lo elenca fra gli attivi', async () => {
    const f = finto()
    const lavori = creaLavori({ avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {} })
    await lavori.avvia(ap())
    expect(f.avviati).toHaveLength(1)
    expect(f.avviati[0]?.cwd).toBe('C:\\p')
    expect(lavori.attivi()).toEqual(['ap-1'])
  })

  it('non avvia due processi per lo stesso autopilota', async () => {
    // Due chat sullo stesso obiettivo nella stessa cartella si pestano i piedi
    // sui file, e la seconda non ha nessuno che la sorvegli.
    const f = finto()
    const lavori = creaLavori({ avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {} })
    await lavori.avvia(ap())
    await lavori.avvia(ap())
    expect(f.avviati).toHaveLength(1)
  })

  it('fermare uccide il processo e lo toglie dagli attivi', async () => {
    const f = finto()
    const lavori = creaLavori({ avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {} })
    await lavori.avvia(ap())
    lavori.ferma('ap-1')
    expect(f.uccisi).toEqual([0])
    expect(lavori.attivi()).toEqual([])
  })

  it('un uscita pulita non e anomala', async () => {
    const anomale: string[] = []
    const f = finto()
    const lavori = creaLavori({
      avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: (id) => anomale.push(id)
    })
    await lavori.avvia(ap())
    f.chiudiProcesso(0, 0)
    await cedi()
    expect(anomale).toEqual([])
    expect(lavori.attivi()).toEqual([])
  })

  it('un uscita con codice diverso da zero viene riferita', async () => {
    const anomale: string[] = []
    const f = finto()
    const lavori = creaLavori({
      avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: (id) => anomale.push(id)
    })
    await lavori.avvia(ap())
    f.chiudiProcesso(0, 1)
    await cedi()
    expect(anomale).toEqual(['ap-1'])
  })

  it('fermare non riferisce l uscita come anomala', async () => {
    // Uccidere un processo produce un codice diverso da zero: senza questa
    // distinzione, ogni «ferma» sembrerebbe un guasto.
    const anomale: string[] = []
    const f = finto()
    const lavori = creaLavori({
      avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: (id) => anomale.push(id)
    })
    await lavori.avvia(ap())
    lavori.ferma('ap-1')
    f.chiudiProcesso(0, 143)
    await cedi()
    expect(anomale).toEqual([])
  })

  it('dopo un uscita si puo riavviare lo stesso autopilota', async () => {
    const f = finto()
    const lavori = creaLavori({ avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {} })
    await lavori.avvia(ap())
    f.chiudiProcesso(0, 0)
    await cedi()
    await lavori.avvia(ap())
    expect(f.avviati).toHaveLength(2)
  })
})

describe('ripresa di una chat ferma', () => {
  it('con un messaggio riprende la sessione invece di ripartire dall obiettivo', () => {
    const args = componiArgomenti(
      { ...ap(), sessionId: 's-7' }, '{}', 'L utente risponde: usa la chiave di prova', undefined, () => true
    )
    expect(args[args.indexOf('-p') + 1]).toContain('usa la chiave di prova')
    expect(args[args.indexOf('--resume') + 1]).toBe('s-7')
    // L'obiettivo non va ripetuto: la sessione ripresa lo ha gia' in memoria, e
    // rimandarlo la farebbe ricominciare da capo.
    expect(args[args.indexOf('-p') + 1]).not.toContain('Criteri di fine')
  })

  it('senza sessione nota il messaggio riparte comunque dall obiettivo', () => {
    // Non c'e' niente da riprendere: meglio ripartire che non partire.
    const args = componiArgomenti(ap(), '{}', 'una risposta')
    expect(args).not.toContain('--resume')
    expect(args[args.indexOf('-p') + 1]).toContain('Fai passare la suite')
  })

  it('avvia passa il messaggio al processo', async () => {
    const f = finto()
    const lavori = creaLavori({
      avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {},
      // La sessione c'e' gia' su disco: e' il caso della ripresa.
      trascrizioneEsiste: () => true
    })
    await lavori.avvia({ ...ap(), sessionId: 's-7' }, 'ecco la risposta')
    expect(f.avviati[0]?.args.join(' ')).toContain('ecco la risposta')
  })
})

describe('flotta di chat', () => {
  const chat = { id: 'c-1', compito: 'scrivi i test', stato: 'lavoro' as const, cicli: 0 }

  it('l hook porta anche l id della chat', () => {
    const s = JSON.parse(componiImpostazioni('ap-1', 47630, 'c-1'))
    expect(s.hooks.Stop[0].hooks[0].url).toContain('chat=c-1')
  })

  it('ogni chat riceve il proprio compito dentro l obiettivo', () => {
    const args = componiArgomenti(ap(), '{}', undefined, { compito: 'scrivi i test' })
    const prompt = args[args.indexOf('-p') + 1] ?? ''
    expect(prompt).toContain('Fai passare la suite')
    expect(prompt).toContain('scrivi i test')
  })

  it('riprende la sessione della chat, non quella dell autopilota', () => {
    const args = componiArgomenti(
      { ...ap(), sessionId: 's-vecchia' }, '{}', 'una risposta',
      { compito: 'x', sessionId: 's-della-chat' }, () => true
    )
    expect(args[args.indexOf('--resume') + 1]).toBe('s-della-chat')
  })

  it('apre un processo per ogni chat dello stesso autopilota', async () => {
    const f = finto()
    const lavori = creaLavori({ avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {} })
    await lavori.avvia(ap(), undefined, chat)
    await lavori.avvia(ap(), undefined, { ...chat, id: 'c-2', compito: 'aggiorna i documenti' })
    expect(f.avviati).toHaveLength(2)
    expect(lavori.attivi()).toEqual(['ap-1::c-1', 'ap-1::c-2'])
  })

  it('fermare una chat sola non ferma le altre', async () => {
    const f = finto()
    const lavori = creaLavori({ avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {} })
    await lavori.avvia(ap(), undefined, chat)
    await lavori.avvia(ap(), undefined, { ...chat, id: 'c-2' })
    lavori.ferma('ap-1', 'c-1')
    expect(lavori.attivi()).toEqual(['ap-1::c-2'])
  })

  it('fermare l autopilota ferma tutte le sue chat', async () => {
    // E' cio' che serve al comando «ferma», che non conosce le singole chat: se
    // ne dimenticasse una, resterebbe un claude.exe vivo per un autopilota
    // sospeso.
    const f = finto()
    const lavori = creaLavori({ avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {} })
    await lavori.avvia(ap(), undefined, chat)
    await lavori.avvia(ap(), undefined, { ...chat, id: 'c-2' })
    lavori.ferma('ap-1')
    expect(lavori.attivi()).toEqual([])
    expect(f.uccisi).toHaveLength(2)
  })

  it('fermare un autopilota non tocca le chat di un altro', async () => {
    const f = finto()
    const lavori = creaLavori({ avvia: f.avvia, claudeCmd: 'claude.exe', porta: 47630, suUscitaAnomala: () => {} })
    await lavori.avvia(ap('ap-1'), undefined, chat)
    await lavori.avvia(ap('ap-2'), undefined, chat)
    lavori.ferma('ap-1')
    expect(lavori.attivi()).toEqual(['ap-2::c-1'])
  })
})

describe('ambiente delle chat governate', () => {
  it('non passa i marcatori della sessione che ha lanciato il servizio', () => {
    // Stessa ragione del PTY host: con CLAUDE_CODE_CHILD_SESSION ereditato la
    // chat non salva la trascrizione, e senza trascrizione l'autopilota non
    // puo' riprenderla dopo un riavvio — perde il lavoro che stava proteggendo.
    const env = ambienteChat({
      CLAUDE_CODE_CHILD_SESSION: '1',
      CLAUDE_CODE_SESSION_ID: 'abc',
      CLAUDE_PID: '9',
      PATH: 'C:\Windows'
    })
    expect(env.CLAUDE_CODE_CHILD_SESSION).toBeUndefined()
    expect(env.CLAUDE_CODE_SESSION_ID).toBeUndefined()
    expect(env.CLAUDE_PID).toBeUndefined()
    expect(env.PATH).toBe('C:\Windows')
  })
})

describe('la sessione la decide l autopilota', () => {
  it('una chat nuova nasce con un id deciso da noi', () => {
    // Senza, l'id lo sceglie Claude Code e noi lo scopriamo solo al primo
    // hook Stop — che per un lavoro lungo arriva dopo dieci minuti. Fino a quel
    // momento nessuno sa quale trascrizione guardare, e l'utente non vede
    // niente di cio' che sta succedendo.
    const args = componiArgomenti(
      { ...ap(), sessionId: '11111111-2222-3333-4444-555555555555' },
      '{}',
      undefined,
      undefined,
      () => false
    )
    expect(args).toContain('--session-id')
    expect(args).toContain('11111111-2222-3333-4444-555555555555')
    expect(args).not.toContain('--resume')
  })

  it('una sessione che esiste gia si riprende, non si ricrea', () => {
    // Claude Code rifiuta un --session-id gia' usato: riprenderla e' anche
    // l'unico modo di non perdere il lavoro fatto prima del riavvio.
    const args = componiArgomenti(
      { ...ap(), sessionId: '11111111-2222-3333-4444-555555555555' },
      '{}',
      undefined,
      undefined,
      () => true
    )
    expect(args).toContain('--resume')
    expect(args).not.toContain('--session-id')
  })

  it('senza id non impone niente e lascia decidere a Claude Code', () => {
    const args = componiArgomenti(ap(), '{}', undefined, undefined, () => false)
    expect(args).not.toContain('--session-id')
    expect(args).not.toContain('--resume')
  })

  it('la chat di una flotta usa il proprio id, non quello dell autopilota', () => {
    const args = componiArgomenti(
      { ...ap(), sessionId: 'aaaaaaaa-2222-3333-4444-555555555555' },
      '{}',
      undefined,
      { compito: 'il mio pezzo', sessionId: 'bbbbbbbb-2222-3333-4444-555555555555' },
      () => false
    )
    expect(args).toContain('bbbbbbbb-2222-3333-4444-555555555555')
    expect(args).not.toContain('aaaaaaaa-2222-3333-4444-555555555555')
  })
})
