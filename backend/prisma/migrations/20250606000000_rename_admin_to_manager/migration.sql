-- Rename ADMIN role to MANAGER for existing business_users
UPDATE business_users SET role = 'MANAGER' WHERE role = 'ADMIN';
