const {load,count}=require('./lib.js');
const R=load('evidence/E14_staff_roster.csv');
console.log('roster cols',Object.keys(R[0]).join(','),'rows',R.length);
console.log('status',count(R,r=>r.status),'dept',count(R,r=>r.department).slice(0,8));
const T=R.filter(r=>r.termination_date);console.log('terminated rows',T.length);T.forEach(r=>console.log(' ',r.username,r.full_name,r.department,r.role,r.status,'term',r.termination_date,'|',r.notes));
console.log('notes non-empty:',R.filter(r=>r.notes).map(r=>r.username+': '+r.notes).slice(0,30));
const E01=load('evidence/E01_ledgerone_api_access.csv').concat(load('evidence/E18_ledgerone_api_access_1_to_7_sep.csv'));
const E02=load('evidence/E02_helpdeskr_audit_log.csv'),E03=load('evidence/E03_sso_signin_log.csv'),E05=load('evidence/E05_bluevault_access_log.csv'),E19=load('evidence/E19_vendor_master_change_log.csv');
const iso2=r=>{const[d,t]=r.ts_local.split(' ');const[dd,mm,yy]=d.split('/');return `${yy}-${mm}-${dd}`};
for(const t of T){const u=t.username,td=t.termination_date;
 const a=E01.filter(r=>r.api_key_id=='user:'+u&&r.ts_utc.slice(0,10)>td).length;
 const b=E02.filter(r=>r.actor==u&&iso2(r)>td).length;
 const c=E03.filter(r=>r.user==u&&r.ts_utc.slice(0,10)>td);
 const d=E05.filter(r=>r.principal=='user:'+u&&new Date(+r.epoch_s*1000).toISOString().slice(0,10)>td).length;
 const e=E19.filter(r=>r.changed_by==u&&r.ts_utc.slice(0,10)>td).length;
 console.log(u,td,'after-term: E01',a,'E02',b,'E03 total',c.length,'ok',c.filter(x=>x.result=='success').length,'E05',d,'E19',e);}
