# ObrasBH — Registro de Atualizações

## Sessão: 01 de Agosto de 2026

### 1. Correção do filtro de status (bug "Em andamento 0")
O frontend mostrava 0 obras "Em andamento" apesar do banco ter registros com esse status. O problema era que `"Em Andamento".toUpperCase()` gerava `"EM ANDAMENTO"` (com espaço), mas o código esperava `"EM_ANDAMENTO"` (com underscore).

**Solução:** Criada função `normalizeStatus()` em `src/lib/format.ts` com mapeamento completo de todos os status, incluindo variantes com e sem acento. Adicionados novos status: `EM_NEGOCIACAO`, `CANCELADO`, `DISTRATATA`, `AGUARDANDO`.

**Arquivos alterados:** `src/lib/format.ts`, `src/hooks/useObras.ts`

---

### 2. Integração com dados financeiros reais da PBH
Os cards mostravam valores zerados (valor contrato, gasto, prazo) porque o banco não tinha essas colunas e o frontend usava valores hardcoded.

**Fonte de dados:** CSV `CONTRATOS-SGEE.csv` do Power BI da SMOBI/PBH, hospedado no Google Drive. Contém 29 colunas com dados financeiros, datas e informações de contrato.

**Migração SQL criada** (`sql/migration_add_columns.sql`):
- Adicionadas 16 colunas: `valor_contrato`, `valor_total_medicao`, `valor_total_aditivo`, `valor_contrato_com_aditivo`, `data_inicio_cnt`, `data_fim_cnt_original`, `data_fim_cnt_com_aditivos`, `prazo_contratual`, `numero_dias_aditivados`, `num_cnt`, `objeto_cnt`, `tipo_cnt`, `dsc_paralisacao`, `motivo_paralisacao`, `vl_total_ultima_renovacao`, `vl_total_aditivo_ultima_renovacao`
- Removidas colunas placeholder antigas: `valor_gasto`, `pct_execucao`, `prazo_original`, `prazo_atual`, `trabalhadores`, `custo_dia`

**Arquivos alterados:** `sql/migration_add_columns.sql`, `sql/schema.sql`, `src/hooks/useObras.ts`

---

### 3. Reescrita do CardObra com dados reais
Cards agora mostram informações calculadas a partir dos dados do CSV:
- **Percentual de execução:** `valor_total_medicao / valor_contrato * 100`
- **Custo/dia:** `valor_total_medicao / dias corridos desde início`
- Barra de progresso com cor por status (verde=concluída, laranja=paralisada, vermelho=vencido, azul=em andamento)
- Alerta de paralisação quando existe descrição
- Detalhes expandidos: empresa, contrato, objeto, prazos, datas, saldo restante

**Arquivos alterados:** `src/components/CardObra.tsx`

---

### 4. KPIs no dashboard
Adicionados 4 indicadores no topo da página:
- Total de contratos
- Em andamento (com % do total)
- Valor total em contratos
- Valor medido (com % executado)

**Arquivos alterados:** `src/pages/index.tsx`, `src/styles/Home.module.css`

---

### 5. Remoção do CalculadoraImpacto
Componente removido porque fazia um cálculo de impacto tributário impreciso e potencialmente enganoso.

**Arquivos alterados:** `src/pages/index.tsx`

---

### 6. Sistema de sincronização automática (CSV → Supabase)
Criado mecanismo para baixar o CSV da PBH e atualizar o banco de dados.

**API Route** (`src/pages/api/sync.ts` — POST):
- Baixa CSV do Google Drive
- Decodifica como Latin-1 (ISO-8859-1) — encoding usado pela PBH
- Detecta delimitador automaticamente (`;` ou `,`)
- Parseia datas no formato `YYYY/MM/DD HH:mm:ss`
- Usa `findCol()` para encontrar colunas com nomes corrompidos por encoding
- Upsert em lotes de 50 usando `id_area_empreendimento` como chave de conflito
- Retorna diagnóstico completo: linhas CSV, registros válidos, inseridos, erros, colunas, exemplo

**Script standalone** (`scripts/sync-contratos.ts`):
- Mesma lógica da API route, executável via `npx ts-node scripts/sync-contratos.ts`

**Endpoint de debug** (`src/pages/api/debug-csv.ts` — GET):
- Mostra estrutura raw do CSV, compara auto-detect vs delimitador `;`

**Botão no frontend:** "Atualizar dados da PBH" no rodapé, com feedback visual e log no console.

**Arquivos criados:** `src/pages/api/sync.ts`, `src/pages/api/debug-csv.ts`, `scripts/sync-contratos.ts`
**Arquivos alterados:** `src/pages/index.tsx`, `.env.example`

---

### Problemas resolvidos durante o desenvolvimento
| Problema | Causa | Solução |
|----------|-------|---------|
| Status "Em andamento 0" | `toUpperCase()` gera espaços, não underscores | `normalizeStatus()` com mapeamento |
| Cards com valores zerados | Banco sem colunas financeiras | Migração SQL + dados do CSV PBH |
| CSV com caracteres corrompidos | Encoding Latin-1 lido como UTF-8 | `TextDecoder('latin1')` |
| Datas invertidas | CSV usa YYYY/MM/DD, parser assumia DD/MM/YYYY | Detecção automática do formato |
| Colunas não encontradas | Nomes com acentos corrompidos | `findCol()` com match por prefixo |
| Sync 200 mas sem dados | Delimitador `;` não detectado pelo PapaParse | Detecção manual + delimitador forçado |

---

### Estrutura atual do projeto
```
ObrasBh/
├── sql/
│   ├── schema.sql
│   └── migration_add_columns.sql
├── scripts/
│   └── sync-contratos.ts
├── src/
│   ├── components/
│   │   └── CardObra.tsx
│   ├── hooks/
│   │   └── useObras.ts
│   ├── lib/
│   │   └── format.ts
│   ├── pages/
│   │   ├── api/
│   │   │   ├── sync.ts
│   │   │   └── debug-csv.ts
│   │   └── index.tsx
│   └── styles/
│       └── Home.module.css
├── .env.example
└── package.json
```

### Variáveis de ambiente necessárias
- `NEXT_PUBLIC_SUPABASE_URL` — URL do projeto Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Chave anon do Supabase
- `SUPABASE_SERVICE_ROLE_KEY` — Chave service role (para escrita via sync)
- `SYNC_API_KEY` — Chave opcional para proteger o endpoint /api/sync
