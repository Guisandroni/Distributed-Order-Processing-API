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
  description = "Published api image (registry path + tag from the deploy workflow)"
  type        = string
  default     = ""
}

variable "desired_count" {
  type    = number
  default = 2
}

resource "aws_ecs_cluster" "main" {
  name = "${var.project}-${var.environment}"

  tags = {
    Environment = var.environment
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.project}-${var.environment}-api"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = "arn:aws:iam::000000000000:role/placeholder-execution-role"

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = var.image
      essential = true
      portMappings = [
        {
          containerPort = 3333
          protocol      = "tcp"
        }
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "wget -qO- http://localhost:3333/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name            = "${var.project}-${var.environment}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets = var.subnet_ids
  }

  tags = {
    Environment = var.environment
  }
}

output "service_name" {
  value = aws_ecs_service.api.name
}
