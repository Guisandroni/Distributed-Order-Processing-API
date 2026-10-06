variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "subnet_ids" {
  type = list(string)
}

variable "image" {
  description = "Published worker image (registry path + tag from the deploy workflow)"
  type        = string
  default     = ""
}

variable "desired_count" {
  type    = number
  default = 1
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}-worker"

  tags = {
    Environment = var.environment
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.project}-${var.environment}-worker"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = "arn:aws:iam::000000000000:role/placeholder-execution-role"

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = var.image
      essential = true
    }
  ])
}

resource "aws_ecs_service" "worker" {
  name            = "${var.project}-${var.environment}-worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Scales independently from the api service (separate cluster/service).

  network_configuration {
    subnets = var.subnet_ids
  }

  tags = {
    Environment = var.environment
  }
}

output "service_name" {
  value = aws_ecs_service.worker.name
}
