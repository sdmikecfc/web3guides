import type { CreateServiceOptions } from './types';

/** The first trip teaches a full solo workflow before asking for rush throughput.
 * These values are copied into a service checkpoint, never recalculated per tick. */
export function earlyServicePacing(input:{routeId:string;serviceDays:number;tutorial:boolean;kind:string}):Partial<CreateServiceOptions>{
  const {routeId,serviceDays,tutorial,kind}=input;
  if(routeId!=='downtown')return {};
  if(tutorial&&serviceDays<3)return {
    customers:[4,6,8][serviceDays],arrivalTicks:[30,27,28][serviceDays]*20,
    pacingVersion:2,pacingProfile:serviceDays===0?'first':serviceDays===1?'second':'third',
    maxWaitingCustomers:serviceDays===2?2:1,queuePatienceTicks:90*20,tablePatienceTicks:70*20,
  };
  if(serviceDays<2)return {customers:serviceDays===0?6:8,arrivalTicks:(serviceDays===0?28:30)*20,maxWaitingCustomers:1,queuePatienceTicks:90*20,tablePatienceTicks:70*20};
  if(kind==='slow')return {pacingVersion:2,pacingProfile:'slow',customers:serviceDays>=4?12:8,arrivalTicks:30*20,maxWaitingCustomers:1,queuePatienceTicks:90*20,tablePatienceTicks:70*20};
  const rush=['busy','special','finale'].includes(kind);
  if(serviceDays>=4)return {
    customers:kind==='finale'?22:rush?Math.min(18,14+(serviceDays-4)*2):12,
    arrivalTicks:(kind==='finale'?18:rush?Math.max(20,24-(serviceDays-4)*2):26)*20,
    maxWaitingCustomers:3,queuePatienceTicks:85*20,tablePatienceTicks:60*20,
  };
  return {customers:rush?(serviceDays===2?10:12):8,arrivalTicks:(rush?(serviceDays===2?28:24):30)*20,maxWaitingCustomers:2,queuePatienceTicks:90*20,tablePatienceTicks:65*20};
}
