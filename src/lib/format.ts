/**
 * Formatação de valores monetários
 */
export function formatMoeda(valor: number): string {
  if (valor >= 1e9) {
    return `R$ ${(valor / 1e9).toFixed(1)}B`
  }
  if (valor >= 1e6) {
    return `R$ ${(valor / 1e6).toFixed(1)}M`
  }
  if (valor >= 1e3) {
    return `R$ ${(valor / 1e3).toFixed(0)}K`
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor)
}

/**
 * Formatação monetária completa (R$ 1.234.567,89) — para tabelas e detalhes
 */
export function formatMoedaFull(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2
  }).format(valor)
}

/**
 * Formata data no padrão brasileiro
 */
export function formatData(data: Date | string): string {
  const d = typeof data === 'string' ? new Date(data) : data

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d)
}

/**
 * Calcula quanto da renda mensal vai para obras em BH
 */
export function calcularCustoObrasPorSalario(salarioMensal: number): number {
  const percentualObrasBH = 0.0254
  return Math.round(salarioMensal * percentualObrasBH)
}

/**
 * Normaliza o status vindo do banco para o formato interno (ex: "Em Andamento" → "EM_ANDAMENTO")
 */
export function normalizeStatus(raw: string | null | undefined): string {
  if (!raw) return 'EM_ANDAMENTO'
  const upper = raw.trim().toUpperCase()

  // Mapeamento direto de valores conhecidos do banco
  const MAP: Record<string, string> = {
    'EM ANDAMENTO': 'EM_ANDAMENTO',
    'EM_ANDAMENTO': 'EM_ANDAMENTO',
    'CONCLUIDA': 'CONCLUIDA',
    'CONCLUÍDA': 'CONCLUIDA',
    'CONCLUIDO': 'CONCLUIDA',
    'PARALISADA': 'PARALISADA',
    'PARALISADO': 'PARALISADA',
    'ATRASADA': 'ATRASADA',
    'RESCINDIDA': 'RESCINDIDA',
    'DISTRATADA': 'DISTRATATA',
    'DISTRATATA': 'DISTRATATA',
    'AGUARDANDO': 'AGUARDANDO',
    'EM NEGOCIAÇÃO': 'EM_NEGOCIACAO',
    'EM NEGOCIACAO': 'EM_NEGOCIACAO',
    'EM_NEGOCIACAO': 'EM_NEGOCIACAO',
    'EM_NEGOCIAÇÃO': 'EM_NEGOCIACAO',
    'CANCELADO': 'CANCELADO',
    'CANCELADA': 'CANCELADO',
  }

  // Tenta match direto, senão substitui espaços por underscore
  return MAP[upper] || upper.replace(/\s+/g, '_')
}

/**
 * Mapeia status para label legível
 */
export const STATUS_LABELS: Record<string, string> = {
  'EM_ANDAMENTO': 'Em andamento',
  'ATRASADA': 'Atrasada',
  'PARALISADA': 'Paralisada',
  'CONCLUIDA': 'Concluída',
  'RESCINDIDA': 'Rescindida',
  'DISTRATATA': 'Distratada',
  'AGUARDANDO': 'Aguardando',
  'EM_NEGOCIACAO': 'Em Negociação',
  'CANCELADO': 'Cancelado'
}

/**
 * Mapeia status para cores
 */
export const STATUS_CORES: Record<string, { bg: string; text: string }> = {
  'EM_ANDAMENTO': { bg: '#e6f1fb', text: '#185fa5' },
  'ATRASADA': { bg: '#fcebeb', text: '#a32d2d' },
  'PARALISADA': { bg: '#faeeda', text: '#854f0b' },
  'CONCLUIDA': { bg: '#eaf3de', text: '#3b6d11' },
  'RESCINDIDA': { bg: '#f5e6e6', text: '#8b4513' },
  'DISTRATATA': { bg: '#f0e6f5', text: '#6b3a8b' },
  'AGUARDANDO': { bg: '#f5f5e6', text: '#8b8b00' },
  'EM_NEGOCIACAO': { bg: '#e6ecf5', text: '#3d5a80' },
  'CANCELADO': { bg: '#f0e0e0', text: '#8b0000' }
}

/**
 * Valor atual do contrato: valor original + aditivos.
 *
 * ATENÇÃO — não use `valor_contrato_com_aditivo`. Apesar do nome, o sync grava
 * ali a coluna "Valor Total Medicao E Reajuste" do CSV da PBH, que é
 * `valor_total_medicao + valor_total_aditivo` (confirmado em 97,6% das 925
 * linhas do banco). Usá-lo como denominador de execução significa dividir
 * medição por medição — o que inflava a execução mediana de 74% para 93%.
 */
export function valorAtualDe(
  obra: {
    valor_contrato?: number | string | null
    valor_total_aditivo?: number | string | null
  },
  /** Acréscimos das renovações (view obra_indicadores), quando disponíveis. */
  indicador?: { num_renovacoes: number; soma_aditivo_renovacoes: number } | null
): number {
  const contrato = Number(obra.valor_contrato) || 0
  const reajuste = Number(obra.valor_total_aditivo) || 0
  const acrescimos = indicador && indicador.num_renovacoes > 0
    ? Number(indicador.soma_aditivo_renovacoes) || 0
    : 0
  return contrato + reajuste + acrescimos
}

/**
 * Percentual de execução financeira (medido sobre o valor atual).
 */
export function pctExecucaoDe(
  obra: {
    valor_contrato?: number | string | null
    valor_total_aditivo?: number | string | null
    valor_total_medicao?: number | string | null
  },
  indicador?: { num_renovacoes: number; soma_aditivo_renovacoes: number } | null
): number {
  const atual = valorAtualDe(obra, indicador)
  if (atual <= 0) return 0
  return ((Number(obra.valor_total_medicao) || 0) / atual) * 100
}

/**
 * Normaliza o nome da regional.
 *
 * O CSV da PBH ora traz a descrição ("Centro Sul"), ora só a sigla ("CS"), e o
 * sync usa a sigla como fallback. Isso criava regionais duplicadas na interface
 * — 85 obras estavam em baldes separados, sendo 75 só em "DV".
 */
const REGIONAL_SIGLAS: Record<string, string> = {
  'B': 'Barreiro',
  'CS': 'Centro Sul',
  'DV': 'Diversos',
  'L': 'Leste',
  'N': 'Norte',
  'NE': 'Nordeste',
  'NO': 'Noroeste',
  'O': 'Oeste',
  'P': 'Pampulha',
  'VN': 'Venda Nova',
}

export function normalizeRegional(raw: string | null | undefined): string {
  const bruto = (raw || '').trim()
  if (!bruto) return 'Sem regional'

  const porSigla = REGIONAL_SIGLAS[bruto.toUpperCase()]
  if (porSigla) return porSigla

  // Corrige capitalização divergente ("CENTRO SUL" / "centro sul" → "Centro Sul")
  const canonico = Object.values(REGIONAL_SIGLAS).find(
    nome => nome.toLowerCase() === bruto.toLowerCase()
  )
  return canonico || bruto
}
