/**
 * Motor de análise de indícios — ObrasBH
 */
import type { Obra } from '@/hooks/useObras'

export type Severidade = 'alta' | 'media' | 'baixa'
export type CategoriaAlerta = 'financeiro' | 'prazo' | 'paralisacao' | 'transparencia'
export type NivelRisco = 'critico' | 'atencao' | 'observacao' | 'ok'

export interface AlertaRisco {
  id: string; categoria: CategoriaAlerta; severidade: Severidade; pontos: number
  titulo: string; descricao: string
}
export interface AnaliseRisco { score: number; nivel: NivelRisco; alertas: AlertaRisco[] }

export const NIVEL_LABELS: Record<NivelRisco, string> = {
  critico: 'Crítico', atencao: 'Atenção', observacao: 'Observação', ok: 'Sem alertas',
}

export const CATEGORIA_LABELS: Record<CategoriaAlerta, string> = {
  financeiro: 'Financeiro', prazo: 'Prazo', paralisacao: 'Paralisação', transparencia: 'Transparência',
}

export const LIMITE_LEGAL_ADITIVO_PCT = 25

const STATUS_ENCERRADOS = ['CONCLUIDA', 'CANCELADO', 'DISTRATATA', 'RESCINDIDA']

function norm(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim().toUpperCase().replace(/\s+/g, '_').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d)
  return isNaN(dt.getTime()) ? null : dt
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

export function analisarObra(obra: Obra, hoje: Date = new Date()): AnaliseRisco {
  const alertas: AlertaRisco[] = []
  const status = norm(obra.status)
  const encerrada = STATUS_ENCERRADOS.includes(status)

  const valorContrato = Number(obra.valor_contrato) || 0
  const valorAditivo = Number(obra.valor_total_aditivo) || 0
  const valorMedido = Number(obra.valor_total_medicao) || 0
  const valorAtual = Number(obra.valor_contrato_com_aditivo) || (valorContrato + valorAditivo)
  const pctExec = valorAtual > 0 ? (valorMedido / valorAtual) * 100 : 0
  const aditivoPct = valorContrato > 0 ? (valorAditivo / valorContrato) * 100 : 0

  if (valorContrato > 0 && aditivoPct > LIMITE_LEGAL_ADITIVO_PCT) {
    alertas.push({
      id: 'aditivo_acima_limite', categoria: 'financeiro', severidade: 'alta', pontos: 30,
      titulo: 'Aditivos acima do limite legal', descricao: `+${Math.round(aditivoPct)}% acima de 25%.`,
    })
  } else if (valorContrato > 0 && aditivoPct > 10) {
    alertas.push({
      id: 'aditivo_elevado', categoria: 'financeiro', severidade: 'media', pontos: 12,
      titulo: 'Aditivos elevados', descricao: `${Math.round(aditivoPct)}% de crescimento.`,
    })
  }

  const score = Math.min(100, alertas.reduce((s, a) => s + a.pontos, 0))
  const nivel: NivelRisco = score >= 45 ? 'critico' : score >= 20 ? 'atencao' : score > 0 ? 'observacao' : 'ok'
  return { score, nivel, alertas }
}

export interface EmpresaResumo {
  empresa: string; contratos: number; valorTotal: number; valorAditivos: number
  aditivoPct: number; obrasComAlerta: number; participacaoPct: number; flags: string[]
}

export function analisarEmpresas(obras: Obra[], analises: Map<number, AnaliseRisco>): EmpresaResumo[] {
  return []
}

export interface GapDados { id: string; titulo: string; descricao: string; quantidade: number; pct: number }
export function analisarGaps(obras: Obra[]): GapDados[] { return [] }

export const SEVERIDADE_LABELS: Record<Severidade, string> = {
  alta: 'Indício forte', media: 'Indício médio', baixa: 'Observação',
}
