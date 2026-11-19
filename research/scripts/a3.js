const {load,count}=require('./lib.js');
const e18=load('E18_ledgerone_api_access_1_to_7_sep.csv'), e19=load('E19_vendor_master_change_log.csv'), e15=load('E15_network_link_flow_log.csv');
console.log('--- E18 req-5f61b0de8'); e18.filter(x=>x.request_id.startsWith('req-5f61b0de8')).forEach(x=>console.log(Object.values(x).join(',')));
console.log('--- E18 key-tb-07 endpoints/method',count(e18.filter(x=>x.api_key_id=='key-tb-07'),x=>x.method+' '+x.endpoint.replace(/\/[A-Za-z0-9-]*\d[\w-]*/g,'/:id')+' '+x.status+' ip'+x.caller_ip.split('.').slice(2).join('.')));
console.log('--- E18 around 09-03 01:3x-01:5x key-tb-07'); e18.filter(x=>x.api_key_id=='key-tb-07'&&x.ts_utc.startsWith('2026-09-03T01:4')).forEach(x=>console.log(Object.values(x).join(',')));
console.log('--- E19 V-0412'); e19.filter(x=>x.vendor_id=='V-0412'||x.vendor_name.includes('Coastal')).forEach(x=>console.log(Object.values(x).join(',')));
console.log('--- E19 bank_account UI changes: approval_ref presence', count(e19.filter(x=>x.field=='bank_account'),x=>x.channel+' ref='+(x.approval_ref?'Y':'N')));
console.log('--- E15 src_label/ip',count(e15,x=>x.src_ip+' '+x.src_label+' '+x.dst_system+' '+x.dst_port+' '+x.result));
