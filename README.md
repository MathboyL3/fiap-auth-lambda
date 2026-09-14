# fiap-auth-lambda

**Function Serverless** (AWS Lambda, **Node.js/TypeScript**) de autenticação por **CPF → JWT**, exposta via **API Gateway**. Um dos 4 repositórios do Tech Challenge — Fase 3 (SOAT/FIAP).

## Parte do sistema (4 repositórios)

| Repositório | Papel |
|---|---|
| [fiap-auth-lambda](https://github.com/MathboyL3/fiap-auth-lambda) | Autenticação por CPF → JWT (API Gateway + Lambda) |
| [fiap-app](https://github.com/MathboyL3/fiap-app) | API principal da oficina (.NET / Kubernetes) |
| [fiap-infra-k8s](https://github.com/MathboyL3/fiap-infra-k8s) | Infra do cluster (Terraform) |
| [fiap-infra-db](https://github.com/MathboyL3/fiap-infra-db) | Banco de dados gerenciado (Terraform + Railway) |

> Arquitetura, diagrama de componentes (cloud) e diagramas de sequência:
> [fiap-app/docs/ARQUITETURA.md](https://github.com/MathboyL3/fiap-app/blob/main/docs/ARQUITETURA.md).

Provisionada por **Terraform** contra **LocalStack** (AWS local, gratuito e offline). O código e o Terraform são idênticos ao que rodaria na AWS real — só muda o endpoint.

## Propósito
Proteger rotas sensíveis da aplicação exigindo autenticação do **cliente por CPF**:
1. Recebe o CPF (`POST /auth`).
2. **Valida** o CPF (dígitos verificadores).
3. **Consulta** a existência do cliente na base (tabela `clientes`, banco gerenciado do `fiap-infra-db`).
4. **Gera e devolve um JWT** (HS256) válido para consumir as APIs protegidas do `fiap-app`.

## Tecnologias
- **Node.js 20 / TypeScript** (AWS Lambda handler)
- **AWS API Gateway + Lambda + Secrets Manager + IAM + CloudWatch Logs** (via **LocalStack**)
- **Terraform** (`hashicorp/aws ~> 5`)
- **PostgreSQL** (Railway — `node-postgres`)
- **Vitest** (testes), **esbuild** (bundle)

## Arquitetura

```mermaid
flowchart LR
  Client([Cliente]) -->|POST /auth {cpf}| APIGW[API Gateway\nPOST /auth]
  APIGW -->|AWS_PROXY| L[Lambda fiap-auth\nNode 20]
  L -->|GetSecretValue| SM[(Secrets Manager\njwt-secret / database-url)]
  L -->|SELECT clientes WHERE cpf| DB[(Postgres gerenciado\nRailway)]
  L -->|200 access_token JWT| APIGW --> Client
  subgraph LocalStack["LocalStack (AWS local)"]
    APIGW
    L
    SM
  end
```

### Contrato da API
`POST /auth`  — corpo `{"cpf": "529.982.247-25"}`

| Status | Quando | Corpo |
|---|---|---|
| `200` | CPF válido e cliente existe | `{ access_token, token_type: "Bearer", expires_in }` |
| `400` | CPF ausente/inválido | `{ error }` |
| `404` | CPF válido, cliente não cadastrado | `{ error }` |
| `500` | erro interno | `{ error }` |

### Contrato do JWT (interoperável com a app .NET)
- **Algoritmo:** HS256, **mesmo `secret`** da `fiap-app`.
- **`iss`/`aud`:** `Oficina.Api` / `Oficina.Api`.
- **Claims:** `sub`=id do cliente, `email`, `role`=`Cliente`, `cpf`, `name`, `jti`, `exp` (60 min).

## Estrutura
```
src/        handler, cpf, jwt, repository, config, logger
test/       testes vitest (cpf, jwt, handler)
terraform/  aws_lambda_function + api_gateway + secretsmanager + iam (LocalStack)
scripts/    package (esbuild+zip), deploy-local, smoke-test
```

## Execução local (deploy + teste e2e)
Pré-requisitos: **Docker**, **Terraform ≥ 1.5**, **Node 20+**.

```bash
# 1) Segredos (NÃO versionar). JWT_SECRET deve ser o MESMO da app .NET.
export JWT_SECRET="<segredo-hs256-de-32+-caracteres>"
export DATABASE_URL="postgresql://postgres:<SENHA>@gondola.proxy.rlwy.net:11177/railway"

# 2) Deploy completo (sobe LocalStack, empacota e aplica o Terraform)
./scripts/deploy-local.sh

# 3) Testar o endpoint (usa o CPF informado ou um default)
./scripts/smoke-test.sh 52998224725
```
O endpoint sai em `terraform output auth_url_localstack`:
`http://localhost:4566/restapis/<id>/prod/_user_request_/auth`

### Testes unitários
```bash
npm ci && npm test     # 11 testes (cpf, jwt, handler)
```

## CI/CD (`.github/workflows/ci.yml`)
- **PR → main:** `npm ci`, typecheck, testes, `package` (esbuild+zip), `terraform fmt/validate`.
- **push → main (merge):** sobe **LocalStack** como service, `terraform apply` e **smoke test** do gateway.
- Secrets necessários: `JWT_SECRET`, `DATABASE_URL` (Settings → Secrets → Actions).

## Nota de portabilidade (LocalStack → AWS)
Para rodar na AWS real: remova o bloco `endpoints` do provider (`terraform/versions.tf`) e use credenciais reais. O restante (Lambda, API Gateway, Secrets Manager, IAM) é idêntico. Ver `docs/adr/0001-*`.

## Documentação
- [`docs/adr/0001-estrategia-autenticacao-cpf-jwt.md`](docs/adr/0001-estrategia-autenticacao-cpf-jwt.md)
- [`docs/adr/0002-localstack-como-nuvem-local.md`](docs/adr/0002-localstack-como-nuvem-local.md)
