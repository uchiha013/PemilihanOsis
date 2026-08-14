import type {Bindings} from '../types';

type CandidateRow={candidateNumber:number;chairmanName:string;viceChairmanName:string;photoUrl:string;votes:number};

export async function quickCount(env:Bindings){
 const settings=await env.DB.prepare('SELECT * FROM election_settings WHERE id=1').first<Record<string,unknown>>();
 if(!settings)throw new Error('settings_missing');
 const totals=await env.DB.prepare('SELECT COUNT(*) totalStudents,SUM(has_voted) votedStudents FROM students').first<{totalStudents:number;votedStudents:number}>();
 const voteTotal=await env.DB.prepare('SELECT COUNT(*) n FROM votes').first<{n:number}>();
 const rows=await env.DB.prepare(`SELECT c.candidate_number candidateNumber,c.chairman_name chairmanName,c.vice_chairman_name viceChairmanName,c.photo_url photoUrl,COUNT(v.id) votes FROM candidates c LEFT JOIN votes v ON v.candidate_id=c.id GROUP BY c.id ORDER BY c.candidate_number`).all<CandidateRow>();
 const totalStudents=totals?.totalStudents??0,totalVotes=voteTotal?.n??0,votedStudents=totals?.votedStudents??0;
 const mode=String(settings.quick_count_mode);
 return {
  electionName:settings.election_name,schoolName:settings.school_name,status:settings.status,
  enabled:Boolean(settings.quick_count_enabled)&&mode!=='OFF',mode,
  refreshInterval:Number(settings.quick_count_refresh_interval),showPhotos:Boolean(settings.show_candidate_photos),showFinalWinner:Boolean(settings.show_final_winner),
  totalStudents,totalVotes,notVoted:Math.max(0,totalStudents-votedStudents),
  turnoutPercentage:totalStudents?Number((votedStudents/totalStudents*100).toFixed(2)):0,
  candidates:rows.results.map(r=>({candidateNumber:r.candidateNumber,chairmanName:r.chairmanName,viceChairmanName:r.viceChairmanName,photoUrl:r.photoUrl,votes:r.votes,percentage:totalVotes?Number((r.votes/totalVotes*100).toFixed(2)):0})),
  integrity:{votedStudents,totalVotes,valid:votedStudents===totalVotes}
 };
}
