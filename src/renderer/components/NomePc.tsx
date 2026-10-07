import { useNomePc } from '../state/nomi-pc'

/**
 * Un PC come si mostra (0.52.4): il nome scelto da Nicholas e, piccolo
 * accanto, l'hostname, solo se è diverso. `nome` è quello ricordato, che vale
 * finché i battiti non dicono di meglio.
 */
export function NomePc({ id, nome, senzaHost = false }: { id?: string | undefined; nome: string; senzaHost?: boolean }): React.JSX.Element {
  const v = useNomePc(id, nome)
  return (
    <>
      {v.nome}
      {!senzaHost && v.host !== undefined ? <small className="nome-pc__host" title="Il nome tecnico della macchina (hostname)"> {v.host}</small> : null}
    </>
  )
}
