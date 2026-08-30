import { describe, it, expect } from 'vitest'
import {
  avanti, cronologiaVuota, filtraVoci, indietro, nomeLibero, nuovaSelezione, ordinaVoci,
  prendiTutto, prossimoOrdine, puoAvanti, puoIndietro, vaiA, vociVisibili,
  accantoA, cartellaDi, separatoreDi, unisciPercorso, leggiPermessi, permessiInLettere,
  type VoceSfogliabile
} from '@shared/sfoglia'

function v(nome: string, over: Partial<VoceSfogliabile> = {}): VoceSfogliabile {
  return { nome, percorso: `/x/${nome}`, cartella: false, dimensione: 0, quando: 0, ...over }
}

describe('ordinare', () => {
  it('mette i numeri in ordine da persona, non da alfabeto', () => {
    // `parte10` prima di `parte2` è quello che fa un confronto fra stringhe, ed
    // è il motivo per cui ogni cartella di backup o di log sembra mescolata.
    const ordinate = ordinaVoci([v('parte10.txt'), v('parte2.txt'), v('parte1.txt')], { per: 'nome', verso: 'su' })
    expect(ordinate.map((x) => x.nome)).toEqual(['parte1.txt', 'parte2.txt', 'parte10.txt'])
  })

  it('le cartelle stanno sempre in testa, anche al contrario', () => {
    // Sono la struttura, non il contenuto: chi rovescia l'ordine per data vuole
    // i file recenti in cima, non le cartelle in fondo dove non le cerca.
    const voci = [v('bbb.txt'), v('aaa', { cartella: true })]
    for (const verso of ['su', 'giu'] as const) {
      expect(ordinaVoci(voci, { per: 'nome', verso })[0]?.nome).toBe('aaa')
    }
  })

  it('per dimensione e per data, nei due versi', () => {
    const voci = [v('a', { dimensione: 10, quando: 300 }), v('b', { dimensione: 5, quando: 100 })]
    expect(ordinaVoci(voci, { per: 'dimensione', verso: 'su' })[0]?.nome).toBe('b')
    expect(ordinaVoci(voci, { per: 'dimensione', verso: 'giu' })[0]?.nome).toBe('a')
    expect(ordinaVoci(voci, { per: 'quando', verso: 'giu' })[0]?.nome).toBe('a')
  })

  it('a parita decide il nome: le righe non devono ballare', () => {
    // Due file della stessa dimensione con un ordine instabile cambiano posto a
    // ogni ricarico, sotto il puntatore di chi sta per cliccare.
    const voci = [v('zeta', { dimensione: 7 }), v('alfa', { dimensione: 7 })]
    expect(ordinaVoci(voci, { per: 'dimensione', verso: 'su' }).map((x) => x.nome))
      .toEqual(['alfa', 'zeta'])
  })

  it('cambiando colonna parte dal verso che serve', () => {
    // Chi clicca «dimensione» cerca il file grosso, non quello da zero byte:
    // partire sempre crescente costringe a due clic ogni volta.
    expect(prossimoOrdine({ per: 'nome', verso: 'su' }, 'dimensione')).toEqual({ per: 'dimensione', verso: 'giu' })
    expect(prossimoOrdine({ per: 'quando', verso: 'giu' }, 'nome')).toEqual({ per: 'nome', verso: 'su' })
    // Stessa colonna: si rovescia.
    expect(prossimoOrdine({ per: 'nome', verso: 'su' }, 'nome')).toEqual({ per: 'nome', verso: 'giu' })
  })
})

describe('filtrare', () => {
  it('i nascosti non si vedono, se non li chiedi', () => {
    const voci = [v('.git', { cartella: true }), v('leggimi.md')]
    expect(filtraVoci(voci).map((x) => x.nome)).toEqual(['leggimi.md'])
    expect(filtraVoci(voci, { nascosti: true })).toHaveLength(2)
  })

  it('il testo non nasconde le cartelle', () => {
    // Il filtro serve a trovare un file in una cartella affollata: nascondere
    // le cartelle mentre lo si cerca toglie l'unica via per cercarlo altrove.
    const voci = [v('immagini', { cartella: true }), v('conto.pdf'), v('nota.txt')]
    expect(filtraVoci(voci, { testo: 'conto' }).map((x) => x.nome)).toEqual(['immagini', 'conto.pdf'])
  })

  it('non guarda le maiuscole', () => {
    expect(filtraVoci([v('Relazione.PDF')], { testo: 'relazione' })).toHaveLength(1)
  })
})

describe('scegliere', () => {
  const visibili = [v('a'), v('b'), v('c'), v('d')]
  const p = (n: string): string => `/x/${n}`

  it('un clic sceglie quello e basta', () => {
    const s = nuovaSelezione(visibili, { presi: [p('a'), p('b')] }, p('c'))
    expect(s.presi).toEqual([p('c')])
    expect(s.ancora).toBe(p('c'))
  })

  it('con Ctrl aggiunge e toglie', () => {
    const uno = nuovaSelezione(visibili, { presi: [p('a')] }, p('c'), { ctrl: true })
    expect(uno.presi).toEqual([p('a'), p('c')])
    expect(nuovaSelezione(visibili, uno, p('a'), { ctrl: true }).presi).toEqual([p('c')])
  })

  it('con Maiusc prende l intervallo, nei due sensi', () => {
    const da = nuovaSelezione(visibili, { presi: [] }, p('b'))
    expect(nuovaSelezione(visibili, da, p('d'), { shift: true }).presi)
      .toEqual([p('b'), p('c'), p('d')])
    expect(nuovaSelezione(visibili, da, p('a'), { shift: true }).presi)
      .toEqual([p('a'), p('b')])
  })

  it('l ancora non si sposta: l intervallo si allarga e si stringe', () => {
    // Senza, tenendo premuto Maiusc e cliccando su e giù la selezione cresce e
    // non torna più indietro — perché ogni Maiusc ripartirebbe dalla fine di
    // quello prima.
    const da = nuovaSelezione(visibili, { presi: [] }, p('a'))
    const largo = nuovaSelezione(visibili, da, p('d'), { shift: true })
    const stretto = nuovaSelezione(visibili, largo, p('b'), { shift: true })
    expect(stretto.presi).toEqual([p('a'), p('b')])
  })

  it('l intervallo segue l ordine che si vede, non quello del disco', () => {
    // Chi tiene premuto Maiusc indica due righe sullo schermo: prendere quello
    // che sta in mezzo in un altro ordine sceglierebbe file mai visti.
    const alContrario = ordinaVoci(visibili, { per: 'nome', verso: 'giu' })
    const da = nuovaSelezione(alContrario, { presi: [] }, p('d'))
    expect(nuovaSelezione(alContrario, da, p('b'), { shift: true }).presi)
      .toEqual([p('d'), p('c'), p('b')])
  })

  it('prendi tutto prende quello che si vede, non quello che c e', () => {
    const solo = vociVisibili([v('.nascosto'), v('a'), v('b')], { per: 'nome', verso: 'su' })
    expect(prendiTutto(solo).presi).toEqual([p('a'), p('b')])
  })
})

describe('andare avanti e indietro', () => {
  it('ricorda la strada', () => {
    let c = cronologiaVuota('/casa')
    c = vaiA(c, '/casa/uno')
    c = vaiA(c, '/casa/uno/due')
    expect(puoIndietro(c)).toBe(true)
    expect(puoAvanti(c)).toBe(false)
    const giu = indietro(c)
    expect(giu.percorso).toBe('/casa/uno')
    expect(puoAvanti(giu.storia)).toBe(true)
    expect(avanti(giu.storia).percorso).toBe('/casa/uno/due')
  })

  it('una strada nuova butta quella che stava davanti', () => {
    // Tenerla darebbe un «avanti» verso un ramo che non hai scelto.
    let c = cronologiaVuota('/a')
    c = vaiA(c, '/b')
    c = vaiA(c, '/c')
    const giu = indietro(indietro(c).storia)
    const altrove = vaiA(giu.storia, '/z')
    expect(puoAvanti(altrove)).toBe(false)
    expect(altrove.voci).toEqual(['/a', '/z'])
  })

  it('ricaricare la stessa cartella non e un passo', () => {
    const c = vaiA(cronologiaVuota('/a'), '/a')
    expect(c.voci).toEqual(['/a'])
  })

  it('ai due estremi non si muove e non si rompe', () => {
    const c = cronologiaVuota('/a')
    expect(indietro(c).percorso).toBeUndefined()
    expect(avanti(c).percorso).toBeUndefined()
  })
})

describe('un nome che non calpesta niente', () => {
  it('numera prima dell estensione', () => {
    // `relazione.pdf (2)` non si apre più con un doppio clic: è il modo più
    // veloce per rendere inutile una copia appena salvata.
    expect(nomeLibero('relazione.pdf', ['relazione.pdf'])).toBe('relazione (2).pdf')
    expect(nomeLibero('relazione.pdf', ['relazione.pdf', 'relazione (2).pdf']))
      .toBe('relazione (3).pdf')
  })

  it('libero resta com e', () => {
    expect(nomeLibero('nuovo.txt', ['altro.txt'])).toBe('nuovo.txt')
  })

  it('un file nascosto non ha un estensione: il punto in testa non conta', () => {
    expect(nomeLibero('.gitignore', ['.gitignore'])).toBe('.gitignore (2)')
  })
})

describe('percorsi delle due sponde', () => {
  it('usa la barra che quel percorso usa gia, non quella del sistema', () => {
    // Le due colonne sono un disco Windows e un server Unix: dedurre il
    // separatore da `process.platform` costruirebbe `\home\utente\file` sul
    // server, che non esiste.
    expect(separatoreDi('/home/utente')).toBe('/')
    expect(separatoreDi('C:\\Progetti')).toBe('\\')
    expect(unisciPercorso('/var/www', 'indice.html')).toBe('/var/www/indice.html')
    expect(unisciPercorso('C:\\Progetti', 'nuovo')).toBe('C:\\Progetti\\nuovo')
  })

  it('non raddoppia la barra di una cartella che gia la porta', () => {
    expect(unisciPercorso('/', 'casa')).toBe('/casa')
    expect(unisciPercorso('/var/', 'log')).toBe('/var/log')
  })

  it('la radice tiene la sua barra', () => {
    // Il padre di `/casa` e' `/`, non la stringa vuota: una stringa vuota qui
    // vorrebbe dire rinominare in un posto senza nome.
    expect(cartellaDi('/casa')).toBe('/')
    expect(cartellaDi('/var/log/messaggi')).toBe('/var/log')
    expect(cartellaDi('senza-cartella')).toBe('')
  })

  it('rinominare e spostare accanto a se stessi', () => {
    // SFTP non ha «rinomina»: ha «sposta». Sbagliare questo calcolo sposta il
    // file in un posto che non esiste.
    expect(accantoA('/var/www/vecchio.html', 'nuovo.html')).toBe('/var/www/nuovo.html')
    expect(accantoA('C:\\Progetti\\a.txt', 'b.txt')).toBe('C:\\Progetti\\b.txt')
    expect(accantoA('/solo.txt', 'altro.txt')).toBe('/altro.txt')
  })
})

describe('permessi', () => {
  it('li scrive come li scrive ls', () => {
    expect(permessiInLettere(0o755)).toBe('rwxr-xr-x')
    expect(permessiInLettere(0o644)).toBe('rw-r--r--')
    expect(permessiInLettere(0o600)).toBe('rw-------')
    expect(permessiInLettere(0o777)).toBe('rwxrwxrwx')
  })

  it('legge solo numeri di permessi veri', () => {
    // `parseInt` accetterebbe `759` ignorando il 9 e tornando 75, cioe'
    // `----wxr-x`: un file senza permessi per il proprietario, ottenuto da una
    // battitura sbagliata che nessuno segnala.
    expect(leggiPermessi('755')).toBe(0o755)
    expect(leggiPermessi(' 0644 ')).toBe(0o644)
    expect(leggiPermessi('759')).toBeUndefined()
    expect(leggiPermessi('99')).toBeUndefined()
    expect(leggiPermessi('')).toBeUndefined()
    expect(leggiPermessi('rwx')).toBeUndefined()
  })
})
