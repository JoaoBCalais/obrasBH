import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

/**
 * API Route: POST /api/sync-execucao
 *
 * Baixa o CSV SOF.csv do Google Drive da PBH,
 * parseia e faz upsert na tabela "execucao_financeira" do Supabase.
 *
 * Colunas do CSV:
 *   Cod Instrumento Juridico Raiz,
 *   Vl Empenhado Total (Empenhado - Anulado),
 *   Vl Liquidado Total (Liquidado - Anulado),
 *   VL Pago Total (VL Pago - VL Pago Anulado),
 *   Vl RP Não Processado Anul, Vl RP Processado Anul
 *
 * NOTA: CSV usa "Cod Instrumento Juridico Raiz" como chave.
 *       Não tem "Empreendimento" nem "Num Cnt".
 *       Fazemos lookup via contratos CSV que tem "Instrumento Juridico Raiz".
 *       Como a tabela obras guarda num_cnt, buscamos primeiro os contratos
 *       do Google Drive para montar o mapa instrumento→empreendimento,
 *       OU usamos o campo diretamente se adicionarmos à tabela.
 *
 *       Abordagem escolhida: buscar obras e fazer lookup por num_cnt via
 *       um mapa intermediário do CSV de contratos (que já foi parseado pelo sync).
 *       Na prática: armazenamos o Cod Instrumento Juridico Raiz como numero_empenho
 *       e fazemos o melhor match possível.
 *
 * Fonte: Painel Transparência Obras Públicas SMOBI/PBH → DADOS ABERTOS → Execução Financeira
 */

const CSV_URL_EXECUCAO =
  'https://drive.google.com/uc?export=download&id=1nzbQ_YhPoutEtem7NU59G6cYi09dFkLy&confirm=t'

const CSV_URL_CONTRATOS =
  'https://drive.google.com/uc?export=download&id=11B4Y3IYF31QLle1_7dsI5MELOg5uwLTm&confirm=t'

// --- Helpers ---
function parseNumber(val: string | undefined): number {
  if (!val || val.trim() === '') return 0
  const cleaned = val.replace(/[^\d.,\-]/g, '')
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    return parseFloat(cleaned.replace(',', '.')) || 0
  }
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(cleaned) || 0
}

function findCol(row: Record<string, string>, prefix: string): string {
  const key = Object.keys(row).find(k => k.startsWith(prefix))
  return key ? (row[key] || '') : ''
}

interface CsvRow {
  [key: string]: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const syncKey = process.env.SYNC_API_KEY
  if (syncKey && req.headers['x-sync-key'] !== syncKey) {
    return res.status(401).json({ error: 'Chave inválida' })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Variáveis SUPABASE não configuradas' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // 0. Buscar o CSV de contratos para montar mapa instrumento_juridico → empreendimento
    const contratosResponse = await fetch(CSV_URL_CONTRATOS, { redirect: 'follow' })
    if (!contratosResponse.ok) {
      throw new Error(`Erro ao baixar CSV contratos: ${contratosResponse.status}`)
    }

    const contratosBuffer = await contratosResponse.arrayBuffer()
    const contratosText = new TextDecoder('latin1').decode(contratosBuffer)
    const firstLineContratos = contratosText.split('\n')[0] || ''
    const delimContratos = firstLineContratos.includes(';') ? ';' : ','

    const { data: contratosData } = Papa.parse<CsvRow>(contratosText, {
      header: true,
      skipEmptyLines: true,
      delimiter: delimContratos,
    })

    // Mapa: Instrumento Juridico Raiz → Empreendimento
    const instrToEmpreendimento = new Map<string, string>()
    for (const row of contratosData) {
      const instrumento = row['Instrumento Juridico Raiz'] || findCol(row, 'Instrumento Juridico') || ''
      const empreendimento = row['Empreendimento'] || ''
      if (instrumento && empreendimento) {
        instrToEmpreendimento.set(instrumento, empreendimento)
      }
    }

    // 1. Baixar CSV de execução financeira
    const csvResponse = await fetch(CSV_URL_EXECUCAO, { redirect: 'follow' })
    if (!csvResponse.ok) {
      throw new Error(`Erro ao baixar CSV: ${csvResponse.status}`)
    }

    const buffer = await csvResponse.arrayBuffer()
    const csvText = new TextDecoder('latin1').decode(buffer)

    if (csvText.trim().startsWith('<!') || csvText.trim().startsWith('<html')) {
      throw new Error('Google Drive retornou página HTML em vez do CSV.')
    }

    // 2. Parsear CSV
    const firstLine = csvText.split('\n')[0] || ''
    const delimiter = firstLine.includes(';') ? ';' : ','

    const { data } = Papa.parse<CsvRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter,
    })

    if (data.length === 0) {
      throw new Error('CSV vazio ou formato inesperado')
    }

    // 3. Converter (deduplicar por empreendimento+instrumento)
    let semMatch = 0
    const registrosMap = new Map<string, Record<string, any>>()

    for (const row of data) {
      const codInstrumento = row['Cod Instrumento Juridico Raiz'] || findCol(row, 'Cod Instrumento') || ''
      if (!codInstrumento) continue

      const empreendimento = instrToEmpreendimento.get(codInstrumento)
      if (!empreendimento) {
        semMatch++
        continue
      }

      const registro = {
        id_area_empreendimento: empreendimento,
        numero_empenho: codInstrumento,
        valor_empenhado: parseNumber(
          row['Vl Empenhado Total (Empenhado - Anulado)'] || findCol(row, 'Vl Empenhado') || ''
        ),
        valor_liquidado: parseNumber(
          row['Vl Liquidado Total (Liquidado - Anulado)'] || findCol(row, 'Vl Liquidado') || ''
        ),
        valor_pago: parseNumber(
          row['VL Pago Total (VL Pago - VL Pago Anulado)'] || findCol(row, 'VL Pago') || ''
        ),
      }

      registrosMap.set(`${empreendimento}::${codInstrumento}`, registro)
    }

    const registros = Array.from(registrosMap.values())

    // 4. Upsert em lotes
    const BATCH_SIZE = 50
    let inserted = 0
    let errorsCount = 0
    const errorMessages: string[] = []

    for (let i = 0; i < registros.length; i += BATCH_SIZE) {
      const batch = registros.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('execucao_financeira')
        .upsert(batch, {
          onConflict: 'id_area_empreendimento,numero_empenho',
          ignoreDuplicates: false,
        })

      if (error) {
        errorsCount++
        errorMessages.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        inserted += batch.length
      }
    }

    return res.status(200).json({
      success: errorsCount === 0 && inserted > 0,
      tabela: 'execucao_financeira',
      message: errorsCount === 0 && inserted > 0
        ? `${inserted} registros de execução financeira sincronizados`
        : `${inserted} inseridos, ${errorsCount} lotes com erro`,
      stats: {
        csvLinhas: data.length,
        instrumentosConhecidos: instrToEmpreendimento.size,
        semMatchInstrumento: semMatch,
        registrosValidos: registros.length,
        inseridosAtualizados: inserted,
        erros: errorsCount,
        errorMessages: errorMessages.slice(0, 5),
        colunasCsv: Object.keys(data[0] || {}),
        exemploRegistro: registros[0] || null,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      tabela: 'execucao_financeira',
      error: err.message || 'Erro desconhecido',
      timestamp: new Date().toISOString(),
    })
  }
}
