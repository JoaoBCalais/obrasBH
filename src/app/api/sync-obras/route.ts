import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false
  }
})

interface ObraProcessada {
  id_area_empreendimento: string
  numero_po: string
  nome: string
  regional: string
  status: string
  empresa: string
  tematica: string
  fonte: 'powerbi' | 'ckan'

// Baixar dados do PowerBI (Google Drive)
async function downloadPowerBIData(): Promise<string> {
  const googleDriveId = '11B4Y3IYF31QLle1_7dsI5MELOg5uwLTm'
  const url = `https://drive.google.com/uc?id=${googleDriveId}&export=download`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } catch (error) {
    console.error('Erro ao baixar CSV do PowerBI:', error)
    throw error
  }

// Processar dados do PowerBI
function processarPowerBIData(csvText: string): ObraProcessada[] {
  return new Promise((resolve, reject) => {
    console.log('\n\n========================================')
    console.log('DIAGNÓSTICO DO CSV - POWERBI')
    console.log('========================================')
    console.log(`CSV tamanho: ${csvText.length} caracteres`)
    console.log(`Primeiras 500 caracteres:`)
    console.log(csvText.substring(0, 500))
    console.log('========================================\n')

    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      delimiter: ';',
      complete: (results: any) => {
        console.log(`\nTotal de linhas parseadas: ${results.data.length}`)

        if (results.data.length > 0) {
          const colunas = Object.keys(results.data[0] || {})
          console.log(`\n=== COLUNAS ENCONTRADAS (${colunas.length} colunas) ===`)
          colunas.forEach((col, idx) => {
            console.log(`  ${idx}: "${col}"`)
          })
          console.log(`\n=== PRIMEIRA LINHA DE DADOS ===`)
          console.log(JSON.stringify(results.data[0], null, 2))
          console.log('================================\n')
        }

        console.log(`\n>>> FILTRANDO ${results.data.length} LINHAS <<<`)

        const obras = results.data
          .filter((row: any, idx: number) => {
            const empreendimento = row['Empreendimento']
            if (idx < 3) {
              console.log(`Row ${idx}: Empreendimento="${empreendimento}" (exists: ${!!empreendimento})`)
            }
            return empreendimento && empreendimento.trim()
          })
          .map((row: any) => {
            const empreendimento = row['Empreendimento'] || ''
            const numCnt = row['Num Cnt'] || ''
            const statusContrato = row['Status Contrato'] || 'Desconhecido'
            const descEmpreendimento = row['Desc Empreendimento'] || 'Sem nome'
            const regionalDesc = row['Regional Empreendimento - Descricao'] || 'Não informado'
            const empresa = row['Empresa Contratada'] || 'Não informado'
            const objetoCnt = row['Objeto Cnt'] || 'Infraestrutura'

            return {
              id_area_empreendimento: empreendimento,
              numero_po: numCnt,
              nome: descEmpreendimento,
              regional: regionalDesc,
              status: mapearStatusPowerBI(statusContrato),
              empresa: empresa,
              tematica: objetoCnt.substring(0, 50),
              fonte: 'powerbi' as const
            }
          })

        console.log(`Total de obras processadas: ${obras.length}\n`)
        resolve(obras)
      },
      error: (error: any) => {
        console.error('Erro ao fazer parse do CSV:', error)
        reject(error)
      }
    })
  })

function mapearStatusPowerBI(situacao: string): string {
  const normalizado = situacao?.trim() || ''

  const mapa: Record<string, string> = {
    'Em andamento': 'EM_ANDAMENTO',
    'Paralisado': 'PARALISADA',
    'Concluído': 'CONCLUIDA',
    'Rescindido': 'RESCINDIDA',
    'Distratado': 'DISTRATATA',
    'Aguardando': 'AGUARDANDO'
  }

  return mapa[normalizado] || normalizado

async function salvarNoSupabase(obras: ObraProcessada[]): Promise<number> {
  // Limpar tabela antiga
  await supabase.from('obras').delete().neq('id', -1)

  // Inserir novos dados em chunks
  const chunkSize = 100
  let totalInserido = 0

  for (let i = 0; i < obras.length; i += chunkSize) {
    const chunk = obras.slice(i, i + chunkSize)
    const { error, data } = await supabase
      .from('obras')
      .insert(chunk)
      .select()

    if (error) {
      console.error('Erro ao inserir chunk:', error)
      throw error
    }

    totalInserido += chunk.length
  }

  return totalInserido

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { erro: 'Não autorizado' },
      { status: 401 }
    )
  }

  try {
    console.log('Iniciando sincronização de obras (PowerBI)...')

    // 1. Baixar dados do PowerBI
    console.log('Baixando dados do PowerBI...')
    const csvText = await downloadPowerBIData()
    console.log('CSV baixado com sucesso')

    // 2. Processar dados
    console.log('Processando dados...')
    const obrasProcessadas = await processarPowerBIData(csvText)
    console.log(`Processados ${obrasProcessadas.length} registros`)

    // Contar distribuição de status
    const statusContagem: Record<string, number> = {}
    obrasProcessadas.forEach(obra => {
      statusContagem[obra.status] = (statusContagem[obra.status] || 0) + 1
    })

    // 3. Salvar no Supabase
    console.log('Salvando no Supabase...')
    const totalInserido = await salvarNoSupabase(obrasProcessadas)
    console.log(`Inseridos ${totalInserido} registros no Supabase`)

    return NextResponse.json({
      sucesso: true,
      mensagem: `Sincronização concluída: ${totalInserido} obras atualizadas`,
      timestamp: new Date().toISOString(),
      total: totalInserido,
      statusContagem: statusContagem,
      fonte: 'PowerBI (CONTRATOS-SGEE.csv)'
    })
  } catch (error) {
    console.error('Erro na sincronização:', error)
    return NextResponse.json(
      {
        erro: 'Erro ao sincronizar dados',
        detalhes: error instanceof Error ? error.message : 'Desconhecido'
      },
      { status: 500 }
    )
  }

export const maxDuration = 60
