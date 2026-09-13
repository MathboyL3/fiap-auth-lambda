# ---------------------------------------------------------------------------
# fiap-auth-lambda — API Gateway + Lambda (Node) de autenticacao CPF -> JWT
# Provisionado contra LocalStack (AWS local). Portavel para AWS real.
# ---------------------------------------------------------------------------

data "aws_region" "current" {}
data "aws_caller_identity" "current" {}

# --- Secrets Manager: segredo JWT e connection string do banco ---------------
resource "aws_secretsmanager_secret" "jwt" {
  name = "fiap/auth/jwt-secret"
}
resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = var.jwt_secret
}

resource "aws_secretsmanager_secret" "database_url" {
  name = "fiap/auth/database-url"
}
resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = var.database_url
}

# --- IAM role de execucao da Lambda -----------------------------------------
resource "aws_iam_role" "lambda_exec" {
  name = "fiap-auth-lambda-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "fiap-auth-lambda-policy"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_secretsmanager_secret.jwt.arn, aws_secretsmanager_secret.database_url.arn]
      }
    ]
  })
}

# --- Lambda ------------------------------------------------------------------
resource "aws_lambda_function" "auth" {
  function_name    = "fiap-auth"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  timeout          = 15
  memory_size      = 256

  environment {
    variables = {
      JWT_ISSUER             = var.jwt_issuer
      JWT_AUDIENCE           = var.jwt_audience
      JWT_EXPIRATION_MINUTES = "60"
      JWT_SECRET_ARN         = aws_secretsmanager_secret.jwt.arn
      DATABASE_SECRET_ARN    = aws_secretsmanager_secret.database_url.arn
      PGSSL                  = var.pg_ssl
      AWS_ENDPOINT_URL       = var.lambda_aws_endpoint
    }
  }
}

# --- API Gateway (REST) ------------------------------------------------------
resource "aws_api_gateway_rest_api" "api" {
  name        = "fiap-auth-api"
  description = "Gateway de autenticacao por CPF (Fase 3)"
}

resource "aws_api_gateway_resource" "auth" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "auth"
}

resource "aws_api_gateway_method" "auth_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.auth.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "lambda" {
  rest_api_id             = aws_api_gateway_rest_api.api.id
  resource_id             = aws_api_gateway_resource.auth.id
  http_method             = aws_api_gateway_method.auth_post.http_method
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.auth.invoke_arn
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auth.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_api_gateway_deployment" "dep" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  triggers = {
    redeploy = sha1(jsonencode([
      aws_api_gateway_resource.auth.id,
      aws_api_gateway_method.auth_post.id,
      aws_api_gateway_integration.lambda.id,
    ]))
  }
  depends_on = [aws_api_gateway_integration.lambda]
  lifecycle { create_before_destroy = true }
}

resource "aws_api_gateway_stage" "prod" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  deployment_id = aws_api_gateway_deployment.dep.id
  stage_name    = "prod"
}
