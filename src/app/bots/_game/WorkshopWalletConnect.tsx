"use client";
import { useState } from "react";
import { useAccount,useSignMessage } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { SiweMessage } from "siwe";
import { WalletProviders } from "@/app/wallet/providers";

function SignIn({onConnected}:{onConnected(token:string,wallet:string):void}){
  const {address}=useAccount(),{signMessageAsync}=useSignMessage(),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const sign=async()=>{if(!address)return;setBusy(true);setError("");try{
    const nonceResponse=await fetch('/api/bots/enlist/nonce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address})});const nonce=await nonceResponse.json();if(!nonceResponse.ok||!nonce.ok)throw Error(nonce.error||'Sign-in is unavailable.');
    const message=new SiweMessage({domain:location.host,address,statement:'Sign in to save your Model Kombat garage. No payment or token approval.',uri:location.origin,version:'1',chainId:1,nonce:nonce.nonce,issuedAt:new Date().toISOString()}).prepareMessage();
    const signature=await signMessageAsync({message});const response=await fetch('/api/bots/workshop/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address,message,signature})}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Sign-in did not finish.');onConnected(data.token,data.wallet);
  }catch(e){setError(e instanceof Error?e.message:'Sign-in did not finish.')}finally{setBusy(false)}};
  return <><p>Connect, then sign a free message to open your saved garage on any device.</p><ConnectButton showBalance={false} chainStatus="none"/>{address&&<button disabled={busy} onClick={()=>void sign()}>{busy?'Waiting for your signature…':'Sign in to my garage'}</button>}{error&&<p role="alert">{error}</p>}</>;
}
/** Loaded only after the player explicitly opens Connect. */
export default function WorkshopWalletConnect(props:{onConnected(token:string,wallet:string):void}){return <WalletProviders><SignIn {...props}/></WalletProviders>}
