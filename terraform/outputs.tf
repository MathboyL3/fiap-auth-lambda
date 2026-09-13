output "rest_api_id" {
  description = "Id da REST API no API Gateway."
  value       = aws_api_gateway_rest_api.api.id
}

output "lambda_function_name" {
  value = aws_lambda_function.auth.function_name
}

# URL de invocacao no LocalStack:
# http://localhost:4566/restapis/<id>/prod/_user_request_/auth
output "auth_url_localstack" {
  description = "Endpoint POST de autenticacao (LocalStack)."
  value       = "${var.localstack_endpoint}/restapis/${aws_api_gateway_rest_api.api.id}/${aws_api_gateway_stage.prod.stage_name}/_user_request_/auth"
}
