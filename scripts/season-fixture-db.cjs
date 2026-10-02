/** PostgREST-shaped local adapter. Every operation runs against this test's in-memory PGlite only. */
module.exports=function fixtureDb(db){
 const query=(sql,args=[])=>db.query(sql,args),safe=s=>{if(!/^[a-z_]+$/.test(s))throw Error('Unsafe fixture column');return s;};
 return {
  from(table){
   if(!/^mk6_[a-z_]+$/.test(table)&&!/^mk_mcp_[a-z_]+$/.test(table))throw Error('Fixture cannot access non-game tables');
   const filters=[],order=[];let take=null,offset=0;
   async function run(){
    const args=[],clauses=filters.map(([column,operator,value])=>{args.push(value);return `${safe(column)} ${operator} $${args.length}`;});
    let text=`SELECT to_jsonb(t) AS value FROM ${table} t`+(clauses.length?' WHERE '+clauses.join(' AND '):'')+(order.length?' ORDER BY '+order.join(','):'');
    if(take!=null)text+=` LIMIT ${take}`;if(offset)text+=` OFFSET ${offset}`;
    try{return{data:(await query(text,args)).rows.map(r=>r.value),error:null};}catch(e){return{data:null,error:{code:e.code,message:e.message}};}
   }
   const q={select(){return q;},eq(k,v){filters.push([k,'IS NOT DISTINCT FROM',v]);return q;},neq(k,v){filters.push([k,'<>',v]);return q;},gte(k,v){filters.push([k,'>=',v]);return q;},gt(k,v){filters.push([k,'>',v]);return q;},lte(k,v){filters.push([k,'<=',v]);return q;},lt(k,v){filters.push([k,'<',v]);return q;},order(k,o){order.push(safe(k)+(o?.ascending===false?' DESC':' ASC'));return q;},limit(n){take=n;return q;},range(a,b){offset=a;take=b-a+1;return q;},async maybeSingle(){const r=await run();return{data:r.data?.[0]??null,error:r.error};},then(resolve,reject){return run().then(resolve,reject);}};
   return q;
  },
  async rpc(name,args){
   if(!/^mk6_[a-z_]+$/.test(name))throw Error('Fixture cannot call external RPCs');
   const e=Object.entries(args);e.forEach(([key])=>{if(!/^p_[a-z_]+$/.test(key))throw Error('Bad argument');});
   try{const r=await query(`SELECT ${name}(${e.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) AS value`,e.map(([,v])=>v&&typeof v==='object'?JSON.stringify(v):v));return{data:r.rows[0].value,error:null};}catch(e){return{data:null,error:{code:e.code,message:e.message}};}
  }
 };
};
