const {load,count}=require('./lib.js');
const e01=load('E01_ledgerone_api_access.csv'),e18=load('E18_ledgerone_api_access_1_to_7_sep.csv'),e15=load('E15_network_link_flow_log.csv'),e02=load('E02_helpdeskr_audit_log.csv'),e05=load('E05_bluevault_access_log.csv'),e03=load('E03_sso_signin_log.csv');
console.log('--- E15 tb-build-02 by day',count(e15.filter(x=>x.src_ip=='10.20.4.77'),x=>x.ts_utc.slice(0,10)+' '+x.dst_system));
const b=e15.filter(x=>x.src_ip=='10.20.4.77'); console.log('first',b[0].ts_utc,'last',b[b.length-1].ts_utc);
console.log('bytes_out per day',Object.entries(b.reduce((m,x)=>{const d=x.ts_utc.slice(0,10);m[d]=(m[d]||0)+ +x.bytes_out;return m},{})));
console.log('--- E01+E18 ip 10.20.4.77'); [...e01,...e18].filter(x=>x.caller_ip=='10.20.4.77').forEach(x=>console.log(Object.values(x).join(',')));
console.log('--- E02 tb-sync-svc sources',count(e02.filter(x=>x.actor=='tb-sync-svc'),x=>x.source_ip.replace(/\.\d+$/,'.x')+' '+x.action));
console.log('--- E02 non-10.20.4 source for integration actor'); e02.filter(x=>x.actor_type=='integration'&&!x.source_ip.startsWith('10.20.4.1')).slice(0,60).forEach(x=>console.log(Object.values(x).join(',')));
