import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { creaServer, type ServerAutopiloti } from '../../src/autopilot-host/server'
import { apriArchivio } from '../../src/autopilot-host/archivio'
import { creaRegistroDomande } from '../../src/autopilot-host/domande'
import { apriMemoria } from '../../src/autopilot-host/memoria'
import { apriCode } from '../../src/autopilot-host/coda-store'
import { apriOrchestratori } from '../../src/autopilot-host/orchestratore-store'
import { apriAttesa } from '../../src/autopilot-host/attesa-store'
import type { VistaAttesa } from '@shared/attesa-specialisti'
import { menuSpecialisti } from '@shared/menu-specialisti'
import { orologioDa } from '../setup/orologio'

/**
 * 16/11 (Nicholas: «due specialisti che lavorano e nel menu vedo nessuno»): i lavori
 * affidati ad altri PC (Aiuta la rete) lavorano per questo workspace, e la lista
 * d'attesa li deve contare, con il nome del PC.
 */

let server: ServerAutopiloti | undefined
afterEach(() => { server?.close(); server = undefined; vi.restoreAllMocks() })

const affidato = (id: string, stato: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, workspace: 'Lavoro', cwd: process.cwd(), pcId: 'pc-portatile-0001', pcNome: 'PORTATILE-PROVA', ruolo: 'sviluppatore',
  descrizione: `k-${id}: prova`, prompt: 'p', sistema: 's', stato, inizio: '2026-11-06T07:50:00.000Z', ...extra
})

describe('la lista d’attesa conta i lavori affidati ad altri PC', () => {
  it('due specialisti su un altro PC: sono al lavoro, con «su NOME-PC», e il menu non dice «nessuno»', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const radice = mkdtempSync(join(tmpdir(), 'ap-affidati-'))
    const archivio = apriArchivio(join(radice, 'archivio'))
    mkdirSync(join(archivio.cartella, 'servizio'), { recursive: true })
    writeFileSync(join(archivio.cartella, 'servizio', 'aiuti-affidati.json'), JSON.stringify([
      affidato('r0000000000a1', 'spedito', { attivita: 'legge i file' }),
      affidato('r0000000000a2', 'da-spedire'),
      affidato('r0000000000a3', 'finito')
    ]))
    const orologio = orologioDa('2026-11-06T08:00:00.000Z')
    const cartella = join(radice, 'orch')
    const s = creaServer({
      archivio,
      memoria: apriMemoria(mkdtempSync(join(tmpdir(), 'ap-affidati-mem-'))),
      versione: '0.96.0',
      esegui: () => Promise.resolve({ codice: 1, uscita: 'non ancora' }),
      avviaLavoro: () => Promise.resolve(),
      avvisa: () => Promise.resolve(),
      domande: creaRegistroDomande({ adesso: orologio.ms }),
      ultimoDetto: () => undefined,
      scadenzaDomandaMs: 5000,
      adesso: () => new Date(orologio.ms()).toISOString(),
      coda: apriCode(cartella),
      orchestratori: apriOrchestratori(cartella),
      avviaProcesso: () => ({ scrivi: () => {}, uccidi: () => {}, suRiga: () => {}, suUscita: () => {} }),
      porta: 47998,
      raccoltaEventiMs: 5,
      attesa: apriAttesa(join(radice, 'attesa-specialisti.json'))
    })
    server = s
    const porta = await new Promise<number>((ris) => s.listen(0, '127.0.0.1', () => ris((s.address() as { port: number }).port)))
    const v = (await (await fetch(`http://127.0.0.1:${porta}/orchestratore/attesa`)).json()) as VistaAttesa
    // Solo i due che lavorano (il terzo è finito); niente posto locale occupato.
    expect(v.alLavoro.map((x) => x.id).sort()).toEqual(['r0000000000a1', 'r0000000000a2'])
    expect(v.alLavoro.every((x) => x.suPc === 'PORTATILE-PROVA')).toBe(true)
    expect(v.posti.usati).toBe(0)
    // Nessuna stima vera dall'altro PC: niente percentuale inventata (10 + minuti).
    expect(v.alLavoro.every((x) => x.percentuale === undefined)).toBe(true)
    const m = menuSpecialisti(v, ['Lavoro'])
    expect(m.etichetta).toBe('Specialisti 2')
    expect(m.lavorano.every((r) => r.corrente && r.suPc === 'PORTATILE-PROVA')).toBe(true)
  })
})
