# ADR-0001 — Estratégia de autenticação: CPF → JWT via Lambda

- **Status:** Aceito
- **Data:** Fase 3
- **Decisores:** Equipe Tech Challenge

## Contexto
A Fase 3 exige proteger rotas sensíveis da aplicação com **autenticação via CPF** e uma **Function Serverless** que valide o CPF, consulte o cliente na base e devolva um **JWT** para consumo das APIs protegidas. A aplicação (`fiap-app`, .NET) já valida JWT HS256 com issuer/audience/secret configuráveis.

## Decisão
- Implementar uma **AWS Lambda em Node.js/TypeScript** exposta por **API Gateway** (`POST /auth`).
- A Lambda: **valida o CPF** (dígitos verificadores, mesmo algoritmo do VO `Cpf` da app), **consulta** a tabela `clientes` por `documento_numero` (tipo `Cpf`) e, se existir, **emite um JWT HS256**.
- O token é **interoperável** com a app: mesmo `secret`, `iss=Oficina.Api`, `aud=Oficina.Api`; claims `sub`=id do cliente, `email`, `role=Cliente`, `cpf`, `name`.
- O segredo JWT e a connection string ficam no **Secrets Manager**; a Lambda os lê em runtime (fallback para variáveis de ambiente em dev).

## Justificativa
- **Node.js** tem *cold start* baixo e runtime nativo na Lambda — ideal para uma função simples de auth.
- **JWT HS256 compartilhado** evita introduzir infraestrutura de chaves assimétricas e reaproveita a validação já existente na app.
- **Validação de existência** (em vez de status) porque o modelo de domínio do cliente não possui campo de status; "cliente cadastrado" é o critério de autorização para abrir/consultar OS.

## Consequências
- **Positivas:** separação clara (auth serverless isolada da app), rotas sensíveis protegidas por CPF, token pronto para o gateway do K8s validar.
- **Negativas / trade-offs:**
  - Secret simétrico compartilhado entre Lambda e app — exige guardar o mesmo `JWT_SECRET` nos dois ambientes (Secrets Manager e K8s Secret). Rotação precisa ser coordenada.
  - Sem campo de status do cliente, não há revogação por inatividade; mitigável adicionando coluna futura.
  - Conexão ao Postgres por invocação (sem pool); para alta carga, usar RDS Proxy/pool.
