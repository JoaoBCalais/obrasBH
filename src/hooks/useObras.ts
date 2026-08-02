import useSWR from 'swr'
import { supabase } from '@/lib/supabase'
import { normalizeStatus } from '@/lib/format'

export interface Obra {
  id: number
  id_area_empreendimento: string
  numero_po: string
  nome: string
  regional: string
  status: string
  empresa: string
  tematica: string

  // Financeiros (CSV CONTRATOS-SGEE)
  valor_contrato: number
  valor_total_medicao: number
  valor_total_aditivo: number
  valor_contrato_com_aditivo: number

  // Datas e prazos
  data_inicio_cnt: string | null
  data_fim_cnt_original: string | null
  data_fim_cnt_com_aditivos: string | null
  prazo_contratual: number
  numero_dias_aditivados: number

  // Contrato
  num_cnt: string
  objeto_cnt: string
  tipo_cnt: string

  // Paralisação
  dsc_paralisacao: string | null
  motivo_paralisacao: string | null

  // Dados ampliados (Power BI SMOBI)
  latitude: number | null
  longitude: number | null
  pct_execucao_pbh: number | null
  justificativa_inexecucao: string | null
  previsao_reinicio: string | null
  origem_contrato: string | null
  data_paralisacao: string | null

  criado_em: string
  atualizado_em: string
}

// Renovações/aditivos de contrato (justificativas de prorrogação)
export interface Renovacao {
  id: number
  id_area_empreendimento: string
  num_cnt: string | null
  numero_renovacao: number | null
  tipo_renovacao: string | null
  data_renovacao: string | null
  data_inicio_renovacao: string | null
  data_fim_renovacao: string | null
  justificativa: string | null
  responsavel_inexecucao: string | null
  valor_renovacao: number
  valor_aditivo_renovacao: number
  dias_aditivados_renovacao: number
  status_renovacao: string | null
}

// Medições periódicas
export interface Medicao {
  id: number
  id_area_empreendimento: string
  num_cnt: string | null
  numero_medicao: number | null
  data_medicao: string | null
  periodo_referencia: string | null
  valor_medicao: number
  valor_acumulado: number
  pct_medicao: number | null
  pct_acumulado: number | null
}

// Obra com todos os dados relacionados
export interface ObraCompleta {
  obra: Obra
  renovacoes: Renovacao[]
  medicoes: Medicao[]
}

// Fetcher para SWR
const fetcher = async (query: string) => {
  const { data, error } = await supabase.rpc('fetch_obras', {
    query_param: query
  }).select()

  if (error) throw error
  return data
}

// Alternativa: fetcher direto via Supabase REST API
const fetcherRest = async () => {
  const { data, error } = await supabase
    .from('obras')
    .select('*')
    .order('regional', { ascending: true })

  if (error) throw error
  return data
}

export function useObras() {
  const { data, error, isLoading, mutate } = useSWR<Obra[]>(
    'obras',
    fetcherRest,
    {
      revalidateOnFocus: false,
      dedupingInterval: 60000, // Revalidar a cada 1 minuto
      focusThrottleInterval: 300000 // 5 minutos
    }
  )

  return {
    obras: data || [],
    isLoading,
    isError: !!error,
    error,
    mutate
  }
}

// Hook filtrado por status
export function useObrasPorStatus(status: string) {
  const { obras, isLoading, isError, error } = useObras()

  const obrasFiltradas = status === 'Todas'
    ? obras
    : obras.filter(o => normalizeStatus(o.status) === status)

  return {
    obras: obrasFiltradas,
    total: obrasFiltradas.length,
    isLoading,
    isError,
    error
  }
}

// Hook filtrado por regional
export function useObrasPorRegional(regional: string) {
  const { obras, isLoading, isError, error } = useObras()

  const obrasFiltradas = regional === 'Todas'
    ? obras
    : obras.filter(o => o.regional === regional)

  return {
    obras: obrasFiltradas,
    total: obrasFiltradas.length,
    isLoading,
    isError,
    error
  }
}

// Hook com busca de texto
export function useObrasBusca(termo: string) {
  const { obras, isLoading, isError, error } = useObras()

  const obrasFiltradas = termo
    ? obras.filter(o =>
        o.nome.toLowerCase().includes(termo.toLowerCase()) ||
        o.regional.toLowerCase().includes(termo.toLowerCase()) ||
        o.empresa.toLowerCase().includes(termo.toLowerCase())
      )
    : obras

  return {
    obras: obrasFiltradas,
    total: obrasFiltradas.length,
    isLoading,
    isError,
    error
  }
}

// Hook para obra completa (com renovações, medições)
export function useObraCompleta(empreendimento: string | null) {
  const { data, error, isLoading } = useSWR<ObraCompleta>(
    empreendimento ? `obra-completa-${empreendimento}` : null,
    async () => {
      const { data, error } = await supabase
        .rpc('obra_completa', { p_empreendimento: empreendimento })

      if (error) throw error
      return data as ObraCompleta
    },
    { revalidateOnFocus: false }
  )

  return {
    obraCompleta: data || null,
    isLoading,
    isError: !!error,
    error
  }
}

// Hook para renovações de uma obra
export function useRenovacoes(empreendimento: string | null) {
  const { data, error, isLoading } = useSWR<Renovacao[]>(
    empreendimento ? `renovacoes-${empreendimento}` : null,
    async () => {
      const { data, error } = await supabase
        .from('renovacoes')
        .select('*')
        .eq('id_area_empreendimento', empreendimento)
        .order('data_renovacao', { ascending: false })

      if (error) throw error
      return data as Renovacao[]
    },
    { revalidateOnFocus: false }
  )

  return {
    renovacoes: data || [],
    isLoading,
    isError: !!error
  }
}

// Hook para uma obra específica (por id numérico — usado na página /obra/[id])
export function useObra(id: string | null) {
  const { data, error, isLoading } = useSWR<Obra | null>(
    id ? `obra-${id}` : null,
    async () => {
      const { data, error } = await supabase
        .from('obras')
        .select('*')
        .eq('id', Number(id))
        .single()

      if (error) throw error
      return data as Obra
    },
    { revalidateOnFocus: false }
  )

  return {
    obra: data || null,
    isLoading,
    isError: !!error,
    error
  }
}

// Hook para medições de uma obra
export function useMedicoes(empreendimento: string | null) {
  const { data, error, isLoading } = useSWR<Medicao[]>(
    empreendimento ? `medicoes-${empreendimento}` : null,
    async () => {
      const { data, error } = await supabase
        .from('medicoes')
        .select('*')
        .eq('id_area_empreendimento', empreendimento)
        .order('data_medicao', { ascending: true })

      if (error) throw error
      return data as Medicao[]
    },
    { revalidateOnFocus: false }
  )

  return {
    medicoes: data || [],
    isLoading,
    isError: !!error
  }
}

// Hook para estatísticas
export function useEstatisticasObras() {
  const { obras } = useObras()

  const stats = {
    total: obras.length,
    concluidas: obras.filter(o => normalizeStatus(o.status) === 'CONCLUIDA').length,
    emAndamento: obras.filter(o => normalizeStatus(o.status) === 'EM_ANDAMENTO').length,
    paralisadas: obras.filter(o => normalizeStatus(o.status) === 'PARALISADA').length,
    regionais: [...new Set(obras.map(o => o.regional))].length,
    empresas: [...new Set(obras.map(o => o.empresa))].length
  }

  return stats
}
