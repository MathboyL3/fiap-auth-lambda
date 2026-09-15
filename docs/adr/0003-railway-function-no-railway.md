# ADR 0003 — Railway Function (serverless nativo) no Railway

- **Status:** Aceita
- **Data:** Fase 3

## Contexto
A autenticação precisa rodar em **nuvem real**, como **Function Serverless** (requisito do
enunciado), com **URL pública** e sem custo relevante — e no mesmo provedor do banco gerenciado
para simplificar a operação e a conectividade.

## Decisão
Executar a autenticação no **Railway Functions** (produto serverless nativo do Railway, mesmo
provedor do banco gerenciado), como uma **Function** de arquivo único em runtime **Bun**
([`src/function/index.ts`](../../src/function/index.ts)). O deploy é feito pelo canvas do Railway
(aba **Source Code** da Function → **Ctrl+S** para salvar, **Shift+Enter** para deployar); cada
deploy gera uma versão com rollback.

- O **contrato do JWT não muda** (HS256, `iss/aud=Oficina.Api`, mesmas claims) — o token continua
  interoperável com a API .NET.
- A configuração vem de **variáveis de ambiente** (`JWT_SECRET`, `DATABASE_URL`, e opcionais
  `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_EXPIRATION_MINUTES`, `PGSSL`).
- Os módulos em `src/*.ts` (cpf, jwt, repository, config, logger) são a **fonte de verdade** da
  lógica e alvo dos testes unitários; o `src/function/index.ts` os consolida em um único arquivo,
  como o Railway Functions exige (imports NPM no formato `pacote@versao`).

## Consequências e aprendizados
- (+) Autenticação como **Function Serverless nativa** em nuvem real, com URL pública e versionamento
  automático de cada deploy — atende diretamente ao requisito de "Function Serverless" do enunciado.
- (+) Sem infraestrutura de container para manter (sem Dockerfile): o Railway executa o arquivo Bun.
- **Gotcha — arquivo único:** a Function roda **um único arquivo** (limite de 96KB), com imports NPM
  no formato `pacote@versao`; por isso a lógica é consolidada em `src/function/index.ts`.
- **Gotcha — banco:** o driver `pg` (Node/Bun) não resolve a **rede privada IPv6-only** do
  Railway (`postgres.railway.internal`); a Function conecta pelo **TCP proxy público com SSL**
  (`PGSSL=require`). A API .NET (Npgsql) resolve a rede interna normalmente.
- **Gotcha — deploy:** o código da Function é publicado pelo canvas do Railway (não pela API nem
  por push no GitHub); o `src/function/index.ts` versionado no repositório é o artefato que se cola
  na Function.
