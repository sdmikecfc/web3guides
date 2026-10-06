'use strict';
// User-run installer. Never executed automatically by npm or a website deploy.
// Transfers only the worker and its three EXISTING settings to the named droplet.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),host='root@143.110.183.157';
const sshOptions=['-o','ForwardAgent=no','-o','ClearAllForwardings=yes','-o','ConnectTimeout=15'];
const run=(command,args,options={})=>cp.execFileSync(command,args,{cwd:root,stdio:'inherit',...options});
function main(){
 if(process.argv.slice(2).some(a=>a!=='--prepare-only'))throw Error('Only --prepare-only is supported.');
 if(process.platform!=='win32')throw Error('Run this launcher from the Windows source checkout.');
 run(process.execPath,['scripts/bots/package-tracking-worker.cjs']);
 const dir='D:/Temp/modelkombat-tracking-worker-20261006',archive=dir+'.tar.gz';
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
 for(const f of manifest.files){if(!/^[\w./-]+$/.test(f.path)||f.path.includes('..'))throw Error('Invalid package path');const digest=crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,f.path))).digest('hex');if(digest!==f.sha256)throw Error('Package changed: '+f.path);}
 run('tar',['-czf',archive,'-C',dir,...manifest.files.map(f=>f.path),'manifest.json']);
 if(process.argv.includes('--prepare-only')){console.log('Package verified. No server connection or settings export performed.');return;}
 require('@next/env').loadEnvConfig(root,false,{info(){},error(){throw Error('Could not load existing Model Kombat settings.');}});
 const keys=['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DOMA_API_KEY'];
 const values=keys.map(k=>{const v=process.env[k];if(!v)throw Error('Existing setting is missing: '+k);if(!/^[A-Za-z0-9_:/+=.%-]+$/.test(v))throw Error('Unsupported characters in existing setting: '+k);return k+'='+v;}).join('\n')+'\n';
 const id=crypto.randomUUID().replaceAll('-',''),temp=path.join('D:/Temp','mk-tracking-upload-'+id),envFile=path.join(temp,'settings.env'),remote='/root/mk-tracking-upload-'+id;
 const checksum=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
 fs.mkdirSync(temp,{recursive:false});
 try{
  // Windows mode bits alone do not restrict access: set a private ACL before
  // writing the temporary file. Values never enter command arguments or logs.
  const identity=cp.execFileSync('whoami',['/user','/fo','csv','/nh'],{encoding:'utf8'}),sid=identity.match(/S-1-5-[0-9-]+/)?.[0];if(!sid)throw Error('Could not determine the current Windows user.');
  run('icacls',[temp,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F'],{stdio:'ignore'});
  fs.writeFileSync(envFile,values,{mode:0o600});
  console.log('Installing the separate Model Kombat collector. Use your normal SSH login when prompted.');
  // Check the actual installation filesystems before sending any settings.
  // A failed check leaves the current worker untouched and creates no upload.
  run('ssh',[...sshOptions,host,`set -eu; for target in /root /opt /var/lib; do free_kb=$(df -Pk "$target" | awk 'NR==2 {print $4}'); free_inodes=$(df -Pi "$target" | awk 'NR==2 {print $4}'); if [ "$free_kb" -lt 524288 ] || [ "$free_inodes" -lt 30000 ]; then echo "Not enough installation space on $target: need 512 MiB and 30000 free file entries. Existing collector unchanged."; df -h "$target"; exit 1; fi; done; umask 077; mkdir '${remote}'; chmod 700 '${remote}'`]);
  run('scp',[...sshOptions,archive,host+':'+remote+'/worker.tar.gz']);
  run('scp',[...sshOptions,envFile,host+':'+remote+'/settings.env']);
  // Verify the transferred archive before extracting or running any of it.
  run('ssh',[...sshOptions,host,`set -eu; trap "rm -f '${remote}/settings.env'" EXIT; cd '${remote}'; printf '%s  %s\n' '${checksum}' worker.tar.gz | sha256sum -c -; tar -xzf worker.tar.gz scripts/bots/install-tracking-worker.sh scripts/bots/lib/worker-release.cjs manifest.json; bash scripts/bots/install-tracking-worker.sh '${remote}'`]);
  console.log('Installation confirmed. Tell Codex it is installed; the new audit can be checked through its private database report.');
 }finally{
  // Delete only this run's exact temporary file/directory; never recursive.
  if(fs.existsSync(envFile))fs.unlinkSync(envFile);
  if(fs.existsSync(temp)&&fs.readdirSync(temp).length===0)fs.rmdirSync(temp);
 }
}
try{main();}catch(e){console.error('Model Kombat setup stopped: '+e.message);process.exitCode=1;}
