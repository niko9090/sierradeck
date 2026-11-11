package it.ferrariconsulenze.sierradeck

import it.ferrariconsulenze.sierradeck.dati.Polso
import it.ferrariconsulenze.sierradeck.dati.PolsoApp
import it.ferrariconsulenze.sierradeck.rete.Contatto
import it.ferrariconsulenze.sierradeck.rete.TipoStrada
import it.ferrariconsulenze.sierradeck.schermate.radice.Parola
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** La parola in alto e i tempi del deposito: regole pure. */
class RadiceTest {
    private val ora: (Long) -> String = { "18:40" }

    @Test
    fun `una parola sola per come sta il collegamento`() {
        assertEquals(Parola("in WiFi", Parola.Tono.BENE), Parola.di(Contatto.Collegato(TipoStrada.CASA, 0), ora))
        assertEquals(Parola("via VPN", Parola.Tono.BENE), Parola.di(Contatto.Collegato(TipoStrada.TAILSCALE, 0), ora))
        assertEquals(Parola("da un altro PC", Parola.Tono.BENE), Parola.di(Contatto.Collegato(TipoStrada.PONTE, 0), ora))
        assertEquals(Parola.Tono.ATTESA, Parola.di(Contatto.MiCollego(0), ora).tono)
        assertEquals(Parola.Tono.ATTESA, Parola.di(null, ora).tono)
        assertEquals(Parola("non collegato dalle 18:40", Parola.Tono.MALE), Parola.di(Contatto.NonCollegato(0, "x"), ora))
        assertEquals(Parola("da riaccoppiare", Parola.Tono.MALE), Parola.di(Contatto.NonMiConosce(0), ora))
    }

    @Test
    fun `la versione dello stato si legge in cima, un PC di prima non la ha`() {
        assertEquals(42L, Polso.versioneDa("""{"versione":42,"chat":[]}"""))
        assertEquals(7L, Polso.versioneDa("""{ "versione" : 7 }"""))
        assertNull(Polso.versioneDa("""{"chat":[{"versione":"0.1.0"}]}"""))
        assertEquals(12L, Polso.numeroDa("""{"ultimo":12,"stato":3,"avvisi":[]}""", "ultimo"))
        assertEquals(3L, Polso.numeroDa("""{"ultimo":12,"stato":3,"avvisi":[]}""", "stato"))
    }

    @Test
    fun `il passo del deposito`() {
        assertEquals(PolsoApp.davantiOgni(0), Polso.passo(0, giu = false))
        assertEquals(PolsoApp.CALMO_OGNI_MS, Polso.passo(PolsoApp.CALMO_DOPO, giu = false))
        assertEquals(Polso.GIU_MS, Polso.passo(0, giu = true))
    }
}
