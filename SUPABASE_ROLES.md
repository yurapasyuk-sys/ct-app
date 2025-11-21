# Supabase Roles & Tiers Setup

To enable "Pro" and "Ultra" tiers, you need to create a `profiles` table in your Supabase database. This table will store the user's tier.

## 1. Run SQL Query

Go to your [Supabase Dashboard](https://supabase.com/dashboard) -> **SQL Editor** -> **New Query**.
Paste and run the following SQL code:

```sql
-- 1. Create a table for public profiles
create table if not exists public.profiles (
  id uuid not null references auth.users on delete cascade,
  tier text not null default 'pro',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (id)
);

-- 2. Enable Row Level Security (RLS)
alter table public.profiles enable row level security;

-- 3. Create policies
create policy "Public profiles are viewable by everyone."
  on profiles for select
  using ( true );

create policy "Users can insert their own profile."
  on profiles for insert
  with check ( auth.uid() = id );

create policy "Users can update own profile."
  on profiles for update
  using ( auth.uid() = id );

-- 4. Create a trigger to automatically create a profile for new users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, tier)
  values (new.id, 'pro');
  return new;
end;
$$;

-- Drop trigger if exists to avoid errors on re-run
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5. Backfill profiles for existing users (if any)
insert into public.profiles (id, tier)
select id, 'pro' from auth.users
on conflict (id) do nothing;
```

## 2. How to give "Ultra" status

To upgrade a user to "Ultra", you can simply edit the row in the `profiles` table via the Table Editor in Supabase, or run a SQL command:

```sql
update public.profiles
set tier = 'ultra'
where id = 'USER_UUID_HERE';
```
