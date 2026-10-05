import { activeDinerMode, dinerClockBoundary, dinerCommandTicks, dinerPauseCommand, dispatchDiner, sanitizeDinerSave, type DinerCommand, type DinerState } from '@/lib/chef/diner/progression';
import type { DinerEnvelope } from '@/lib/chef/diner/authority';

export type SyncStatus='guest'|'connecting'|'saved'|'saving'|'offline';
export type DinerSession={accessToken:string;refreshToken:string;expiresAt:number;playerId:string;wallet?:string};
type Session=DinerSession;
export type DinerSnapshot={ok:boolean;state:DinerState;revision:number;serverTime:number;interrupted?:boolean;code?:string;error?:string;retryAfterMs?:number};
type Snapshot=DinerSnapshot;
const SESSION_KEY='diner_preview_session_v1',TAPE_KEY='diner_preview_pending_v1';
const active=(s:DinerState)=>activeDinerMode(s)!==null;
const paused=(s:DinerState)=>s.run?(s.run.service?.phase==='paused'||s.run.event?.phase==='paused'):s.rally?.service?s.rally.service.phase==='paused':s.homeTask?.phase==='paused';
const tick=(c:DinerCommand)=>['service','rallyService','eventInput','homeTaskInput'].includes(c.type)&&'action' in c&&c.action.type==='tick';
const sampledStroke=(c:DinerCommand)=>c.type==='homeTaskInput'&&c.action.type==='stroke';
const pause=(c:DinerCommand)=>['service','rallyService','eventInput','homeTaskInput'].includes(c.type)&&'action' in c&&(c.action.type==='pause'||(c.type==='homeTaskInput'&&c.action.type==='hold'&&!c.action.active));
const release=(c:DinerCommand)=>pause(c)||(['service','rallyService','eventInput'].includes(c.type)&&'action' in c&&((c.action.type==='hold'&&!c.action.active)||(c.action.type==='clean'&&!c.action.active)));
/** One ordered writer, durable idempotency IDs, and reconciliation after every receipt. */
export class DinerSync {
  session:Session|null=null;
  canonical:DinerState|null=null;
  predicted:DinerState|null=null;
  revision=0;
  queue:DinerCommand[]=[];
  flight:DinerEnvelope|null=null;
  busy=false;
  stopped=false;
  blocked=false;
  needsSignature=false;
  serverOffset=0;
  retryAt=0;
  constructor(private readonly callbacks:{state:(state:DinerState)=>void;status:(status:SyncStatus)=>void;message:(message:string)=>void},private readonly storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,private readonly request:typeof fetch=fetch,private readonly requiredWallet?:string){ }
  private get sessionKey(){return DinerSync.sessionKey(this.requiredWallet);}
  private get tapeKey(){return this.requiredWallet?`diner_preview_wallet_pending_v1:${this.requiredWallet.toLowerCase()}`:TAPE_KEY;}
  private checkWallet(session:Session|null){if(this.requiredWallet&&session?.wallet?.toLowerCase()!==this.requiredWallet.toLowerCase())throw Object.assign(new Error('Sign in with this wallet before opening its diner.'),{status:401});}
  private persist():boolean{
    try{if(this.session)this.storage.setItem(this.sessionKey,JSON.stringify(this.session));if(this.session)this.storage.setItem(this.tapeKey,JSON.stringify({playerId:this.session.playerId,flight:this.flight,queue:this.queue,canonical:this.canonical,revision:this.revision}));return true;}
    catch{this.blocked=true;this.callbacks.status('offline');this.callbacks.message('Your browser cannot save pending actions. Free some storage before continuing.');return false;}
  }
  private async json(path:string,body?:unknown):Promise<Snapshot&Partial<Session>>{
    const response=await this.request(`/api/chef/diner/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(this.session?{Authorization:`Bearer ${this.session.accessToken}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});
    const data=await response.json();
    if(!response.ok){const error=Object.assign(new Error(data.error??'Your diner could not be reached.'),{status:response.status,data});throw error;}return data;
  }
  /** Authenticated companion APIs use the same current preview session. */
  async read(path:string,body?:unknown){return this.json(path,body);}
  /** Retain unresolved receipts, but revoke this device before clearing tokens. */
  async signOut():Promise<boolean>{
    if(!this.session)return false;
    this.blocked=true;this.callbacks.status('offline');const pauseCommand=this.predicted?dinerPauseCommand(this.predicted):null;if(pauseCommand)this.send(pauseCommand);
    if(this.busy)throw new Error('Your last request is still finishing. Try signing out again in a moment.');
    if(!this.persist())return false;this.busy=true;
    try{
      if(this.session.expiresAt*1000<Date.now()+30000){const result=await this.json('session',{refreshToken:this.session.refreshToken});this.checkWallet(result as Session);this.session=result as Session;if(!this.persist())return false;}
      await this.json('wallet/logout',{});
      this.stopped=true;this.session=null;try{this.storage.removeItem(this.sessionKey);}catch{this.callbacks.message('The server session is revoked. Your browser could not remove its expired local credentials.');}this.callbacks.status('guest');return true;
    }finally{this.busy=false;}
  }
  async adoptSession(credentials:DinerSession):Promise<boolean>{
    if(this.busy||this.flight||this.queue.length)throw new Error('Finish saving your current diner before changing accounts.');
    if(!credentials||![credentials.accessToken,credentials.refreshToken,credentials.playerId].every(value=>typeof value==='string'&&value.length>0&&value.length<=16000)||!Number.isSafeInteger(credentials.expiresAt)||credentials.expiresAt<=0)throw new Error('The account session is incomplete.');
    this.checkWallet(credentials);
    if(this.session?.playerId!==credentials.playerId){this.canonical=null;this.predicted=null;this.revision=0;}
    this.session={...credentials};if(!this.persist())return false;return this.connect();
  }
  acceptSnapshot(snapshot:DinerSnapshot):boolean{
    if(this.stopped||this.busy||this.flight||this.queue.length||!snapshot.ok||!Number.isSafeInteger(snapshot.revision)||snapshot.revision<this.revision||!Number.isSafeInteger(snapshot.serverTime)||!snapshot.state)return false;
    this.canonical=snapshot.state;this.revision=snapshot.revision;this.serverOffset=snapshot.serverTime-Date.now();this.blocked=false;this.reconcile(snapshot.state);if(!this.persist())return false;this.callbacks.status('saved');return true;
  }
  async connect(restore=false):Promise<boolean>{
    this.callbacks.status('connecting');
    let fallback:DinerState|null=null,pendingPlayer:string|null=null;
    try{
      if(restore){const raw=this.storage.getItem(this.sessionKey);if(!raw){this.needsSignature=!!this.requiredWallet;this.blocked=!!this.requiredWallet;this.callbacks.status('guest');return false;}this.session=JSON.parse(raw);}
      this.checkWallet(this.session);
      const saved=this.storage.getItem(this.tapeKey);if(restore&&saved){const pending=JSON.parse(saved);if(pending.playerId===this.session?.playerId){pendingPlayer=pending.playerId;this.flight=pending.flight??null;this.queue=Array.isArray(pending.queue)?pending.queue:[];fallback=sanitizeDinerSave(pending.canonical);}}
      if(!this.session||this.session.expiresAt*1000<Date.now()+60000){const result=await this.json('session',this.session?{refreshToken:this.session.refreshToken}:{});if(this.stopped)return false;this.checkWallet(result as Session);this.session=result as unknown as Session;}
      if(pendingPlayer&&pendingPlayer!==this.session.playerId){this.flight=null;this.queue=[];fallback=null;}
      const snapshot=await this.json('state');if(this.stopped)return false;this.canonical=snapshot.state;this.revision=snapshot.revision;this.serverOffset=snapshot.serverTime-Date.now();
      this.blocked=false;this.needsSignature=false;this.reconcile(snapshot.state);if(!this.persist())return true;this.callbacks.status(this.flight||this.queue.length?'saving':'saved');
      if(this.flight||this.queue.length)await this.flush();
      if(this.predicted){const command=dinerPauseCommand(this.predicted);if(command)this.send(command);}
      return true;
    }catch(error){if(this.stopped)return false;this.needsSignature=(error as {status?:number}).status===401;this.blocked=true;if(fallback){this.canonical=fallback;this.predicted=fallback;this.callbacks.state(fallback);}this.callbacks.status(this.session?'offline':'guest');this.callbacks.message(error instanceof Error?error.message:'The preview account service is unavailable.');return false;}
  }
  send(command:DinerCommand):boolean{
    if(!this.predicted||this.stopped||this.blocked&&!release(command))return false;
    const result=dispatchDiner(this.predicted,command,{now:Math.round(Date.now()+this.serverOffset),online:true});
    if(result.error){this.callbacks.message(result.error);return false;}
    if(this.blocked){
      // A physical release must survive an uncertain hold response. Keep this
      // safety input behind the same unresolved UUID; never advance time here.
      const last=this.queue.at(-1);if(!last||JSON.stringify(last)!==JSON.stringify(command))this.queue.push(structuredClone(command));
      this.predicted=result.state;this.callbacks.state(result.state);this.persist();return true;
    }
    const last=this.queue[this.queue.length-1];
    if(last&&tick(command)&&tick(last)&&command.type===last.type&&'action' in last&&last.action.type==='tick'&&dinerCommandTicks(last)+dinerCommandTicks(command)<=20)last.action.ticks+=dinerCommandTicks(command);
    else this.queue.push(structuredClone(command));
    this.predicted=result.state;this.callbacks.state(result.state);this.callbacks.status('saving');
    // High-frequency cloth samples stay ordered with their ticks in the regular
    // checkpoint. Starting, releasing, and parcel choices still flush promptly.
    if(!tick(command)&&!sampledStroke(command)){if(!this.persist())return false;void this.flush();}
    if(this.queue.length>96||this.queue.reduce((n,c)=>n+dinerCommandTicks(c),0)>=90){this.blocked=true;this.callbacks.status('offline');this.callbacks.message('Cooking is paused while your last actions finish saving.');}
    return true;
  }
  private reconcile(state:DinerState){
    let next=state;
    // A flight has already been applied by the server when acknowledging it.
    for(const command of this.queue){const result=dispatchDiner(next,command,{now:Math.round(Date.now()+this.serverOffset),online:true});if(result.error){this.queue=[];this.callbacks.message('Your diner changed while saving. The latest saved version is now open.');next=state;break;}next=result.state;}
    this.predicted=next;this.callbacks.state(next);
  }
  async flush(){
    if(this.stopped||this.busy||!this.session||!this.canonical||Date.now()<this.retryAt)return;
    if(!this.flight&&!this.queue.length)return;
    this.busy=true;
    if(!this.flight){
      // Open/resume must commit before elapsed ticks can spend its server clock.
      const boundary=this.queue.findIndex(dinerClockBoundary);
      const commands=this.queue.splice(0,boundary>=0?boundary+1:this.queue.length);
      this.flight={id:crypto.randomUUID(),revision:this.revision,commands};
    }
    // Never send an action ID that cannot survive a tab close or lost receipt.
    if(!this.persist()){this.busy=false;return;}
    try{
      if(this.session.expiresAt*1000<Date.now()+30000){const renewed=await this.json('session',{refreshToken:this.session.refreshToken});if(this.stopped)return;this.checkWallet(renewed as Session);this.session=renewed as unknown as Session;if(!this.persist())return;}
      const submitted=this.flight!;
      const snapshot=await this.json('command',submitted);
      if(this.stopped)return;
      const changedElsewhere=snapshot.revision>submitted.revision+1;
      // Duplicate receipts contain the latest state, not the original response flags.
      const interrupted=snapshot.interrupted||(paused(snapshot.state)&&!submitted.commands.some(pause)&&(active(this.predicted??snapshot.state)||submitted.commands.some(tick)));
      this.flight=null;this.canonical=snapshot.state;this.revision=snapshot.revision;this.serverOffset=snapshot.serverTime-Date.now();this.blocked=false;
      if(interrupted){this.queue=[];this.callbacks.message('Your service paused while the connection was away. Resume when you are ready.');}
      else if(changedElsewhere){this.queue=[];this.callbacks.message('Another device updated this diner. Its saved version is now open.');}
      this.reconcile(snapshot.state);if(this.persist())this.callbacks.status(this.queue.length?'saving':'saved');
    }catch(error){
      if(this.stopped)return;
      const failure=error as Error&{status?:number;data?:Snapshot};
      if(failure.status===429){this.retryAt=Date.now()+Math.max(100,failure.data?.retryAfterMs??500);}
      else if(failure.status===409&&failure.data?.state){
        this.flight=null;this.queue=[];this.canonical=failure.data.state;this.revision=failure.data.revision;this.serverOffset=failure.data.serverTime-Date.now();this.blocked=false;this.reconcile(failure.data.state);if(this.persist())this.callbacks.status('saved');this.callbacks.message('Another device updated this diner. Its saved version is now open.');
      }else if(failure.status&&failure.status<500&&failure.status!==401){
        // A rejected tape committed nothing; reset predictions to the canonical state.
        this.flight=null;this.queue=[];this.blocked=false;this.reconcile(this.canonical);if(this.persist())this.callbacks.status('saved');this.callbacks.message(failure.message);
      }else{if(failure.status===401&&this.session)this.session.expiresAt=0;this.blocked=true;this.retryAt=Date.now()+1500;this.callbacks.status('offline');this.callbacks.message('Connection interrupted. Cooking is paused; your pending save will retry with the same action ID.');}
    }finally{this.busy=false;}
  }
  checkpoint(){if(this.persist())void this.flush();}
  dispose(){this.stopped=true;this.persist();}
  static sessionKey(wallet?:string){return wallet?`diner_preview_wallet_session_v1:${wallet.toLowerCase()}`:SESSION_KEY;}
  static hasSession(storage:Pick<Storage,'getItem'>,wallet?:string){return !!storage.getItem(DinerSync.sessionKey(wallet));}
}
