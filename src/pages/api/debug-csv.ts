import type { NextApiRequest, NextApiResponse } from 'next'
import Papa from 'papaparse'

/**
 * GET /api/debug-csv
 * Baixa o CSV da PBH e retorna as primeiras 3 linhas + nomes das colunas
 * para diagnosticar problemas de mapeamento.
 */

const CSV_URL =
  'https://drive.google.com/uc?export=download&id=11B4Y3IYF31QLle1_7dsI5MELOg5uwLTm&confirm=t'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const csvResponse = await fetch(CSV_URL, { redirect: 'follow' })
    if (!csvResponse.ok) {
      return res.status(500).json({ error: `Erro HTTP ${csvResponse.status}`, contentType: csvResponse.headers.get('content-type') })
    }

    const csvText = await csvResponse.text()

    // Verificar se veio HTML (página de confirmação do Google Drive)
    if (csvText.trim().startsWith('<!') || csvText.trim().startsWith('<html')) {
      return res.status(200).json({
        error: 'Google Drive retornou HTML em vez de CSV (página de confirmação)',
        primeiros500chars: csvText.substring(0, 500),
        dica: 'O arquivo pode ser grande demais para download direto. Precisamos usar outra abordagem.',
      })
    }

    // Tentar parsear com auto-detect
    const result1 = Papa.parse(csvText, { header: true, skipEmptyLines: true, preview: 3 })

    // Tentar com ; forçado
    const result2 = Papa.parse(csvText, { header: true, skipEmptyLines: true, delimiter: ';', preview: 3 })

    // Mostrar primeiros bytes raw
    const primeirasLinhas = csvText.split('\n').slice(0, 3)

    return res.status(200).json({
      csvTamanho: csvText.length,
      primeiros200chars: csvText.substring(0, 200),
      primeirasLinhasRaw: primeirasLinhas,
      autoDetect: {
        colunas: Object.keys(result1.data[0] || {}),
        qtdColunas: Object.keys(result1.data[0] || {}).length,
        primeiraLinha: result1.data[0],
        erros: result1.errors.slice(0, 3),
      },
      pontoEVirgula: {
        colunas: Object.keys(result2.data[0] || {}),
        qtdColunas: Object.keys(result2.data[0] || {}).length,
        primeiraLinha: result2.data[0],
        erros: result2.errors.slice(0, 3),
      },
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
