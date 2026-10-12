import type { RisorsePc, TipoRichiestaDrive } from '@shared/risorse'

/**
 * Quanto lavora SierraDeck su questo PC (0.69.0). «Ottimizziamo l'app perché i
 * PC girano lenti» (Nicholas, 12/10): prima di togliere giri bisogna poterli
 * contare, su ogni PC e non solo su quello davanti. Le richieste al Drive si
 * contano qui, in una finestra di 10 minuti; CPU e RAM le dà Electron. Il
 * risultato va nella Salute e nel battito, così ogni PC vede gli altri.
 */

/** La finestra su cui si contano le richieste al Drive. */
export const FINESTRA_RISORSE_MS = 10 * 60_000

/** Che richiesta è, da metodo e indirizzo dell'API di Google Drive. */
export function tipoRichiestaDrive(metodo: string, url: string): TipoRichiestaDrive {
  const m = metodo.toUpperCase()
  if (m === 'DELETE') return 'cancella'
  if (m === 'POST' || m === 'PATCH' || m === 'PUT') return 'scrittura'
  if (url.includes('alt=media')) return 'scarica'
  if (url.includes('/files?') || url.endsWith('/files')) return 'ricerca'
  return 'altro'
}

export type ContatoreDrive = {
  conta: (tipo: TipoRichiestaDrive, rifiutata: boolean) => void
  /** Le richieste dell'ultima finestra: al minuto, per tipo, e quante rifiutate (403/429). */
  riassunto: () => Pick<RisorsePc, 'driveAlMinuto' | 'drivePerTipo' | 'driveRifiutate'>
}

export function creaContatoreDrive(adesso: () => number = Date.now): ContatoreDrive {
  const voci: { il: number; tipo: TipoRichiestaDrive; rifiutata: boolean }[] = []
  const pota = (): void => {
    const da = adesso() - FINESTRA_RISORSE_MS
    while (voci.length > 0 && (voci[0]?.il ?? 0) < da) voci.shift()
    // Un tetto: anche con una tempesta di richieste la memoria resta piccola.
    if (voci.length > 20_000) voci.splice(0, voci.length - 20_000)
  }
  return {
    conta(tipo, rifiutata) {
      voci.push({ il: adesso(), tipo, rifiutata })
      pota()
    },
    riassunto() {
      pota()
      const perTipo: Partial<Record<TipoRichiestaDrive, number>> = {}
      for (const v of voci) perTipo[v.tipo] = (perTipo[v.tipo] ?? 0) + 1
      return {
        driveAlMinuto: Math.round((voci.length / (FINESTRA_RISORSE_MS / 60_000)) * 10) / 10,
        drivePerTipo: perTipo,
        driveRifiutate: voci.filter((v) => v.rifiutata).length
      }
    }
  }
}

/** Il contatore di questo processo: lo usano i client del Drive. */
export const contatoreDrive = creaContatoreDrive()

/** `fetch` che conta ogni richiesta che parte davvero (anche i ritentativi). */
export function conConteggio(f: typeof fetch, c: ContatoreDrive = contatoreDrive): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const tipo = tipoRichiestaDrive(init?.method ?? 'GET', url)
    try {
      const r = await f(input, init)
      c.conta(tipo, r.status === 403 || r.status === 429)
      return r
    } catch (e) {
      c.conta(tipo, false)
      throw e
    }
  }) as typeof fetch
}

/** CPU e RAM dei processi di SierraDeck, da `app.getAppMetrics()` di Electron. */
export function cpuRamDa(metriche: { cpu: { percentCPUUsage: number }; memory: { workingSetSize: number } }[], core: number): Pick<RisorsePc, 'cpu' | 'ramMb' | 'processi'> {
  const cpu = metriche.reduce((s, m) => s + (m.cpu.percentCPUUsage || 0), 0)
  const kb = metriche.reduce((s, m) => s + (m.memory.workingSetSize || 0), 0)
  return {
    // percentCPUUsage è su un core: diviso per i core, è la parte del PC intero.
    cpu: Math.round((cpu / Math.max(1, core)) * 10) / 10,
    ramMb: Math.round(kb / 1024),
    processi: metriche.length
  }
}
