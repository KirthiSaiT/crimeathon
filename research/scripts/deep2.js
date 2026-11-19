const {load,count}=require('./lib.js');
const E03=load('evidence/E03_sso_signin_log.csv'),E02=load('evidence/E02_helpdeskr_audit_log.csv'),E05=load('evidence/E05_bluevault_access_log.csv');
const R=new Set(load('evidence/E14_staff_roster.csv').map(r=>r.username));
console.log('== E03',E03.length,'range',E03[0].ts_utc,E03[E03.length-1].ts_utc);
console.log('auth',count(E03,r=>r.auth_method),'mfa',count(E03,r=>r.mfa_result),'result',count(E03,r=>r.result),'fail',count(E03,r=>r.failure_reason));
console.log('users not in roster:',count(E03.filter(r=>!R.has(r.user)),r=>r.user).slice(0,10));
console.log('success without passed MFA:',count(E03.filter(r=>r.result=='success'&&r.mfa_result!='passed'),r=>r.user+' '+r.auth_method+' '+r.mfa_result+' '+r.source_ip.split('.').slice(0,3).join('.')).slice(0,15));
console.log('source ranges (success)',count(E03.filter(r=>r.result=='success'),r=>r.source_ip.split('.').slice(0,2).join('.')));
console.log('192.0.2.* users',count(E03.filter(r=>r.source_ip.startsWith('192.0.2.')),r=>r.user+' '+r.city));
console.log('cities',count(E03,r=>r.city).slice(0,12));
// impossible travel: same user, different city, <3h apart on success
const by={};E03.filter(r=>r.result=='success').forEach(r=>(by[r.user]??=[]).push(r));let it=[];
for(const u in by){const a=by[u].sort((x,y)=>x.ts_utc<y.ts_utc?-1:1);for(let i=1;i<a.length;i++){const dt=(Date.parse(a[i].ts_utc)-Date.parse(a[i-1].ts_utc))/36e5;if(a[i].city!=a[i-1].city&&dt<3&&a[i].city&&a[i-1].city)it.push(`${u} ${a[i-1].city}->${a[i].city} ${dt.toFixed(1)}h ${a[i].ts_utc}`)}}
console.log('city jumps <3h:',it.length,it.slice(0,10));
// failed-login bursts per user
console.log('fail by user',count(E03.filter(r=>r.result!='success'),r=>r.user).slice(0,8));
console.log('fail by ip /24',count(E03.filter(r=>r.result!='success'),r=>r.source_ip.split('.').slice(0,3).join('.')).slice(0,8));
console.log('a.kapoor events',E03.filter(r=>r.user=='a.kapoor'&&r.result!='success').map(r=>r.ts_utc+' '+r.source_ip+' '+r.failure_reason+' '+r.mfa_result).join('\n'));
console.log('c.lawson cities',count(E03.filter(r=>r.user=='c.lawson'),r=>r.city+' '+r.source_ip.split('.').slice(0,3).join('.')));
console.log('== E02',E02.length);
console.log('actor_type',count(E02,r=>r.actor_type),'action',count(E02,r=>r.action));
console.log('actors not roster/known',count(E02.filter(r=>!R.has(r.actor)),r=>r.actor+' '+r.actor_type));
console.log('who touched TKT-48213',E02.filter(r=>r.object_id=='TKT-48213').map(r=>r.ts_local+' '+r.actor+' '+r.action+' '+r.source_ip).join('\n'));
console.log('details non-empty sample',count(E02.filter(r=>r.details),r=>r.action+': '+r.details.slice(0,50)).slice(0,25));
console.log('result',count(E02,r=>r.result));
console.log('exports by actor',count(E02.filter(r=>r.action.startsWith('export')),r=>r.actor+' '+r.action));
