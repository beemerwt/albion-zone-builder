import { WorldJson } from './types';
export const DEFAULT_PORT_NAMES = ['NW','NE','SE','SW','NW2','NE2','SE2','SW2'];
export async function parseWorldFile(file:File):Promise<WorldJson>{ return JSON.parse(await file.text()) as WorldJson; }
export function downloadJson(name:string,data:unknown){const b=new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}); const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href)}
