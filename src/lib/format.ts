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
