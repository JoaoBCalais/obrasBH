# 🚀 Setup Completo - ObrasBH com Supabase

Este guia te leva de zero até uma aplicação funcionando com sincronização automática de dados do CKAN.

---

## Passo 1: Setup do Supabase

### 1.1 Criar conta e projeto
1. Acesse https://supabase.com e clique em "Sign Up"
2. Faça login com GitHub ou crie uma conta
3. Clique em "New Project"
4. Preencha:
   - **Project Name:** ObrasBH
   - **Database Password:** Escolha uma senha forte
   - **Region:** São Paulo (sa-east-1)
5. Clique "Create new project" (leva 2-3 minutos)

### 1.2 Executar schema SQL
1. No painel do Supabase, vá para **SQL Editor** (menu esquerdo)
2. Clique em **"New Query"**
3. Copie todo o conteúdo de `sql/schema.sql` deste projeto
4. Cole na janela de query
5. Clique em **"Run"**

Pronto! Sua tabela `obras` foi criada.

### 1.3 Copiar credenciais
1. Clique em **Settings** (engrenagem, menu esquerdo)
2. Vá para **API**
3. Copie:
   - `Project URL` → salve como `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` (chave pública) → salve como `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` (chave privada) → salve como `SUPABASE_SERVICE_ROLE_KEY`

---

## Passo 2: Configurar variáveis de ambiente

### 2.1 Criar `.env.local` na raiz do projeto
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CRON_SECRET=seu-secret-aleatorio-aqui
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

⚠️ **IMPORTANTE:** Nunca commit `.env.local` no Git! Já está no `.gitignore`.

---

## Passo 3: Instalar dependências

```bash
cd C:\Users\JoaoB\OneDrive\Documentos\ObrasBh
npm install
```

Isso vai instalar:
- `@supabase/supabase-js` (cliente do Supabase)
- `papaparse` (para fazer parse do CSV)
- Todas as outras dependências

---

## Passo 4: Testar localmente

### 4.1 Rodar aplicação em desenvolvimento
```bash
npm run dev
```

Vai abrir em `http://localhost:3000`

### 4.2 Sincronizar dados manualmente (para testar)
```bash
curl http://localhost:3000/api/sync-obras
```

Isso vai:
1. Baixar o CSV do CKAN
2. Processar os dados
3. Salvar no Supabase

Se tudo der certo, verá:
```json
{
  "sucesso": true,
  "mensagem": "Sincronização concluída: 123 obras atualizadas",
  "total": 123
}
```

### 4.3 Verificar dados no Supabase
1. Vá ao painel do Supabase
2. Clique em **Table Editor** (menu esquerdo)
3. Clique em tabela `obras`
4. Deve mostrar todas as obras sincronizadas!

---

## Passo 5: Deploy no Vercel (Recomendado)

### 5.1 Preparar repositório Git
```bash
cd C:\Users\JoaoB\OneDrive\Documentos\ObrasBh
git init
git add .
git commit -m "Initial commit: ObrasBH with Supabase integration"
git branch -M main
```

### 5.2 Push para GitHub
```bash
# Criar repositório no GitHub
# Depois rodar:
git remote add origin https://github.com/seu-usuario/obras-bh.git
git push -u origin main
```

### 5.3 Deploy no Vercel
1. Acesse https://vercel.com
2. Clique em "Import Project"
3. Conecte seu repositório GitHub
4. Vercel vai auto-detectar Next.js
5. Em **Environment Variables**, adicione:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   CRON_SECRET=...
   ```
6. Clique em "Deploy"

Vercel vai fazer build e deploy automaticamente! 🎉

---

## Passo 6: Configurar sincronização automática (Cron)

### Opção A: EasyCron (Gratuito, simples)

1. Acesse https://www.easycron.com
2. Clique em "Sign Up"
3. Clique em "New Cron Job"
4. Preencha:
   - **URL:** `https://seu-site.vercel.app/api/sync-obras`
   - **HTTP Basic Auth (optional):** `Authorization: Bearer seu-CRON_SECRET`
   - **Cron Expression:** `0 2 * * *` (todo dia às 2 da manhã UTC)
5. Clique em "Create"

Pronto! Sincroniza automaticamente todo dia.

### Opção B: Vercel Cron (se usar Vercel)

Já está configurado no arquivo `src/app/api/sync-obras/route.ts`. Só precisa de ajuste mínimo em `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/sync-obras",
      "schedule": "0 2 * * *"
    }
  ]
}
```

---

## Passo 7: Monitorar e testar

### Verificar última sincronização
1. Vá para `seu-site.com/api/sync-obras?status=true`
2. Verá status da última sincronização

### Ver logs
1. No painel do Vercel, clique em seu projeto
2. Vá para **Functions** → **sync-obras**
3. Veja logs das execuções

### Testar manualmente
```bash
curl "https://seu-site.vercel.app/api/sync-obras" \
  -H "Authorization: Bearer seu-CRON_SECRET"
```

---

## Troubleshooting

### Erro: "Cannot find module '@supabase/supabase-js'"
```bash
npm install @supabase/supabase-js --save
```

### Erro: "NEXT_PUBLIC_SUPABASE_URL is not defined"
Certifique-se que:
1. `.env.local` existe
2. Tem as variáveis preenchidas
3. Reiniciou o servidor (`npm run dev`)

### Erro: "Service role key is required for sync"
Use `SUPABASE_SERVICE_ROLE_KEY` (não a anon key) para sincronizar.

### Dados não aparecem
1. Verifique se sincronização rodou: `curl /api/sync-obras`
2. Vá ao Supabase Table Editor e veja se há dados
3. Veja console do navegador (F12) para erros

---

## Próximos passos

1. **Adicionar autenticação** - Usuários fazem login e salvam votos
2. **Adicionar mapa** - Mostrar obras geograficamente
3. **Integrar dados financeiros** - Adicionar valores de contrato
4. **Mobile app** - Converter para React Native

---

## Documentação útil

- [Supabase Docs](https://supabase.com/docs)
- [Next.js Docs](https://nextjs.org/docs)
- [Vercel Docs](https://vercel.com/docs)
- [CKAN API](https://docs.ckan.org/en/2.10/api/)

---

**Sucesso! 🎉 Sua aplicação de transparência está viva!**
