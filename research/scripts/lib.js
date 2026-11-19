const fs=require('fs');
function parseCSV(t){const rows=[];let row=[],f='',q=false;for(let i=0;i<t.length;i++){const c=t[i];if(q){if(c=='"'){if(t[i+1]=='"'){f+='"';i++}else q=false}else f+=c}else if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'){row.push(f.replace(/\r$/,''));rows.push(row);row=[];f=''}else f+=c}
if(f||row.length){row.push(f);rows.push(row)}const h=rows.shift();return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])))}
exports.load=p=>parseCSV(fs.readFileSync(p,'utf8'));
exports.count=(a,f)=>{const m={};a.forEach(x=>{const k=f(x);m[k]=(m[k]||0)+1});return Object.entries(m).sort((a,b)=>b[1]-a[1])};
