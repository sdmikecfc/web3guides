-- Private diagnostic data. No browser role may read or write these tables.
create table if not exists public.diner_problem_reports (
 id uuid primary key, created_at timestamptz not null default now(),
 status text not null default 'new' check(status in ('new','investigating','resolved')),
 category text not null check(category in ('interaction','understanding','difficulty')),
 build text not null, fingerprint text not null, payload jsonb not null
);
create index if not exists diner_problem_reports_created on public.diner_problem_reports(created_at);
create table if not exists public.diner_report_limits(rate_key text not null,hour timestamptz not null,used integer not null,primary key(rate_key,hour));
alter table public.diner_problem_reports enable row level security;
alter table public.diner_report_limits enable row level security;
revoke all on public.diner_problem_reports,public.diner_report_limits from anon,authenticated;
grant all on public.diner_problem_reports,public.diner_report_limits to service_role;
create or replace function public.diner_submit_problem_report(p_id uuid,p_rate_key text,p_fingerprint text,p_report jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare old_fingerprint text; used_count integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select fingerprint into old_fingerprint from diner_problem_reports where id=p_id;
 if found then return jsonb_build_object('ok',old_fingerprint=p_fingerprint,'reason','id_reused');end if;
 if octet_length(p_report::text)>524288 then return jsonb_build_object('ok',false,'reason','size');end if;
 insert into diner_report_limits values(p_rate_key,date_trunc('hour',now()),1)
 on conflict(rate_key,hour) do update set used=diner_report_limits.used+1 returning used into used_count;
 if used_count>6 then return jsonb_build_object('ok',false,'reason','limit');end if;
 insert into diner_problem_reports(id,category,build,fingerprint,payload) values(p_id,p_report->>'category',p_report->>'build',p_fingerprint,p_report);
 delete from diner_problem_reports where created_at<now()-interval '30 days';
 delete from diner_report_limits where hour<now()-interval '1 day';
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.diner_submit_problem_report(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.diner_submit_problem_report(uuid,text,text,jsonb) to service_role;

create or replace function public.diner_purge_problem_reports() returns void
language sql security definer set search_path=public as $$
 delete from diner_problem_reports where created_at<now()-interval '30 days';
 delete from diner_report_limits where hour<now()-interval '1 day';
$$;
revoke all on function public.diner_purge_problem_reports() from public,anon,authenticated;
grant execute on function public.diner_purge_problem_reports() to service_role;
-- Supabase's pg_cron extension must be enabled before exposing submissions.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  execute $job$select cron.schedule('diner-report-retention','17 3 * * *','select public.diner_purge_problem_reports()')$job$;
 end if;
end $$;
create or replace function public.diner_reports_retention_ready() returns boolean
language plpgsql security definer set search_path=public as $$
declare ready boolean:=false;
begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  execute 'select exists(select 1 from cron.job where jobname=''diner-report-retention'' and active)' into ready;
 end if;
 return ready;
end $$;
revoke all on function public.diner_reports_retention_ready() from public,anon,authenticated;
grant execute on function public.diner_reports_retention_ready() to service_role;
