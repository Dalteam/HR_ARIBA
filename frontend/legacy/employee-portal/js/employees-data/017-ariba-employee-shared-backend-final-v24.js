
(function(){
'use strict';
/* Final shared-backend behavior: the employee app always reads the same Supabase employee_directory/context used by HR. */
window.ARIBA_SOURCE_OF_TRUTH='Supabase shared backend: employee_directory + ariba_employee_context + workflow + attendance';
window.ARIBA_SHARED_BACKEND_FINAL=true;
var last='';
function stable(v){if(v===null||typeof v!=='object')return v;if(Array.isArray(v))return v.map(stable);var o={},k=Object.keys(v).sort();k.forEach(function(x){o[x]=stable(v[x]);});return o;}
function editing(){var a=document.activeElement;return !!(a&&(a.matches('input,select,textarea,[contenteditable="true"]')||a.closest('form')));}
function sig(c){try{return JSON.stringify(stable({employee:c&&c.employee,requests:c&&c.requests,notifications:c&&c.notifications,attendance:c&&c.attendance,team:c&&c.team,payroll:c&&c.payroll,documents:c&&c.documents}));}catch(e){return '';}}
async function refresh(){try{if(!window.ARIBA_SESSION||!window.refreshAribaContext)return;var c=await window.refreshAribaContext(),x=sig(c);if(!last){last=x;return;}if(x!==last&&!editing()){last=x;var tab=document.querySelector('.bni.on');var id=tab?tab.id.replace('tb-',''):'';var f={home:window.renderHome,att:window.renderAtt,lv:window.renderLv,pay:window.renderPay,team:window.renderTeam,prof:window.renderProf,approvals:window.renderApprovals,overtime:window.renderOvertime};if(typeof f[id]==='function'){var r=f[id]();if(r&&r.catch)r.catch(function(){});}}}catch(e){}}
window.ARIBA_SHARED_REFRESH=refresh;
function start(){setTimeout(refresh,1200);setInterval(refresh,15000);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
