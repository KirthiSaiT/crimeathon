const {load,count}=require('./lib.js');
const e01=load('E01_ledgerone_api_access.csv'), e18=load('E18_ledgerone_api_access_1_to_7_sep.csv'), e19=load('E19_vendor_master_change_log.csv');
console.log('--- E01 key-tb-07 outside 10.20.4');
e01.filter(x=>x.api_key_id.startsWith('key-tb')&&!x.caller_ip.startsWith('10.20.4')).forEach(x=>console.log(Object.values(x).join(',')));
console.log('--- E01/E18 any key-tb-03/key-app-12 use'); [...e01,...e18].filter(x=>/tb-03|app-12/.test(x.api_key_id)).slice(0,5).forEach(x=>console.log(Object.values(x).join(',')));
console.log('--- E19 channel x field',count(e19,x=>x.channel+' | '+x.field));
console.log('--- E19 non-UI');
e19.filter(x=>x.channel!='UI').forEach(x=>console.log(Object.values(x).join(',')));
