# ADR 0003 — Servidor Bun no Railway (nuvem real)

- **Status:** Aceita
- **Data:** Fase 3

## Contexto
A autenticação precisa rodar em **nuvem real**, com **URL pública** e deploy contínuo, sem custo
relevante — e no mesmo provedor do banco gerenciado para simplificar a operação e a conectividade.

## Decisão
Executar a autenticação no **Railway** (mesmo provedor do banco gerenciado) como um **serviço HTTP
de longa duração** com **`Bun.serve`** ([`src/server.ts`](../../src/server.ts)). A imagem é
construída por um **Dockerfile Bun** e o deploy é automático a partir do GitHub (push na `main`).

- O **contrato do JWT não muda** (HS256, `iss/aud=Oficina.Api`, mesmas claims) — o token continua
  interoperável com a API .NET.
- A configuração vem de **variáveis de ambiente** (`JWT_SECRET`, `DATABASE_URL`).

## Consequências e aprendizados
- (+) Autenticação com **URL pública em nuvem real**, deploy contínuo, sem custo relevante.
- (+) Mesma base de código reaproveitada (cpf, jwt, repository, config).
- **Gotcha 1 — porta:** o Railway injeta a porta em runtime; o serviço deve escutar em `0.0.0.0`
  e ter `PORT` alinhado ao *target port* do domínio público (fixamos `PORT=3000`).
- **Gotcha 2 — banco:** o driver `pg` (Node/Bun) não resolve a **rede privada IPv6-only** do
  Railway (`postgres.railway.internal`); usamos o **TCP proxy público com SSL** (`PGSSL=require`).
  A API .NET (Npgsql) resolve a rede interna normalmente.
