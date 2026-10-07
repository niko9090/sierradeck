package it.ferrariconsulenze.sierradeck

/**
 * Il nome di un PC da mostrare (0.52.4, app 2.52.4).
 *
 * Nicholas (07/10): in alto e nel cambio di computer si vedeva il nome tecnico
 * della macchina (l'hostname) invece di quello che le aveva dato lui. Ogni PC
 * ha adesso un **nome scelto** (sul PC in «Altri computer», o da qui con la
 * matita del selettore), che arriva in `/api/stato` e nei battiti; l'hostname
 * resta solo come sottotitolo piccolo.
 *
 * Copia di `src/shared/nome-pc.ts`: `NomePcTest` rilegge gli stessi casi
 * (`tests/fixtures/nome-pc-casi.json`).
 */
object NomePc {
    const val MAX = 40

    /** Senza caratteri di controllo, senza spazi doppi, in testa o in coda. */
    fun pulito(s: String?): String {
        if (s == null) return ""
        val t = StringBuilder()
        for (ch in s) t.append(if (ch.code < 32 || ch.code == 127) ' ' else ch)
        return t.split(' ').filter { it.isNotEmpty() }.joinToString(" ")
    }

    /** Quello scelto, poi quello che dice il PC, poi l'hostname. */
    fun daMostrare(nomeScelto: String?, nome: String?, host: String?): String =
        pulito(nomeScelto).ifEmpty { pulito(nome) }.ifEmpty { pulito(host) }

    /** L'hostname piccolo sotto: solo se dice qualcosa in più del nome mostrato. */
    fun sottotitolo(nomeScelto: String?, nome: String?, host: String?): String? {
        val h = pulito(host)
        if (h.isEmpty()) return null
        return if (h.equals(daMostrare(nomeScelto, nome, host), ignoreCase = true)) null else h
    }

    /** Un nome scelto da salvare; vuoto = si torna all'hostname. */
    fun valido(s: String?): String = pulito(pulito(s).take(MAX))
}

/** Il computer in alto (2.52.4): il nome e, piccolo, l'hostname. */
data class Intestazione(val nome: String, val sotto: String?)

/**
 * Il nome in alto e nel cambio di computer, puro (2.52.4): un nome scritto a
 * mano qui vince; poi quello che dice il computer (il suo nome scelto); poi
 * quello salvato; poi l'indirizzo. Prima della 2.52.4 in alto vinceva sempre
 * il nome del computer, cioè il suo hostname.
 */
fun intestazionePc(postazione: Postazioni.Postazione?, computer: NomeComputer?, ripiego: String): Intestazione {
    val dalPc = computer?.let { NomePc.daMostrare(it.nomeScelto, it.nome, it.host) }.orEmpty()
    val nome = when {
        postazione?.aMano == true && postazione.nome.isNotBlank() -> postazione.nome
        dalPc.isNotBlank() -> dalPc
        postazione != null && postazione.nome.isNotBlank() -> postazione.nome
        else -> ripiego
    }
    val host = computer?.host?.takeIf { it.isNotBlank() } ?: postazione?.host?.takeIf { it.isNotBlank() }
    return Intestazione(nome, NomePc.sottotitolo(nome, null, host))
}
