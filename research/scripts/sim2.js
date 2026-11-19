const {load,count}=require('./lib.js');
const E01=load('evidence/E01_ledgerone_api_access.csv'),E18=load('evidence/E18_ledgerone_api_access_1_to_7_sep.csv');
const E15=load('evidence/E15_network_link_flow_log.csv'),E02=load('evidence/E02_helpdeskr_audit_log.csv');
console.log('E15 .77 July rows:',E15.filter(r=>r.src_ip=='10.20.4.77'&&r.ts_utc<'2026-08').map(r=>r.ts_utc+' '+r.dst_system+' '+r.dst_port+' '+r.bytes_out+' '+r.result).join('\n'));
const all=[...E01,...E18].filter(r=>r.api_key_id=='key-tb-07');
const sync=new Set(['11','12','13','14','15','16'].map(x=>'10.20.4.'+x));
// refined: key-tb-07 baseline = sync nodes, endpoints invoices/payments status/vendors reads; 3.6.0 enrolled contact PATCH from sync nodes
const ok=r=>sync.has(r.caller_ip)&&(/\/contact$/.test(r.endpoint)&&r.method=='PATCH'||r.method=='GET'&&/^\/v2\/(invoices|payments\/status|vendors)(\?|\/?$|\/V-\d+$)/.test(r.endpoint));
const attacker=r=>r.caller_ip.startsWith('198.18.')||r.caller_ip=='10.20.4.77';
let tp=0,fp=0,fn=0,tn=0;const fpl=[],fnl=[];
all.forEach(r=>{const f=!ok(r),a=attacker(r);if(f&&a)tp++;else if(f&&!a){fp++;fpl.push(r)}else if(!f&&a){fn++;fnl.push(r)}else tn++});
console.log('key-tb-07 rows',all.length,'attacker-labelled',tp+fn,'TP',tp,'FP',fp,'FN',fn,'TN',tn);
console.log('FP sample',count(fpl,r=>r.caller_ip+' '+r.method+' '+r.endpoint.replace(/V-\d+/,'V-x')).slice(0,8));
console.log('FN sample',fnl.slice(0,5).map(r=>r.ts_utc+' '+r.endpoint));
console.log('attacker endpoints',count(all.filter(attacker),r=>r.method+' '+r.endpoint.replace(/V-\d+/,'V-x').replace(/pay-?\d+/,'pay')).slice(0,15));
console.log('.77 req per day',count(all.filter(r=>r.caller_ip=='10.20.4.77'),r=>r.ts_utc.slice(0,10)));
console.log('.77 hours UTC',count(all.filter(r=>r.caller_ip=='10.20.4.77'),r=>r.ts_utc.slice(11,13)));
// E02 .77 and 198.18 events
const h=E02.filter(r=>r.source_ip=='10.20.4.77'||r.source_ip.startsWith('198.18.'));
console.log('E02 attacker-like rows',h.length,count(h,r=>r.actor+' '+r.action+' '+r.source_ip).slice(0,14));
// 3 Sep sequence
console.log(all.filter(r=>r.ts_utc.startsWith('2026-09-03T01:4')&&r.caller_ip=='10.20.4.77').map(r=>r.ts_utc+' '+r.method+' '+r.endpoint+' '+r.records_returned+' '+r.status).join('\n'));
// time gap: first payments/scheduled by .77 vs earlier
console.log('scheduled reads',all.filter(r=>/scheduled/.test(r.endpoint)).map(r=>r.ts_utc+' '+r.caller_ip).join(' | '));
