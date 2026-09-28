-- Game-only, service-role-only READ adapter. Never writes any Reporter table.
-- Apply after workshop competition. Reporter campaign-v1 tables must exist.
begin;
create or replace function public.mk8_reporter_evidence(p_campaign text,p_wallet text)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare packet jsonb; enrollment jsonb; evidence jsonb; cutoff timestamptz; starts timestamptz;
begin
 if p_wallet !~ '^0x[0-9a-f]{40}$' then raise exception 'INVALID_WALLET'; end if;
 select payload into packet from battle_bots_campaign_snapshots where campaign_id=p_campaign and period_key='final' order by as_of desc limit 1;
 select to_jsonb(e) into enrollment from battle_bots_campaign_enrollments e where campaign_id=p_campaign and wallet=p_wallet;
 if packet is null or enrollment is null then return null; end if;
 cutoff:=least((packet#>>'{provenance,confirmedThrough}')::timestamptz,(packet#>>'{campaign,endsAt}')::timestamptz);
 starts:=greatest((packet#>>'{campaign,startsAt}')::timestamptz,(enrollment->>'credit_from_at')::timestamptz);
 -- One PostgreSQL statement snapshot: attribution changes cannot be interleaved
 -- between reading the keeper, receipt and fill rows. Receipt time is not used.
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id::text,'executedAt',f.occurred_at,'source',g.automation_source,
   'verified',case when g.automation_source='keeper' then f.origin<>f.wallet and exists(select 1 from battle_bots_keepers k where k.origin=f.origin and k.status='confirmed')
   when g.automation_source='doma_mcp' then exists(select 1 from battle_bots_execution_receipt_fills rf join battle_bots_execution_receipts r on r.id=rf.receipt_id where rf.fill_id=f.id and r.status='verified' and r.wallet=f.wallet and r.tx_hash=f.tx_hash)
   else false end) order by f.occurred_at,f.id),'[]'::jsonb) into evidence
 from (select id,occurred_at,origin,wallet,tx_hash from battle_bots_fills where wallet=p_wallet and role='buyer' and chain_id=97477 and occurred_at>=starts and occurred_at<cutoff order by occurred_at,id limit 50001) f
 join battle_bots_campaign_fills g on g.fill_id=f.id and g.campaign_id=p_campaign and g.wallet=p_wallet;
 return jsonb_build_object('snapshot',jsonb_set(packet,'{players}',jsonb_build_object(p_wallet,packet->'players'->p_wallet)),
   'enrollment',jsonb_build_object('snapshot_status',enrollment->'snapshot_status','eligibility_status',enrollment->'eligibility_status','is_test',enrollment->'is_test','credit_from_at',enrollment->'credit_from_at'),
   'fills',evidence,'truncated',jsonb_array_length(evidence)>=50001);
end $$;
revoke all on function public.mk8_reporter_evidence(text,text) from public,anon,authenticated;
grant execute on function public.mk8_reporter_evidence(text,text) to service_role;
commit;
