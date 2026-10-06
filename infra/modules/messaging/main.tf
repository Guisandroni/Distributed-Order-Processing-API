variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "username" {
  type      = string
  default   = "orderplatform"
  sensitive = true
}

variable "password" {
  description = "Broker password — from the secret manager at plan/apply time, never committed"
  type        = string
  sensitive   = true
  default     = null
}

resource "aws_mq_broker" "main" {
  broker_name        = "${var.project}-${var.environment}"
  engine_type        = "RabbitMQ"
  engine_version     = "4.0"
  host_instance_type = var.environment == "prod" ? "mq.m5.large" : "mq.t3.micro"
  subnet_ids         = [var.subnet_ids[0]]

  user {
    username = var.username
    password = var.password
  }

  tags = {
    Environment = var.environment
  }
}

output "endpoint" {
  value = aws_mq_broker.main.instances[0].endpoints[0]
}
