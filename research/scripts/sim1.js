const {load,count}=require('./lib.js');
const E01=load('evidence/E01_ledgerone_api_access.csv'),E18=load('evidence/E18_ledgerone_api_access_1_to_7_sep.csv');
const E02=load('evidence/E02_helpdeskr_audit_log.csv'),E05=load('evidence/E05_bluevault_access_log.csv');
const E15=load('evidence/E15_network_link_flow_log.csv'),E19=load('evidence/E19_vendor_master_change_log.csv');
const all=[...E01,...E18].filter(r=>!r.api_key_id.startsWith('user:')).map(r=>({...r,t:Date.parse(r.ts_utc)}));
console.log('LedgerOne rows',all.length,'range',all[0].ts_utc,all[all.length-1].ts_utc);
console.log('keys',count(all,r=>r.api_key_id));
// baseline: before 2026-08-09
const cut=Date.parse('2026-08-09T00:00:00Z');
const base=all.filter(r=>r.t<cut);
const prof={};
base.forEach(r=>{const p=prof[r.api_key_id]??={ips:new Set(),eps:new Set(),ua:new Set(),days:new Set()};p.ips.add(r.caller_ip);p.eps.add(r.endpoint.replace(/V-\d+/,'V-x').replace(/pay-\d+|\d+/g,'N'));p.ua.add(r.user_agent);p.days.add(r.ts_utc.slice(0,10))});
for(const k in prof)console.log(k,'days',prof[k].days.size,'ips',[...prof[k].ips].join(' '),'| eps',[...prof[k].eps].join(' '));
const norm=e=>e.replace(/V-\d+/,'V-x').replace(/\d+/g,'N');
const flagged=[];
all.filter(r=>r.t>=cut).forEach(r=>{const p=prof[r.api_key_id];const why=[];
 if(!p)why.push('unknown key');else{ if(!p.ips.has(r.caller_ip))why.push('new source '+r.caller_ip); if(!p.eps.has(norm(r.endpoint)))why.push('new endpoint'); if(!p.ua.has(r.user_agent))why.push('new UA')}
 if(why.length)flagged.push({ts:r.ts_utc,key:r.api_key_id,ip:r.caller_ip,ep:r.endpoint,m:r.method,n:r.records_returned,why:why.join(',')})});
console.log('post-cut rows',all.filter(r=>r.t>=cut).length,'flagged',flagged.length);
console.log('flag by key/ip',count(flagged,f=>f.key+' '+f.ip));
console.log('flag by why',count(flagged,f=>f.why.replace(/\d+\.\d+\.\d+\.\d+/,'IP')));
console.log('PATCH bank-details rows:',all.filter(r=>/bank-details/.test(r.endpoint)&&r.method!='GET').map(r=>r.ts_utc+' '+r.caller_ip+' '+r.api_key_id+' '+r.endpoint));
console.log('bank-details GETs by ip',count(all.filter(r=>/bank-details/.test(r.endpoint)),r=>r.caller_ip));
// first/last flagged per ip
const byip={};flagged.forEach(f=>{(byip[f.ip]??=[]).push(f.ts)});for(const ip in byip)console.log(ip,byip[ip].length,byip[ip][0],byip[ip][byip[ip].length-1]);
// E19 approval check
const api=E19.filter(r=>r.channel!='UI');console.log('E19 channels',count(E19,r=>r.channel),'field',count(E19,r=>r.field));
console.log('bank changes w/o approval:',E19.filter(r=>r.field=='bank_account'&&!r.approval_ref).map(r=>r.ts_utc+' '+r.vendor_id+' '+r.channel+' '+r.changed_by));
// E15
console.log('E15 labels',count(E15,r=>r.src_ip+' '+r.src_label));
console.log('E15 .77 per day',count(E15.filter(r=>r.src_ip=='10.20.4.77'),r=>r.ts_utc.slice(0,10)));
console.log('E15 dst',count(E15.filter(r=>r.src_ip=='10.20.4.77'),r=>r.dst_system));
