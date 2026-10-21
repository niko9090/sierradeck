package it.ferrariconsulenze.sierradeck

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Il menu dei workspace (PC 0.82.0): gli stessi gruppi e le stesse azioni del
 * PC e della pagina, sui casi scritti da `tests/shared/menu-workspace-app.test.ts`.
 */
class MenuWorkspaceTest {
    private val fx: JsonObject = Api.json.parseToJsonElement(
        javaClass.classLoader!!.getResource("menu-workspace/menu-0.82.json")!!.readText()
    ).jsonObject

    private fun stringhe(e: JsonElement?): List<String> = e?.jsonArray?.map { it.jsonPrimitive.content } ?: emptyList()
    private fun testo(o: JsonObject, k: String): String? = o[k]?.jsonPrimitive?.contentOrNull

    @Test
    fun `i gruppi sono quelli del PC, caso per caso`() {
        for (caso in fx["gruppi"]!!.jsonArray) {
            val c = caso.jsonObject
            val p = c["ingresso"]!!.jsonObject
            val altrove = p["altrove"]?.jsonArray?.map { a ->
                val o = a.jsonObject
                WorkspaceAltrove(pc = testo(o, "pc")!!, nome = testo(o, "nome")!!, workspace = stringhe(o["workspace"]))
            } ?: emptyList()
            val fatti = MenuWorkspace.gruppi(
                nomi = stringhe(p["nomi"]), attivo = testo(p, "attivo")!!, recenti = stringhe(p["recenti"]),
                filtro = testo(p, "filtro") ?: "", nomePc = testo(p, "nomePc"), altrove = altrove
            )
            val attesi = c["gruppi"]!!.jsonArray.map { g ->
                val o = g.jsonObject
                MenuWorkspace.Gruppo(testo(o, "chiave")!!, testo(o, "titolo")!!, o["voci"]!!.jsonArray.map { v ->
                    val x = v.jsonObject
                    val pc = x["pc"]?.jsonObject
                    MenuWorkspace.Voce(testo(x, "nome")!!, x["qui"]!!.jsonPrimitive.boolean, pc?.let { testo(it, "id") }, pc?.let { testo(it, "nome") })
                })
            }
            assertEquals(testo(c, "nome"), attesi, fatti)
        }
    }

    @Test
    fun `le azioni dietro «⋯» sono quelle del PC, con gli stessi testi`() {
        for (caso in fx["azioni"]!!.jsonArray) {
            val c = caso.jsonObject
            val v = c["voce"]!!.jsonObject
            val pc = v["pc"]?.jsonObject
            val p = c["ingresso"]!!.jsonObject
            val fatte = MenuWorkspace.azioni(
                MenuWorkspace.Voce(testo(v, "nome")!!, v["qui"]!!.jsonPrimitive.boolean, pc?.let { testo(it, "id") }, pc?.let { testo(it, "nome") }),
                attivo = testo(p, "attivo")!!, quanti = p["quanti"]!!.jsonPrimitive.int,
                sposta = p["sposta"]?.jsonPrimitive?.boolean ?: false, cartella = p["cartella"]?.jsonPrimitive?.boolean ?: true
            )
            val attese = c["azioni"]!!.jsonArray.map { a ->
                val o = a.jsonObject
                MenuWorkspace.Azione(testo(o, "azione")!!, testo(o, "etichetta")!!, testo(o, "spiega")!!, testo(o, "spenta"), o["pericolo"]?.jsonPrimitive?.boolean ?: false)
            }
            assertEquals(testo(c, "nome"), attese, fatte)
        }
    }

    @Test
    fun `la ricerca non guarda accenti e maiuscole`() {
        assertEquals("desk", MenuWorkspace.piano("Dèsk"))
        assertEquals(listOf("Dèsk"), MenuWorkspace.gruppi(listOf("Dèsk", "altro"), "altro", filtro = "DESK").flatMap { g -> g.voci.map { it.nome } })
    }
}
