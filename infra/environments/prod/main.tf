terraform {
  backend "local" {}
}

module "network" {
  source      = "../../modules/network"
  project     = "order-platform"
  environment = "prod"
}

module "database" {
  source      = "../../modules/database"
  project     = "order-platform"
  environment = "prod"
  subnet_ids  = module.network.private_subnet_ids
}

module "cache" {
  source      = "../../modules/cache"
  project     = "order-platform"
  environment = "prod"
  subnet_ids  = module.network.private_subnet_ids
}

module "messaging" {
  source      = "../../modules/messaging"
  project     = "order-platform"
  environment = "prod"
  subnet_ids  = module.network.private_subnet_ids
}

module "api" {
  source      = "../../modules/api"
  project     = "order-platform"
  environment = "prod"
  subnet_ids  = module.network.private_subnet_ids
}

module "worker" {
  source      = "../../modules/worker"
  project     = "order-platform"
  environment = "prod"
  subnet_ids  = module.network.private_subnet_ids
}
