/** Community-supplied NPC names, not wallet identities or social profiles. */
export const COMMUNITY_HANDLES = [
  's_tranik','itoshi_08','realmusha','sauravanand','raja01416','hasnab16','alexxd2924','selfmademilly','medvejon0k','duong_56175',
  'nightmare__25','clowes4094','cuongcrypto6868_10871','sdmikecfc','ycc123.','bili02225','julia457','myname9980','marclita','thuytrang2708',
  'og.crypto','olli_web3','pdthang810','a.chebe','heyfab','yixin88','purush0793','marginla','exchange.','qamarop',
  'kruot2','cloudtechvn','dongnguyen3196','aqccapital','hannie299_87009','hrx0005','lyf5555l','anlog8386','rdhxlzrdyy','meox_78247',
  'lovecity0088','xcoindocky_22856','ayeshah','vidangnhat','edward.9999','gallezkaaa.','0xihor','cyt0207','0xsupercoin','davidwellsberg',
  'ravindra8s','mrlinss','laohac234','babyplayer6936','davidtinh','rendyrhey','huymoi18','bentabenti','dr1mmerr','klausmikaels0n1',
  'ilmi0171','ujangrambo69','ku666','kyo482004','1just_panda1','_muhammadsalman','abdo095546','hodl.esf.eth','hlu1986','miki2439',
  'xintex21cucu','ozmahesa8265','whyshahed','numaa_4','lilniyo.','venidiktov','handles_x','ghooolyache','abbagigo','oriadejunior',
  'dopozg21_27291','deelaw100','al270440','fernando220169','hsya0704','cool9559','pikacuuu23','avikara','venusm91','rooh0222',
  'kuchjude.','tunglava','yigesuren','thachvosiuu','bookah0007','chenyun.bit','_kudalaut','ya_tebya_poshal','rexx119688','vothaithinh102',
] as const;
export type AudienceType='local'|'party'|'business';
export function communityIdentity(type:AudienceType,index:number){const offset=type==='party'?6:type==='business'?12:0;const position=offset+Math.abs(Math.floor(index))%6;return {handle:COMMUNITY_HANDLES[position],look:position%8};}
