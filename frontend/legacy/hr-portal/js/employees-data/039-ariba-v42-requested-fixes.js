
(function(){
'use strict';
var V42_NOT_EMPLOYED=['عبد الله المصرياني'];
function norm42(v){return String(v||'').replace(/\s+/g,' ').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه');}
function hasName42(e,list){var n=norm42(e&& (e.nameAr||e.name||e.na||e.name_en||e.nameEn));return list.some(function(x){var q=norm42(x);return n===q||n.indexOf(q)>=0;});}
function consultant42(e){var s=[e&&e.empType,e&&e.wpsType,e&&e.excelCategory,e&&e.jobTitle,e&&e.jt,e&&e.dept,e&&e.dep].map(norm42).join(' ');return /استشاري|استشاره|consultant|external|مهمه محدده/.test(s);}
function payrollExcluded42(e){return !!(e&& (e.excludeFromPayroll||consultant42(e)||String(e.wpsType||'').toLowerCase()==='external' || String(e.wpsType||'').toLowerCase()==='consultant'));}
function eosExcluded42(e){return !!(e&& (e.excludeFromEOS||consultant42(e)||String(e.wpsType||'').toLowerCase()==='external' || String(e.wpsType||'').toLowerCase()==='consultant'));}
function dateLeft42(v){if(!v)return null;var d=new Date(v),t=new Date();if(isNaN(d.getTime()))return null;d.setHours(0,0,0,0);t.setHours(0,0,0,0);return Math.ceil((d-t)/86400000);}
function expired42(v){var d=dateLeft42(v);return d!==null&&d<0;}
function trainingEnded42(e){var v=e&& (e.trainingEndDate||e.training_end_date||e.endTrainingDate||e.lastDay);if(!v)return false;var typ=norm42((e.empType||'')+' '+(e.wpsType||'')+' '+(e.jobTitle||e.jt||''));return /تمهير|متدرب|تدريب|trainee|tamheer/.test(typ)&&expired42(v);}
function normalizeEmployees42(list){
  var out=[],terminated=[];
  (list||[]).forEach(function(src){
    if(!src)return;
    if(hasName42(src,V42_NOT_EMPLOYED))return;
    var e=Object.assign({},src);
    if(trainingEnded42(e) || (!e.isTerminated && expired42(e.contractEnd||e.ce) && String(e.contractNature||'fixed')!=='indefinite')){
      e.isTerminated=true;e.term=true;
      if(!e.lastDay)e.lastDay=e.trainingEndDate||e.training_end_date||e.contractEnd||e.ce||new Date().toISOString().slice(0,10);
      if(!e.reason)e.reason=trainingEnded42(e)?'انتهاء التدريب':'انتهاء العقد';
    }
    if(e.isTerminated||e.term)terminated.push(e);
    out.push(e);
  });
  return {all:out,terminated:terminated};
}
function readStored42(){try{var s=localStorage.getItem('hr7_emps');return s?JSON.parse(s):[];}catch(e){return [];}}
function readTerms42(){try{var s=localStorage.getItem('hr7_term_emps');return s?JSON.parse(s):[];}catch(e){return [];}}
function writeTerms42(all,extra){
  var map={};readTerms42().forEach(function(e){if(e&&e.id!=null)map[String(e.id)]=e;});
  (extra||[]).forEach(function(e){if(e&&e.id!=null)map[String(e.id)]=e;});
  /* remove the explicitly non-employed records from the terminated archive too */
  Object.keys(map).forEach(function(k){if(hasName42(map[k],V42_NOT_EMPLOYED))delete map[k];});
  try{localStorage.setItem('hr7_term_emps',JSON.stringify(Object.keys(map).map(function(k){return map[k];})));}catch(e){}
}

/* One authoritative current-employee selector: terminated/excluded records never enter payroll/dashboard. */
window.ARIBA_V42_PAYROLL_EXCLUDED=payrollExcluded42;
window.ARIBA_V42_EOS_EXCLUDED=eosExcluded42;
window.ARIBA_V42_CURRENT=function(){
  var base=readStored42();
  if(!base.length && typeof CLEAN_EMPS!=='undefined')base=CLEAN_EMPS.slice();
  var n=normalizeEmployees42(base);
  if(n.terminated.length)writeTerms42(n.all,n.terminated);
  return n.all.filter(function(e){return !e.isTerminated&&!e.term&&!hasName42(e,V42_NOT_EMPLOYED);});
};

/* Replace aEmps so every current-only view uses the same state rules. */
window.aEmps=function(){return window.ARIBA_V42_CURRENT();};
/* Keep tEmps as the termination archive, while also catching records newly terminated by edits. */
window.tEmps=function(){
  var a=readTerms42(), cur=readStored42(), n=normalizeEmployees42(cur);
  writeTerms42(n.all,n.terminated);
  return readTerms42().filter(function(e){return e&&!hasName42(e,V42_NOT_EMPLOYED);});
};

/* Save: normalize status, move terminated records to the termination archive, and keep current data intact. */
try{
  var oldSave42=window.saveEmps;
  if(typeof oldSave42==='function'&&!oldSave42.__aribaV42){
    var save42=function(d){
      var n=normalizeEmployees42(d||[]);
      writeTerms42(n.all,n.terminated);
      return oldSave42(n.all);
    };
    save42.__aribaV42=true;window.saveEmps=save42;
  }
}catch(e){console.warn('V42 save wrapper',e);}

/* Payroll: current employees only, with consultants/external explicitly excluded. */
try{
  window.rptPay=function(){
    var h=LANG==='en',asOf=typeof payrollAsOf==='function'?payrollAsOf():new Date(),src=window.ARIBA_V42_CURRENT().filter(function(e){return !payrollExcluded42(e);});
    var ws=src.map(function(e){var sal=Number(e.salary||e.sal||0),hou=Number(e.housingAllowance||e.hou||0),tra=Number(e.transportAllowance||e.tra||0),st=Number(e.salaryTotal||0)||(sal+hou+tra),ic=typeof calcIns==='function'?calcIns(Object.assign({},e,{salaryTotal:st}),31,31,asOf):{empAmt:0};var net=Math.round((st-(ic.empAmt||0)-(Number(e.otherDeductions||0)))*100)/100;return Object.assign({},e,{nameAr:e.nameAr||e.na||'',employer:e.employer||e.em||'',salary:sal,housingAllowance:hou,transportAllowance:tra,salaryTotal:st,isSaudi:e.isSaudi||e.saudi||false,_ins:ic,_net:net});});
    var totT=ws.reduce(function(s,e){return s+e.salaryTotal;},0),totN=ws.reduce(function(s,e){return s+e._net;},0),totI=ws.reduce(function(s,e){return s+(e._ins.empAmt||0);},0);
    showRpt(h?'Payroll Report':'تقرير الرواتب','<table><tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th><th>'+(h?'Basic':'الأساسي')+'</th><th>'+(h?'Total':'الإجمالي')+'</th><th>'+(h?'Emp Ins':'تأمين موظف')+'</th><th>'+(h?'Net':'الصافي')+'</th></tr>'+ws.map(function(e){return'<tr><td>'+e.id+'</td><td>'+e.nameAr+'</td><td>'+e.employer+'</td><td>'+fN(e.salary)+' '+(h?'SAR':'ر.س')+'</td><td style="color:var(--gr)">'+fN(e.salaryTotal)+' '+(h?'SAR':'ر.س')+'</td><td style="color:var(--rd)">'+(e.isSaudi?'-'+fN(e._ins.empAmt):(h?'None':'لا يوجد'))+'</td><td style="color:var(--cy);font-weight:700">'+fN(e._net)+' '+(h?'SAR':'ر.س')+'</td></tr>';}).join('')+'<tfoot><tr><td colspan="4">'+(h?'Total':'المجموع')+'</td><td style="color:var(--gr)">'+fN(totT)+'</td><td style="color:var(--rd)">-'+fN(totI)+'</td><td style="color:var(--cy)">'+fN(totN)+'</td></tr></tfoot></table>');
  };
}catch(e){console.warn('V42 rptPay',e);}

/* EOS report: terminated records only; consultants/external never appear. */
try{
  window.rptEOS=function(){
    var h=LANG==='en',a=window.tEmps().filter(function(e){return !eosExcluded42(e)&&(Number(e.eosLaborLaw||e.eosEndContract||0)>0);});
    showRpt(h?'EOS Report':'تقرير مكافآت نهاية الخدمة','<table><tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th><th>'+(h?'Last Day':'آخر يوم عمل')+'</th><th>'+(h?'Reason':'السبب / البند')+'</th><th>'+(h?'EOS Amount':'المكافأة المستحقة')+'</th></tr>'+a.sort(function(x,y){return Number(y.eosLaborLaw||y.eosEndContract||0)-Number(x.eosLaborLaw||x.eosEndContract||0);}).map(function(e){var amt=Number(e.eosLaborLaw||e.eosEndContract||0);return'<tr><td>'+e.id+'</td><td>'+e.nameAr+'</td><td>'+e.employer+'</td><td>'+fD(e.lastDay||e.contractEnd)+'</td><td>'+(e.reason||'—')+'</td><td style="color:var(--gr);font-weight:700">'+fN(amt)+' '+(h?'SAR':'ر.س')+'</td></tr>';}).join('')+'</table>');
  };
}catch(e){console.warn('V42 rptEOS',e);}

/* Active employees report is explicitly current-only. */
try{window.rptAll=function(){var h=LANG==='en',emps=window.ARIBA_V42_CURRENT();showRpt(h?'Active Employees ('+emps.length+')':'الموظفون الحاليون ('+emps.length+')','<table><tr><th>#</th><th>'+(h?'Name':'الاسم')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th><th>'+(h?'Nationality':'الجنسية')+'</th><th>'+(h?'Dept':'القسم')+'</th><th>'+(h?'Start':'المباشرة')+'</th><th>'+(h?'Salary':'الراتب')+'</th></tr>'+emps.map(function(e,i){return'<tr><td>'+(i+1)+'</td><td>'+e.nameAr+'</td><td>'+e.employer+'</td><td>'+e.nationality+'</td><td>'+e.dept+'</td><td>'+fD(e.contractJoin)+'</td><td style="color:var(--gr)">'+fN(e.salaryTotal||0)+'</td></tr>';}).join('')+'</table>');};}catch(e){}

/* Documents/guardianship: calculate remaining days live from the expiry dates, never from stale cached numbers. */
window.loadDocs=function(){
  var a=window.ARIBA_V42_CURRENT(),h=LANG==='en',dl=function(v){return dateLeft42(v);};
  var b=function(d){if(d===null)return'<span class="b bk">—</span>';if(d<=0)return'<span class="b br">'+(h?'Expired':'منتهي')+'</span>';if(d<=30)return'<span class="b br">'+d+(h?' days':' يوم')+'</span>';if(d<=90)return'<span class="b ba">'+d+(h?' days':' يوم')+'</span>';return'<span class="b bg">'+d+(h?' days':' يوم')+'</span>';};
  var short=function(n){return String(n||'').split(' ').slice(0,3).join(' ');};
  document.getElementById('IQT').innerHTML='<tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Iqama No':'رقم الإقامة')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th><th>'+(h?'Expiry':'الانتهاء')+'</th><th>'+(h?'Remaining':'المتبقي')+'</th><th>'+(h?'Status':'الحالة')+'</th></tr>'+a.filter(function(e){return e.iqamaNo||e.iqamaExpiry;}).sort(function(x,y){return (dl(x.iqamaExpiry)??9999)-(dl(y.iqamaExpiry)??9999);}).map(function(e){var d=dl(e.iqamaExpiry);return'<tr><td>'+e.id+'</td><td style="font-weight:600">'+short(e.nameAr)+'</td><td>'+ (e.iqamaNo||'—')+'</td><td>'+e.employer+'</td><td>'+ (fD(e.iqamaExpiry)||'—')+'</td><td>'+b(d)+'</td><td>'+(!e.iqamaExpiry?(h?'Not set':'غير محدد'):d<=0?(h?'Expired':'منتهي'):d<=90?(h?'Soon':'قريب'):(h?'Valid':'سارية'))+'</td></tr>';}).join('');
  document.getElementById('PPT').innerHTML='<tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Passport No':'رقم الجواز')+'</th><th>'+(h?'Nationality':'الجنسية')+'</th><th>'+(h?'Expiry':'الانتهاء')+'</th><th>'+(h?'Remaining':'المتبقي')+'</th></tr>'+a.filter(function(e){return e.passportNo||e.passportExpiry;}).sort(function(x,y){return (dl(x.passportExpiry)??9999)-(dl(y.passportExpiry)??9999);}).map(function(e){return'<tr><td>'+(e.empNo!=null?e.empNo:e.id)+'</td><td style="font-weight:600">'+short(e.nameAr)+'</td><td>'+ (e.passportNo||'—')+'</td><td>'+e.nationality+'</td><td>'+ (fD(e.passportExpiry)||'—')+'</td><td>'+b(dl(e.passportExpiry))+'</td></tr>';}).join('');
  document.getElementById('INT').innerHTML='<tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Company':'الشركة')+'</th><th>'+(h?'Class':'الفئة')+'</th><th>'+(h?'Card No':'رقم البطاقة')+'</th><th>'+(h?'Expiry':'الانتهاء')+'</th><th>'+(h?'Remaining':'المتبقي')+'</th></tr>'+a.filter(function(e){return e.insuranceCo||e.insuranceExpiry;}).sort(function(x,y){return (dl(x.insuranceExpiry)??9999)-(dl(y.insuranceExpiry)??9999);}).map(function(e){return'<tr><td>'+(e.empNo!=null?e.empNo:e.id)+'</td><td style="font-weight:600">'+short(e.nameAr)+'</td><td>'+ (e.insuranceCo||'—')+'</td><td><span class="b bb">'+(e.insuranceClass||'—')+'</span></td><td>'+ (e.insuranceCard||'—')+'</td><td>'+ (fD(e.insuranceExpiry)||'—')+'</td><td>'+b(dl(e.insuranceExpiry))+'</td></tr>';}).join('');
  document.getElementById('CTT').innerHTML='<tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th><th>'+(h?'Type':'النوع')+'</th><th>'+(h?'Start':'المباشرة')+'</th><th>'+(h?'End':'الانتهاء')+'</th><th>'+(h?'Remaining':'المتبقي')+'</th><th>'+(h?'Status':'الحالة')+'</th></tr>'+a.filter(function(e){return e.contractEnd;}).sort(function(x,y){return (dl(x.contractEnd)??9999)-(dl(y.contractEnd)??9999);}).map(function(e){var d=dl(e.contractEnd);return'<tr><td>'+e.id+'</td><td style="font-weight:600">'+short(e.nameAr)+'</td><td>'+e.employer+'</td><td>'+(e.contractType||'—')+'</td><td>'+fD(e.contractJoin)+'</td><td>'+fD(e.contractEnd)+'</td><td>'+b(d)+'</td><td>'+ (d<=0?(h?'Expired':'منتهي'):d<=90?(h?'Soon':'قريب'):(h?'Active':'ساري'))+'</td></tr>';}).join('');
};

/* Remove duplicate Remote Work location; keep the original active location L6, and do not recreate L7. */
function dedupeRemote42(){try{var a=typeof getLocs==='function'?getLocs():[];var rem=a.filter(function(x){return String(x.type||'')==='remote'&&norm42(x.name).indexOf(norm42('عمل عن بعد'))>=0;});if(rem.length>1){var keep=rem.find(function(x){return String(x.id)==='L6';})||rem[0];a=a.filter(function(x){return !(String(x.type||'')==='remote'&&norm42(x.name).indexOf(norm42('عمل عن بعد'))>=0&&x!==keep);});dbS('locs',a);if(window.ARIBA_HR_TOKEN&&window.syncLocationsToCloud)window.syncLocationsToCloud(a).catch(function(){});if(typeof rLocs==='function')rLocs();}}catch(e){console.warn('remote dedupe',e);}}
setTimeout(dedupeRemote42,900);setTimeout(dedupeRemote42,1800);

/* Dashboard repaint with exact requested night colors while preserving daytime values/layout. */
function dash42(){
  try{
    var KR=document.getElementById('KR');if(!KR)return;
    var dark=document.documentElement.getAttribute('data-ariba-theme')==='dark';
    var cards=KR.querySelectorAll('div[style*="border-radius:18px"]');
    cards.forEach(function(c){var txt=c.textContent||'';var val=c.querySelector('div[style*="font-weight:900"]');if(/إجمالي الرواتب|MONTHLY PAYROLL/.test(txt)){c.setAttribute('data-ariba-kpi','payroll');if(val)val.classList.add('ariba-kpi-value');var lab=c.querySelector('div[style*="font-size:12px"]');if(lab)lab.classList.add('ariba-kpi-label');if(dark){c.style.borderColor='#B8BFBC';if(val)val.style.color='#B8BFBC';}}
      if(/نسبة السعودة|SAUDIZATION/.test(txt)){c.setAttribute('data-ariba-kpi','saudization');var l=c.querySelector('div[style*="font-size:12px"]');if(l)l.classList.add('ariba-kpi-label');if(val)val.classList.add('ariba-kpi-value');if(dark){if(l)l.style.color='#E4E4BC';if(val)val.style.color='#E4E4BC';}}
      if(/توزيع الجنس|GENDER DISTRIBUTION/.test(txt)){c.setAttribute('data-ariba-kpi','gender');var nums=c.querySelectorAll('div[style*="font-weight:900"]');if(dark&&nums[0]){nums[0].classList.add('ariba-male-number');nums[0].style.color='#E4E4BC';}}
      if(/توزيع الأقسام|DEPARTMENTS/.test(txt)){c.setAttribute('data-ariba-kpi','departments');var nums=c.querySelectorAll('span[style*="font-weight:700"]');nums.forEach(function(n){if(dark){n.classList.add('ariba-dept-number');n.style.color='#E4E4BC';}});}
      if(/طلبات معلقة/.test(txt)){c.setAttribute('data-ariba-kpi','pending');var n=c.querySelector('span[style*="font-weight:900"]');if(dark&&n){n.classList.add('ariba-pending-number');n.style.color='#E4E4BC';}}
    });
    var hr=document.getElementById('HRL');if(hr&&dark)hr.style.color='#E4E4BC';var lo=hr&&hr.nextElementSibling;if(lo&&dark)lo.style.color='#E4E4BC';
  }catch(e){}
}
window.ARIBA_V42_REFRESH_UI=function(){try{if(typeof loadDash==='function')loadDash();}catch(e){}setTimeout(dash42,50);setTimeout(dash42,300);setTimeout(dash42,900);try{if(typeof loadDocs==='function'&&document.getElementById('pg-doc')?.classList.contains('on'))loadDocs();}catch(e){}};
setInterval(dash42,1200);

/* Manual Update button: pull latest cloud data, persist local state, refresh every open HR view, and notify Employee app. */
window.syncAll=async function(){
  var b=document.querySelector('.topbar .bpl');if(b){b.disabled=true;b.classList.add('busy');}
  try{
    var local=readStored42();
    if(!local.length&&typeof CLEAN_EMPS!=='undefined')local=CLEAN_EMPS.slice();
    var n=normalizeEmployees42(local);oldSave42?null:null;
    writeTerms42(n.all,n.terminated);
    if(typeof window.saveEmps==='function')window.saveEmps(n.all);
    /* Force employee app to read the same Supabase context immediately. */
    if(typeof window.syncEmployeesToSupabase==='function')await window.syncEmployeesToSupabase(n.all);
    if(typeof window.pullEmployeesFromCloud==='function'){
      window.__ARIBA_MANUAL_PULL_ALLOWED=true;
      try{await window.pullEmployeesFromCloud();}finally{window.__ARIBA_MANUAL_PULL_ALLOWED=false;}
    }
    if(typeof syncLeavesFromSupa==='function')await syncLeavesFromSupa(true).catch(function(){});
    if(typeof syncAttFromSupa==='function')await syncAttFromSupa().catch(function(){});
    if(typeof syncLocationsFromCloud==='function')await syncLocationsFromCloud().catch(function(){});
    dedupeRemote42();
    var cur=document.querySelector('.pg.on');var id=cur?cur.id.replace('pg-',''):'';
    try{if(typeof loads[id]==='function')await Promise.resolve(loads[id]());}catch(e){}
    try{if(typeof rEmps==='function')rEmps();}catch(e){}
    try{if(typeof popEF==='function')popEF();}catch(e){}
    try{if(typeof uBadges==='function')uBadges();}catch(e){}
    try{if(typeof loadDash==='function')loadDash();}catch(e){}
    try{if(typeof loadDocs==='function')loadDocs();}catch(e){}
    try{if(typeof window.ARIBA_REFRESH_EXCEL_REPORTS==='function')window.ARIBA_REFRESH_EXCEL_REPORTS();}catch(e){}
    try{localStorage.setItem('ariba_hr_force_sync',new Date().toISOString());window.dispatchEvent(new StorageEvent('storage',{key:'ariba_hr_force_sync',newValue:localStorage.getItem('ariba_hr_force_sync')}));}catch(e){}
    setTimeout(dash42,100);setTimeout(dash42,500);
    toast('تم تحديث ومزامنة بيانات البرنامجين بنجاح ✓','tin');
  }catch(e){console.error('V42 syncAll',e);toast('تم الحفظ محلياً لكن تعذر إكمال المزامنة السحابية','ter');}
  finally{if(b){b.disabled=false;b.classList.remove('busy');}}
};

/* Apply state normalization once at launch without changing the design. */
try{
  var boot42=normalizeEmployees42(readStored42());
  if(boot42.all.length){writeTerms42(boot42.all,boot42.terminated);}
}catch(e){}
setTimeout(function(){try{window.ARIBA_V42_REFRESH_UI();}catch(e){}},1200);
})();
