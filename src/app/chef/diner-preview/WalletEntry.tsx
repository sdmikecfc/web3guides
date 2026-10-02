"use client";
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DinerWalletConnect } from './DinerWalletConnect';
import { useAccount, useSignMessage } from 'wagmi';
import { DinerAccessContext } from './DinerAccess';
import { DinerSync, type DinerSession } from './diner-sync';
import { GameEmblem } from './GameEmblem';
import { DINER_SAVE_KEY } from '@/lib/chef/diner/progression';
import css from './wallet-entry.module.css';

const DinerClient=dynamic(()=>import('./DinerClient'),{ssr:false,loading:()=> <p className={css.loading}>Opening your diner…</p>});
async function request(path:string,body?:unknown,token?:string){
  const response=await fetch(`/api/chef/diner/${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store'});
  const value=await response.json();if(!response.ok)throw new Error(value.error??'Wallet sign-in is temporarily unavailable.');return value;
}
/** Public play only mounts after a verified wallet session. Local QA is explicit. */
export default function WalletEntry({allowLocalGuest=false}:{allowLocalGuest?:boolean}){
  const {address,isConnected,chainId}=useAccount(),{signMessageAsync}=useSignMessage();
  const wallet=address?.toLowerCase(),currentWallet=useRef(wallet),signingAttempt=useRef(0);currentWallet.current=wallet;
  const [available,setAvailable]=useState<boolean|null>(null),[session,setSession]=useState<DinerSession|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[local,setLocal]=useState(false),[localAllowed,setLocalAllowed]=useState(false),[earlierPreview,setEarlierPreview]=useState(false);
  const reauthenticate=useCallback((message?:string)=>{if(currentWallet.current!==wallet)return;setSession(null);setError(message??'Your sign-in expired. Sign a fresh message to return to this diner; your pending actions are preserved.');},[wallet]);
  useEffect(()=>{let active=true;void request('status').then(value=>{if(active)setAvailable(value.enabled===true&&value.authAvailable===true);}).catch(()=>{if(active)setAvailable(false);});setLocalAllowed(allowLocalGuest&&['localhost','127.0.0.1','[::1]'].includes(window.location.hostname));return()=>{active=false;};},[allowLocalGuest]);
  useEffect(()=>{try{setEarlierPreview(localStorage.getItem(DINER_SAVE_KEY)!==null);}catch{/* Storage availability is handled when an account opens. */}},[]);
  useEffect(()=>{
    let active=true;signingAttempt.current++;setSession(null);setError('');setBusy(false);
    if(!wallet||!isConnected||!available)return;
    void (async()=>{try{
      const raw=localStorage.getItem(DinerSync.sessionKey(wallet));if(!raw)return;let saved=JSON.parse(raw) as DinerSession;
      if(saved.wallet?.toLowerCase()!==wallet)return;setBusy(true);
      if(saved.expiresAt*1000<Date.now()+60000)saved=await request('session',{refreshToken:saved.refreshToken});
      if(saved.wallet?.toLowerCase()!==wallet)throw new Error('This saved account belongs to a different wallet.');
      const account=await request('account',undefined,saved.accessToken);
      if(account.wallet?.toLowerCase()!==wallet)throw new Error('Sign in again with this wallet.');
      if(active){localStorage.setItem(DinerSync.sessionKey(wallet),JSON.stringify(saved));setSession(saved);}
    }catch(failure){if(active)setError(failure instanceof Error?failure.message:'Sign in again to reopen your diner.');}finally{if(active)setBusy(false);}})();
    return()=>{active=false;signingAttempt.current++;};
  },[wallet,isConnected,available]);
  async function signIn(){
    if(!address||!wallet||!available||busy)return;const signingWallet=wallet,attempt=++signingAttempt.current;setBusy(true);setError('');
    try{
      const challenge=await request('wallet/challenge',{address,chainId:chainId??1});
      if(currentWallet.current!==signingWallet||signingAttempt.current!==attempt)throw new Error('Your wallet changed. Start sign-in again.');
      const signature=await signMessageAsync({message:challenge.message,account:address});
      if(currentWallet.current!==signingWallet||signingAttempt.current!==attempt)throw new Error('Your wallet changed. Start sign-in again.');
      const signed=await request('wallet/verify',{nonce:challenge.nonce,message:challenge.message,signature}) as DinerSession;
      if(currentWallet.current!==signingWallet||signingAttempt.current!==attempt||signed.wallet?.toLowerCase()!==signingWallet)throw new Error('The signed wallet changed. Reconnect before continuing.');
      localStorage.setItem(DinerSync.sessionKey(signingWallet),JSON.stringify(signed));setSession(signed);
    }catch(failure){if(signingAttempt.current===attempt){const reason=failure instanceof Error?failure.message:'Sign-in did not finish.';setError(/reject|denied|cancel/i.test(reason)?'Signature cancelled. Nothing was sent or charged. You can try again when ready.':reason);}}
    finally{if(signingAttempt.current===attempt)setBusy(false);}
  }
  if(local&&localAllowed)return <DinerAccessContext.Provider value={{mode:'local'}}><div className={css.local}>Local development sandbox · browser save · no wallet account</div><DinerClient/></DinerAccessContext.Provider>;
  if(isConnected&&wallet&&session?.wallet?.toLowerCase()===wallet)return <DinerAccessContext.Provider value={{mode:'wallet',wallet,session,reauthenticate}}><DinerClient key={wallet}/></DinerAccessContext.Provider>;
  return <main className={css.page}><section className={css.card} aria-labelledby="wallet-title"><GameEmblem kind="cook" size={110}/><p className={css.eyebrow}>Your wallet. Your little diner.</p><h1 id="wallet-title">A table with your name on it</h1><p>Connect your wallet to open your Domain Kitchen account.</p><div className={css.promise}><strong>Just a message signature.</strong><span>No transaction. No gas fee. No permission to spend your assets.</span></div><div className={css.actions}><DinerWalletConnect/>{isConnected&&<button onClick={()=>void signIn()} disabled={!available||busy}>{busy?'Opening your account…':'Sign in & open my diner'}</button>}</div>{available===null&&<p role="status">Checking account service…</p>}{available===false&&<p className={css.notice}>Wallet accounts are being prepared. Play will open when the account service is ready.</p>}{error&&<p className={css.error} role="alert">{error}</p>}{earlierPreview&&<p className={css.notice}>Your earlier preview restaurant is preserved on this browser. Wallet accounts start a separate diner.</p>}<p className={css.small}>Reconnect the same wallet to return to your restaurant. We never ask for your seed phrase or private key.</p>{localAllowed&&<button className={css.developer} onClick={()=>setLocal(true)}>Open local development sandbox</button>}</section></main>;
}
