const {load,count}=require('./lib.js');
const e01=load('E01_ledgerone_api_access.csv'), e18=load('E18_ledgerone_api_access_1_to_7_sep.csv');
for (const [n,d] of [['E01',e01],['E18',e18]]){console.log('==',n,d.length);
console.log('key x ip x ua',count(d,x=>[x.api_key_id,x.caller_ip.split('.').slice(0,3).join('.'),x.user_agent].join(' | ')).slice(0,40));
}
