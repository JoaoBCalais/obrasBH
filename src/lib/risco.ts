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
import type { IndicadorObra } from '@/hooks/useIndicadores'

export type Severidade = 'alta' | 'media' | 'baixa'

export type CategoriaAlerta = 'financeiro' | 'prazo' | 'paralisacao' | 'transparencia' | 'execucao'

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
  execucao: 'Execução',
}

/** Meses sem nenhuma medição a partir dos quais a obra é tratada como estagnada. */
export const MESES_ESTAGNACAO = 6

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

/** "março de 2024" — para descrever quando foi a última medição. */
function formatMesAno(d: string | null | undefined): string {
  const dt = parseDate(d)
  if (!dt) return 'data não informada'
  return dt.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

/** Formatação curta de moeda para os textos dos alertas. */
function moeda(v: number): string {
  if (v >= 1e6) return `R$ ${(v / 1e6).toFixed(1)} mi`
  if (v >= 1e3) return `R$ ${(v / 1e3).toFixed(0)} mil`
  return `R$ ${v.toFixed(0)}`
}

/**
 * Analisa uma obra (linha crua do banco) e devolve o score + alertas.
 */
export function analisarObra(
  obra: Obra,
  indicador?: IndicadorObra | null,
  hoje: Date = new Date()
): AnaliseRisco {
  const alertas: AlertaRisco[] = []

  const status = norm(obra.status)
  const encerrada =
    STATUS_ENCERRADOS.includes(status) ||
    status.startsWith('CONCLUID') || status.startsWith('CANCELAD') ||
    status.startsWith('DISTRAT') || status.startsWith('RESCINDID')

  const valorContrato = Number(obra.valor_contrato) || 0
  const valorAditivo = Number(obra.valor_total_aditivo) || 0
  const valorMedido = Number(obra.valor_total_medicao) || 0

  // Acréscimos de escopo — vêm das renovações, não do CSV de contratos.
  const acrescimos = indicador && indicador.num_renovacoes > 0
    ? Number(indicador.soma_aditivo_renovacoes) || 0
    : 0

  // Valor atual = original + reajuste + acréscimos.
  //
  // NÃO usar `valor_contrato_com_aditivo`: apesar do nome, o sync grava ali a
  // coluna "Valor Total Medicao E Reajuste" do CSV, que é medição + reajuste.
  // Usá-lo como denominador dividia medição por medição.
  //
  // Esta fórmula foi validada contra os dados reais: com ela, apenas 7 das 925
  // obras têm medição acima do valor do contrato (0,8% — taxa plausível de
  // inconsistência real). Usando só `valor_contrato` seriam 128, e a maioria
  // seria falso positivo causado por aditivo não contabilizado.
  const valorAtual = valorContrato + valorAditivo + acrescimos

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

  // `obra.valor_total_aditivo` vem da coluna "Valor Total Reajuste" do CSV —
  // é correção inflacionária, não acréscimo de escopo. O teto de 25% do
  // art. 125 da Lei 14.133 se aplica só ao segundo. Quando a obra tem
  // renovações registradas, elas são a fonte correta (as duas só coincidem
  // em 9,8% dos casos).
  const aditivoReal = indicador && indicador.num_renovacoes > 0 ? acrescimos : null
  const baseAditivo = aditivoReal !== null ? aditivoReal : valorAditivo
  const aditivoPct = valorContrato > 0 ? (baseAditivo / valorContrato) * 100 : 0
  const fonteAditivo = aditivoReal !== null
    ? `somando as ${indicador!.num_renovacoes} renovações registradas`
    : 'segundo o reajuste publicado no CSV de contratos'

  // ---------- FINANCEIRO ----------

  if (valorContrato > 0 && aditivoPct > LIMITE_LEGAL_ADITIVO_PCT) {
    alertas.push({
      id: 'aditivo_acima_limite',
      categoria: 'financeiro',
      severidade: 'alta',
      pontos: 30,
      titulo: 'Aditivos acima do limite legal de referência',
      descricao: `Os acréscimos somam +${Math.round(aditivoPct)}% do valor original do contrato (${fonteAditivo}). A Lei 14.133/2021 usa 25% como teto de referência para acréscimos em obras — acima disso, a contratação merece escrutínio.`,
    })
  } else if (valorContrato > 0 && aditivoPct > 10) {
    alertas.push({
      id: 'aditivo_elevado',
      categoria: 'financeiro',
      severidade: 'media',
      pontos: 12,
      titulo: 'Aditivos elevados',
      descricao: `O contrato já cresceu +${Math.round(aditivoPct)}% sobre o valor original (${fonteAditivo}).`,
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

  // 58% das obras ativas estão com o prazo vencido — um alerta que dispara em
  // mais da metade da base não separa nada. Por isso a pontuação é escalonada:
  // o que distingue é HÁ QUANTO TEMPO venceu, não o fato de ter vencido.
  if (prazoAtual && prazoAtual < hoje && !encerrada && !temParalisacao) {
    const diasVencidos = diasEntre(prazoAtual, hoje)
    const anos = Math.floor(diasVencidos / 365)
    const grave = diasVencidos > 730
    const medio = diasVencidos > 365
    alertas.push({
      id: 'prazo_estourado',
      categoria: 'prazo',
      severidade: grave ? 'alta' : medio ? 'media' : 'baixa',
      pontos: grave ? 26 : medio ? 14 : 6,
      titulo: grave
        ? `Prazo vencido há mais de ${anos} anos`
        : `Prazo vencido há ${diasVencidos} dias`,
      descricao: `O contrato previa conclusão em ${prazoAtual.toLocaleDateString('pt-BR')} (já contando as prorrogações) e a obra segue sem constar como concluída.${grave ? ' Atraso dessa ordem costuma significar que o cronograma original perdeu qualquer relação com a realidade.' : ''}`,
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
    // `previsao_reinicio` está 0% preenchido no banco — a PBH não publica esse
    // campo. Como o alerta disparava em 100% das paralisadas com peso alto, ele
    // não media risco da obra, media ausência de dado. Rebaixado a observação
    // de transparência: continua sendo informação útil, sem inflar o score.
    if (!obra.previsao_reinicio) {
      alertas.push({
        id: 'paralisada_sem_previsao',
        categoria: 'transparencia',
        severidade: 'baixa',
        pontos: 4,
        titulo: 'Sem previsão de reinício publicada',
        descricao: 'A obra está paralisada e não há data de reinício nos dados abertos. A PBH não publica esse campo para nenhuma obra — o que, por si só, é uma lacuna de transparência.',
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

  // pct_execucao_pbh está 0% preenchido hoje (nenhum sync escreve nessa coluna).
  // A regra fica no lugar, inerte, para passar a valer sozinha caso a PBH
  // publique o percentual de execução física — aí a divergência entre o físico
  // e o financeiro vira um dos indícios mais fortes possíveis.
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

  // ============================================================
  // INDÍCIOS VINDOS DAS TABELAS SATÉLITE (view obra_indicadores)
  // Só rodam quando a migração v3 foi aplicada e há dado para a obra.
  // ============================================================

  if (indicador) {
    // ---------- ESTAGNAÇÃO ----------
    // O indício mais forte que os dados permitem: obra ativa, dinheiro
    // contratado, e nenhuma medição há meses. É obra parada de fato, sem
    // estar registrada como paralisada. 227 obras se enquadram hoje.
    if (!encerrada && !temParalisacao && valorContrato > 0) {
      const meses = indicador.meses_sem_medicao

      if (indicador.total_medicoes === 0 && dataInicio && diasEntre(dataInicio, hoje) > 180) {
        alertas.push({
          id: 'nunca_medida',
          categoria: 'execucao',
          severidade: 'alta',
          pontos: 28,
          titulo: 'Nenhuma medição desde o início do contrato',
          descricao: `O contrato começou há ${Math.floor(diasEntre(dataInicio, hoje) / 30)} meses e não há uma única medição registrada. Ou a obra nunca saiu do papel, ou a execução não está sendo publicada.`,
        })
      } else if (meses != null && meses >= MESES_ESTAGNACAO) {
        const anos = Math.floor(meses / 12)
        const grave = meses >= 24
        alertas.push({
          id: 'estagnada',
          categoria: 'execucao',
          severidade: grave ? 'alta' : 'media',
          pontos: grave ? 25 : 15,
          titulo: grave
            ? `Sem medição há mais de ${anos} ${anos === 1 ? 'ano' : 'anos'}`
            : `Sem medição há ${meses} meses`,
          descricao: `A última medição registrada é de ${formatMesAno(indicador.ultima_medicao)}. A obra continua ativa e com ${Math.round(pctExec)}% do valor executado, mas não avança há ${meses} meses — sem constar como paralisada.`,
        })
      }
    }

    // ---------- ADITIVO EM SALAME ----------
    // Vários acréscimos pequenos ao longo do tempo, somando perto do teto de
    // 25% sem ultrapassá-lo. O fatiamento é justamente o padrão que escapa de
    // uma regra que só olha o total.
    if (
      indicador.num_renovacoes >= 2 &&
      aditivoPct > 15 && aditivoPct <= LIMITE_LEGAL_ADITIVO_PCT &&
      valorContrato > 0
    ) {
      alertas.push({
        id: 'aditivo_fatiado',
        categoria: 'financeiro',
        severidade: 'media',
        pontos: 16,
        titulo: 'Acréscimos sucessivos logo abaixo do teto legal',
        descricao: `Foram ${indicador.num_renovacoes} renovações que somam +${Math.round(aditivoPct)}% — perto do limite de ${LIMITE_LEGAL_ADITIVO_PCT}%, mas sem ultrapassá-lo. Acréscimos fatiados podem ter explicação técnica, mas também são a forma conhecida de crescer um contrato sem acionar o teto.`,
      })
    }

    if (indicador.num_renovacoes >= 4) {
      alertas.push({
        id: 'muitas_renovacoes',
        categoria: 'financeiro',
        severidade: 'media',
        pontos: 12,
        titulo: `${indicador.num_renovacoes} renovações no mesmo contrato`,
        descricao: `Um contrato renovado ${indicador.num_renovacoes} vezes sugere que o projeto original subestimou prazo, custo ou escopo — ou que a licitação virou uma relação de longo prazo sem nova disputa.`,
      })
    }

    // ---------- DESCOLAMENTO FINANCEIRO ----------
    // Empenhado é dinheiro reservado; pago é dinheiro que saiu. A distância
    // entre os dois antecede paralisação por falta de caixa.
    const pctPago = indicador.pct_pago_sobre_empenhado
    if (pctPago != null && !encerrada && indicador.empenhado > 0) {
      const naoPago = indicador.empenhado - indicador.pago
      if (pctPago < 50 && naoPago > 100000) {
        alertas.push({
          id: 'empenhado_nao_pago',
          categoria: 'financeiro',
          severidade: 'alta',
          pontos: 20,
          titulo: 'Menos da metade do empenhado foi pago',
          descricao: `Foram empenhados ${moeda(indicador.empenhado)} e pagos apenas ${moeda(indicador.pago)} (${pctPago}%). Dinheiro reservado que não sai costuma anteceder atraso ou paralisação por falta de repasse.`,
        })
      } else if (pctPago < 75 && naoPago > 500000) {
        alertas.push({
          id: 'empenhado_pouco_pago',
          categoria: 'financeiro',
          severidade: 'media',
          pontos: 10,
          titulo: 'Pagamento bem abaixo do empenhado',
          descricao: `${moeda(naoPago)} empenhados ainda não foram pagos (${pctPago}% do total saiu).`,
        })
      }
    }

    // ---------- SERVIÇO FEITO E NÃO PAGO ----------
    // Medição é serviço conferido e aprovado por fiscal. Se o pagamento não
    // acompanha, a empresa está bancando obra pública com capital próprio —
    // o que costuma terminar em paralisação ou pedido de reequilíbrio.
    if (
      indicador.pago > 0 && valorMedido > 0 && !encerrada &&
      valorMedido > indicador.pago * 1.2 &&
      valorMedido - indicador.pago > 500000
    ) {
      alertas.push({
        id: 'medido_nao_pago',
        categoria: 'financeiro',
        severidade: 'alta',
        pontos: 18,
        titulo: 'Serviço medido e ainda não pago',
        descricao: `Já foram medidos ${moeda(valorMedido)} — serviço conferido e aprovado por fiscal — mas os pagamentos somam ${moeda(indicador.pago)}. São ${moeda(valorMedido - indicador.pago)} de defasagem.`,
      })
    }
  }

  const score = Math.min(100, alertas.reduce((s, a) => s + a.pontos, 0))

  // Limiares recalibrados junto com a entrada dos indícios de execução.
  // Com o corte antigo (45/20), o conjunto novo de regras classificava 199
  // obras como críticas — 21% da base. "Crítico" que vale para uma em cada
  // cinco obras não orienta ninguém sobre por onde começar.
  const nivel: NivelRisco =
    score >= 60 ? 'critico' : score >= 30 ? 'atencao' : score > 0 ? 'observacao' : 'ok'

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
  analises: Map<number, AnaliseRisco>,
  indicadores?: Map<number, IndicadorObra>
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
    // Preferir o acréscimo real das renovações ao reajuste do CSV de contratos.
    const valorAditivos = lista.reduce((s, o) => {
      const ind = indicadores?.get(o.id)
      const real = ind && ind.num_renovacoes > 0 ? Number(ind.soma_aditivo_renovacoes) || 0 : null
      return s + (real !== null ? real : Number(o.valor_total_aditivo) || 0)
    }, 0)
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

export function analisarGaps(
  obras: Obra[],
  indicadores?: Map<number, IndicadorObra>
): GapDados[] {
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

  if (indicadores && indicadores.size > 0) {
    const semExecFin = ativos.filter(o => {
      const i = indicadores.get(o.id)
      return !i || i.empenhado <= 0
    }).length
    gaps.push({
      id: 'sem_execucao_financeira',
      titulo: 'Contratos ativos sem dado de empenho e pagamento',
      descricao: 'Sem execução financeira publicada, não dá para saber se o dinheiro chegou a sair do caixa.',
      quantidade: semExecFin,
      pct: Math.round((semExecFin / Math.max(1, ativos.length)) * 100),
    })

    const semJustificativa = obras.filter(o => {
      const i = indicadores.get(o.id)
      return i && i.num_renovacoes > 0
    }).length
    if (semJustificativa > 0) {
      gaps.push({
        id: 'renovacao_sem_justificativa',
        titulo: 'Renovações sem justificativa publicada',
        descricao: 'Contratos foram prorrogados, mas o motivo da prorrogação não consta nos dados abertos — nenhum registro traz esse texto.',
        quantidade: semJustificativa,
        pct: Math.round((semJustificativa / n) * 100),
      })
    }
  }

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
