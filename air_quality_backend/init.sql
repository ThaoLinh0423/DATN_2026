-- Tạo user cho ứng dụng
CREATE USER app_user WITH PASSWORD 'app_password!@#$';
-- Tạo user read-only cho reporting/analytics
CREATE USER readonly_user WITH PASSWORD 'readonly_password!@#$';

-- Grant quyền cho app_user
GRANT ALL PRIVILEGES ON DATABASE air_quality_db TO app_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO app_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO app_user;

-- Grant quyền read-only cho readonly_user
GRANT CONNECT ON DATABASE air_quality_db TO readonly_user;
GRANT USAGE ON SCHEMA public TO readonly_user;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO readonly_user;
