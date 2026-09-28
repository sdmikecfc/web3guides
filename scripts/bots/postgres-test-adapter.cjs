// PGlite-shaped adapter so the existing migration/ledger fixtures also run on
// real PostgreSQL. Fixed loopback test port; never accepts a production DSN.
const {Client,types}=require(process.env.MK_PG_CLIENT||'D:/Temp/modelkombat-postgres/client/node_modules/pg');
types.setTypeParser(20,value=>{const n=Number(value);return Number.isSafeInteger(n)?n:value});
const {randomUUID}=require('node:crypto');
class PGlite{
 constructor(){this.ready=this.open()}
 async open(){const base={host:'127.0.0.1',port:55487,user:'mk_test',database:'postgres'};
  const admin=new Client(base);await admin.connect();
  const name='mk_check_'+randomUUID().replaceAll('-','');await admin.query(`create database ${name}`);await admin.end();
  this.client=new Client({...base,database:name});await this.client.connect();this.database=name;
 }
 async exec(sql){await this.ready;
  // Roles are cluster-wide; fixtures normally get a fresh embedded cluster.
  sql=sql.replace(/create role (anon|authenticated|service_role)( bypassrls)?/gi,(_,name,extra)=>`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${name}') THEN CREATE ROLE ${name}${extra||''}; END IF; END $$`);
  return this.client.query(sql);
 }
 async query(sql,args=[]){await this.ready;return this.client.query(sql,args)}
 async close(){await this.ready;await this.client.end()}
}
module.exports={PGlite};
