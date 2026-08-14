import {sha256} from '../utils/crypto'; import type {Bindings} from '../types';
export async function findVoter(env:Bindings,token:string){if(token.length<32||token.length>200)return null;return env.DB.prepare('SELECT id,name,attendance_number,class_name,has_voted FROM students WHERE qr_token_hash=?').bind(await sha256(token)).first<{id:number;name:string;attendance_number:number;class_name:string;has_voted:number}>()}
export async function castAnonymousVote(env:Bindings,token:string,candidateId:number){const hash=await sha256(token);const eligible=`EXISTS(SELECT 1 FROM students s,election_settings e WHERE s.qr_token_hash=? AND s.has_voted=0 AND e.id=1 AND e.status='OPEN' AND (e.start_at IS NULL OR e.start_at<=CURRENT_TIMESTAMP) AND (e.end_at IS NULL OR e.end_at>CURRENT_TIMESTAMP))`;
 const results=await env.DB.batch([env.DB.prepare(`INSERT INTO votes(candidate_id) SELECT id FROM candidates WHERE id=? AND ${eligible}`).bind(candidateId,hash),env.DB.prepare(`UPDATE students SET has_voted=1,voted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE qr_token_hash=? AND has_voted=0 AND changes()=1`).bind(hash)]);
 return results[0].meta.changes===1&&results[1].meta.changes===1;
}
export async function electionState(env:Bindings){return env.DB.prepare('SELECT * FROM election_settings WHERE id=1').first<Record<string,unknown>>()}
