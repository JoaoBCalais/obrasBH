/**
 * Motor de análise de indícios — ObrasBH
 *
 * Analisa cada contrato de obra pública e atribui um score de risco (0–100)
 * com base em indícios objetivos calculados sobre os dados abertos da PBH.
 *
 * IMPORTANTE: indício NÃO é prova. Um alerta significa "isso merece ser
 * olhado de perto por um cidadão, jornalista ou órgão de controle" — nunca
 * uma acusação. Os textos exibidos ao público devem sempre deixar isso claro.
 */

import type { Obra } from '@/hooks/useObras'

export type Severidade = 'alta' | 'media' | 'baixa'

export type CategoriaAlerta = 'financeiro' | 'prazo' | 'paralisacao' | 'transparencia'

export interface AlertaRisco {
  id: string
  categoria: CategoriaAlerta
  severidade: Severidade
  pontos: number
  titulo: string
  descricao: string
}

export type NivelRisco = 'critico' | 'atencao' | 'observacao' | 'ok'

export interface AnaliseRisco {
  score: number
  nivel: NivelRisco
  alertas: AlertaRisco[]
}

export const NIVEL_LABELS: Record<NivelRisco, string> = {
  critico: 'Crítico',
  atencao: 'Atenção',
  observacao: 'Observação',
  ok: 'Sem alertas',
}

export const CATEGORIA_LABELS: Record<CategoriaAlerta, string> = {
  financeiro: 'Financeiro',
  prazo: 'Prazo',
  paralisacao: 'Paralisação',
  transparencia: 'Transparência',
}

/** Limite de referência para aditivos em obras (art. 125 da Lei 14.133/2021: 25%) */
export const LIMITE_LEGAL_ADITIVO_PCT = 25

const STATUS_ENCERRADOS = ['CONCLUIDA', 'CANCELADO', 'DISTRATATA', 'RESCINDIDA']

function norm(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw.trim().toUpperCase().replace(/\s+/g, '_')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseDate(d: string | null | undefined): Date | null {
  if (!d) return null
  const dt = new Date(String(d).length <= 10 ? `${d}T12:00:00` : d)
  return isNaN(dt.getTime()) ? null : dt
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/**
 * Analisa uma obra (linha crua do banco) e devolve o score + alertas.
 */
export function analisarObra(obra: Obra, hoje: Date = new Date()): AnaliseRisco {
  const alertas: AlertaRisco[] = []

  const status = norm(obra.status)
  const encerrada =
    STATUS_ENCERRADOS.includes(status) ||
    status.startsWith('CONCLUID') || status.startsWith('CANCELAD') ||
    status.startsWith('DISTRAT') || status.startsWith('RESCINDID')

  const valorContrato = Number(obra.valor_contrato) || 0
  const valorAditivo = Number(obra.valor_total_aditivo) || 0
  const valorMedido = Number(obra.valor_total_medicao) || 0
  const valorAtual = Number(obra.valor_contrato_com_aditivo) || (valorContrato + valorAditivo)

  const dataInicio = parseDate(obra.data_inicio_cnt)
  const prazoOriginal = parseDate(obra.data_fim_cnt_original)
  const prazoAtual = parseDate(obra.data_fim_cnt_com_aditivos) || prazoOriginal
  const prazoContratual = Number(obra.prazo_contratual) || 0
  const diasAditivados = Number(obra.numero_dias_aditivados) || 0

  const temParalisacao = Boolean(
    status === 'PARALISADA' || status === 'PARALISADO' ||
    (obra.dsc_paralisacao && obra.dsc_paralisacao.trim()) ||
    (obra.data_paralisacao)
  )

  const pctExec = valorAtual > 0 ? (valorMedido / valorAtual) * 100 : 0
  const aditivoPct = valorContrato > 0 ? (valorAditivo / valorContrato) * 100 : 0

  // ---------- FINANCEIRO ----------

  if (valorContrato > 0 && aditivoPct > LIMITE_LEGAL_ADITIVO_PCT) {
    alertas.push({
      id: 'aditivo_acima_limite',
      categoria: 'financeiro',
      severidade: 'alta',
      pontos: 30,
      titulo: 'Aditivos acima do limite legal de referência',
      descricao: `Os aditivos somam +${Math.round(aditivoPct)}% do valor original do contrato. A Lei 14.133/2021 usa 25% como teto de referência para acréscimos em obras — acima disso, a contratação merece escrutínio.`,
    })
  } else if (valorContrato > 0 && aditivoPct > 10) {
    alertas.push({
      id: 'aditivo_elevado',
      categoria: 'financeiro',
      severidade: 'media',
      pontos: 12,
      titulo: 'Aditivos elevados',
      descricao: `O contrato já cresceu +${Math.round(aditivoPct)}% sobre o valor original por meio de aditivos.`,
    })
  }

  if (valorAtual > 0 && valorMedido > valorAtual * 1.02) {
    alertas.push({
      id: 'medicao_acima_contrato',
      categoria: 'financeiro',
      severidade: 'alta',
      pontos: 25,
      titulo: 'Medição acima do valor contratado',
      descricao: `Já foram medidos ${Math.round((valorMedido / valorAtual) * 100)}% do valor do contrato (com aditivos) — pagamento aprovado acima do que foi contratado é uma inconsistência que merece explicação.`,
    })
  }

  // ---------- PRAZO ----------

  if (prazoAtual && prazoAtual < hoje && !encerrada && !temParalisacao) {
    const diasVencidos = diasEntre(prazoAtual, hoje)
    alertas.push({
      id: 'prazo_estourado',
      categoria: 'prazo',
      severidade: diasVencidos > 180 ? 'alta' : 'media',
      pontos: diasVencidos > 180 ? 22 : 14,
      titulo: `Prazo vencido há ${diasVencidos} dias`,
      descricao: `O contrato previa conclusão em ${prazoAtual.toLocaleDateString('pt-BR')} (já contando as prorrogações) e a obra segue sem constar como concluída.`,
    })
  }

  if (prazoContratual > 0 && diasAditivados >= prazoContratual) {
    alertas.push({
      id: 'prazo_dobrado',
      categoria: 'prazo',
      severidade: 'media',
      pontos: 12,
      titulo: 'Prazo já foi mais que dobrado',
      descricao: `Foram acrescentados ${diasAditivados} dias a um contrato originalmente de ${prazoContratual} dias — a obra já custou mais que o dobro do tempo prometido.`,
    })
  }

  if (
    dataInicio && !encerrada && !temParalisacao &&
    diasEntre(dataInicio, hoje) > 365 * 3 && pctExec < 30 && valorAtual > 0
  ) {
    alertas.push({
      id: 'obra_arrastada',
      categoria: 'prazo',
      severidade: 'alta',
      pontos: 18,
      titulo: 'Obra se arrastando',
      descricao: `Iniciada há mais de ${Math.floor(diasEntre(dataInicio, hoje) / 365)} anos e apenas ${Math.round(pctExec)}% do valor foi executado, sem registro oficial de paralisação.`,
    })
  }

  // ---------- PARALISAÇÃO ----------

  if (temParalisacao && !encerrada) {
    if (!obra.previsao_reinicio) {
      alertas.push({
        id: 'paralisada_sem_previsao',
        categoria: 'paralisacao',
        severidade: 'alta',
        pontos: 18,
        titulo: 'Paralisada sem previsão de reinício',
        descricao: 'A obra está paralisada e não há nenhuma data de reinício registrada nos dados públicos.',
      })
    }
    const temMotivo = Boolean(
      (obra.dsc_paralisacao && obra.dsc_paralisacao.trim()) ||
      (obra.motivo_paralisacao && obra.motivo_paralisacao.trim()) ||
      (obra.justificativa_inexecucao && obra.justificativa_inexecucao.trim())
    )
    if (!temMotivo) {
      alertas.push({
        id: 'paralisada_sem_motivo',
        categoria: 'transparencia',
        severidade: 'alta',
        pontos: 15,
        titulo: 'Paralisada sem motivo informado',
        descricao: 'A obra consta como paralisada, mas nenhum motivo foi registrado — a população tem o direito de saber por quê.',
      })
    }
  }

  // ---------- EXECUÇÃO / CONSISTÊNCIA ----------

  if (
    status === 'EM_ANDAMENTO' && dataInicio && valorMedido === 0 &&
    valorContrato > 0 && diasEntre(dataInicio, hoje) > 180
  ) {
    alertas.push({
      id: 'sem_medicao',
      categoria: 'transparencia',
      severidade: 'media',
      pontos: 12,
      titulo: 'Em andamento sem nenhuma medição',
      descricao: `Contrato iniciado há ${Math.floor(diasEntre(dataInicio, hoje) / 30)} meses, em andamento, e nenhuma medição foi registrada — ou a obra não avançou, ou os dados não estão sendo publicados.`,
    })
  }

  if (pctExec >= 100 && !encerrada && valorAtual > 0) {
    alertas.push({
      id: 'pago_sem_conclusao',
      categoria: 'transparencia',
      severidade: 'baixa',
      pontos: 8,
      titulo: '100% medido, mas não consta como concluída',
      descricao: 'Todo o valor do contrato já foi medido e aprovado, mas o status oficial ainda não é "Concluída".',
    })
  }

  const pctPbh = obra.pct_execucao_pbh != null ? Number(obra.pct_execucao_pbh) : null
  if (pctPbh != null && valorAtual > 0 && Math.abs(pctPbh - pctExec) > 20) {
    alertas.push({
      id: 'divergencia_pbh',
      categoria: 'transparencia',
      severidade: 'media',
      pontos: 10,
      titulo: 'Divergência entre medição e percentual oficial',
      descricao: `A PBH informa ${Math.round(pctPbh)}% de execução física, mas as medições financeiras indicam ${Math.round(pctExec)}% — uma diferença de ${Math.round(Math.abs(pctPbh - pctExec))} pontos.`,
    })
  }

  // ---------- GAPS DE TRANSPARÊNCIA ----------

  if (valorContrato <= 0 && !encerrada) {
    alertas.push({
      id: 'sem_valor',
      categoria: 'transparencia',
      severidade: 'media',
      pontos: 10,
      titulo: 'Sem valor de contrato publicado',
      descricao: 'Não há valor de contrato nos dados abertos — impossível fiscalizar o custo desta obra.',
    })
  }

  if ((!obra.data_inicio_cnt || !obra.data_fim_cnt_original) && !encerrada) {
    alertas.push({
      id: 'sem_datas',
      categoria: 'transparencia',
      severidade: 'baixa',
      pontos: 6,
      titulo: 'Datas de contrato incompletas',
      descricao: 'Falta a data de início e/ou o prazo de conclusão nos dados publicados.',
    })
  }

  if (!obra.empresa || !obra.empresa.trim()) {
    alertas.push({
      id: 'sem_empresa',
      categoria: 'transparencia',
      severidade: 'baixa',
      pontos: 5,
      titulo: 'Empresa contratada não informada',
      descricao: 'Os dados públicos não identificam quem executa o contrato.',
    })
  }

  const score = Math.min(100, alertas.reduce((s, a) => s + a.pontos, 0))
  const nivel: NivelRisco =
    score >= 45 ? 'critico' : score >= 20 ? 'atencao' : score > 0 ? 'observacao' : 'ok'

  return { score, nivel, alertas }
}

// ============================================================
// Análise agregada: concentração por empresa
// ============================================================

export interface EmpresaResumo {
  empresa: string
  contratos: number
  valorTotal: number
  valorAditivos: number
  aditivoPct: number
  obrasComAlerta: number
  participacaoPct: number
  flags: string[]
}

export function analisarEmpresas(
  obras: Obra[],
  analises: Map<number, AnaliseRisco>
): EmpresaResumo[] {
  const total = obras.reduce((s, o) => s + (Number(o.valor_contrato) || 0), 0)
  const porEmpresa = new Map<string, Obra[]>()

  obras.forEach(o => {
    const nome = (o.empresa || '').trim()
    if (!nome) return
    if (!porEmpresa.has(nome)) porEmpresa.set(nome, [])
    porEmpresa.get(nome)!.push(o)
  })

  const resumos: EmpresaResumo[] = []
  porEmpresa.forEach((lista, empresa) => {
    const valorTotal = lista.reduce((s, o) => s + (Number(o.valor_contrato) || 0), 0)
    const valorAditivos = lista.reduce((s, o) => s + (Number(o.valor_total_aditivo) || 0), 0)
    const aditivoPct = valorTotal > 0 ? (valorAditivos / valorTotal) * 100 : 0
    const obrasComAlerta = lista.filter(o => {
      const a = analises.get(o.id)
      return a && (a.nivel === 'critico' || a.nivel === 'atencao')
    }).length
    const participacaoPct = total > 0 ? (valorTotal / total) * 100 : 0

    const flags: string[] = []
    if (lista.length >= 2 && aditivoPct > LIMITE_LEGAL_ADITIVO_PCT) {
      flags.push(`Aditivos médios de +${Math.round(aditivoPct)}% em ${lista.length} contratos`)
    }
    if (participacaoPct >= 10) {
      flags.push(`Concentra ${Math.round(participacaoPct)}% de todo o valor contratado`)
    }
    if (lista.length >= 3 && obrasComAlerta / lista.length >= 0.5) {
      flags.push(`${obrasComAlerta} de ${lista.length} contratos com alertas`)
    }

    resumos.push({
      empresa, contratos: lista.length, valorTotal, valorAditivos,
      aditivoPct, obrasComAlerta, participacaoPct, flags,
    })
  })

  return resumos.sort((a, b) =>
    (b.flags.length - a.flags.length) || (b.valorTotal - a.valorTotal)
  )
}

// ============================================================
// Gaps de dados no conjunto (o que a PBH não está publicando)
// ============================================================

export interface GapDados {
  id: string
  titulo: string
  descricao: string
  quantidade: number
  pct: number
}

export function analisarGaps(obras: Obra[]): GapDados[] {
  const n = obras.length || 1
  const ativos = obras.filter(o => {
    const s = norm(o.status)
    return !STATUS_ENCERRADOS.includes(s)
  })

  const semValor = ativos.filter(o => !(Number(o.valor_contrato) > 0)).length
  const semDatas = ativos.filter(o => !o.data_inicio_cnt || !o.data_fim_cnt_original).length
  const semEmpresa = obras.filter(o => !o.empresa || !o.empresa.trim()).length
  const semCoordenadas = obras.filter(o => o.latitude == null || o.longitude == null).length
  const paralisadas = obras.filter(o =>
    norm(o.status) === 'PARALISADA' || (o.dsc_paralisacao && o.dsc_paralisacao.trim())
  )
  const paralisadasSemMotivo = paralisadas.filter(o =>
    !(o.dsc_paralisacao && o.dsc_paralisacao.trim()) &&
    !(o.motivo_paralisacao && o.motivo_paralisacao.trim()) &&
    !(o.justificativa_inexecucao && o.justificativa_inexecucao.trim())
  ).length
  const paralisadasSemPrevisao = paralisadas.filter(o => !o.previsao_reinicio).length

  const gaps: GapDados[] = [
    {
      id: 'sem_valor', titulo: 'Contratos ativos sem valor publicado',
      descricao: 'Sem o valor do contrato, é impossível fiscalizar quanto a obra custa.',
      quantidade: semValor, pct: Math.round((semValor / Math.max(1, ativos.length)) * 100),
    },
    {
      id: 'sem_datas', titulo: 'Contratos ativos sem datas completas',
      descricao: 'Sem data de início ou prazo, não dá para cobrar atrasos.',
      quantidade: semDatas, pct: Math.round((semDatas / Math.max(1, ativos.length)) * 100),
    },
    {
      id: 'sem_empresa', titulo: 'Obras sem empresa identificada',
      descricao: 'A população não sabe quem recebe o dinheiro público.',
      quantidade: semEmpresa, pct: Math.round((semEmpresa / n) * 100),
    },
    {
      id: 'sem_coordenadas', titulo: 'Obras sem localização no mapa',
      descricao: 'Sem coordenadas, o cidadão não consegue conferir a obra no local.',
      quantidade: semCoordenadas, pct: Math.round((semCoordenadas / n) * 100),
    },
    {
      id: 'paralisada_sem_motivo', titulo: 'Paralisadas sem motivo informado',
      descricao: 'Obra parada sem explicação pública registrada.',
      quantidade: paralisadasSemMotivo,
      pct: paralisadas.length ? Math.round((paralisadasSemMotivo / paralisadas.length) * 100) : 0,
    },
    {
      id: 'paralisada_sem_previsao', titulo: 'Paralisadas sem previsão de reinício',
      descricao: 'Obra parada sem nenhum compromisso público de retomada.',
      quantidade: paralisadasSemPrevisao,
      pct: paralisadas.length ? Math.round((paralisadasSemPrevisao / paralisadas.length) * 100) : 0,
    },
  ]

  return gaps.filter(g => g.quantidade > 0).sort((a, b) => b.quantidade - a.quantidade)
}

// ============================================================
// Cores e helpers de exibição
// ============================================================

export const NIVEL_CORES: Record<NivelRisco, { bg: string; text: string; border: string }> = {
  critico: { bg: '#fdecec', text: '#a32323', border: '#f3b8b8' },
  atencao: { bg: '#fdf0e7', text: '#95421b', border: '#f5c8a8' },
  observacao: { bg: '#fdf6e0', text: '#7a5c00', border: '#ecd489' },
  ok: { bg: '#eaf3de', text: '#3b6d11', border: '#c5dea8' },
}

export const SEVERIDADE_LABELS: Record<Severidade, string> = {
  alta: 'Indício forte',
  media: 'Indício médio',
  baixa: 'Observação',
}
