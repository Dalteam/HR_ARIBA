
(function(){
'use strict';
/* HR is the sole source of employee/payroll data. Keep the original UI, replace only its data bridge. */
function num(v){var n=Number(v);return Number.isFinite(n)?n:0;}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function money2(v){return num(v).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';}
function payrollPayload(r){var p=r&&r.payload&&typeof r.payload==='object'?r.payload:(r||{});return {
 sal:num(p.sal??p.salary), hou:num(p.hou??p.housingAllowance??p.housing_allowance),
 tra:num(p.tra??p.transportAllowance??p.transport_allowance), prj:num(p.prj??p.projectAllowance??p.project_allowance),
 oth:num(p.oth??p.otherAllowance??p.other_allowance), tot:num(p.tot??p.salaryTotal??p.totalDue??p.total_due),
 ins:num(p.insEmp??p.insuranceSub??p.insurance_emp), net:num(p.net??p.netSalary??p.net_salary??p.netSAR),
 otherDed:num(p.otherDeduct??p.otherDeductions??p.other_deduct??0), loan:num(p.loanDeduct??p.loan_deduct??0),
 days:p.days??p.workDays??31, workDays:p.workDays??p.days??31, month:r&&r.month, year:r&&r.year,
 currency:p.currency||'ريال سعودي'
};}
function latestPayroll(){var arr=Array.isArray(ME&&ME.payroll)?ME.payroll:[];return arr.length?payrollPayload(arr[0]):null;}
function applyMasterEmployee(e,c){
 if(!e)return;
 /* Preserve every HR field instead of reducing it to the old employee shape. */
 var old=ME||{};
 ME=Object.assign({},old,e);
 ME.id=String(e.id||old.id||'');
 ME.name=e.nameAr||e.name||old.name||'';
 ME.name_en=e.nameEn||e.name_en||old.name_en||'';
 ME.job=e.jobTitle||e.job||old.job||'';
 ME.dept=e.dept||e.department||old.dept||'';
 ME.employer=e.employer||old.employer||'';
 ME.nationality=e.nationality||old.nationality||'';
 ME.salary=num(e.salary??e.sal??old.salary??old.sal);
 ME.hou=num(e.housingAllowance??e.hou??old.hou);
 ME.tra=num(e.transportAllowance??e.tra??old.tra);
 ME.prj=num(e.projectAllowance??e.prj??old.prj);
 /* HR may store nature allowance separately; show it explicitly and never lose it. */
 ME.natureAllowance=num(e.natureAllowance??old.natureAllowance);
 ME.oth=num(e.otherAllowance??e.oth??old.oth);
 ME.salaryTotal=num(e.salaryTotal??e.total??old.salaryTotal);
 ME.insuranceSub=num(e.insuranceSub??e.insEmp??old.insuranceSub??old.insEmp);
 ME.otherDeductions=num(e.otherDeductions??old.otherDeductions);
 ME.net=num(e.netSalary??e.net??e.netSalarySAR??old.net??old.netSalary);
 ME.payroll=Array.isArray(c&&c.payroll)?c.payroll:[];
 ME.attendance=Array.isArray(c&&c.attendance)?c.attendance:[];
 ME.documents=Array.isArray(c&&c.documents)?c.documents:[];
 ME.workflowRequests=Array.isArray(c&&c.requests)?c.requests:[];
 ME.notifications=Array.isArray(c&&c.notifications)?c.notifications:[];
 ME.locations=Array.isArray(c&&c.locations)?c.locations:[];
 ME.team=Array.isArray(c&&c.team)?c.team:[];
 ME.managerName=(c&&c.manager&&(c.manager.nameAr||c.manager.nameEn))||ME.managerName||'';
}
/* Context from ariba_employee_context is the HR master feed. No local employee master is consulted. */
var originalRefresh=window.refreshAribaContext;
if(typeof originalRefresh==='function'&&!originalRefresh.__hrPayrollFinal){
 window.refreshAribaContext=async function(){
   var c=await originalRefresh.apply(this,arguments);
   if(c&&c.employee)applyMasterEmployee(c.employee,c);
   return c;
 };
 window.refreshAribaContext.__hrPayrollFinal=true;
}
window.syncFromHR=function(){return window.refreshAribaContext?window.refreshAribaContext().catch(function(){return null;}):Promise.resolve(null);};
/* Exact HR payroll presentation: every displayed amount comes from the approved HR payroll payload. */
window.renderPay=function(){
 var el=document.getElementById('appContent');if(!el||!ME)return;
 var arr=Array.isArray(ME.payroll)?ME.payroll:[];
 var latest=arr.length?payrollPayload(arr[0]):null;
 function slipCard(r,raw){
   var monthNames=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
   var title=monthNames[Number(raw&&raw.month)||0]||''; if(raw&&raw.year)title+=(title?' ':'')+raw.year;
   var rows='';
   rows+='<div class="hr-pay-row"><span>الراتب الأساسي</span><b>'+money2(r.sal)+'</b></div>';
   rows+='<div class="hr-pay-row"><span>بدل السكن</span><b>'+money2(r.hou)+'</b></div>';
   rows+='<div class="hr-pay-row"><span>بدل النقل</span><b>'+money2(r.tra)+'</b></div>';
   rows+='<div class="hr-pay-row"><span>بدل المشروع</span><b>'+money2(r.prj)+'</b></div>';
   rows+='<div class="hr-pay-row"><span>بدلات أخرى</span><b>'+money2(r.oth)+'</b></div>';
   rows+='<div class="hr-pay-row hr-pay-total"><span>إجمالي الراتب</span><b>'+money2(r.tot)+'</b></div>';
   rows+='<div class="hr-pay-row hr-pay-ded"><span>استقطاع التأمينات</span><b>- '+money2(r.ins)+'</b></div>';
   if(r.loan)rows+='<div class="hr-pay-row hr-pay-ded"><span>استقطاع السلفة</span><b>- '+money2(r.loan)+'</b></div>';
   if(r.otherDed)rows+='<div class="hr-pay-row hr-pay-ded"><span>استقطاعات أخرى</span><b>- '+money2(r.otherDed)+'</b></div>';
   rows+='<div class="hr-pay-row hr-pay-net"><span>صافي الراتب</span><b>'+money2(r.net)+'</b></div>';
   return '<div class="card hr-pay-card"><div class="card-title"><i class="ti ti-file-invoice"></i> قسيمة الراتب'+(title?' — '+esc(title):'')+'</div>'+rows+'</div>';
 }
 var html='';
 /* V100: الراتب الحالي من الموارد البشرية يظهر دايمًا، وتحته آخر قسيمة معتمدة */
 {
   /* If no approved monthly slip exists, show HR employee master salary only. */
   var gross=ME.salaryTotal||((ME.salary||0)+(ME.hou||0)+(ME.tra||0)+(ME.prj||0)+(ME.oth||0)+(ME.natureAllowance||0));
   html+='<div class="card hr-pay-card"><div class="card-title"><i class="ti ti-cash"></i> الراتب الحالي — من نظام الموارد البشرية</div>'+
     '<div class="hr-pay-row"><span>الراتب الأساسي</span><b>'+money2(ME.salary)+'</b></div>'+ 
     '<div class="hr-pay-row"><span>بدل السكن</span><b>'+money2(ME.hou)+'</b></div>'+ 
     '<div class="hr-pay-row"><span>بدل النقل</span><b>'+money2(ME.tra)+'</b></div>'+ 
     '<div class="hr-pay-row"><span>بدل المشروع</span><b>'+money2(ME.prj)+'</b></div>'+ 
     '<div class="hr-pay-row"><span>بدلات أخرى</span><b>'+money2(ME.oth+(ME.natureAllowance||0))+'</b></div>'+ 
     '<div class="hr-pay-row hr-pay-total"><span>إجمالي الراتب</span><b>'+money2(gross)+'</b></div>'+ 
     '<div class="hr-pay-row hr-pay-ded"><span>استقطاع التأمينات</span><b>- '+money2(ME.insuranceSub)+'</b></div>'+ 
     '<div class="hr-pay-row hr-pay-net"><span>صافي الراتب</span><b>'+money2(ME.net)+'</b></div></div>';
 }
 if(latest){html+=slipCard(latest,arr[0]);}
 if(arr.length>1){html+='<div class="card"><div class="card-title"><i class="ti ti-history"></i> الرواتب الشهرية المعتمدة</div>'+arr.map(function(raw){return slipCard(payrollPayload(raw),raw);}).join('')+'</div>';}
 html+='<div class="card"><div class="card-title"><i class="ti ti-building-bank"></i> بيانات البنك</div>'+row('IBAN',ME.iban||'—')+'</div>';
 el.innerHTML=html;
};
/* Keep the original profile UI but force its salary block to use HR fields. */
/* Final profile renderer: no direct employees-table lookup, no recursion. All fields come from the HR master context. */
window.renderProf=function(){
  var el=document.getElementById('appContent'); if(!el||!ME)return;
  var e=ME, p=null; /* V100: البروفايل يعرض الراتب الحالي من الموارد البشرية فورًا */
  var fullName=e.name||'—', nameEn=e.name_en||e.nameEn||'—';
  var iban=e.iban||e.IBAN||'—';
  var dob=e.dob||e.birthDate||e.birth_date||'—';
  var join=e.joinDate||e.join_date||e.contract_join||'—';
  var end=e.contractEnd||e.contract_end||'—';
  var iq=e.iqamaNo||e.iqama_no||'—';
  var email=e.email||'—', mobile=e.mobile||'—';
  var manager=e.managerName||'—';
  var gross=p?p.tot:(e.salaryTotal||0), net=p?p.net:(e.net||0), ins=p?p.ins:(e.insuranceSub||0);
  function val(v){return esc(v==null||v===''?'—':v);}
  function dateVal(v){if(!v||v==='—')return '—'; try{var d=new Date(v); if(isNaN(d.getTime()))return val(v); var dd=String(d.getDate()).padStart(2,'0'), mm=String(d.getMonth()+1).padStart(2,'0'), yy=d.getFullYear(); return dd+'/'+mm+'/'+yy;}catch(_){return val(v);}}
  function info(label,v){return '<div class="profile-info"><span>'+label+'</span><b>'+val(v)+'</b></div>';}
  el.innerHTML=
    '<div class="profile-hero">'+
      '<div class="profile-avatar">'+esc((fullName.trim().split(/\s+/)[0]||'؟').slice(0,1))+'</div>'+
      '<div style="min-width:0;flex:1"><div class="profile-name">'+val(fullName)+'</div><div class="profile-en">'+val(nameEn)+'</div><div class="profile-job">'+val(e.job||'—')+'</div></div>'+
    '</div>'+ 
    '<div class="card"><div class="card-title">البيانات الشخصية</div><div class="profile-grid">'+
      info('الرقم الوظيفي',e.empNo!=null?e.empNo:e.id)+info('الجنسية',e.nationality)+info('الجوال',mobile)+info('البريد الإلكتروني',email)+info('رقم الإقامة / الهوية',iq)+info('تاريخ الميلاد',dateVal(dob))+ 
    '</div></div>'+ 
    '<div class="card"><div class="card-title">الوظيفة والعقد</div><div class="profile-grid">'+
      info('جهة العمل',e.employer)+info('القسم',e.dept)+info('الوظيفة',e.job)+info('المدير المباشر',manager)+info('تاريخ المباشرة',dateVal(join))+info('انتهاء العقد',dateVal(end))+
    '</div></div>'+ 
    '<div class="card"><div class="card-title">💰 الراتب من الموارد البشرية</div>'+ 
      '<div class="hr-pay-row"><span>الراتب الأساسي</span><b>'+money2(p?p.sal:e.salary)+'</b></div>'+ 
      '<div class="hr-pay-row"><span>بدل السكن</span><b>'+money2(p?p.hou:e.hou)+'</b></div>'+ 
      '<div class="hr-pay-row"><span>بدل النقل</span><b>'+money2(p?p.tra:e.tra)+'</b></div>'+ 
      '<div class="hr-pay-row"><span>بدل المشروع</span><b>'+money2(p?p.prj:e.prj)+'</b></div>'+ 
      '<div class="hr-pay-row"><span>بدلات أخرى</span><b>'+money2(p?p.oth:(e.oth||0)+(e.natureAllowance||0))+'</b></div>'+ 
      '<div class="hr-pay-row hr-pay-total"><span>إجمالي الراتب</span><b>'+money2(gross)+'</b></div>'+ 
      '<div class="hr-pay-row hr-pay-ded"><span>استقطاع التأمينات</span><b>- '+money2(ins)+'</b></div>'+ 
      '<div class="hr-pay-row hr-pay-net"><span>صافي الراتب</span><b>'+money2(net)+'</b></div>'+ 
    '</div>'+ 
    '<div class="card"><div class="card-title">🏦 بيانات البنك</div>'+info('IBAN',iban)+'</div>';
};
var pst=document.createElement('style');pst.textContent='.profile-hero{display:flex;align-items:center;gap:14px;padding:16px;border-radius:14px;background:var(--c2);margin-bottom:12px}.profile-avatar{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--gr);color:#fff;font-size:30px;font-weight:800;flex:none}.profile-name{font-size:17px;font-weight:800;line-height:1.5}.profile-en{font-size:11px;color:var(--mu);margin-top:2px}.profile-job{font-size:12px;font-weight:700;margin-top:6px}.profile-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.profile-info{padding:10px;border:1px solid var(--bd);border-radius:10px;background:var(--c2);min-width:0}.profile-info span{display:block;font-size:10px;color:var(--mu);margin-bottom:4px}.profile-info b{display:block;font-size:12px;overflow-wrap:anywhere}';document.head.appendChild(pst);
var st=document.createElement('style');st.textContent='.hr-pay-row{display:flex;justify-content:space-between;align-items:center;padding:10px 2px;border-bottom:1px solid rgba(36,48,68,.25);font-size:12px}.hr-pay-row span{color:var(--mu)}.hr-pay-row b{font-weight:700}.hr-pay-total{margin-top:6px;border-top:1px solid var(--bd);font-size:13px}.hr-pay-total b{color:var(--gr)}.hr-pay-ded b{color:var(--rd)}.hr-pay-net{border-bottom:0;margin-top:4px;padding-top:12px;font-size:16px;font-weight:800}.hr-pay-net b{color:var(--cy);font-size:17px}.hr-pay-card{overflow:hidden}';document.head.appendChild(st);
/* Initial + periodic refresh from HR context only. */
async function pull(){try{if(window.ARIBA_SESSION&&window.refreshAribaContext){var c=await window.refreshAribaContext();if(c&&c.employee){applyMasterEmployee(c.employee,c);var b=document.querySelector('.bni.on');var tab=b?b.id.replace('tb-',''):'';if(tab==='pay'&&typeof window.renderPay==='function')window.renderPay();if(tab==='prof'&&typeof window.renderProf==='function')window.renderProf();}}}catch(e){console.warn('HR master payroll sync',e);}}
setTimeout(pull,800);setInterval(pull,10000);window.addEventListener('focus',pull);window.addEventListener('online',pull);document.addEventListener('visibilitychange',function(){if(!document.hidden)pull();});
})();
