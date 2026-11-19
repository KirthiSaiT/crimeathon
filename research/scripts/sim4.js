const {load,count}=require('./lib.js');
const L=load('evidence/E01_ledgerone_api_access.csv').concat(load('evidence/E18_ledgerone_api_access_1_to_7_sep.csv')).filter(r=>r.api_key_id=='key-tb-07');
const F=load('evidence/E15_network_link_flow_log.csv');
const H=load('evidence/E02_helpdeskr_audit_log.csv').filter(r=>r.actor=='tb-sync-svc');
const att=ip=>ip.startsWith('198.18.')||ip=='10.20.4.77';
// unify events from 3 sources: {t,host,sys,ep}
const ev=(rows)=>{const e=[];
 L.forEach(r=>e.push({t:Date.parse(r.ts_utc),h:r.caller_ip,s:'LedgerOne',ep:r.method+' '+r.endpoint.replace(/\?.*/,'').replace(/V-\d+/,'V-x').replace(/\d+/g,'N')}));
 F.filter(r=>r.src_ip.startsWith('10.20.4.')&&r.src_ip!='10.20.4.10').forEach(r=>e.push({t:Date.parse(r.ts_utc),h:r.src_ip,s:'flow:'+r.dst_system,ep:'flow'}));
 H.forEach(r=>{const[d,tm]=r.ts_local.split(' ');const[dd,mm,yy]=d.split('/');e.push({t:Date.parse(`${yy}-${mm}-${dd}T${tm}Z`)-19800000,h:r.source_ip,s:'HelpDeskr',ep:r.action})});
 return e};
function run(name,mut){let e=ev();if(mut)e=e.map(mut);
 const days={},eps={},sys={};
 e.forEach(x=>{const d=new Date(x.t).toISOString().slice(0,10);(days[x.h]??=new Set()).add(d);(sys[x.h]??=new Set()).add(x.s.split(':')[0]);(eps[x.h]??={});eps[x.h][x.ep]=(eps[x.h][x.ep]||0)+1});
 const dc=Object.entries(days).map(([h,s])=>[h,s.size]).sort((a,b)=>b[1]-a[1]);
 const med=dc.filter(([h])=>!att(h)||false).map(x=>x[1]);const ref=Math.max(...dc.map(x=>x[1]));
 // L1: host seen on <15% of reference days = unestablished ; L2: host's endpoint family outside the established-host family set
 const est=new Set(dc.filter(([h,n])=>n>=0.5*ref).map(x=>x[0]));
 const fam=new Set(['PATCH /vN/vendors/V-x/contact']);e.filter(x=>x.t<Date.parse('2026-08-09T00:00:00Z')&&est.has(x.h)).forEach(x=>fam.add(x.ep));
 let tp=0,fp=0,fn=0,tn=0;const miss=[];
 e.forEach(x=>{const l1=!est.has(x.h);const l2=x.ep!='flow'&&!fam.has(x.ep)&&!/^flow/.test(x.s);const f=l1||l2;const a=x.att??att(x.h);if(f&&a)tp++;else if(f)fp++;else if(a){fn++;miss.push(x)}else tn++});
 console.log(`[${name}] events ${e.length} hosts ${dc.length} established ${est.size} | TP ${tp} FP ${fp} FN ${fn} TN ${tn}`);
 return {dc,miss}}
const base=run('baseline');
console.log('days-active per host:',base.dc.map(x=>x.join('=')).join(' '));
// variation A: renumber private-link hosts (+90)
run('A renumber hosts',x=>({...x,h:x.h.startsWith('10.20.4.')?'10.20.4.'+(+x.h.split('.')[3]+90):x.h,att:att(x.h)}));
// variation B: shift all clocks +2h
run('B +2h clock shift',x=>({...x,t:x.t+7200000,att:att(x.h)}));
// variation C: attacker rides a real sync node (evasion)
const r=run('C attacker uses sync node .13',x=>x.h=='10.20.4.77'?{...x,h:'10.20.4.13',att:true}:{...x,att:att(x.h)});
console.log(' C misses by endpoint:',count(r.miss,m=>m.s+' '+m.ep).slice(0,8));
// variation D: attacker host active many days (low and slow, 45 days) — simulate by adding .77 daily ping
