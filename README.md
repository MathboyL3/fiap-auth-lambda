# fiap-auth-lambda

**Serviço serverless de autenticação por CPF → JWT**, executado como container **Bun** em **nuvem real (Railway)**. Um dos 4 repositórios do Tech Challenge — Fase 3 (SOAT/FIAP).

> O nome do repositório mantém o sufixo `-lambda` por histórico; a autenticação é entregue como um **serviço HTTP de longa duração** (`Bun.serve`) hospedado no Railway, e **não** depende de AWS Lambda.

## Parte do sistema (4 repositórios)

| Repositório | Papel |
|---|---|
| [fiap-auth-lambda](https://github.com/MathboyL3/fiap-auth-lambda) | Autenticação por CPF → JWT (serverless Bun, Railway) |
| [fiap-app](https://github.com/MathboyL3/fiap-app) | API principal da oficina (.NET / Kubernetes) |
| [fiap-infra-k8s](https://github.com/MathboyL3/fiap-infra-k8s) | Infra do cluster + gateway Kong (Terraform) |
| [fiap-infra-db](https://github.com/MathboyL3/fiap-infra-db) | Banco de dados gerenciado (Terraform + Railway) |

> Arquitetura, diagrama de componentes (cloud) e diagramas de sequência:
> [fiap-app/docs/ARQUITETURA.md](https://github.com/MathboyL3/fiap-app/blob/main/docs/ARQUITETURA.md).

## Propósito
Proteger rotas sensíveis da aplicação exigindo autenticação do **cliente por CPF**:
1. Recebe o CPF (`POST /auth`).
2. **Valida** o CPF (dígitos verificadores).
3. **Consulta** a existência do cliente na base (tabela `clientes`, banco gerenciado do `fiap-infra-db`).
4. **Gera e devolve um JWT** (HS256) válido para consumir as APIs protegidas do `fiap-app`.

## Tecnologias
- **TypeScript** sobre o runtime **Bun** (`Bun.serve`)
- **PostgreSQL** gerenciado (Railway) via **`node-postgres` (`pg`)**
- **`jsonwebtoken`** (JWT HS256)
- **Vitest** (testes unitários)
- **Docker** (imagem `oven/bun`) + **Railway** (deploy contínuo a partir do GitHub)

## Arquitetura

```mermaid
flowchart LR
  Client([Cliente]) -->|POST /auth {cpf}| S[Serviço auth\nBun.serve — Railway]
  S -->|SELECT clientes WHERE cpf| DB[(PostgreSQL gerenciado\nRailway)]
  S -->|200 access_token JWT| Client
```

### Contrato da API
`POST /auth`  — corpo `{"cpf": "529.982.247-25"}`

| Status | Quando | Corpo |
|---|---|---|
| `200` | CPF válido e cliente existe | `{ access_token, token_type: "Bearer", expires_in }` |
| `400` | CPF ausente/inválido | `{ error }` |
| `404` | CPF válido, cliente não cadastrado | `{ error }` |
| `500` | erro interno | `{ error }` |

`GET /health` — `200 "ok"` (health check).

### Contrato do JWT (interoperável com a app .NET)
- **Algoritmo:** HS256, **mesmo `secret`** da `fiap-app`.
- **`iss`/`aud`:** `Oficina.Api` / `Oficina.Api`.
- **Claims:** `sub`=id do cliente, `email`, `role`=`Cliente`, `cpf`, `name`, `jti`, `exp` (60 min).

## Estrutura
```
src/        server (Bun.serve), cpf, jwt, repository, config, logger
test/       testes vitest (cpf, jwt)
Dockerfile  imagem Bun para o Railway
```

## Deploy em nuvem (Railway)
A autenticação roda em **nuvem real** no **Railway**, no mesmo projeto `fiap-fase3` do banco, como
um **serviço HTTP** (`Bun.serve`) de longa duração.

- **URL pública:** https://fiap-auth-production.up.railway.app — `POST /auth` e `GET /health`.
- **Código:** [`src/server.ts`](src/server.ts) (Bun) + [`Dockerfile`](Dockerfile). Autodeploy a cada push na `main`.
- **Variáveis** (Railway → serviço `fiap-auth`):
  - `JWT_SECRET` — segredo HS256 canônico (igual ao da API .NET);
  - `DATABASE_URL` — Postgres via **TCP proxy público** com `${{Postgres.PGPASSWORD}}`;
  - `PGSSL=require`, `PORT=3000` (alinhado ao *target port* do domínio).

> **Por que TCP proxy e não a rede privada?** O driver `pg` (Node/Bun) não resolve a rede privada
> IPv6-only do Railway; a API .NET (Npgsql) resolve e usa a rede interna. Detalhes em
> [`docs/adr/0003-servidor-bun-no-railway.md`](docs/adr/0003-servidor-bun-no-railway.md).

## Execução local
Pré-requisitos: **Bun** (ou Docker) e acesso ao Postgres gerenciado.

```bash
# Segredos (NÃO versionar). JWT_SECRET deve ser o MESMO da app .NET.
export JWT_SECRET="<segredo-hs256-de-32+-caracteres>"
export DATABASE_URL="postgresql://postgres:<SENHA>@<host>:<porta>/railway"
export PGSSL=require

bun run src/server.ts           # sobe o serviço em :3000
curl -X POST localhost:3000/auth -H 'content-type: application/json' -d '{"cpf":"52998224725"}'
```

### Testes unitários
```bash
npm ci && npm test     # testes de cpf e jwt (vitest)
```

## CI/CD (`.github/workflows/ci.yml`)
- **PR → main** e **push → main:** `npm ci`, typecheck (`tsc --noEmit`) e testes (`vitest`).
- O deploy é feito pelo **Railway** (autodeploy a partir da `main`).

## Documentação
- [`docs/adr/0001-estrategia-autenticacao-cpf-jwt.md`](docs/adr/0001-estrategia-autenticacao-cpf-jwt.md)
- [`docs/adr/0003-servidor-bun-no-railway.md`](docs/adr/0003-servidor-bun-no-railway.md)
