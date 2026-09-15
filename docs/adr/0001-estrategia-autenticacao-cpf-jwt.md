# ADR-0001 — Estratégia de autenticação: CPF → JWT (serverless)

- **Status:** Aceito
- **Data:** Fase 3
- **Decisores:** Equipe Tech Challenge

## Contexto
A Fase 3 exige proteger rotas sensíveis da aplicação com **autenticação via CPF** e um **serviço serverless** que valide o CPF, consulte o cliente na base e devolva um **JWT** para consumo das APIs protegidas. A aplicação (`fiap-app`, .NET) já valida JWT HS256 com issuer/audience/secret configuráveis.

## Decisão
- Implementar a autenticação como um **serviço serverless em TypeScript**, executado no runtime **Bun** (`Bun.serve`) e exposto por HTTP (`POST /auth`).
- O serviço: **valida o CPF** (dígitos verificadores, mesmo algoritmo do VO `Cpf` da app), **consulta** a tabela `clientes` por `documento_numero` (tipo `Cpf`) e, se existir, **emite um JWT HS256**.
- O token é **interoperável** com a app: mesmo `secret`, `iss=Oficina.Api`, `aud=Oficina.Api`; claims `sub`=id do cliente, `email`, `role=Cliente`, `cpf`, `name`.
- A configuração (segredo JWT e connection string) vem de **variáveis de ambiente**, injetadas pela plataforma de hospedagem (Railway).

## Justificativa
- **TypeScript/Bun** dá um serviço leve, de subida rápida e baixo overhead — ideal para uma função simples de auth com deploy contínuo como Function Serverless.
- **JWT HS256 compartilhado** evita introduzir infraestrutura de chaves assimétricas e reaproveita a validação já existente na app.
- **Validação de existência** (em vez de status) porque o modelo de domínio do cliente não possui campo de status; "cliente cadastrado" é o critério de autorização para abrir/consultar OS.

## Consequências
- **Positivas:** separação clara (auth isolada da app), rotas sensíveis protegidas por CPF, token pronto para o gateway (Kong) do K8s validar.
- **Negativas / trade-offs:**
  - Secret simétrico compartilhado entre o serviço de auth e a app — exige guardar o mesmo `JWT_SECRET` nos dois ambientes. Rotação precisa ser coordenada.
  - Sem campo de status do cliente, não há revogação por inatividade; mitigável adicionando coluna futura.
  - Conexão ao Postgres por requisição (sem pool dedicado); para alta carga, adicionar pooling.
