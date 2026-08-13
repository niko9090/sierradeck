import { describe, it, expect } from 'vitest'
import {
  componiPromptIntervista, leggiEsitoIntervista, giaChiesta, type EsitoIntervista, TEMPO_PREPARAZIONE_MS } from '../../src/autopilot-host/intervista'

const OBIETTIVO = 'Sistema il lettore dei file di configurazione'
const CWD = 'C:\\progetto'

describe('componiPromptIntervista', () => {
  it('contiene obiettivo e cartella', () => {
    const p = componiPromptIntervista(OBIETTIVO, CWD, [])
    expect(p).toContain(OBIETTIVO)
    expect(p).toContain(CWD)
  })

  it('riporta le risposte gia avute, cosi non richiede due volte la stessa cosa', () => {
    const p = componiPromptIntervista(OBIETTIVO, CWD, [
      { domanda: 'Quale formato?', risposta: 'YAML' }
    ])
    expect(p).toContain('Quale formato?')
    expect(p).toContain('YAML')
  })

  it('ammette una domanda sola per volta', () => {
    // Cinque domande insieme sono un modulo da compilare: e' esattamente cio'
    // che questo meccanismo esiste per evitare.
    expect(componiPromptIntervista(OBIETTIVO, CWD, [])).toContain('{"domanda": "la tua domanda"}')
  })

  it('dice di decidere da solo e di chiedere solo l indecidibile', () => {
    // «Non voglio essere tempestato di domande, se no parlavo con la chat io»:
    // e' il criterio con cui questo prompt va giudicato.
    const p = componiPromptIntervista(OBIETTIVO, CWD, []).toLowerCase()
    expect(p).toContain('decidi tu')
    expect(p).toContain('ciò che soltanto l’utente può sapere'.toLowerCase())
    expect(p).toContain('nel dubbio, parti')
  })

  it('vieta di ripetere una domanda gia fatta', () => {
    expect(componiPromptIntervista(OBIETTIVO, CWD, []).toLowerCase())
      .toContain('non ripetere una domanda già fatta')
  })

  it('chiede di guardare il progetto prima di domandare', () => {
    // Le domande a cui il codice risponde da solo fanno perdere tempo a
    // entrambi: il framework di test si scopre leggendo package.json.
    const p = componiPromptIntervista(OBIETTIVO, CWD, []).toLowerCase()
    expect(p).toContain('guarda')
  })

  it('descrive la forma delle due risposte possibili', () => {
    const p = componiPromptIntervista(OBIETTIVO, CWD, [])
    expect(p).toContain('"domanda"')
    expect(p).toContain('"pronto"')
    expect(p).toContain('"criteri"')
  })
})

describe('leggiEsitoIntervista', () => {
  it('legge una domanda', () => {
    const e = leggiEsitoIntervista('{"domanda": "In quale cartella stanno i file?"}')
    expect(e).toEqual({ tipo: 'domanda', testo: 'In quale cartella stanno i file?' })
  })

  it('legge una configurazione pronta', () => {
    const e = leggiEsitoIntervista(`{
      "pronto": true,
      "nome": "Lettore YAML",
      "obiettivo": "Il lettore accetta anche YAML",
      "criteri": [
        { "descrizione": "i test passano", "comando": "npm test" },
        { "descrizione": "il README lo documenta" }
      ]
    }`)
    expect(e?.tipo).toBe('pronto')
    if (e?.tipo === 'pronto') {
      expect(e.nome).toBe('Lettore YAML')
      expect(e.criteri).toHaveLength(2)
      expect(e.criteri[0]?.comando).toBe('npm test')
      expect(e.criteri[1]?.comando).toBeUndefined()
    }
  })

  it('legge un JSON circondato da chiacchiere', () => {
    const e = leggiEsitoIntervista('Ho capito.\n{"domanda": "Quale ambiente?"}\nGrazie.')
    expect(e?.tipo).toBe('domanda')
  })

  it('restituisce undefined su un testo senza JSON', () => {
    expect(leggiEsitoIntervista('non ho capito')).toBeUndefined()
  })

  it('rifiuta una configurazione senza criteri', () => {
    // Senza criteri l'autopilota non saprebbe quando fermarsi: e' il motivo per
    // cui l'intervista esiste, e non puo' finire senza averli ottenuti.
    expect(leggiEsitoIntervista('{"pronto": true, "criteri": []}')).toBeUndefined()
  })

  it('rifiuta una domanda vuota', () => {
    expect(leggiEsitoIntervista('{"domanda": "   "}')).toBeUndefined()
  })

  it('scarta i criteri malformati e tiene i buoni', () => {
    const e = leggiEsitoIntervista(`{
      "pronto": true,
      "criteri": [{ "descrizione": "buono" }, { "comando": "senza descrizione" }, 42]
    }`)
    expect(e?.tipo).toBe('pronto')
    if (e?.tipo === 'pronto') expect(e.criteri.map((c) => c.descrizione)).toEqual(['buono'])
  })

  it('la domanda vince quando ci sono entrambe', () => {
    // Se ha ancora qualcosa da chiedere, non e' pronto: partire con una
    // configurazione mezza indovinata e' peggio che fare un'altra domanda.
    const e = leggiEsitoIntervista('{"domanda": "Ancora una cosa", "pronto": true, "criteri": [{"descrizione": "x"}]}')
    expect(e?.tipo).toBe('domanda')
  })
})

describe('la configurazione prodotta', () => {
  it('conserva il nome quando c e, e ripiega sull obiettivo quando manca', () => {
    const conNome = leggiEsitoIntervista('{"pronto": true, "nome": "Corto", "criteri": [{"descrizione": "x"}]}')
    expect((conNome as EsitoIntervista & { tipo: 'pronto' }).nome).toBe('Corto')

    const senzaNome = leggiEsitoIntervista('{"pronto": true, "criteri": [{"descrizione": "x"}]}')
    expect((senzaNome as EsitoIntervista & { tipo: 'pronto' }).nome).toBeUndefined()
  })
})

describe('giaChiesta', () => {
  it('riconosce la stessa domanda riformulata', () => {
    // E' il caso vero: tre autopiloti sullo stesso obiettivo hanno chiesto la
    // stessa cosa sul contratto elettrico con parole appena diverse, e l'utente
    // si e' ritrovato a rispondere tre volte — «ti ho gia risposto prima».
    const scambi = [{
      domanda: 'Sui consumi: la bolletta indica potenza impegnata 3 kW, confermi il limite contrattuale?',
      risposta: 'la mia fornitura e 3kw'
    }]
    expect(giaChiesta(scambi, 'Sui consumi: confermi che il limite contrattuale della bolletta e 3 kW impegnati?')).toBe(true)
  })

  it('lascia passare una domanda su un altro argomento', () => {
    const scambi = [{ domanda: 'Il limite contrattuale e 3 kW?', risposta: 'si' }]
    expect(giaChiesta(scambi, 'Vuoi che tolga anche la routine dell orologio in carica?')).toBe(false)
  })

  it('senza domande precedenti non c e niente di gia chiesto', () => {
    expect(giaChiesta([], 'una domanda qualunque')).toBe(false)
  })

  it('non si fa ingannare dalle parole di servizio', () => {
    // Due domande diverse condividono «vuoi», «che», «il»: se contassero,
    // qualunque domanda risulterebbe gia' fatta e non se ne farebbe piu' una.
    const scambi = [{ domanda: 'Vuoi che il report sia in italiano?', risposta: 'si' }]
    expect(giaChiesta(scambi, 'Vuoi che il backup venga fatto ogni notte?')).toBe(false)
  })
})

describe('prompt che non ammette domande', () => {
  it('chiede la configurazione e vieta di domandare ancora', () => {
    // Serve all'ultimo giro e quando l'intervistatore ripete una domanda: senza,
    // l'intervista puo' andare avanti a chiedere finche' l'utente si stanca.
    const p = componiPromptIntervista('obiettivo', 'C:/p', [], { senzaDomande: true })
    expect(p).toContain('NON fare domande')
    expect(p).not.toContain('{"domanda"')
  })

  it('normalmente le domande restano possibili', () => {
    expect(componiPromptIntervista('obiettivo', 'C:/p', [])).toContain('{"domanda"')
  })
})

describe('quanto tempo ha per prepararsi', () => {
  it('molto piu di un giudizio, perche qui non aspetta nessuno', () => {
    // Sul campo: la preparazione di un autopilota su un progetto vero e' stata
    // uccisa a cinque minuti, tre volte di fila, e quello che si leggeva era
    // «la preparazione si e guastata». Non era guasta: doveva leggersi un
    // progetto intero prima di sapere quando il lavoro sara' finito, e cinque
    // minuti sono il tempo di un giudizio - dove pero' c'e' una chat ferma che
    // aspetta, e qui no.
    expect(TEMPO_PREPARAZIONE_MS).toBeGreaterThanOrEqual(15 * 60_000)
  })
})
