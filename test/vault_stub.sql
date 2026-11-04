create schema if not exists vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(s text, n text default null, d text default null) returns uuid language sql as $$ insert into vault.secrets(secret,name,description) values (s,n,d) returning id $$;
create function vault.update_secret(i uuid, s text default null, n text default null, d text default null) returns void language sql as $$ update vault.secrets set secret=coalesce(s,secret) where id=i $$;
