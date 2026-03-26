-- Revoke public access to the discount column on brands table
-- The discount represents our seller profit margin and should not be exposed to clients
REVOKE SELECT (discount) ON brands FROM anon, authenticated;
