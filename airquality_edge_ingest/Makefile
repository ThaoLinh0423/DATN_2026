# Configuration
COMPOSE_FILE=./data_management_services/docker-compose.yml
ENV_FILE=.env

# Targets
up:
	docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) up -d

down:
	docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) down --volumes

restart:
	docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) down --volumes
	docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) up -d

logs:
	docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) logs -f

ps:
	docker compose --env-file $(ENV_FILE) -f $(COMPOSE_FILE) ps
