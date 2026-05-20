-- Provisions the second logical database used by the analytics-engine service.
-- Runs only on first boot of the postgres container (when pgdata volume is empty).
CREATE DATABASE analytics_db;
GRANT ALL PRIVILEGES ON DATABASE analytics_db TO admin;
