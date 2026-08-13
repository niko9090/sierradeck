import { describe, it, expect } from 'vitest'
import { paginaClient, MANIFESTO } from '../../src/main/client-pagina'

const html = paginaClient()
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'))

describe('lo script della pagina', () => {
  it('è JavaScript valido', () => {
    // Un errore di sintassi qui non si vede da nessuna parte: la pagina resta
    // **nera**, senza un messaggio, senza niente da premere. È successo, ed è
    // la ragione per cui questo test esiste: il testo vive dentro un template
    // JavaScript, e una virgoletta scappata male non la nota nessuno.
    expect(() => new Function(script)).not.toThrow()
  })

  it('si puo affidare un lavoro, e la cartella si sceglie dalla lista', () => {
    // Delegare e' il gesto che ha piu' senso da un telefono: si dice cosa si
    // vuole e si va. Le domande della preparazione arrivano sulla stessa
    // pagina, dove c'e' gia' il campo per rispondere.
    const p = paginaClient()
    expect(p).toContain('/api/autopilota/crea')
    expect(p).toContain('Affida un lavoro')
    // Per indice, come per l'apertura di una chat: un percorso di Windows
    // dentro un onclick vorrebbe dire raddoppiare i backslash e sperare.
    expect(p).toContain('scegliPer(')
  })

  it('la regex del codice cerca sei cifre, non la lettera d', () => {
    // `\d` scritto una volta sola dentro un template arriva alla pagina come
    // una «d»: la scansione del QR non accoppiava niente e nessuno capiva
    // perché.
    const riga = script.split(String.fromCharCode(10)).find((r) => r.includes('codice=(')) ?? ''
    const regex = new RegExp(riga.slice(riga.indexOf('/') + 1, riga.lastIndexOf('/')))
    // La prova vera non è che il testo somigli a una regex: è che **trovi** un
    // codice. Con la lettera «d» al posto della classe di cifre, un controllo
    // sul testo sarebbe passato lo stesso e il QR avrebbe continuato a non
    // funzionare.
    expect(regex.test('#codice=123456')).toBe(true)
  })

  it('accoppia leggendo il codice dall indirizzo', () => {
    expect(script).toContain('accoppiaDalQr')
    expect(script).toContain('location.hash')
  })

  it('ogni tasto della pagina esiste davvero', () => {
    // Un onclick che chiama una funzione mai definita non dà errore finché
    // qualcuno non lo preme: il tasto sembra esserci e non fa niente. Qui si
    // raccolgono tutti i nomi chiamati negli onclick e si controlla che siano
    // scritti da qualche parte.
    const chiamati = new Set<string>()
    for (const m of script.matchAll(/onclick="([a-zA-Z]+)\(/g)) chiamati.add(m[1] ?? '')
    for (const nome of chiamati) {
      const definita =
        script.includes(`window.${nome} =`) || script.includes(`function ${nome}(`)
      expect(definita, `${nome} non è definita`).toBe(true)
    }
    // E le tre cose che da fuori servono davvero: guardare dentro una chat,
    // aprirne una nuova, e sapere dove.
    expect(chiamati.has('guarda')).toBe(true)
    expect(chiamati.has('scegliCartella')).toBe(true)
    expect(chiamati.has('apriIn')).toBe(true)
  })

  it('qualunque errore lascia qualcosa a schermo', () => {
    // Il nero è il peggior esito: non dice se manca la rete, se la chiave non
    // vale più o se c'è un difetto, e non lascia niente da premere.
    expect(script).toContain("addEventListener('error'")
    expect(script).toContain('ingresso(')
  })
})

describe('il manifesto', () => {
  it('dice come si chiama e come si apre', () => {
    expect(MANIFESTO.name).toContain('SierraDeck')
    expect(MANIFESTO.display).toBe('standalone')
  })
})

describe('la chiave che non si riscrive ogni volta', () => {
  it('la pagina la fa sapere all app quando si accoppia', () => {
    // La chiave nasce nella pagina e finiva solo nel suo archivio locale:
    // l'app non la vedeva, e la guardia mandava le sue richieste con una
    // chiave vuota. Il servizio che esiste per avvisarti non ha mai avvisato.
    expect(script).toContain('SierraDeckApp.ricorda')
  })

  it('e la richiede all app quando non ce l ha', () => {
    expect(script).toContain('chiaveSalvata()')
  })

  it('senza il ponte funziona lo stesso: nel browser non c e', () => {
    // Il try attorno è ciò che permette alla stessa pagina di vivere in un
    // browser qualunque, dove `SierraDeckApp` non esiste.
    const riga = script.slice(script.indexOf('chiaveSalvata()') - 200, script.indexOf('chiaveSalvata()') + 80)
    expect(riga).toContain('try')
  })
})

describe('il logo', () => {
  it('c e anche nella schermata del codice', () => {
    // Si arriva da un QR o da un link e la prima cosa che si vede è un campo
    // con sei puntini: senza un segno, non si sa nemmeno dove si è finiti.
    const ingresso = html.slice(html.indexOf('function ingresso('), html.indexOf('function ingresso(') + 600)
    expect(ingresso).toContain('data:image/svg+xml')
  })
})

describe('il terminale, con i suoi colori', () => {
  it('la pagina porta dentro l interprete dei colori, per intero', () => {
    // Non una copia riscritta a mano: la stessa funzione che i test verificano,
    // incollata dentro. Due copie divergono al primo ritocco.
    const p = paginaClient()
    expect(p).toContain('function ansiInHtml')
    expect(p).toContain('#54c07a')
  })

  it('mostra le righe vestite, e ripiega su quelle ripulite', () => {
    // Una versione vecchia dell'app puo' non mandarle: meglio un terminale
    // sbiancato che uno schermo vuoto.
    const p = paginaClient()
    expect(p).toContain('righeGrezze')
    expect(p).toContain('righeDentro.length')
  })
})

describe('l invito a installare l app', () => {
  /**
   * Le funzioni vere della pagina, prese dallo script e rese chiamabili.
   *
   * Non una riscrittura: un secondo esemplare divergerebbe al primo ritocco, e
   * questo difetto e' nato proprio da un controllo che sembrava giusto e non
   * lo era.
   */
  const estrai = (nome: string): string => {
    const inizio = script.indexOf(`function ${nome}(`)
    expect(inizio, `${nome} non e nella pagina`).toBeGreaterThan(-1)
    let profondita = 0
    for (let i = script.indexOf('{', inizio); i < script.length; i++) {
      if (script[i] === '{') profondita++
      else if (script[i] === '}' && --profondita === 0) return script.slice(inizio, i + 1)
    }
    throw new Error(`${nome} non si chiude`)
  }
  const decidi = new Function(
    `${estrai('versioneApp')}\n${estrai('piuNuovaApp')}\n${estrai('proponeApp')}
     return { proponeApp, versioneApp, piuNuovaApp }`
  ) as () => {
    proponeApp: (ua: string, disponibile: string, rifiutato: unknown, comeApp: boolean) => boolean
    versioneApp: (ua: string) => string
    piuNuovaApp: (mia: string, trovata: string) => boolean
  }
  const { proponeApp, versioneApp, piuNuovaApp } = decidi()

  const CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126'
  const DENTRO = `${CHROME} SierraDeck/1.3.0`

  it('legge dallo user agent la versione dell app che sta guardando', () => {
    // Una WebView non e' mai `display-mode: standalone`: senza questa
    // dichiarazione la pagina non ha nessun modo di sapere dove gira.
    expect(versioneApp(DENTRO)).toBe('1.3.0')
    expect(versioneApp(CHROME)).toBe('')
  })

  it('non propone a chi ha gia quella versione installata', () => {
    // Il difetto vero, provato sul telefono: la banda offriva di scaricare la
    // 1.3.0 a chi stava usando la 1.3.0, e premere non faceva niente.
    expect(proponeApp(DENTRO, '1.3.0', null, false)).toBe(false)
  })

  it('propone dentro l app solo un sorpasso vero', () => {
    expect(proponeApp(`${CHROME} SierraDeck/1.2.0`, '1.3.0', null, false)).toBe(true)
    expect(proponeApp(`${CHROME} SierraDeck/1.3.0`, '1.2.9', null, false)).toBe(false)
    expect(piuNuovaApp('0.9.0', '0.10.0')).toBe(true)
  })

  it('nel browser Android l app si propone ancora: li non ce l ha', () => {
    expect(proponeApp(CHROME, '1.3.0', null, false)).toBe(true)
  })

  it('tace su un computer, a chi ha detto no, e se non c e niente da scaricare', () => {
    expect(proponeApp('Mozilla/5.0 (Windows NT 10.0)', '1.3.0', null, false)).toBe(false)
    expect(proponeApp(CHROME, '1.3.0', '1', false)).toBe(false)
    expect(proponeApp(CHROME, undefined as unknown as string, null, false)).toBe(false)
  })

  it('il no vale per quella versione, non per sempre', () => {
    // Altrimenti un «No, grazie» premuto una volta spegneva ogni avviso
    // futuro: chi l'ha premuto non saprebbe piu' di nessun aggiornamento.
    expect(proponeApp(DENTRO, '1.3.0', '1.3.0', false)).toBe(false)
    expect(proponeApp(`${CHROME} SierraDeck/1.2.0`, '1.4.0', '1.3.0', false)).toBe(true)
  })
})
