# Setup Supabase para ObrasBH

## 1. Criar conta no Supabase
- Acesse https://supabase.com
- Clique em "Sign Up"
- Faça login com GitHub ou email

## 2. Criar novo projeto
- Clique em "New Project"
- **Project Name:** ObrasBH
- **Database Password:** Escolha uma senha forte
- **Region:** São Paulo (sa-east-1) - se disponível
- Clique em "Create new project"

⏳ *Leva uns 2-3 minutos para criar*

## 3. Executar schema SQL
- Vá para **SQL Editor** no painel esquerdo
- Clique em **"New Query"**
- Cole o conteúdo de `sql/schema.sql`
- Clique em **"Run"**
- Pronto! Tabela criada.

## 4. Copiar credenciais
Vá para **Settings** → **API** e copie:
- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` (chave pública) → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 5. Criar arquivo `.env.local`
Na raiz do projeto, crie `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...  # Copie de Settings → API
```

⚠️ **IMPORTANTE:** O `SUPABASE_SERVICE_ROLE_KEY` é a chave privada - **nunca commita no Git**!

## 6. Instalar pacotes
```bash
npm install @supabase/supabase-js
```

## Pronto! 🎉
Seu banco de dados está criado e pronto para sincronizar dados do CKAN.
