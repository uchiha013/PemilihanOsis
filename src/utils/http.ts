import type {Context} from 'hono'; import type {AppEnv} from '../types';
export const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const ip=(c:Context<AppEnv>)=>c.req.header('CF-Connecting-IP')||'unknown';
export function jsonError(c:Context<AppEnv>,status:number,message:string){return c.json({ok:false,error:message},status as 400)}
export async function body(c:Context<AppEnv>){const type=c.req.header('content-type')||'';if(type.includes('application/json'))return await c.req.json<Record<string,unknown>>();return await c.req.parseBody()}
