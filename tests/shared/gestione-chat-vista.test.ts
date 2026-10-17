import { describe, it, expect } from 'vitest'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { TESTI_AZIONI_CHAT, FRASE_SVUOTA, vistaSpazio, totaleSelezione, scadenzaRecupero, messaggioEsito, type VoceSpazio, type ChatInRecupero, type EsitoAzioni } from '../../src/shared/gestione-chat'
import {
  commutaScelta, confermaArchiviaChat, confermaChiediSvuota, confermaChiudiChat, confermaEliminaChat, fraseSvuotaGiusta, nomeScelte,
  ordinaVoci, quandoUsata, rifiutiDi, riepilogoSelezione, riepilogoSpazio, rigaArchiviata, rigaRecupero, rigaVoce, scegliTutte, scelteValide
} from '../../src/shared/gestione-chat-vista'
import { byteLeggibili } from '../../src/shared/spazio-drive'

/**
 * Le regole della vista della gestione delle chat (0.79.0), uguali per PC,
 * pagina e app. L'app le rifà in `GestioneChat.kt` e le controlla
 * (`GestioneChatTest`) sui casi scritti qui in
 * `android/app/src/test/resources/gestione-chat/vista-0.79.json`. `AGGIORNA=1` riscrive.
 */
const ORA = Date.parse('2026-10-17T12:00:00Z')
const GIORNO = 86_400_000
const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'
const S3 = '33333333-3333-4333-8333-333333333333'

function voci(): VoceSpazio[] {
  return [
    { sessione: S1, titolo: 'piccola recente', slug: 'E--prova', byte: 2048, parti: { trascrizione: 2048 }, ultimaAttivita: new Date(ORA - 2 * 3600_000).toISOString(), archiviata: false, aperta: false },
    { sessione: S2, titolo: 'grande vecchia', slug: 'E--prova', byte: 12 * 1024 * 1024, parti: { trascrizione: 4 * 1024 * 1024, 'sotto-agenti': 8 * 1024 * 1024 }, ultimaAttivita: new Date(ORA - 90 * GIORNO).toISOString(), archiviata: true, aperta: false },
    { sessione: S3, titolo: 'al lavoro', slug: 'E--prova', byte: 340 * 1024, parti: { trascrizione: 340 * 1024 }, ultimaAttivita: new Date(ORA - GIORNO).toISOString(), archiviata: false, aperta: true, nonEliminabile: '«al lavoro» sta lavorando: aspetta che finisca, poi chiudila.' }
  ]
}

function recupero(): ChatInRecupero {
  const quando = new Date(ORA - 3 * GIORNO).toISOString()
  return { id: 'r-1', sessione: S2, titolo: 'grande vecchia', slug: 'E--prova', quando, scadeIl: scadenzaRecupero(quando), byte: 5 * 1024 * 1024, file: [], drive: { pulizia: 'p-1', file: 1, byte: 10 } }
}

function esitoMisto(): EsitoAzioni {
  return { azione: 'elimina', esiti: [{ sessione: S1, ok: true, byte: 2048 }, { sessione: S3, ok: false, motivo: '«al lavoro» sta lavorando: aspetta che finisca, poi chiudila.' }], fatte: 1, rifiutate: 1, byte: 2048, messaggio: messaggioEsito('elimina', 1, 1, 2048, byteLeggibili) }
}

function casi(): unknown {
  const v = voci()
  const vista = vistaSpazio(v, { versione: 1, chat: [recupero()] })
  const sel = totaleSelezione(v, [S1, S3])
  return {
    testi: TESTI_AZIONI_CHAT,
    frase: FRASE_SVUOTA,
    conferme: {
      chiudi: confermaChiudiChat('«x»'),
      archivia: confermaArchiviaChat('3 chat'),
      elimina: confermaEliminaChat('«x»', '12 MB', false),
      eliminaDrive: confermaEliminaChat('«x»', '12 MB', true),
      archiviaN: confermaArchiviaChat('3 chat', 3),
      eliminaN: confermaEliminaChat('2 chat', '12 MB', false, 2),
      eliminaDriveN: confermaEliminaChat('2 chat', '12 MB', true, 2),
      chiediSvuota: confermaChiediSvuota(false),
      chiediSvuotaDrive: confermaChiediSvuota(true)
    },
    nomi: { una: nomeScelte(['x']), tre: nomeScelte(['a', 'b', 'c']) },
    quando: {
      adesso: new Date(ORA).toISOString(),
      casi: [undefined, ORA - 3600_000, ORA - GIORNO, ORA - 5 * GIORNO, ORA - 90 * GIORNO, ORA - 800 * GIORNO].map((t) => {
        const iso = t === undefined ? undefined : new Date(t).toISOString()
        return { iso: iso ?? null, testo: quandoUsata(iso, ORA) }
      })
    },
    // La risposta di /api/chat/gestione/spazio con la selezione, come la manda il PC.
    spazio: { ...vista, selezione: sel },
    righe: vista.chat.map((x) => rigaVoce(x, ORA)),
    riepilogo: riepilogoSpazio(vista),
    riepilogoSelezione: riepilogoSelezione(sel),
    ordine: { spazio: ordinaVoci(v, 'spazio').map((x) => x.sessione), uso: ordinaVoci(v, 'uso').map((x) => x.sessione) },
    recupero: { chat: [recupero()], byte: recupero().byte, riga: rigaRecupero(recupero(), ORA) },
    archiviata: { voce: { sessione: S2, il: new Date(ORA - GIORNO).toISOString(), titolo: 'grande vecchia' }, riga: rigaArchiviata({ sessione: S2, il: new Date(ORA - GIORNO).toISOString() }) },
    esito: esitoMisto(),
    rifiuti: rifiutiDi(esitoMisto(), (s) => v.find((x) => x.sessione === s)?.titolo)
  }
}

describe('la vista della gestione delle chat', () => {
  it('l’ordine: dalla più grande, o dalla meno usata', () => {
    expect(ordinaVoci(voci(), 'spazio').map((x) => x.titolo)).toEqual(['grande vecchia', 'al lavoro', 'piccola recente'])
    expect(ordinaVoci(voci(), 'uso').map((x) => x.titolo)).toEqual(['grande vecchia', 'al lavoro', 'piccola recente'])
    // Senza data viene prima nell'ordine «meno usate»: non si sa quando è stata usata l'ultima volta.
    const senza = [...voci(), { ...voci()[0]!, sessione: '44444444-4444-4444-8444-444444444444', titolo: 'senza data', ultimaAttivita: undefined } as VoceSpazio]
    expect(ordinaVoci(senza, 'uso')[0]!.titolo).toBe('senza data')
  })

  it('la scelta: commuta, «scegli tutte» solo le eliminabili, e le scelte sparite escono', () => {
    expect(commutaScelta([S1], S2)).toEqual([S1, S2])
    expect(commutaScelta([S1, S2], S1)).toEqual([S2])
    expect(scegliTutte(voci())).toEqual([S1, S2])
    expect(scelteValide([S1, 'sparita', S3], voci())).toEqual([S1, S3])
  })

  it('il totale della scelta conta anche quelle che non si possono eliminare, e lo dice', () => {
    const sel = totaleSelezione(voci(), [S1, S3])
    expect(riepilogoSelezione(sel)).toBe('2 chat scelte · 342 KB · 1 non si può eliminare · eliminandole liberi 2,0 KB')
    expect(riepilogoSelezione(totaleSelezione(voci(), []))).toBe('Nessuna chat scelta.')
  })

  it('la riga in cima e quella di ogni chat', () => {
    const vista = vistaSpazio(voci(), { versione: 1, chat: [recupero()] })
    expect(riepilogoSpazio(vista)).toBe('3 chat · 12 MB · si possono liberare 12 MB · nel recupero 1 chat (5,0 MB)')
    expect(rigaVoce(voci()[1]!, ORA)).toBe('12 MB · usata 3 mesi fa · archiviata')
    expect(rigaVoce(voci()[2]!, ORA)).toBe('340 KB · usata ieri · aperta')
  })

  it('da quanto non si usa', () => {
    expect(quandoUsata(undefined, ORA)).toBe('mai usata')
    expect(quandoUsata('non è una data', ORA)).toBe('mai usata')
    expect(quandoUsata(new Date(ORA - 3600_000).toISOString(), ORA)).toBe('usata oggi')
    expect(quandoUsata(new Date(ORA - 5 * GIORNO).toISOString(), ORA)).toBe('usata 5 giorni fa')
    expect(quandoUsata(new Date(ORA - 800 * GIORNO).toISOString(), ORA)).toBe('usata 2 anni fa')
  })

  it('le conferme: corte, con lo spazio, il recupero e il Drive', () => {
    expect(confermaEliminaChat('«x»', '12 MB', false)).toEqual({ titolo: 'Eliminare «x» dal PC?', testo: 'Libera 12 MB. Per 30 giorni resta nel recupero e la rimetti con «Ripristina». La copia sul Drive resta.', azione: 'Elimina dal PC' })
    expect(confermaEliminaChat('«x»', '12 MB', true).testo).toContain('Anche la copia sul Drive va nel recupero del Drive.')
    expect(confermaChiediSvuota(false).testo).toContain('scrivere SVUOTA')
    expect(nomeScelte(['a', 'b'])).toBe('2 chat')
    // Più chat: i verbi al plurale (giro dal vero del 17/10).
    expect(confermaEliminaChat('2 chat', '646 KB', false, 2).testo).toBe('Libera 646 KB. Per 30 giorni restano nel recupero e le rimetti con «Ripristina». Le copie sul Drive restano.')
    expect(confermaEliminaChat('2 chat', '646 KB', true, 2).testo).toContain('Anche le copie sul Drive vanno')
    expect(confermaArchiviaChat('2 chat', 2).testo).toBe('Escono dagli elenchi, ma non si cancella niente: le ritrovi in «Archiviate».')
    expect(rigaVoce(voci()[1]!, ORA, false)).toBe('usata 3 mesi fa · archiviata')
    // Testi corti (regola del 12/10): niente paragrafi nelle conferme.
    for (const c of [confermaChiudiChat('«x»'), confermaArchiviaChat('«x»'), confermaEliminaChat('«x»', '1 MB', true), confermaChiediSvuota(true)]) expect(c.testo.length).toBeLessThan(170)
  })

  it('la parola per svuotare', () => {
    expect(fraseSvuotaGiusta('svuota ')).toBe(true)
    expect(fraseSvuotaGiusta('sì')).toBe(false)
    expect(fraseSvuotaGiusta('')).toBe(false)
  })

  it('il recupero e le archiviate', () => {
    expect(rigaRecupero(recupero(), ORA)).toBe('5,0 MB · eliminata il 14/10 · si svuota fra 27 giorni · anche dal Drive')
    expect(rigaRecupero({ ...recupero(), scadeIl: new Date(ORA - 1).toISOString(), drive: undefined }, ORA)).toBe('5,0 MB · eliminata il 14/10 · si svuota oggi')
    expect(rigaArchiviata({ sessione: S2, il: '2026-10-16T08:00:00Z' })).toBe('archiviata il 16/10')
  })

  it('i rifiuti: la chat e il motivo del PC', () => {
    expect(rifiutiDi(esitoMisto(), (s) => (s === S3 ? 'al lavoro' : undefined))).toEqual([{ sessione: S3, titolo: 'al lavoro', motivo: '«al lavoro» sta lavorando: aspetta che finisca, poi chiudila.' }])
    expect(rifiutiDi({ esiti: [{ sessione: S1, ok: false }] }, () => undefined)).toEqual([{ sessione: S1, titolo: '11111111', motivo: 'Non si è potuta toccare.' }])
  })

  it('i casi d’esempio sono quelli che l’app legge nei suoi test', () => {
    const file = join(__dirname, '..', '..', 'android', 'app', 'src', 'test', 'resources', 'gestione-chat', 'vista-0.79.json')
    const atteso = `${JSON.stringify(casi(), null, 2)}\n`
    if (process.env.AGGIORNA === '1' || !existsSync(file)) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, atteso) }
    expect(readFileSync(file, 'utf8').replace(/\r\n/g, '\n')).toBe(atteso)
  })
})
