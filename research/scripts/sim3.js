const {load,count}=require('./lib.js');
const A=[...load('evidence/E01_ledgerone_api_access.csv'),...load('evidence/E18_ledgerone_api_access_1_to_7_sep.csv')].filter(r=>r.api_key_id=='key-tb-07');
const sync=new Set([11,12,13,14,15,16].map(x=>'10.20.4.'+x));
const norm=r=>r.method+' '+r.endpoint.replace(/\?.*/,'').replace(/V-\d+/,'V-x').replace(/\d+/g,'N');
// baseline profile = what sync nodes did before 1 Sep (E01 only) ; 3.6.0 contact PATCH enrolled by release note E20-C
const prof=new Set(A.filter(r=>sync.has(r.caller_ip)&&r.ts_utc<'2026-09-01').map(norm));
prof.add('PATCH /vN/vendors/V-x/contact');
console.log('baseline endpoint set',[...prof]);
const flag=r=>!sync.has(r.caller_ip)||!prof.has(norm(r));
const att=r=>r.caller_ip.startsWith('198.18.')||r.caller_ip=='10.20.4.77';
let tp=0,fp=0,fn=0,tn=0;const fpl=[];
A.forEach(r=>{const f=flag(r),a=att(r);if(f&&a)tp++;else if(f)fp++,fpl.push(r);else if(a)fn++;else tn++});
console.log({rows:A.length,TP:tp,FP:fp,FN:fn,TN:tn});
console.log('FP',count(fpl,r=>r.caller_ip+' '+norm(r)));
// rule 'no sync-window masquerade': bank-details write from non-sync node
const w=A.filter(r=>r.method!='GET'&&/bank-details/.test(r.endpoint)&&!sync.has(r.caller_ip));console.log('bank write off-profile:',w.map(r=>r.ts_utc+' '+r.caller_ip));
// A naive 'sync window + right UA' rule
const win=A.filter(r=>r.ts_utc.slice(11,16)>='01:30'&&r.ts_utc.slice(11,16)<='01:45'&&att(r));console.log('attacker rows inside 01:30-01:45 window',win.length,'UA',count(win,r=>r.user_agent));
