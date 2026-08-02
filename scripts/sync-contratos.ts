/**
 * Script para sincronizar dados do CSV CONTRATOS-SGEE.csv (Power BI da SMOBI/PBH)
 * com a tabela "obras" no Supabase.
 *
 * Uso:
 *   npx ts-node scripts/sync-contratos.ts
 *
 * Requer variáveis de ambiente:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (service role, não anon key)
 *
 * O CSV é público no Google Drive da PBH.
 */

import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

// --- Configuração ---
const CSV_URL =
  'https://drive.google.com/uc?export=download&id=11B4Y3IYF31QLle1_7dsI5MELOg5uwLTm&confirm=t'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// --- Helpers ---
function parseNumber(val: string | undefined): number {
  if (!val || val.trim() === '') return 0
  // O CSV brasileiro pode usar "." como separador de milhar e "," como decimal
  // Mas o CSV da PBH usa ponto como decimal
  const cleaned = val.replace(/[^\d.,\-]/g, '')
  // Se tiver vírgula, trata como decimal BR
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    return parseFloat(cleaned.replace(',', '.')) || 0
  }
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // 1.234,56 → 1234.56
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(cleaned) || 0
}

function parseDate(val: string | undefined): string | null {
  if (!val || val.trim() === '' || val.trim() === '0') return null
  // Formato esperado: DD/MM/YYYY ou YYYY-MM-DD ou DD/MM/YYYY HH:mm:ss
  const trimmed = val.trim().split(' ')[0] // Remover hora se existir
  if (trimmed.includes('/')) {
    const [d, m, y] = trimmed.split('/')
    if (y && m && d) return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  return null
}

function parseInt2(val: string | undefined): number {
  if (!val || val.trim() === '') return 0
  return parseInt(val.replace(/[^\d\-]/g, ''), 10) || 0
}

// --- Mapeamento CSV → Banco ---
interface CsvRow {
  [key: string]: string
}

function csvToObra(row: CsvRow) {
  // O CSV usa ; como separador, mas o Papa detecta automaticamente
  const empreendimento = row['Empreendimento'] || ''

  return {
    id_area_empreendimento: empreendimento,
    numero_po: row['Num Cnt'] || empreendimento,
    nome: row['Objeto Cnt'] || row['Desc Empreendimento'] || empreendimento,
    regional: row['Regional Empreendimento - Descricao'] || row['Regional Empreendimento - Sigla'] || '',
    status: row['Status Contrato'] || '',
    empresa: row['Empresa Contratada'] || '',
    tematica: row['Tipo Cnt'] || '',

    // Financeiros
    valor_contrato: parseNumber(row['Valor Contrato']),
    valor_total_medicao: parseNumber(row['Valor Total Medicao']),
    valor_total_aditivo: parseNumber(row['Valor Total Reajuste']),
    valor_contrato_com_aditivo: parseNumber(row['Valor Contrato e Aditivo'] || row['Valor Contrato']),
    vl_total_ultima_renovacao: parseNumber(row['Vl Total Última Renovação'] || row['Vl Total Ultima Renc']),
    vl_total_aditivo_ultima_renovacao: parseNumber(row['Vl Total Aditivo Última Renovação'] || row['Vl Total Aditivo Ultima Renc']),

    // Datas
    data_inicio_cnt: parseDate(row['Data Inicio Cnt']),
    data_fim_cnt_original: parseDate(row['Data Fim Cnt Original'] || row['Data Fim Cnt Origina']),
    data_fim_cnt_com_aditivos: parseDate(row['Data Fim Cnt Com Aditivos'] || row['Data Fim Cnt Com A']),
    prazo_contratual: parseInt2(row['Prazo Contratual']),
    numero_dias_aditivados: parseInt2(row['Numero Dias Aditivados'] || row['Numero Dias Aditiva']),

    // Contrato
    num_cnt: row['Num Cnt'] || '',
    objeto_cnt: row['Objeto Cnt'] || '',
    tipo_cnt: row['Tipo Cnt'] || '',

    // Paralisação
    dsc_paralisacao: row['Dsc Paralisação'] || row['Dsc Paralisacao'] || row['Dsc. Paralisação'] || null,
    motivo_paralisacao: row['Motivo Paralisação'] || row['Motivo Paralisacao'] || null,
  }
}

// --- Main ---
async function main() {
  console.log('📥 Baixando CSV da PBH...')

  const response = await fetch(CSV_URL, { redirect: 'follow' })
  if (!response.ok) {
    throw new Error(`Erro ao baixar CSV: ${response.status} ${response.statusText}`)
  }

  const csvText = await response.text()
  console.log(`📄 CSV recebido: ${csvText.length} caracteres`)

  // Parsear CSV
  const { data, errors } = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    delimiter: '', // Auto-detect
  })

  if (errors.length > 0) {
    console.warn('⚠️ Erros no parse:', errors.slice(0, 5))
  }

  console.log(`📊 ${data.length} linhas encontradas no CSV`)
  if (data.length > 0) {
    console.log('📋 Colunas:', Object.keys(data[0]).join(', '))
  }

  // Converter para formato do banco
  const obras = data
    .filter(row => row['Empreendimento'] && row['Empreendimento'].trim() !== '')
    .map(csvToObra)

  console.log(`🔄 Inserindo/atualizando ${obras.length} registros...`)

  // Upsert em lotes de 50
  const BATCH_SIZE = 50
  let inserted = 0
  let errors2 = 0

  for (let i = 0; i < obras.length; i += BATCH_SIZE) {
    const batch = obras.slice(i, i + BATCH_SIZE)

    const { error } = await supabase
      .from('obras')
      .upsert(batch, {
        onConflict: 'id_area_empreendimento',
        ignoreDuplicates: false,
      })

    if (error) {
      console.error(`❌ Erro no lote ${i / BATCH_SIZE + 1}:`, error.message)
      errors2++
    } else {
      inserted += batch.length
      process.stdout.write(`  ✅ ${inserted}/${obras.length}\r`)
    }
  }

  console.log(`\n🏁 Concluído: ${inserted} registros atualizados, ${errors2} erros`)
}

main().catch(err => {
  console.error('💥 Erro fatal:', err)
  process.exit(1)
})
