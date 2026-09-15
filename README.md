# fiap-auth-lambda

**Function Serverless de autenticação por CPF → JWT**, executada no **Railway Functions** (runtime **Bun**). Um dos 4 repositórios do Tech Challenge — Fase 3 (SOAT/FIAP).

> O nome do repositório mantém o sufixo `-lambda` por histórico; a autenticação é entregue como uma **Function Serverless** hospedada no **Railway Functions**, e **não** depende de AWS Lambda.

## Parte do sistema (4 repositórios)

| Repositório | Papel |
|---|---|
| [fiap-auth-lambda](https://github.com/MathboyL3/fiap-auth-lambda) | Autenticação por CPF → JWT (Railway Function serverless, Bun) |
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
- **Railway Functions** (produto serverless nativo do Railway — deploy de um único arquivo)
- **PostgreSQL** gerenciado (Railway) via **`node-postgres` (`pg`)**
- **`jsonwebtoken`** (JWT HS256)
- **Vitest** (testes unitários)

## Arquitetura

```mermaid
flowchart LR
  Client([Cliente]) -->|POST /auth {cpf}| S[Railway Function auth\nBun runtime]
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
src/function/index.ts   artefato deployado na Railway Function (arquivo único)
src/                    módulos de referência: cpf, jwt, repository, config, logger
test/                   testes vitest (cpf, jwt)
```

> O `src/function/index.ts` é o código que roda na Function (um único arquivo, imports NPM no
> formato `pacote@versao`, exigido pelo Railway Functions). Os módulos em `src/*.ts` são a fonte
> de verdade da lógica (validação de CPF, JWT, repositório) e alvo dos testes unitários.

## Deploy em nuvem (Railway Functions)
A autenticação roda como uma **Function Serverless** no **Railway Functions**, no mesmo projeto
`fiap-fase3` do banco.

- **URL pública:** https://function-bun-production-8bb2.up.railway.app — `POST /auth` e `GET /health`.
- **Código:** [`src/function/index.ts`](src/function/index.ts). O deploy é feito pelo canvas do
  Railway (aba **Source Code** da Function → **Ctrl+S** para salvar, **Shift+Enter** para deployar).
- **Variáveis** (Railway → Function `fiap-auth` → *Variables*):
  - `JWT_SECRET` — segredo HS256 canônico (igual ao da API .NET);
  - `DATABASE_URL` — Postgres via **TCP proxy público** (`${{Postgres.PGPASSWORD}}`);
  - `PGSSL=require`, e opcionais `JWT_ISSUER`, `JWT_AUDIENCE`, `JWT_EXPIRATION_MINUTES`.

> **Por que TCP proxy e não a rede privada?** O driver `pg` (Node/Bun) não resolve a rede privada
> IPv6-only do Railway; por isso a Function conecta pelo TCP proxy público com SSL. Detalhes em
> [`docs/adr/0003-railway-function-no-railway.md`](docs/adr/0003-railway-function-no-railway.md).

## Execução local
Pré-requisitos: **Bun** e acesso ao Postgres gerenciado.

```bash
# Segredos (NÃO versionar). JWT_SECRET deve ser o MESMO da app .NET.
export JWT_SECRET="<segredo-hs256-de-32+-caracteres>"
export DATABASE_URL="postgresql://postgres:<SENHA>@<host>:<porta>/railway"
export PGSSL=require

bun run src/function/index.ts   # sobe a Function localmente em :3000
curl -X POST localhost:3000/auth -H 'content-type: application/json' -d '{"cpf":"52998224725"}'
```

### Testes unitários
```bash
npm ci && npm test     # testes de cpf e jwt (vitest)
```

## CI/CD (`.github/workflows/ci.yml`)
- **PR → main** e **push → main:** `npm ci`, typecheck (`tsc --noEmit`) e testes (`vitest`).
- O deploy da Function é feito pelo **Railway** (canvas da Function). O `src/function/index.ts` é
  o artefato versionado que se cola/deploya na Function.

## Documentação
- [`docs/adr/0001-estrategia-autenticacao-cpf-jwt.md`](docs/adr/0001-estrategia-autenticacao-cpf-jwt.md)
- [`docs/adr/0003-railway-function-no-railway.md`](docs/adr/0003-railway-function-no-railway.md)
