# Reboka

Sistema para guincho e reboque: chamados, cotação por km, despacho e cobrança. Produto da Enter Labs Tecnologia Ltda.
Nasceu do motor do Auttos (que veio do ClinicLoop e do AppLavaCar).

## Stack

- **Site e ajuda:** Astro (HTML estático, Cloudflare Workers)
- **Banco e login:** Supabase (Postgres com RLS por empresa; nas tabelas, cada empresa é uma "loja", prefixo `reboka_`)
- **Painel (/app):** React dentro do Astro, falando direto com o Supabase
- **Demonstração sem login:** `/app/?demo=1` (dados fictícios em memória, serve de painel de teste)

## Comandos

```
npm install
npm run dev      # http://localhost:4321
npm run build    # gera dist/
npm run prints   # prints desktop e mobile em docs/prints (rodar após o build)
```

## Como o chamado funciona

O chamado usa a tabela `reboka_agendamentos` do motor. As fases reaproveitam os status que já existiam:

| Na tela | No banco |
|---|---|
| Agendado | `confirmado` |
| Novo | `fila` |
| A caminho | `em_servico` |
| Carregado | `pronto` |
| Entregue | `entregue` |

A cotação (`cotar` em `src/app/util.ts`) é: saída + km além da franquia × valor por km, mais o acréscimo noturno e os adicionais.
O socorro (serviço cujo nome começa com "Socorro") usa o preço fechado do serviço. A tabela de preço fica em `reboka_lojas` (`tarifa_*`).
Sem API de mapas: a pessoa digita o km e um link abre a rota no Google Maps para conferir.

## Onde mexer

| O quê | Arquivo |
|---|---|
| Cores, fontes, sombra | `src/styles/global.css` |
| Logo | `scripts/gera_logo.py` gera `src/data/logo.json` |
| Dados da empresa, planos e preços | `src/data/site.ts` |
| Landing | `src/pages/index.astro` |
| Tela de chamados | `src/app/Chamados.tsx` |
| Dados da demonstração | `src/app/demo.ts` |
| Banco | `supabase/migrations/` (a 0024 é a do guincho) |

## Regras do projeto

- Identidade visual única: usar só os tokens de `global.css` em qualquer tela.
- Toda mudança visual gera prints desktop e mobile antes do merge.
- Menor custo operacional: sem API paga de mapas ou de WhatsApp nesta fase.

## Fora do menu nesta fase

Agenda por horário, funil de orçamentos, reativação, contratos, fidelidade, mensagens e Atendente IA continuam no código, mas fora do menu
(`FORA_DO_MENU` em `src/app/App.tsx`). A Atendente IA ainda agenda por horário e precisa aprender a cotar antes de voltar.

## Pendências

- **Banco:** fica no projeto Supabase **Enter-Labs** (dividido com outros produtos, tabelas `reboka_`), com as migrations 0001 a 0024 aplicadas em 22/11/2026. Para sair para um banco próprio: criar o projeto, aplicar `supabase/migrations/` em ordem, copiar os dados e trocar `src/app/config.ts` e `wrangler.jsonc`.
- **Publicação:** falta conectar o repositório a um Worker chamado `reboka` no Cloudflare (build `npm run build`, deploy `npx wrangler deploy`) e cadastrar os segredos `MP_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET` e `SUPABASE_SECRET_KEY`.
- **Domínio:** `reboka.com.br` está nos textos, mas não foi verificado nem registrado.
- **Identidade e preços:** cor âmbar, logo e preços (R$ 97 e R$ 197) são provisórios.
- **Próximos blocos:** vistoria com fotos na coleta e na entrega, cálculo automático de km, Atendente IA que cota pelo WhatsApp, termos e privacidade com revisão jurídica.
