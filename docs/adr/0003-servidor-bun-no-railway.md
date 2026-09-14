# ADR 0003 — Servidor Bun no Railway (deploy em nuvem real)

- **Status:** Aceita
- **Data:** Fase 3 (extra)

## Contexto
A autenticação foi implementada como **Lambda + API Gateway** sobre **LocalStack** (nuvem AWS
simulada). LocalStack é ótimo para reproduzir a API da AWS localmente, mas **não é nuvem de
verdade**: sem URL pública, sem persistência entre execuções, e o comportamento não é 100%
idêntico ao da AWS. Para a entrega, queríamos os serviços rodando em **nuvem real**, sem custo.

## Decisão
Rodar a autenticação também no **Railway** (mesmo provedor do banco gerenciado), como um
**serviço HTTP de longa duração** com **`Bun.serve`** ([`src/server.ts`](../../src/server.ts)),
reusando exatamente a mesma lógica de negócio (CPF, JWT, repository, config). A imagem é construída
por um **Dockerfile Bun** e o deploy é automático a partir do GitHub.

- O **contrato do JWT não muda** (HS256, `iss/aud=Oficina.Api`, mesmas claims) — o token continua
  interoperável com a API .NET.
- A configuração vem de **variáveis de ambiente** (`JWT_SECRET`, `DATABASE_URL`), sem AWS/Secrets
  Manager.
- A versão **Lambda + API Gateway (LocalStack)** permanece no repositório como alternativa
  (portável para AWS real).

## Consequências e aprendizados
- (+) Autenticação com **URL pública em nuvem real**, deploy contínuo, sem custo relevante.
- (+) Mesma base de código para três topologias (LocalStack, Kubernetes local, Railway).
- (−) No Railway, é um **serviço** (não serverless "puro"): a plataforma não expõe funções AWS-like
  com API Gateway.
- **Gotcha 1 — porta:** o Railway injeta a porta em runtime; o serviço deve escutar em `0.0.0.0`
  e ter `PORT` alinhado ao *target port* do domínio público (fixamos `PORT=3000`).
- **Gotcha 2 — banco:** o driver `pg` (Node/Bun) não resolve a **rede privada IPv6-only** do
  Railway (`postgres.railway.internal`); usamos o **TCP proxy público com SSL**
  (`PGSSL=require`). A API .NET (Npgsql) resolve a rede interna normalmente.
