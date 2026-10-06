variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (dev or prod); isolates network, data and workloads"
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be \"dev\" or \"prod\"."
  }
}

variable "project" {
  description = "Project slug used in resource names and tags"
  type        = string
  default     = "order-platform"
}

variable "db_username" {
  description = "Master username for the database (password comes from the secret manager, never from tfvars)"
  type        = string
  default     = "orderplatform"
  sensitive   = true
}
