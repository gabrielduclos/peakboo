# Peakboo

[English](README.en.md)

**Conversas que viram planos.** Mensageiro open source com agenda compartilhada por conversa, feito em React, Tailwind CSS e componentes Radix no padrão shadcn/ui. API Node/Express, Better Auth e PostgreSQL no Neon. Licença MIT.

## Primeira versão

- Conversas privadas por convite, mensagens de texto e reações.
- Mensagens e alterações da agenda chegam por SSE, sem consultas periódicas ao banco. A conexão pausa quando a aba fica oculta e reconecta com espera progressiva.
- Agenda por conversa e agenda geral com mês, semana e lista; filtros por conversa.
- Criar, editar e cancelar compromissos; presença “Eu vou”, “Talvez” e “Não vou”. Cada novo compromisso também aparece no chat.
- Exportação do compromisso em `.ics` para outros calendários.
- Temas claro/escuro, português/inglês, interface responsiva e configurações em dialog com abas.
- Better Auth com senha mínima de 8 caracteres, controle para mostrar senha, edição do nome, alteração de senha e saída com revogação da sessão.
- O aplicativo principal exige autenticação real e não oferece modo de demonstração. A apresentação do portfólio é compilada separadamente em `dist-portfolio`, com dados fictícios locais e sem login real.

## Desenvolvimento

Requer Node 22+ e PostgreSQL (local ou Neon).

```sh
npm ci
cp .env.example .env
```

Preencha as variáveis e execute em terminais separados:

```sh
node --env-file=.env server/index.mjs
npm run dev
```

O Vite encaminha `/api` para `localhost:3001`. No início, o servidor aplica as migrações do Better Auth e a migração versionada de domínio. As migrações de domínio são serializadas por um bloqueio transacional. Nunca coloque valores de credenciais no código ou em commits.

```sh
npm test
npm run test:integration
npm run build
```

O teste de integração inicia um PostgreSQL descartável e três contas fictícias. Verifica convites, privacidade entre contas, mensagens idempotentes, SSE, presença, eventos, paginação, reações e revogação de sessão. Não acessa o Neon de produção.

## Publicação

Frontend no Cloudflare Workers (Worker `main`, build `npm run build`, deploy `npx wrangler deploy`): [Peakboo](https://main.peakboo.workers.dev). API no Render: `https://peakboo-api.onrender.com`. A origem `https://main.peakboo.workers.dev` deve constar em `FRONTEND_ORIGINS`. A URL da API é definida automaticamente para esse endereço e pode ser substituída por `VITE_API_URL` no build. A publicação privada de revisão em `peakboo-agenda.gabriel-axel.chatgpt.site` usa a mesma API; convites apontam para o aplicativo público, que exige a conta do participante para acessar conversas.

API: Render, plano Free, build `npm ci --include=dev && npm run build`, início `npm start`. O servidor também fornece a interface compilada, permitindo usar uma única origem. Defina `DATABASE_URL`, `BETTER_AUTH_SECRET` (aleatório, pelo menos 32 caracteres), `BETTER_AUTH_URL` (URL externa do serviço) e `FRONTEND_ORIGINS` (origens separadas por vírgula). As credenciais ficam exclusivamente no servidor.

Frontend independente: Cloudflare Worker com Static Assets usando `wrangler.jsonc`. No build, defina `VITE_API_URL` com a URL real da API no Render e adicione a origem do frontend em `FRONTEND_ORIGINS`. Conecte o repositório a Workers Builds para build e deploy automáticos. O frontend hospedado separadamente usa o plugin Bearer oficial do Better Auth; o token permanece no `sessionStorage` da aba.

O build padrão gera duas interfaces: `dist` contém somente o aplicativo real para o Cloudflare; `dist-portfolio` contém somente a demonstração de portfólio servida no Render. Também é possível executar `npm run build:app` ou `npm run build:portfolio` separadamente. A demonstração ignora sessões reais e não faz chamadas à API. As rotas `/api` do Render continuam disponíveis para o aplicativo real no Cloudflare.

## Arquitetura e limites desta versão

As tabelas `rooms`, `members`, `messages`, `events`, `rsvps` e `reactions` guardam os dados. Toda operação de conversa verifica participação no servidor. Somente o criador altera ou cancela seu compromisso. Um convite é um segredo de acesso à conversa; compartilhe-o apenas com quem deve participar.

O SSE usa um distribuidor em memória e foi preparado para uma única instância de API. Para escalar horizontalmente, adicione um mecanismo de distribuição entre instâncias. A conexão com PostgreSQL usa pool limitado a cinco conexões. Não há keep-alive agendado para impedir a suspensão do Render.

Esta versão inclui texto, reações e compromissos de um único dia. Anexos, chamadas, recorrência, notificações push, recuperação por e-mail, sincronização bidirecional com Google Calendar e criptografia de ponta a ponta não estão implementados. Exportar `.ics` não cria sincronização contínua.

## Identidade visual

Violeta é a cor principal; coral, verde, azul e amarelo identificam planos e conversas. Fundos de leitura são neutros e o texto das mensagens tem 16 px. Os tokens dos dois temas estão centralizados em `src/styles.css`. Cores de preenchimento e cores de texto são separadas para manter o contraste.
