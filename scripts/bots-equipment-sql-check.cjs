const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require(process.env.BOTS_PGLITE_PATH || '@electric-sql/pglite');
const schema=fs.readFileSync(path.join(__dirname,'sql/fixtures/legacy-pair-schema.sql'),'utf8');
const migration=fs.readFileSync(path.join(__dirname,'sql/bots-independent-limbs-prelaunch.sql'),'utf8');
const db=new PGlite();

async function seed(wallet='demo',bay=1,layout='parts') {
  const rows=[];
  for (const [i,slot] of ['head','torso','arms','legs','weapon'].entries()) {
    const row=(await db.query(`INSERT INTO battle_bots_part_instances
      (wallet,part_key,slot_kind,tier,stats,source,list_price,color,is_test)
      VALUES($1,$2,$3,1,$4,'starter',15,$5,true) RETURNING *`,
      [wallet,`starter.${slot}`,slot,JSON.stringify({s:[1,0,0],paint:slot==='weapon'?undefined:'mint',provenance:'Original'}),slot==='weapon'?null:'mint'])).rows[0];
    rows.push(row);
  }
  const ids=Object.fromEntries(rows.map(p=>[p.slot_kind,Number(p.id)]));
  const build={...(layout==='parts'?{parts:ids}:ids),look:{face:'wink'},name:{first:'Tiny',second:'Biscuit',num:null}};
  const bot=(await db.query('INSERT INTO battle_bots_bots(wallet,slot,build,total,is_test) VALUES($1,$2,$3,5,true) RETURNING *',[wallet,bay,JSON.stringify(build)])).rows[0];
  for(const row of rows)await db.query('UPDATE battle_bots_part_instances SET bot_id=$1 WHERE id=$2',[bot.id,row.id]);
  return {rows,bot,build};
}
async function snapshot(){return{
  parts:(await db.query('SELECT * FROM battle_bots_part_instances ORDER BY id')).rows,
  bots:(await db.query('SELECT * FROM battle_bots_bots ORDER BY id')).rows
};}

(async()=>{
  await db.exec(schema);
  const first=await seed();
  const second=await seed('other',1,'root');
  const incomplete=await seed('incomplete');
  const recycled=await seed('recycled');
  await db.query('UPDATE battle_bots_bots SET recycled_at=now() WHERE id=$1',[recycled.bot.id]);
  await db.query('UPDATE battle_bots_part_instances SET recycled_at=now() WHERE bot_id=$1',[recycled.bot.id]);
  await db.query(`UPDATE battle_bots_bots SET build=jsonb_set(build,'{parts,legs}','null') WHERE id=$1`,[incomplete.bot.id]);
  await db.query(`UPDATE battle_bots_part_instances SET bot_id=null WHERE id=$1`,[incomplete.rows.find(p=>p.slot_kind==='legs').id]);
  // Loose pairs must split too; an existing modern item must stay individual.
  await db.query(`INSERT INTO battle_bots_part_instances(wallet,part_key,slot_kind,tier,stats,list_price,color)
    VALUES('demo','loose.arm','arms',2,'{"s":[2,3,1],"paint":"coral"}',201,'coral'),
          ('demo','modern.arm','arms',1,'{"s":[1,0,0],"equipmentVersion":2}',25,'mint'),
          ('demo','starter.arm','arms',1,'{"s":[1,0,0],"equipmentVersion":2}',7,'mint')`);
  await db.query(`UPDATE battle_bots_part_instances SET source='starter' WHERE part_key='starter.arm'`);
  const before=await snapshot();
  const result=await db.exec(migration);
  const after=await snapshot();
  assert.equal(after.parts.length,before.parts.length+7);
  assert.deepEqual(after.parts.filter(p=>p.wallet==='recycled'),before.parts.filter(p=>p.wallet==='recycled'));
  assert.deepEqual(after.bots.find(p=>p.wallet==='recycled'),before.bots.find(p=>p.wallet==='recycled'));
  for(const original of [first,second]){
    const bot=after.bots.find(b=>b.id===original.bot.id);
    assert.equal(bot.build.equipmentVersion,2);
    assert.equal(Object.keys(bot.build.sockets).length,7);
    assert.equal(new Set(Object.values(bot.build.sockets)).size,7);
    assert.deepEqual(bot.build.look,original.build.look);
    assert.equal(bot.total,5);
    for(const [kind,L,R] of [['arms','armL','armR'],['legs','legL','legR']]){
      const left=after.parts.find(p=>p.id===bot.build.sockets[L]);
      const right=after.parts.find(p=>p.id===bot.build.sockets[R]);
      assert.equal(left.id,original.rows.find(p=>p.slot_kind===kind).id);
      assert.equal(left.list_price+right.list_price,15);
      assert.equal(left.stats.salvage+right.stats.salvage,6);
      assert.equal(right.bot_id,bot.id);
      assert.deepEqual(left.stats.s,right.stats.s);
      assert.equal(left.color,right.color);
    }
  }
  const partial=after.bots.find(b=>b.id===incomplete.bot.id);
  assert.equal(partial.build.sockets.legL,null);
  assert.equal(partial.build.sockets.legR,null);
  assert.equal(after.parts.filter(p=>p.part_key==='modern.arm').length,1);
  assert.equal(after.parts.find(p=>p.part_key==='starter.arm').stats.salvage,3);
  await db.exec(migration);
  assert.deepEqual(await snapshot(),after,'A second run must change no row');
  console.log('[OK] Real PostgreSQL migration: owned and loose pairs, two old build layouts, partial bots, value conservation, existing individual parts and exact rerun idempotence.');

  // Invalid references must roll back, keeping every inventory row intact.
  await db.query(`INSERT INTO battle_bots_bots(wallet,slot,build) VALUES('broken',1,'{"parts":{"arms":999999}}')`);
  const invalidBefore=await snapshot();
  await assert.rejects(db.exec(migration),/missing, recycled, wrong-kind or foreign part/);
  await db.exec('ROLLBACK');
  assert.deepEqual(await snapshot(),invalidBefore);
  console.log('[OK] Invalid ownership/reference preflight aborts the entire transaction without losing data.');
  await db.close();
})().catch(async e=>{console.error(e.message);await db.close();process.exitCode=1;});
