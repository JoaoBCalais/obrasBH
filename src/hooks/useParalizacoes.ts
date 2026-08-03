// src/hooks/useParalizacoes.ts

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Paralizacao } from './paralizacao.types'

export function useParalizacoes(idObra: string) {
  const [paralizacoes, setParalizacoes] = useState<Paralizacao[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!idObra) {
      setLoading(false)
      return
    }

    const fetchParalizacoes = async () => {
      try {
        setLoading(true)

        const { data, error: err } = await supabase
          .from('paralizacoes')
          .select('*')
          .eq('id_area_empreendimento', idObra)
          .order('data_paralisacao', { ascending: false })

        if (err) throw err

        setParalizacoes(data || [])
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Erro ao buscar paralizações'))
        setParalizacoes([])
      } finally {
        setLoading(false)
      }
    }

    fetchParalizacoes()
  }, [idObra])

  // Paralisação ativa (mais recente com status 'Em paralisação')
  const paralizacaoAtiva = paralizacoes.find(
    (p) => p.status_paralisacao === 'Em paralisação'
  ) || null

  // Total de paralizações
  const totalParalizacoes = paralizacoes.length

  // Total de dias paralisado (soma todos)
  const totalDiasParalisado = paralizacoes.reduce(
    (acc, p) => acc + (p.dias_paralisado || 0),
    0
  )

  return {
    paralizacoes,
    paralizacaoAtiva,
    totalParalizacoes,
    totalDiasParalisado,
    loading,
    error,
  }
}

// Hook adicional para contar paralizações em lote (util para dashboards)
export function useContagemParalizacoes(idsObras: string[]) {
  const [contagem, setContagem] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (idsObras.length === 0) {
      setLoading(false)
      return
    }

    const fetchContagemLote = async () => {
      try {
        setLoading(true)
        const { data, error: err } = await supabase
          .from('paralizacoes')
          .select('id_area_empreendimento, status_paralisacao')
          .in('id_area_empreendimento', idsObras)

        if (err) throw err

        // Agrupar por obra
        const resultado: Record<string, number> = {}
        data?.forEach((p) => {
          resultado[p.id_area_empreendimento] =
            (resultado[p.id_area_empreendimento] || 0) + 1
        })

        setContagem(resultado)
      } catch {
        // silencioso — tabela pode não existir ainda
      } finally {
        setLoading(false)
      }
    }

    fetchContagemLote()
  }, [idsObras])

  return { contagem, loading }
}
