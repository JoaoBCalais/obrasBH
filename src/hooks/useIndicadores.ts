import useSWR from 'swr'
import { supabase } from '@/lib/supabase'

/**
 * Indicadores agregados por obra, vindos da view `obra_indicadores`
 * (sql/migration_v3_indicadores.sql).
 *
 * São os números que só existem nas tabelas satélite — medições, renovações
 * e execução financeira — resumidos a uma linha por obra pelo servidor.
 * Sem isso o motor de risco enxerga apenas a linha de `obras`.
 */
export interface IndicadorObra {
  id_area_empreendimento: string
  obra_id: number

  total_medicoes: number
  ultima_medicao: string | null
  primeira_medicao: string | null
  medicoes_12m: number
  soma_medicoes: number

  num_renovacoes: number
  soma_aditivo_renovacoes: number
  ultima_renovacao: string | null
  primeira_renovacao: string | null

  empenhado: number
  liquidado: number
  pago: number
  /** null quando não há dado de execução financeira — diferente de "não pagou" */
  pct_pago_sobre_empenhado: number | null
  /** null quando a obra nunca teve medição registrada */
  meses_sem_medicao: number | null
}

export function useIndicadores() {
  const { data, error, isLoading } = useSWR<IndicadorObra[]>(
    'obra-indicadores',
    async () => {
      const { data, error } = await supabase.from('obra_indicadores').select('*')
      if (error) throw error
      return (data || []) as IndicadorObra[]
    },
    { revalidateOnFocus: false, dedupingInterval: 60000, shouldRetryOnError: false }
  )

  // Indexado por obra_id, que é como o motor de risco faz o lookup.
  const porObra = new Map<number, IndicadorObra>()
  ;(data || []).forEach(i => porObra.set(i.obra_id, i))

  return {
    indicadores: porObra,
    isLoading,
    /**
     * A view pode ainda não existir no banco (migração v3 não rodada).
     * Nesse caso o app segue funcionando: os indícios que dependem dela
     * simplesmente não são gerados, em vez de quebrar a página.
     */
    indisponivel: !!error,
  }
}
