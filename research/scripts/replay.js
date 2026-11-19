const {load}=require('./lib.js');
const day=new Map();const add=(d,k,n=1)=>{const o=day.get(d)??{};o[k]=(o[k]||0)+n;day.set(d,o)};
const sync=ip=>/^10\.20\.4\.1[1-6]$/.test(ip);
[...load('evidence/E01_ledgerone_api_access.csv'),...load('evidence/E18_ledgerone_api_access_1_to_7_sep.csv')].filter(r=>r.api_key_id=='key-tb-07'&&!sync(r.caller_ip)).forEach(r=>add(r.ts_utc.slice(0,10),'LedgerOne off-node calls (key-tb-07)'));
load('evidence/E02_helpdeskr_audit_log.csv').filter(r=>r.actor=='tb-sync-svc'&&!sync(r.source_ip)).forEach(r=>{const[d]=r.ts_local.split(' ');const[dd,mm,yy]=d.split('/');add(`${yy}-${mm}-${dd}`,'HelpDeskr off-node actions (tb-sync-svc, local date)')});
load('evidence/E05_bluevault_access_log.csv').filter(r=>r.principal.includes('bvk-7f3a')).forEach(r=>{if(r.source_ip!='172.16.9.40')add(new Date(+r.epoch_s*1000).toISOString().slice(0,10),'BlueVault bvk-7f3a off-normal source')});
load('evidence/E15_network_link_flow_log.csv').filter(r=>r.src_ip=='10.20.4.77').forEach(r=>add(r.ts_utc.slice(0,10),'Link flows from 10.20.4.77'));
load('evidence/E19_vendor_master_change_log.csv').filter(r=>r.field=='bank_account').forEach(r=>add(r.ts_utc.slice(0,10),'Bank change '+r.vendor_id+' ['+r.channel+', ref='+(r.approval_ref||'NONE')+']'));
[...day.keys()].sort().forEach(d=>console.log(d,JSON.stringify(day.get(d))));
