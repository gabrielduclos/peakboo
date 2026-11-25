# PeakBoo

[English](README.en.md)

**Conversas que viram planos.** Mensageiro open source com agenda compartilhada por conversa, feito em React, Tailwind CSS e componentes Radix no padrão shadcn/ui. API Node/Express, Better Auth e PostgreSQL no Neon. Licença MIT.

## Primeira versão

- Grupos privados por convite, mensagens de texto e reações.
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

Frontend independente: Cloudflare Worker com Static Assets usando `wrangler.jsonc`. No build, defina `VITE_API_URL` com a URL real da API no Render e adicione a origem do frontend em `FRONTEND_ORIGINS`. Conecte o repositório a Workers Builds para build e deploy automáticos. O frontend hospedado separadamente usa o plugin Bearer oficial do Better Auth; o token é persistido no `localStorage` da origem para reabertura do PWA, é removido ao sair ou receber uma confirmação de sessão inválida e mantém a expiração de sete dias definida no servidor (renovável após um dia). O token é acessível a JavaScript; proteger a aplicação contra XSS é essencial.

O build padrão gera duas interfaces: `dist` contém somente o aplicativo real para o Cloudflare; `dist-portfolio` contém somente a demonstração de portfólio servida no Render. Também é possível executar `npm run build:app` ou `npm run build:portfolio` separadamente. A demonstração ignora sessões reais e não faz chamadas à API. As rotas `/api` do Render continuam disponíveis para o aplicativo real no Cloudflare.

## Arquitetura e limites desta versão

As tabelas `rooms`, `members`, `messages`, `events`, `rsvps` e `reactions` guardam os dados. Toda operação de conversa verifica participação no servidor. Somente o criador altera ou cancela seu compromisso. Um convite é um segredo de acesso à conversa; compartilhe-o apenas com quem deve participar.

O SSE usa um distribuidor em memória e foi preparado para uma única instância de API. Para escalar horizontalmente, adicione um mecanismo de distribuição entre instâncias. A conexão com PostgreSQL usa pool limitado a cinco conexões. Não há keep-alive agendado para impedir a suspensão do Render.

Esta versão inclui texto, reações e compromissos de um único dia. Anexos, chamadas, recorrência, notificações push, recuperação por e-mail, sincronização bidirecional com Google Calendar e criptografia de ponta a ponta não estão implementados. Exportar `.ics` não cria sincronização contínua.

## Identidade visual

Verde-turquesa e azul definem a identidade visual. O logo é somente o texto PeakBoo, com Peak em turquesa e Boo em azul. Cores de apoio identificam planos e conversas. Fundos de leitura são neutros e o texto das mensagens tem 16 px. Os tokens dos dois temas estão centralizados em `src/styles.css`. Cores de preenchimento e cores de texto são separadas para manter o contraste.

### Fotos e anexos

Fotos de perfil: Configurações → Perfil → Alterar foto. Para alterar a foto da conversa, o criador clica na imagem no cabeçalho. O botão **+** reutiliza o compositor da `main` do [Uorqui](https://github.com/gabrielduclos/uorqui/tree/58e5c199cbf0731bdafaa95ed4bff959ddb559e3) (MIT): galeria, câmera (foto/vídeo), arquivos, localização, gravação de áudio, prévia e editor de fotos. Fotos e vídeos são compactados no dispositivo quando compatível; envio como arquivo mantém o original.

A API aceita até **10 MB por arquivo**, foto de perfil de até **1 MB** e **100 MB por usuário**. Os binários ficam no PostgreSQL, com migração aditiva `002_media.sql`; nenhum arquivo depende do disco temporário do Render. Downloads exigem sessão e participação na conversa. Somente o criador altera a foto da conversa. A demo mantém os arquivos no IndexedDB do navegador e não faz uploads à API. Câmera, microfone e localização dependem de permissão e suporte do navegador.

### Cache, carregamento e mensagens

Fotos de perfil e mídias usam cache em memória por sessão/conta, com deduplicação, revalidação após cinco minutos e descarte no logout. O limite alvo é 64 MB/160 itens; mídias em exibição são preservadas. O skeleton reserva a proporção enviada com a mídia; anexos antigos sem dimensões usam uma moldura fixa 4:3. A interface mostra Foto, Vídeo, Áudio ou Documento, mantendo o nome original apenas no download.

O filtro por período reaproveita as regras de datas locais do Uorqui e combina texto, tipos de mídia e fixadas. A API pesquisa o histórico com paginação, sem limitar a busca à página visível. O menu dos balões adapta responder, copiar, encaminhar, fixar/desafixar, editar texto, cancelar e denunciar. Edição e cancelamento são restritos ao autor. A migração aditiva `003_message_actions.sql` guarda dimensões e estados das mensagens. A demo mantém tudo no navegador.

### Experiência do chat

A lupa abre/recolhe a busca; o filtro de período abre diretamente em cada separador de dia. As ações dos balões usam um menu ancorado (também pelo botão direito), com copiar, editar e cancelar conforme a autoria. O botão de envio tem área circular de 50 px.

Texto, áudio e anexos aparecem de forma otimista, com estado de envio e reenvio usando o mesmo identificador em caso de falha. Ao abrir uma conversa, a rolagem vai ao fim; durante a leitura de mensagens antigas, preserva a posição, exibe um atalho para descer e conta novas mensagens. O player tem forma de onda, busca e velocidades 1×, 1,5× e 2×; a forma de onda depende do suporte de decodificação do navegador. Ao tocar em uma foto, a galeria navega pelas imagens carregadas da conversa e permite zoom pela roda do mouse, pinça ou botões, além de arrastar e usar as setas do teclado.

O botão de áudio compartilha o círculo do envio. A busca abre no cabeçalho; as reações oferecem 24 opções em menu ajustado à janela. As mensagens fixadas aparecem em uma faixa no topo, consultada independentemente da página atual do histórico. Mídias visuais e áudio não exibem tamanho nem link de download sob o balão; o download de fotos permanece na galeria.

O build incorpora o CSS inicial no HTML nas duas versões. Isso evita que uma falha de carregamento ou uma divergência de cache do arquivo CSS deixe a página sem formatação. Os arquivos CSS também são mantidos para compatibilidade, e o HTML do Cloudflare exige revalidação. O build verifica automaticamente a presença dos estilos incorporados.


No mobile, o cabeçalho mostra a marca PeakBoo e as configurações ficam na navegação inferior. Arraste uma mensagem para a direita para responder; rolagem vertical, pinça e controles de mídia continuam independentes. O criador pode abrir a foto do grupo e escolher **Excluir grupo**. A confirmação explica que a exclusão é definitiva para todos e remove mensagens, anexos e compromissos. `DELETE /api/rooms/:room` verifica a autoria no servidor, exclui em uma transação e avisa os participantes pelo SSE. Não há migração adicional; as relações existentes removem os dados dependentes.

### Grupos privados e perfis

O Peakboo é focado em grupos privados, inclusive grupos de duas pessoas. Crie um grupo ou entre com um link/código de convite. O menu não tem contatos, conversas individuais ou exploração de grupos públicos. Os convites podem ser copiados ou exibidos como QR Code gerado localmente; `VITE_APP_URL` define a origem canônica do aplicativo (por padrão, https://main.peakboo.workers.dev).

Em Configurações → Perfil, é possível editar nome, biografia, foto e capa. Não há username nem perfis públicos; links antigos não expõem dados. A API verifica a participação nos grupos antes de entregar mensagens e anexos. A demo continua isolada da API real.

Os dados legados de contatos e conversas individuais permanecem armazenados, mas não são listados nem acessíveis pelos endpoints de grupos. Nenhuma exclusão de dados ou migração destrutiva foi introduzida.

### Tokens, privacidade e notificações internas

O token é o segredo já usado no link de convite; pode ser copiado separadamente e inserido em **Entrar com token**. Links e QR Codes existentes continuam válidos. O servidor restringe mensagens, prévias, buscas, respostas, ações e anexos à data de entrada de cada participante. Reutilizar um token não altera essa data.

A agenda permanece compartilhada. Novos compromissos, alterações e cancelamentos de outros participantes são registrados no servidor e atualizados pelo SSE. Badges mostram mensagens não lidas e avisos da agenda; a central interna inclui lembretes de 60 e 15 minutos. A leitura dos avisos da agenda é armazenada por conta neste navegador, e os lembretes são calculados localmente enquanto o aplicativo está aberto ou ao retornar. Não há push, e-mail nem consultas periódicas adicionais ao banco.

Reações usam alteração otimista e confirmação idempotente. O SSE entrega alterações de reações aos participantes autorizados sem recarregar a agenda; outras mudanças são agrupadas e sincronizadas ao reconectar. A distribuição SSE utiliza a instância única do Render.

### Armazenamento privado no R2

Crie um bucket privado exclusivo (ex.: `peakboo-media`) e um token S3 Object Read & Write limitado ao bucket. Configure `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY` somente no Render. Nunca coloque segredos no frontend. Sem configuração, uploads continuam no Neon; com configuração completa, novos uploads ficam no R2 e o Neon guarda metadados. Falhas no R2 não provocam gravações silenciosas no banco. O acesso continua autenticado pela API. Execute `npm run media:migrate-r2 -- 100` no ambiente do backend para copiar lotes de até 100 arquivos antigos e verificar SHA-256 de cada objeto. Os bytes antigos são preservados nesta etapa; a remoção posterior requer verificação e backup separados. A fila de exclusão de objetos é persistida e processada após exclusão de grupos, no início da API e durante a manutenção. Não habilite acesso público do bucket.

### PWA e Web Push

Instale o Peakboo no navegador (no iOS, Safari → Adicionar à Tela de Início), abra Configurações → Notificações e habilite o dispositivo. A API envia Web Push com VAPID e criptografia RFC 8291; SSE continua ativo para o conteúdo aberto. Prévia desativada por padrão, silêncio por grupo e inscrições vinculadas à sessão autenticada. Ative `PUSH_ENABLED=true` no Render. O par VAPID permanece estável enquanto a chave `PUSH_VAPID_PRIVATE_KEY` (ou o segredo Better Auth usado na derivação HKDF) não mudar. Após rotacionar, reinscreva os dispositivos. O Cron do Cloudflare a cada 5 minutos mantém a API gratuita disponível; a API agenda o próximo lembrete pendente e recalcula após alterações, sem consultas periódicas quando não há lembretes. O envio externo depende da disponibilidade do Render e dos provedores de push, sem garantia de entrega imediata. A aplicação não armazena respostas privadas da API no cache do service worker.

Ao abrir o Peakboo no navegador, o convite de instalação aparece no máximo uma vez por dia local, se a instalação não for detectada. Android e desktop usam o diálogo nativo quando disponível; caso contrário, dispositivos móveis recebem instruções. O convite de push aparece após o login e sem sobrepor o de instalação, se o dispositivo for compatível e ainda não estiver inscrito. Permissões bloqueadas podem ser alteradas nas configurações do navegador.

### Prévias e reações nos grupos

A lista de grupos mostra o remetente, texto ou tipo de mídia da última mensagem. Se alguém reagir mais recentemente a uma mensagem sua, a prévia mostra essa reação. Reações recebidas aparecem também na central interna (até 100 reações ativas dos últimos 30 dias), com leitura por conta neste navegador; remover ou trocar a reação atualiza a atividade. Grupos silenciados não geram avisos internos de reação nem push, mas mantêm a prévia. A migração 009 preserva reações anteriores sem gerar notificações antigas.

### Organização modular da interface

Componentes visuais compartilhados ficam em `src/features/<domínio>/`. A lista de grupos (`groups/GroupsPanel.tsx`) e as visualizações da agenda (`calendar/CalendarViews.tsx`) e o painel do chat (`chat/ChatPanel.tsx`) recebem dados e callbacks por propriedades. Produção e demonstração preservam suas fontes de dados e operações independentes; os componentes compartilhados não importam a API nem o armazenamento da demo. Novas extrações devem manter o comportamento e ser acompanhadas de testes de regressão.

Os diálogos compartilhados de conta (`account/AccountDialogs.tsx`) recebem callbacks de autenticação e troca de senha e conteúdo de perfil e notificações da aplicação de origem. A interface não decide a validade da sessão nem acessa diretamente a API; a demonstração mantém suas restrições e dados isolados.

Os estilos ficam em `src/styles/`, importados em ordem explícita por `src/styles.css`: fundação e tokens, layout, grupos, chat, agenda, diálogos, estados de carregamento e regras responsivas e específicas. A divisão inicial preserva integralmente o conteúdo e a cascata existentes; consolidação de sobrescritas exige validação visual separada. O build mantém o CSS incorporado no HTML das duas variantes.

### Organização do backend

O ponto de entrada `server/index.mjs` coordena a inicialização e a ordem de registro de middleware e rotas. Os módulos de `server/routes/` separam bootstrap, grupos, mensagens, eventos e mídia; `server/middleware/access.mjs` concentra sessão e autorização por grupo, e `server/realtime.mjs` concentra SSE. Os módulos recebem dependências explicitamente. A extração preserva contratos HTTP, consultas SQL, transações, regras de acesso e ordem de registro; não altera o schema. Os testes de registro e integração devem passar antes de integrar mudanças.

### Proteção de scripts e cache privado

As respostas da API usam `Cache-Control: private, no-store`, inclusive autenticação e SSE. O frontend aplica CSP que restringe scripts à própria origem, bloqueia manipuladores JavaScript inline, objetos e enquadramento externo, restringe conexões à própria origem e à API Peakboo no Render e permite estilos inline e mídias blob/data. A demo permite conexões apenas à própria origem. Se mudar `VITE_API_URL`, ajuste `connect-src` no Worker e em `_headers`. O cliente solicita respostas da API sem cache HTTP. O HTML offline usa link sem manipulador inline. A revogação imediata de streams SSE abertos exige avaliação separada. O Worker e `_headers` protegem os assets, e o Render aplica a política à demonstração. O bearer persistente ainda fica no armazenamento local: a CSP reduz a superfície de injeção, mas não elimina o risco de XSS. Uma eventual migração para cookies HttpOnly exige projeto separado com CSRF, CORS, sessões PWA e testes reais. Validar cabeçalhos publicados e fluxos de mídia e login em navegadores antes de declarar a proteção em produção.

### Visualização de perfis e recuperação de mídias

O nome do remetente e os nomes na lista de participantes abrem um perfil somente para leitura (nome, foto, capa e biografia). A rota autenticada `GET /api/profiles/:user` exige uma conta própria ou um grupo privado em comum; não expõe e-mail, sessão ou dados de contato. Não há diretório público na internet, username ou chat individual. A demonstração usa apenas dados locais. Fotos e capas encerram o skeleton em caso de falha de rede ou decodificação; avatares preservam iniciais e capas preservam o fundo. O carregamento de perfis oferece nova tentativa.

A migração do bearer para cookie HttpOnly deve ser tratada separadamente: o frontend Cloudflare e a API Render estão em origens e sites diferentes. Avaliar proxy de API na origem do aplicativo, cookies Secure/HttpOnly/SameSite, CSRF, SSE, uploads e Web Push antes de retirar o bearer. Não mudar a duração da sessão nem invalidar contas existentes sem plano de transição.

## Confirmação de e-mail (Resend)

Verifique um domínio de envio no Resend e crie uma chave com permissão de envio. Configure somente no Render `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (remetente do domínio verificado) e, após testar a entrega, `EMAIL_VERIFICATION_REQUIRED=true`. Por padrão, a confirmação permanece desativada para desenvolvimento e implantação gradual. Ao ativar, cadastros e próximos logins exigem e-mail confirmado; sessões existentes não são revogadas automaticamente. O link expira em uma hora e retorna à origem confiável do aplicativo para novo login. Teste cadastro, reenvio, expiração e login antes de ativar em produção. Nunca grave a chave no Git.
