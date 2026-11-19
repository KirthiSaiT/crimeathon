const {load,count}=require('./lib.js');
const e01=load('E01_ledgerone_api_access.csv'),e18=load('E18_ledgerone_api_access_1_to_7_sep.csv'),e19=load('E19_vendor_master_change_log.csv'),e02=load('E02_helpdeskr_audit_log.csv');
console.log('r.menon API', [...e01,...e18].filter(x=>x.api_key_id=='user:r.menon').length);
const ids=[...new Set(e19.map(x=>x.vendor_id))].sort(); console.log('vendor id range',ids[0],ids[ids.length-2],ids[ids.length-1],'non-"Logistics Supply" names',[...new Set(e19.filter(x=>!/Logistics Supply/.test(x.vendor_name)).map(x=>x.vendor_name))]);
console.log('E02 exports by actor/day', count(e02.filter(x=>x.action=='export.create'),x=>x.actor+' '+x.ts_local.slice(0,10)+' '+x.source_ip.replace(/\.\d+$/,'')));
console.log('E02 HelpDeskr 18 Aug 10.20.4.77 all'); e02.filter(x=>x.source_ip=='10.20.4.77').forEach(x=>console.log(Object.values(x).join(',')));
console.log('E18 5-6 Sep payments/scheduled', [...e18].filter(x=>x.endpoint.includes('scheduled')).map(x=>x.ts_utc+' '+x.caller_ip+' '+x.records_returned).join(' | '));
