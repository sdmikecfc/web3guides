export type GameEnvelope = { channel: string; type: string; payload?: any };
export function gameBridge() {
  const channel = new URLSearchParams(location.search).get('channel');
  if (!channel || parent === window) return null;
  const send = (type: string, payload?: unknown) => parent.postMessage({channel,type,payload}, location.origin);
  const initial = new Promise<any>((resolve,reject) => {
    const timer = setTimeout(() => { window.removeEventListener('message', listener); reject(Error('The room could not open. Return to your garage and try again.')); }, 20000);
    const listener = (event: MessageEvent) => {
      if(event.source!==parent || event.origin!==location.origin || event.data?.channel!==channel || event.data.type!=='init')return;
      clearTimeout(timer);window.removeEventListener('message',listener);resolve(event.data.payload);
    };
    window.addEventListener('message',listener);send('ready');
  });
  const subscribe=(callback:(payload:any)=>void)=>{const listener=(event:MessageEvent)=>{if(event.source===parent&&event.origin===location.origin&&event.data?.channel===channel&&event.data.type==='update')callback(event.data.payload)};window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener)};
  return { initial, send, subscribe };
}
