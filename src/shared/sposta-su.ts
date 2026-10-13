import type { PcNoto, RigaProgetto } from './pannello-drive'

/**
 * «Sposta su ▾» nel dettaglio di un progetto (0.71.0). Nicholas: «come faccio
 * nella scheda Progetti a cambiare un progetto da un PC all'altro?? deve essere
 * lì che gestisco tutto».
 *
 * Prima c'erano «Lavora su questo PC» (solo verso il PC dove sei) e «Sposta
 * progetto…» nascosto negli Strumenti (solo da questo PC a un altro). Da A a B
 * stando su C non si poteva. Adesso un'azione sola, da qualsiasi PC verso
 * qualsiasi PC della stessa chiave di casa: è il trasloco di sempre
 * (`src/main/trasloco.ts`), che gira **sul PC di arrivo**. Se l'arrivo è questo
 * PC parte qui; se no la richiesta va al PC di arrivo per il ponte
 * (`/api/trasloco/avvia`), e questo PC ne segue l'avanzamento.
 *
 * Qui le regole pure, uguali per PC, pagina e app (l'app le riceve già fatte).
 */

/** Un PC si dice acceso se il suo ultimo battito è più recente di così. */
export const ACCESO_ENTRO_MS = 5 * 60_000

export type DestinazioneSposta = {
  pc: string
  nome: string
  /** È questo PC (quello da cui guardi). */
  qui: boolean
  acceso: boolean
  /** È già il PC dove vive il progetto: si vede, ma non si sceglie. */
  attuale: boolean
  /** La riga dell'elenco: «PC-B · acceso», «PC-C · spento · dove vive adesso». */
  testo: string
  /** La conferma già scritta dal PC, per pagina e app (vedi `riassuntoSposta`). */
  riassunto?: RiassuntoSposta
}

export type RiassuntoSposta = { titolo: string; righe: string[]; conferma: string; avviso?: string }

/** I PC verso cui si può spostare il progetto: questo PC per primo, poi gli altri per nome. */
export function destinazioniSposta(r: Pick<RigaProgetto, 'residente'>, io: PcNoto, pc: PcNoto[], adesso: number): DestinazioneSposta[] {
  const visti = new Set<string>()
  const tutti: PcNoto[] = []
  for (const p of [io, ...pc]) {
    if (p.id === '' || visti.has(p.id)) continue
    visti.add(p.id)
    tutti.push(p)
  }
  const voci = tutti.map((p): DestinazioneSposta => {
    const qui = p.id === io.id
    const battito = p.battito === undefined ? Number.NaN : Date.parse(p.battito)
    const acceso = qui || (Number.isFinite(battito) && adesso - battito < ACCESO_ENTRO_MS)
    const attuale = r.residente?.pc === p.id
    const parti = [qui ? `${p.nome} (questo PC)` : p.nome, acceso ? 'acceso' : 'spento', ...(attuale ? ['dove vive adesso'] : [])]
    return { pc: p.id, nome: p.nome, qui, acceso, attuale, testo: parti.join(' · ') }
  })
  return [...voci.filter((v) => v.qui), ...voci.filter((v) => !v.qui).sort((a, b) => a.nome.localeCompare(b.nome, 'it'))]
}

/** Dove parte il trasloco: qui, oppure sul PC di arrivo per il ponte. */
export function comeSpostare(verso: string, io: PcNoto): 'qui' | 'ponte' {
  return verso === io.id ? 'qui' : 'ponte'
}

/** Il riassunto della conferma: da dove, verso dove, quante chat e file, cosa succede alle chat aperte. */
export function riassuntoSposta(
  r: Pick<RigaProgetto, 'nome' | 'residente' | 'chat' | 'alLavoro' | 'spazioDrive' | 'cartelle'>,
  verso: DestinazioneSposta
): RiassuntoSposta {
  const da = r.residente === undefined ? 'nessun PC (non ha ancora una casa)' : r.residente.qui ? `${r.residente.nome} (questo PC)` : r.residente.nome
  const dove = verso.qui ? `${verso.nome} (questo PC)` : verso.nome
  const file = r.spazioDrive !== undefined ? `${r.spazioDrive.file} file sul Drive` : 'i file della cartella'
  const alLavoro = r.alLavoro ?? 0
  const altrove = r.cartelle.filter((c) => c.pc !== verso.pc).map((c) => c.nome)
  const righe = [
    `Da: ${da}`,
    `Verso: ${dove}`,
    `Cosa: ${r.chat} chat e ${file}. ${dove} confronta le copie, prende quello che c’è solo altrove e unisce.`,
    alLavoro > 0
      ? `Chat aperte: ${alLavoro} ${alLavoro === 1 ? 'sta lavorando' : 'stanno lavorando'}; il trasloco aspetta che finiscano il turno, poi le riapre su ${verso.nome}.`
      : `Chat aperte: si riaprono su ${verso.nome}; sugli altri PC le guardi dal vivo.`,
    altrove.length > 0
      ? `Le copie su ${altrove.join(', ')} vanno nel recupero solo alla fine, dopo il confronto (30 giorni, «Annulla tutto»).`
      : 'Niente si cancella: «Annulla tutto» rimette com’era per 30 giorni.'
  ]
  return {
    titolo: `Sposta «${r.nome}» su ${verso.nome}?`,
    righe,
    conferma: `Conferma: sposta su ${verso.nome}`,
    ...(verso.acceso ? {} : { avviso: `${verso.nome} adesso risulta spento: provo lo stesso (il ponte passa anche dal Drive). Se non risponde non cambia niente, e lo rifai quando è acceso.` })
  }
}
