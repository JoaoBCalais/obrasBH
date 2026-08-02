# ⚡ Guia Rápido - ObrasBH com Dados Reais

## ✅ O que foi criado

Seu projeto agora tem:
- ✅ **Sincronização automática** do CKAN (dados reais de BH)
- ✅ **Banco de dados Supabase** para armazenar obras
- ✅ **Vercel Function** que roda diariamente
- ✅ **Frontend atualizado** para consumir dados reais
- ✅ **Zero custo** (planos gratuitos de Supabase + Vercel)

---

## 🚀 Próximos passos (5 minutos)

### 1. Criar conta Supabase
- Acesse https://supabase.com
- Sign up com GitHub ou email
- Crie um novo projeto

### 2. Executar schema SQL
- Copie conteúdo de `sql/schema.sql`
- Cole em SQL Editor do Supabase
- Execute

### 3. Configurar `.env.local`
Copie da dashboard do Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 4. Instalar e rodar
```bash
npm install
npm run dev
```

### 5. Testar sincronização
```bash
curl http://localhost:3000/api/sync-obras
```

---

## 📁 Arquivos novos

| Arquivo | O que faz |
|---------|-----------|
| `sql/schema.sql` | Schema do banco de dados |
| `src/app/api/sync-obras/route.ts` | Função que sincroniza CKAN → Supabase |
| `src/hooks/useObras.ts` | Hook React para consumir dados |
| `.env.example` | Variáveis de ambiente necessárias |
| `vercel.json` | Configuração do cron job |
| `SETUP_COMPLETO.md` | Guia passo-a-passo completo |

---

## 🔄 Como funciona

```
Dia 1 - 2:00 AM:
  CKAN (dados públicos) 
    ↓ (Vercel Function)
  CSV → Processa → Supabase
    ↓ (seu frontend)
  React consome dados → Usuário vê dashboard atualizado
```

---

## 💾 O que foi mudado no projeto original

- `package.json` → Adicionou `@supabase/supabase-js` e `papaparse`
- `src/pages/index.tsx` → Agora usa `useObras()` ao invés de mock
- `.env.example` → Adicionou variáveis Supabase

O resto do projeto **continua igual**! CSS, componentes, tudo funciona.

---

## 🎯 Diferenças: Mock vs Dados Reais

### Mock (original)
- 6 obras hardcoded
- Valores financeiros fictícios
- Sem atualização

### Dados Reais (novo)
- Todas as obras de BH (100+)
- Dados reais do CKAN
- Atualiza todo dia automaticamente
- Pode filtrar por status, regional, empresa

---

## 📞 Suporte

Se der erro, verifique:
1. `.env.local` existe e tem as chaves?
2. Tabela `obras` foi criada no Supabase?
3. Npm install rodou sem erros?
4. Reiniciou o servidor (`npm run dev`)?

---

**Pronto! Seu app de transparência está rodando com dados reais!** 🎉
