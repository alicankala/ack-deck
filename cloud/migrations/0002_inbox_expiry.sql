CREATE INDEX inbox_expiry ON inbox_items(expires_at) WHERE kv_key IS NOT NULL;
