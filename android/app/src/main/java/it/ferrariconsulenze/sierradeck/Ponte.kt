package it.ferrariconsulenze.sierradeck

import android.webkit.JavascriptInterface

/**
 * Il ponte fra la pagina e l'app.
 *
 * La chiave del dispositivo nasce dentro la pagina — è lei che fa
 * l'accoppiamento a sei cifre — e finisce nel suo archivio locale. L'app, che è
 * un programma diverso, non la vedeva: **la guardia mandava le sue richieste
 * con una chiave vuota**, riceveva 401 e taceva. Il servizio che esiste per
 * avvisarti quando il computer ha bisogno di te non ha mai avvisato nessuno, e
 * non c'era modo di accorgersene.
 *
 * Da qui la chiave passa dalla pagina all'app, che la conserva **per
 * indirizzo**: il computer di casa e quello in VPN sono due indirizzi con due
 * accoppiamenti, e tornare da uno all'altro non deve costare sei cifre ogni
 * volta.
 */
class Ponte(private val collegamento: Collegamento) {

    /** La pagina si è accoppiata: da adesso la chiave la sa anche l'app. */
    @JavascriptInterface
    fun ricorda(chiave: String) {
        collegamento.ricordaChiave(collegamento.indirizzo, chiave)
    }

    /**
     * La chiave per questo indirizzo, se l'app se la ricorda.
     *
     * È ciò che permette di reinstallare l'app, cambiare rete e tornare
     * indietro senza rifare l'accoppiamento: quello che si è già fatto una
     * volta non si chiede due volte.
     */
    @JavascriptInterface
    fun chiaveSalvata(): String = collegamento.chiaveDi(collegamento.indirizzo)

    /** Gli indirizzi che l'app conosce già: si sceglie invece di digitare. */
    @JavascriptInterface
    fun indirizziNoti(): String = collegamento.indirizziNoti().joinToString("\n")
}
