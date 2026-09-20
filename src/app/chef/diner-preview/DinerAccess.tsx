"use client";
import { createContext, useContext } from 'react';
import type { DinerSession } from './diner-sync';

export type DinerAccess = { mode:'wallet'; wallet:string; session:DinerSession; reauthenticate?:(message?:string)=>void } | { mode:'local' };
export const DinerAccessContext = createContext<DinerAccess|null>(null);
export const useDinerAccess = () => useContext(DinerAccessContext);
