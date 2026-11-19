const {load,count}=require('./lib.js');
const e03=load('E03_sso_signin_log.csv'),e01=load('E01_ledgerone_api_access.csv');
const atk=['198.18.7.41','198.18.7.58','198.18.7.23','198.18.7.24','198.18.7.77'];
console.log('E03 rows from attacker IPs'); e03.filter(x=>atk.includes(x.source_ip)).forEach(x=>console.log(Object.values(x).join(',')));
console.log('E03 successes from 198.18.7.* by user',count(e03.filter(x=>x.source_ip.startsWith('198.18.7.')&&x.result=='success'),x=>x.user).slice(0,5), 'distinct ips',new Set(e03.filter(x=>x.source_ip.startsWith('198.18.7.')).map(x=>x.source_ip)).size);
console.log('E01 429s',count(e01.filter(x=>x.status=='429'),x=>x.api_key_id+' '+x.caller_ip+' '+x.ts_utc.slice(0,10)));
