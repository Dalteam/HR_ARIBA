
(function(){
'use strict';
function escA(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
function photoHtml(e,size){
  if(e&&e.photoUrl)return '<img class="profile-photo" style="width:'+size+'px;height:'+size+'px" src="'+e.photoUrl+'" alt="">';
  return '<div class="profile-photo-fallback" style="width:'+size+'px;height:'+size+'px">'+escA((e&&e.name||'؟').split(' ')[0].slice(0,1))+'</div>';
}
function money(v){return Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';}
function payRow(p){
  var r=p.payload||p,rowName=(p.month||'')+'/'+(p.year||'');
  var gross=r.totalDue??r.total??r.salaryTotal??0, net=r.netSAR??r.net??0, ins=r.insEmp??r.insuranceSub??0;
  return '<div class="salary-month"><div><strong>'+escA(rowName)+'</strong><div style="font-size:10px;color:var(--mu)">الإجمالي '+money(gross)+' • التأمينات '+money(ins)+'</div></div><div class="salary-net">'+money(net)+'</div></div>';
}
var oldRefresh=window.refreshAribaContext;
window.refreshAribaContext=async function(){
  var c=await oldRefresh();
  if(c&&c.employee){
    ME.photoUrl=c.employee.photoUrl||c.employee.photo_url||'';
    ME.empNo=c.employee.empNo||c.employee.emp_no||c.employee.id||'';
    ME.salaryTotal=c.employee.salaryTotal||c.employee.salary_total||0;
    ME.payroll=c.payroll||[];
    ME.attendance=c.attendance||[];
    ME.leaveCurrent=c.employee.leaveCurrentOverride;
    ME.leaveYearEnd=c.employee.leaveYearEnd;
    ME.leaveTotalSinceStart=c.employee.leaveTotalSinceStart;
    ME.leaveUsedSinceStart=c.employee.leaveUsedSinceStart;
    ME.leaveAvailableSinceStart=c.employee.leaveAvailableSinceStart; ME.managerName=(c.manager&&(c.manager.nameAr||c.manager.nameEn))||'';
  }
  return c;
};
window.syncFromHR=function(){return window.refreshAribaContext?window.refreshAribaContext():Promise.resolve(null);};

window.renderHome=function(){
  var el=document.getElementById('appContent');if(!el||!ME)return;
  var today=new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var reqs=window.getMyLeaves?window.getMyLeaves():[];
  var pending=reqs.filter(function(r){return r.status==='pending';}).length;
  var photo=photoHtml(ME,82);
  el.innerHTML=
    '<div class="profile-hero"><div style="display:flex;align-items:center;gap:14px">'+photo+
      '<div style="min-width:0"><div style="font-size:18px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escA(ME.name)+'</div>'+
      '<div style="font-size:11px;color:var(--dm);margin-top:3px">'+escA(ME.job||'—')+'</div>'+
      '<div style="font-size:10px;color:var(--mu);margin-top:3px">الرقم الوظيفي: '+escA(ME.empNo||'—')+'</div>'+
      '<div style="font-size:10px;color:var(--mu);margin-top:3px">'+escA(today)+'</div></div></div>'+
      '<div class="profile-grid">'+
      '<div class="profile-mini"><span>جهة العمل</span><b>'+escA(ME.employer||'—')+'</b></div>'+
      '<div class="profile-mini"><span>القسم</span><b>'+escA(ME.dept||'—')+'</b></div>'+
      '<div class="profile-mini"><span>المدير المباشر</span><b>'+escA(ME.managerName||'—')+'</b></div>'+
      '<div class="profile-mini"><span>الجنسية</span><b>'+escA(ME.nationality||'—')+'</b></div></div></div>'+
    '<div class="kpi-row">'+
      '<div class="kpi" style="border-top:3px solid var(--gr)"><div class="kpi-label">رصيد الإجازة</div><div class="kpi-val" style="color:var(--gr)">'+Number(ME.leave_bal||0).toFixed(2)+'</div><div class="kpi-sub">يوم حتى اليوم</div></div>'+
      '<div class="kpi" style="border-top:3px solid var(--cy)"><div class="kpi-label">نهاية العام</div><div class="kpi-val" style="color:var(--cy)">'+Number(ME.leaveYearEnd??ME.leave_bal??0).toFixed(2)+'</div><div class="kpi-sub">31/12</div></div>'+
    '</div>'+
    '<div class="card salary-card"><div class="card-title"><i class="ti ti-cash"></i> آخر راتب معتمد</div>'+
      (ME.payroll&&ME.payroll.length?payRow(ME.payroll[0]):'<div style="color:var(--mu);font-size:11px">لم يتم إصدار مسير معتمد للموظف حتى الآن.</div>')+
    '</div>'+
    '<div class="quick-grid"><button class="quick-btn" onclick="goTab(\'att\',document.getElementById(\'tb-att\'))">📍<br>الحضور</button><button class="quick-btn" onclick="goTab(\'lv\',document.getElementById(\'tb-lv\'))">🗓<br>الإجازات</button><button class="quick-btn" onclick="goTab(\'pay\',document.getElementById(\'tb-pay\'))">💳<br>الراتب</button><button class="quick-btn" onclick="goTab(\'prof\',document.getElementById(\'tb-prof\'))">👤<br>ملفي</button></div>'+
    (pending?'<div class="card"><div class="card-title">🔔 طلبات معلقة</div><div style="font-size:12px">لديك '+pending+' طلب/طلبات بانتظار الاعتماد.</div></div>':'');
  try{if(typeof ensureApprovalNav==='function')ensureApprovalNav();}catch(e){}
};

window.renderPay=function(){
  var el=document.getElementById('appContent');if(!el||!ME)return;
  var html='<div class="card"><div class="card-title"><i class="ti ti-cash"></i> الراتب الحالي</div>'+
    row('الراتب الأساسي',money(ME.salary))+row('بدل السكن',money(ME.hou))+row('بدل المواصلات',money(ME.tra))+row('بدل المشروع',money(ME.prj))+row('بدلات أخرى',money(ME.oth))+
    '<div style="border-top:1px solid var(--bd);margin-top:5px;padding-top:9px">'+row('الإجمالي',money(ME.salaryTotal||((ME.salary||0)+(ME.hou||0)+(ME.tra||0)+(ME.prj||0)+(ME.oth||0))))+
    row('الصافي الحالي',money(ME.net))+'</div></div>';
  html+='<div class="card salary-card"><div class="card-title">📅 الرواتب الشهرية المعتمدة</div>'+
    (ME.payroll&&ME.payroll.length?ME.payroll.map(payRow).join(''):'<div style="font-size:11px;color:var(--mu)">لا توجد مسيرات معتمدة حتى الآن.</div>')+
    '</div><div class="card"><div class="card-title">🏦 بيانات البنك</div>'+row('IBAN',ME.iban||'—')+'</div>';
  el.innerHTML=html;
};

window.renderProf=function(){
  var el=document.getElementById('appContent');if(!el||!ME)return;
  el.innerHTML='<div class="profile-hero"><div style="display:flex;align-items:center;gap:14px">'+photoHtml(ME,96)+
    '<div><div style="font-size:18px;font-weight:900">'+escA(ME.name)+'</div><div style="font-size:11px;color:var(--mu)">'+escA(ME.job||'—')+'</div><div style="font-size:10px;color:var(--dm);margin-top:4px">EMP: '+escA(ME.empNo||'—')+'</div></div></div></div>'+
    '<div class="card"><div class="card-title">البيانات الشخصية</div>'+
    row('الاسم',ME.name)+row('الاسم بالإنجليزي',ME.name_en||'—')+row('الجنسية',ME.nationality||'—')+row('جهة العمل',ME.employer||'—')+row('القسم',ME.dept||'—')+row('الوظيفة',ME.job||'—')+row('الجوال',ME.mobile||'—')+row('البريد',ME.email||'—')+row('تاريخ الميلاد',fD(ME.dob))+'</div>'+
    '<div class="card"><div class="card-title">📄 الوثائق والعقد</div>'+row('رقم الإقامة / الهوية',ME.iqama||'—')+row('انتهاء الإقامة',fD(ME.iqama_exp))+row('تاريخ المباشرة',fD(ME.join))+row('طبيعة العقد',ME.contractNature||'—')+(ME.contractNature==='fixed'||ME.contractNature==='محدد المدة'?row('مدة العقد (شهر)',ME.contractDuration||'—'):'')+row('انتهاء العقد',fD(ME.end))+'</div>'+
    '<div class="card"><div class="card-title">🏖 أرصدة الإجازات</div>'+row('الرصيد حتى اليوم',Number(ME.leave_bal||0).toFixed(2)+' يوم')+row('الرصيد حتى 31/12',Number(ME.leaveYearEnd??ME.leave_bal??0).toFixed(2)+' يوم')+row('المرحل',Number(ME.leave_carry||0).toFixed(2)+' يوم')+row('إجمالي منذ بداية الخدمة',Number(ME.leaveTotalSinceStart||0).toFixed(2)+' يوم')+row('المستخدم منذ بداية الخدمة',Number(ME.leaveUsedSinceStart||0).toFixed(2)+' يوم')+row('المتاح منذ بداية الخدمة',Number(ME.leaveAvailableSinceStart||0).toFixed(2)+' يوم')+'</div>'+
    '<div class="card"><div class="card-title">💰 الراتب</div>'+row('الراتب الأساسي',money(ME.salary))+row('الإجمالي',money(ME.salaryTotal))+row('الصافي',money(ME.net))+'</div>';
};

})();
