-- Torna um usuário existente administrador da plataforma (quem vende os acessos).
-- 1) Supabase > Authentication > Users > "Add user" > crie seu usuário com e-mail e senha
--    (marque "Auto Confirm User").
-- 2) Troque o e-mail abaixo e rode no SQL Editor.
insert into public.platform_admins (user_id)
select id from auth.users where email = lower('voce@seudominio.com.br')
on conflict do nothing;

-- Conferir:
select u.email, a.created_at from public.platform_admins a join auth.users u on u.id = a.user_id;
