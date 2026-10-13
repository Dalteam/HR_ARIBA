
(function(){
'use strict';
/* V60: authoritative employee master. CLEAN_EMPS is seed data only; it must never overwrite HR edits/deletions. */
function v60json(k,fb){try{var x=localStorage.getItem(k);return x?JSON.parse(x):fb;}catch(e){return fb;}}
function v60set(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
function v60norm(v){return String(v||'').trim().toLowerCase();}
function v60deleted(){return v60json('hr7_deleted_employee_ids',[]).map(String);}
function v60seed(){
  var cur=v60json('hr7_emps',null);
  if(!Array.isArray(cur)||!cur.length){
    if(typeof CLEAN_EMPS!=='undefined'&&Array.isArray(CLEAN_EMPS)&&CLEAN_EMPS.length){
      cur=JSON.parse(JSON.stringify(CLEAN_EMPS));
      v60set('hr7_emps',cur);
    } else cur=[];
  }
  return cur;
}
function v60all(){
  var del=new Set(v60deleted());
  return (v60seed()||[]).filter(function(e){return e&&!del.has(String(e.id));});
}
function v60save(arr){
  var del=new Set(v60deleted());
  arr=(arr||[]).filter(function(e){return e&&!del.has(String(e.id));});
  try{dbS('emps',arr);}catch(e){}
  v60set('hr7_emps',arr);
  try{
    var app=arr.map(function(e){return {id:e.id,empNo:e.empNo,nameAr:e.nameAr||e.name||'',nameEn:e.nameEn||'',employer:e.employer||e.em||'',dept:e.dept||e.dep||'',jobTitle:e.jobTitle||e.jt||'',nationality:e.nationality||e.nat||'',isSaudi:!!(e.isSaudi||e.saudi),salary:e.salary||e.sal||0,housingAllowance:e.housingAllowance||e.hou||0,transportAllowance:e.transportAllowance||e.tra||0,netSalary:e.netSalary||e.net||0,leaveBalance:e.leaveBalance||e.leave_bal||0,leaveDaysContract:e.leaveDaysContract||e.lb||21,iqamaNo:e.iqamaNo||e.iq||'',iqamaExpiry:e.iqamaExpiry||e.iqe||'',contractJoin:e.contractJoin||e.cj||'',contractEnd:e.contractEnd||e.ce||'',managerId:e.managerId||'',gender:e.gender||e.gen||'',isTerminated:!!(e.isTerminated||e.term),u:e.username||('EMP'+String(e.empNo||e.id||'').padStart(3,'0')),pw:('')};});
    localStorage.setItem('hr7_emps',JSON.stringify(arr));
    localStorage.setItem('hr7_employee_app_users',JSON.stringify(app));
  }catch(e){}
}
/* Keep original getEmps normalization, but filter only permanently deleted records. */
var oldGet=window.getEmps;
if(typeof oldGet==='function'&&!oldGet.__v60){
  window.getEmps=function(){var a=oldGet.apply(this,arguments)||[],del=new Set(v60deleted());return a.filter(function(e){return e&&!del.has(String(e.id));});};window.getEmps.__v60=true;
}
/* Seed local master once, then always use local master. */
v60seed();
window.aEmps=function(){return v60all().filter(function(e){return !e.isTerminated&&!e.term;});};
window.ARIBA_V42_CURRENT=window.aEmps;
window.tEmps=function(){
  /* ARIBA v97: كان بيدمج بيانات من مخزن قديم منفصل (hr7_term_emps) بيفضل زي ما هو
     من غير تحديث، فأي تعديل على موظف منتهي الخدمة كان بيختفي. المصدر الوحيد الصحيح
     دلوقتي هو hr7_emps (اللي الحفظ بيحدّثه فعليًا)، ولو موظف موجود بس في المخزن
     القديم ومش موجود في hr7_emps خالص، نضيفه علشان معلوماته القديمة متضيعش. */
  var a=v60all().filter(function(e){return !!(e.isTerminated||e.term);});
  var ids=new Set(a.map(function(e){return String(e.id);}));
  var ar=v60json('hr7_term_emps',[]);
  ar.forEach(function(e){if(e&&!v60deleted().includes(String(e.id))&&!ids.has(String(e.id))){a.push(e);ids.add(String(e.id));}});
  return a;
};
/* Save employee master without allowing the old CLEAN_EMPS branch to take control. */
window.saveEmps=function(d){v60save(d);try{if(typeof clearLeavePerfCache==='function')clearLeavePerfCache();}catch(e){};try{if(typeof rEmps==='function')rEmps();}catch(e){};try{if(typeof uBadges==='function')uBadges();}catch(e){}};
/* Termination / reinstatement: keep a real archive and make restore reliable. */
window.termEmp=function(id){
  var r=prompt(LANG==='en'?'Termination reason:':'سبب إنهاء الخدمة:');if(!r)return;
  var last=prompt(LANG==='en'?'Last working day (YYYY-MM-DD):':'آخر يوم عمل (YYYY-MM-DD):',typeof tod==='function'?tod():new Date().toISOString().slice(0,10));
  if(last===null)return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(last)){toast('تاريخ آخر يوم عمل غير صحيح','ter');return;}
  var a=v60all(),i=a.findIndex(function(e){return String(e.id)===String(id);});if(i<0)return;
  a[i].isTerminated=true;a[i].term=true;a[i].terminationReason=r;a[i].reason=r;a[i].lastDay=last;a[i].terminationDate=last;
  if(a[i].contractNature==='indefinite'){a[i].contractEnd=last;a[i].ce=last;}
  v60save(a);v60set('hr7_term_emps',a.filter(function(e){return e.isTerminated||e.term;}));
  try{rEmps();}catch(e){} try{uBadges();}catch(e){} toast('✓ تم استبعاد الموظف ويمكن إعادته من زر الرجوع','tin');
};
window.reinstate=function(id){
  var a=v60all(),i=a.findIndex(function(e){return String(e.id)===String(id);});if(i<0)return;
  a[i].isTerminated=false;a[i].term=false;a[i].terminationReason='';a[i].reason='';a[i].lastDay='';
  v60save(a);v60set('hr7_term_emps',a.filter(function(e){return e.isTerminated||e.term;}));
  try{rEmps();}catch(e){} try{uBadges();}catch(e){} toast('✓ تم إرجاع الموظف للعمل','tin');
};
/* Permanent deletion from employee master, archive, app cache, payroll archives, dependents and cloud when available. */
window.delEmp=function(id,name){
  if(!confirm('حذف نهائي لـ "'+name+'"؟\nسيتم حذف الموظف من البرنامج بالكامل ولا يمكن التراجع عن الحذف.'))return;
  var sid=String(id),a=v60all().filter(function(e){return String(e.id)!==sid;});
  var del=v60deleted();if(!del.includes(sid))del.push(sid);v60set('hr7_deleted_employee_ids',del);
  v60save(a);v60set('hr7_term_emps',v60json('hr7_term_emps',[]).filter(function(e){return String(e.id)!==sid;}));
  /* Remove from every locally stored payroll month/archive. */
  try{Object.keys(localStorage).forEach(function(k){if(/^hr7_(pay_|archive_|approved_archive_)/.test(k)){var raw=localStorage.getItem(k);if(!raw)return;try{var x=JSON.parse(raw);if(x&&Array.isArray(x.rows)){x.rows=x.rows.filter(function(r){return String(r.id)!==sid&&String(r.employee_id||'')!==sid;});localStorage.setItem(k,JSON.stringify(x));}}catch(e){}}});}catch(e){}
  try{Object.keys(localStorage).forEach(function(k){if(k==='deps_manual_'+sid||k==='hr7_deps_'+sid)localStorage.removeItem(k);});}catch(e){}
  try{if(window.supa&&typeof window.supa.from==='function')window.supa.from('employees').delete().eq('id',id).then(function(){}).catch(function(){});}catch(e){}
  try{rEmps();}catch(e){} try{uBadges();}catch(e){} toast('✓ تم الحذف النهائي من البرنامج','ter');
};
/* Employees page: active / terminated lists always come from authoritative master. */
window.rEmps=function(){
  var q=(document.getElementById('ES')?.value||'').toLowerCase(),ef=document.getElementById('EF')?.value||'',st=(window.ARIBA_EMP_CATEGORY||document.getElementById('EST')?.value||'active'),h=LANG==='en';
  var src=v60all();
  var list=src.filter(function(e){
    var w=String(e.wpsType||'').toLowerCase(),et=String(e.empType||'').toLowerCase(),jt=String(e.jobTitle||'').toLowerCase(),dp=String(e.dept||e.department||'').toLowerCase();
    var tam=w.includes('tamheer')||et.includes('tamheer')||w.includes('تمهير')||et.includes('تمهير')||jt.includes('تمهير');
    var training=w.includes('trainee')||w.includes('training')||et.includes('trainee')||et.includes('training')||w.includes('متدرب')||et.includes('متدرب')||dp.includes('تدريب')||jt.includes('تدريب');
    var consult=w.includes('consult')||et.includes('consult')||jt.includes('استشاري')||jt.includes('consult');
    if(st==='active'&&(e.isHourly||e.isTerminated||tam||training||consult))return false;
    if(st==='term'&&!e.isTerminated)return false;if(st==='tamheer'&&!tam)return false;if(st==='training'&&!training)return false;if(st==='consultant'&&!consult)return false;
    if(ef&&e.employer!==ef)return false;
    if(q&&!v60norm(e.nameAr).includes(q)&&!v60norm(e.nameEn).includes(q)&&!String(e.iqamaNo||'').includes(q)&&!String(e.id||'').includes(q)&&!String(e.empNo||'').includes(q))return false;return true;
  });
  var et=document.getElementById('ET');if(!et)return;
  et.innerHTML='<tr><th>#</th><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Job':'الوظيفة')+'</th><th>'+(h?'Employer':'جهة العمل')+'</th><th>'+(h?'Dept':'القسم')+'</th><th>'+(h?'Nationality':'الجنسية')+'</th><th>'+(h?'Service':'الخدمة')+'</th><th>'+(h?'Iqama':'الإقامة')+'</th><th>'+(h?'Contract':'العقد')+'</th><th>'+(h?'Total Salary':'الراتب الإجمالي')+'</th><th>'+(h?'Net':'الصافي')+'</th><th>'+(h?'Actions':'إجراءات')+'</th></tr>'+list.map(function(e){var n=h?(e.nameEn||e.nameAr||'—'):(e.nameAr||e.nameEn||'—'),c=typeof ec==='function'?ec(n):'#014D3D';return '<tr><td>'+ (e.empNo||e.id)+'</td><td><div style="display:flex;align-items:center;gap:7px">'+(typeof av==='function'?av(n,c,28):'')+'<div><div style="font-weight:600">'+n+'</div><div style="font-size:10px;color:var(--dm)">رقم وظيفي: '+(e.empNo||e.id)+'</div>'+(e.isTerminated?'<span class="b ba">منتهية الخدمة</span>':'')+'</div></div></td><td>'+ (e.jobTitle||'—')+'</td><td><span class="b bb">'+(e.employer||'—')+'</span></td><td>'+(e.dept||'—')+'</td><td>'+(e.nationality||'—')+'</td><td>'+((e.yearsOfService||0)>0?(Number(e.yearsOfService).toFixed(1)+' سنة'):'—')+'</td><td>'+ (typeof dBadge==='function'?dBadge(e.iqamaDaysLeft||9999):'—')+'</td><td>'+ (typeof dBadge==='function'?dBadge(e.contractDaysLeft||9999):'—')+'</td><td style="color:var(--gr);font-weight:600">'+(typeof grossDisplay==='function'?grossDisplay(e):'—')+'</td><td style="color:var(--cy);font-weight:600">'+(typeof ARIBA_SAR==='function'?ARIBA_SAR(e,'net'):'—')+'</td><td><button class="btn bsm" onclick="showED(\''+e.id+'\')"><i class="ti ti-eye"></i></button> <button class="btn bsm" onclick="editEmp(\''+e.id+'\')"><i class="ti ti-edit"></i></button> <button class="btn bsm" style="color:var(--rd)" onclick="delEmp(\''+e.id+'\',\''+String(n).replace(/'/g,"\\'")+'\')"><i class="ti ti-trash"></i></button>'+(e.isTerminated?' <button class="btn bsm" title="رجوع" style="color:var(--gr)" onclick="reinstate(\''+e.id+'\')"><i class="ti ti-rotate-clockwise"></i></button>':'')+'</td></tr>';}).join('');
};
/* Lists: departments and employers are persistent and can grow without editing HTML. */
function v60defaults(){return {departments:['التشغيل','الاستشارات','الخدمات اللوجيستية','المالية','التسويق','الموارد البشرية','تدريب','أخرى'],employers:['اريبا','الجيوميكانية','أوبتيموم','دار التميز','أمانة الرياض']};}
function v60lists(){var d=v60json('hr7_master_lists',null),def=v60defaults();if(!d)d={departments:def.departments.slice(),employers:def.employers.slice()};var all=v60all();all.forEach(function(e){if(e.dept&&!d.departments.includes(e.dept))d.departments.push(e.dept);if(e.employer&&!d.employers.includes(e.employer))d.employers.push(e.employer);});d.departments=[...new Set(d.departments.filter(Boolean))];d.employers=[...new Set(d.employers.filter(Boolean))];v60set('hr7_master_lists',d);return d;}
function v60refreshLists(){
  var l=v60lists();
  ['EF','PFE','payEmp'].forEach(function(id){var s=document.getElementById(id);if(!s)return;var cur=s.value;s.innerHTML='<option value="">'+(id==='EF'||id==='PFE'||id==='payEmp'?'كل جهات العمل':'اختر...')+'</option>';l.employers.slice().sort((a,b)=>a.localeCompare(b,'ar')).forEach(function(x){var o=document.createElement('option');o.value=x;o.textContent=x;s.appendChild(o);});if(cur&&l.employers.includes(cur))s.value=cur;});
  var f=document.getElementById('EF2');if(f&&f.elements['em']){var cur=f.elements['em'].value;f.elements['em'].innerHTML='<option value="">اختر...</option>'+l.employers.map(function(x){return '<option>'+x+'</option>';}).join('');if(cur)f.elements['em'].value=cur;}
  if(f&&f.elements['dep']){var cur2=f.elements['dep'].value;f.elements['dep'].innerHTML=l.departments.map(function(x){return '<option>'+x+'</option>';}).join('');if(cur2)f.elements['dep'].value=cur2;}
  var le=document.getElementById('LE2');if(le){var cv=le.value;le.innerHTML='<option value="all">الكل</option>'+l.employers.map(function(x){return '<option>'+x+'</option>';}).join('');if(cv)le.value=cv;}
}
window.addMasterListItem=function(kind){var label=kind==='departments'?'القسم الجديد':'جهة العمل الجديدة',v=prompt(label+':');if(!v)return;v=v.trim();if(!v)return;var l=v60lists();if(l[kind].includes(v)){toast('موجود بالفعل','ter');return;}l[kind].push(v);v60set('hr7_master_lists',l);renderMasterLists();v60refreshLists();toast('✓ تم إضافة '+v,'tin');};
window.removeMasterListItem=function(kind,v){var l=v60lists();var inUse=v60all().some(function(e){return kind==='departments'?e.dept===v:e.employer===v;});if(inUse){toast('لا يمكن حذف '+v+' لأنه مستخدم لدى موظف','ter');return;}l[kind]=l[kind].filter(function(x){return x!==v;});v60set('hr7_master_lists',l);renderMasterLists();v60refreshLists();};
window.renderMasterLists=function(){var host=document.getElementById('ARIBA_MASTER_LISTS');if(!host)return;var l=v60lists();function box(kind,title){return '<div class="ariba-list-box"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><strong style="flex:1">'+title+'</strong><button class="btn bsm bpl" onclick="addMasterListItem(\''+kind+'\')">+ إضافة</button></div>'+l[kind].map(function(x){return '<div class="ariba-list-row"><span>'+x+'</span><button class="btn bsm" style="color:var(--rd)" onclick="removeMasterListItem(\''+kind+'\',\''+String(x).replace(/'/g,"\\'")+'\')"><i class="ti ti-trash"></i></button></div>';}).join('')+'</div>';}
host.innerHTML='<div class="g2">'+box('departments','الأقسام')+box('employers','جهات العمل')+'</div>';};
/* Extend settings page with master-list management. */
var oldLoadSet=window.loadSet;window.loadSet=function(){if(typeof oldLoadSet==='function')oldLoadSet();v60refreshLists();renderMasterLists();};
var setCard=document.getElementById('pg-set');if(setCard&&!document.getElementById('ARIBA_MASTER_LISTS')){var d=document.createElement('div');d.id='ARIBA_MASTER_LISTS';d.className='card';d.innerHTML='<div class="ct" style="margin-bottom:10px">إدارة الأقسام وجهات العمل</div><div style="font-size:11px;color:var(--mu);margin-bottom:10px">أضف أي قسم أو جهة عمل جديدة، وستظهر مباشرة في نموذج الموظف والفلاتر ومسير الرواتب.</div>';setCard.appendChild(d);}
/* Salary slip: employee + month + year, reading approved/saved payroll snapshot when available. */
window.loadSlipPg=function(){var sel=document.getElementById('SLE');if(!sel)return;var a=v60all().filter(function(e){return !e.isTerminated&&(Number(e.salaryTotal||e.salary||e.sal||0)>0);});sel.innerHTML=a.map(function(e){return '<option value="'+e.id+'">'+(e.nameAr||e.nameEn)+'</option>';}).join('')||'<option value="">لا يوجد موظفون</option>';var m=document.getElementById('SLM'),y=document.getElementById('SLY');if(m&&!m.options.length){['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'].forEach(function(n,i){var o=document.createElement('option');o.value=i+1;o.textContent=n;m.appendChild(o);});}if(y&&!y.options.length){var cy=new Date().getFullYear();for(var yy=cy-3;yy<=cy+2;yy++){var o=document.createElement('option');o.value=yy;o.textContent=yy;y.appendChild(o);}}if(m)m.value=new Date().getMonth()+1;if(y)y.value=new Date().getFullYear();rSlip();};
window.rSlip=function(){
  var id=document.getElementById('SLE')?.value;if(!id)return;var e=v60all().find(function(x){return String(x.id)===String(id);});if(!e)return;var m=Number(document.getElementById('SLM')?.value||new Date().getMonth()+1),y=Number(document.getElementById('SLY')?.value||new Date().getFullYear());var raw=localStorage.getItem('hr7_pay_'+y+'_'+String(m).padStart(2,'0'));var snap=null;try{snap=raw?JSON.parse(raw):null;}catch(ex){}var row=snap&&Array.isArray(snap.rows)?snap.rows.find(function(r){return String(r.id)===String(id)||String(r.employee_id||'')===String(id);}):null;var basic=row?Number(row.sal||e.salary||e.sal||0):Number(e.salary||e.sal||0),hou=row?Number(row.hou||e.housingAllowance||e.hou||0):Number(e.housingAllowance||e.hou||0),tra=row?Number(row.tra||e.transportAllowance||e.tra||0):Number(e.transportAllowance||e.tra||0),prj=row?Number(row.prj||e.projectAllowance||0):Number(e.projectAllowance||0),oth=row?Number(row.oth||e.otherAllowance||0):Number(e.otherAllowance||0),gross=row?Number(row.totalDue||row.tot||row.total||0):(basic+hou+tra+prj+oth),ins=row?Number(row.insEmp||0):Number(calcIns(e,31,31,new Date(y,m-1,1)).empAmt),ded=row?Number(row.otherDeduct||row.loanDeduct||0):Number(e.otherDeductions||0),net=row?Number(row.net||row.netSAR||0):(gross-ins-ded);var names=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];var h=LANG==='en';document.getElementById('SLC').innerHTML='<div class="psc"><div style="text-align:center;margin-bottom:18px;padding-bottom:14px;border-bottom:1px solid var(--bd)"><div style="font-size:18px;font-weight:900;color:var(--bl)">'+(h?'Ariba Business Solutions':'شركة اريبا لخدمات الأعمال')+'</div><div style="font-size:12px;color:var(--mu);margin-top:3px">'+(h?'Salary Slip':'كشف راتب')+' — '+(h?new Date(y,m-1,1).toLocaleDateString('en-US',{month:'long',year:'numeric'}):names[m]+' '+y)+'</div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;background:var(--c2);border-radius:8px;padding:10px"><div><div style="font-size:10px;color:var(--dm)">الموظف</div><div style="font-weight:700">'+e.nameAr+'</div></div><div><div style="font-size:10px;color:var(--dm)">الوظيفة</div><div>'+(e.jobTitle||'—')+'</div></div><div><div style="font-size:10px;color:var(--dm)">جهة العمل</div><div>'+(e.employer||'—')+'</div></div><div><div style="font-size:10px;color:var(--dm)">IBAN</div><div style="font-family:monospace">'+(e.iban||'—')+'</div></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div style="background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.2);border-radius:9px;padding:13px"><div style="font-weight:700;color:var(--gr);margin-bottom:9px">الاستحقاقات</div>'+pR('الراتب الأساسي',basic,h)+pR('بدل السكن',hou,h)+pR('بدل المواصلات',tra,h)+pR('بدل المشروع',prj,h)+pR('بدلات أخرى',oth,h)+'<div style="border-top:1px solid var(--bd);margin-top:8px;padding-top:7px;display:flex;justify-content:space-between;font-weight:700"><span>الإجمالي</span><span style="color:var(--gr)">'+fN(gross)+' ر.س</span></div></div><div style="background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:9px;padding:13px"><div style="font-weight:700;color:var(--rd);margin-bottom:9px">الاستقطاعات</div>'+pR('التأمينات الاجتماعية',ins?-ins:0,h)+pR('استقطاعات أخرى',ded?-ded:0,h)+'<div style="border-top:1px solid var(--bd);margin-top:8px;padding-top:7px;display:flex;justify-content:space-between;font-weight:700"><span>صافي الراتب</span><span style="color:var(--cy)">'+fN(net)+' ر.س</span></div></div></div></div>';
};
/* Remove Ahmed Al-Bosiri from payroll only, including saved payroll rows, without deleting the employee master. */
function v60isBosiri(e){return /البوصيري|bosiri|bosairy/i.test(v60norm(e&&(e.nameAr||e.nameEn||e.name||e.na)));}
var oldBuild=window.buildPayrollRows;if(typeof oldBuild==='function'&&!oldBuild.__v60){window.buildPayrollRows=function(){return (oldBuild.apply(this,arguments)||[]).filter(function(r){return !v60isBosiri(r);});};window.buildPayrollRows.__v60=true;}
var oldRPay=window.rPay;if(typeof oldRPay==='function'&&!oldRPay.__v60){window.rPay=function(){var r=oldRPay.apply(this,arguments);try{var tb=document.getElementById('PYT');if(tb)tb.querySelectorAll('tr').forEach(function(tr){if(/البوصيري|bosiri|bosairy/i.test(tr.textContent))tr.remove();});}catch(e){}return r;};window.rPay.__v60=true;}
/* Documents: show every current employee, even when passport/insurance fields are blank; print each tab independently. */
window.loadDocs=function(){var a=v60all().filter(function(e){return !e.isTerminated;});var h=LANG==='en';function row(e){return '<tr><td>'+(e.empNo!=null?e.empNo:e.id)+'</td><td style="font-weight:600">'+(e.nameAr||e.nameEn||'—')+'</td>';}
var iq=row;document.getElementById('IQT').innerHTML='<tr><th>#</th><th>الموظف</th><th>رقم الإقامة</th><th>جهة العمل</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr>'+a.map(function(e){var d=e.iqamaExpiry?dl(e.iqamaExpiry):null;return row(e)+'<td>'+ (e.iqamaNo||'—')+'</td><td>'+(e.employer||'—')+'</td><td>'+ (fD(e.iqamaExpiry)||'—')+'</td><td>'+(d==null?'—':dBadge(d))+'</td><td>'+(!e.iqamaNo&&!e.iqamaExpiry?'<span class="b bk">غير مكتملة</span>':d!=null&&d<=0?'<span class="b br">منتهية</span>':'<span class="b bg">سارية</span>')+'</td></tr>';}).join('');
document.getElementById('PPT').innerHTML='<tr><th>#</th><th>الموظف</th><th>رقم الجواز</th><th>الجنسية</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr>'+a.map(function(e){var d=e.passportExpiry?dl(e.passportExpiry):null;return row(e)+'<td>'+ (e.passportNo||'—')+'</td><td>'+(e.nationality||'—')+'</td><td>'+ (fD(e.passportExpiry)||'—')+'</td><td>'+(d==null?'—':dBadge(d))+'</td><td>'+(!e.passportNo&&!e.passportExpiry?'<span class="b bk">غير مكتمل</span>':d!=null&&d<=0?'<span class="b br">منتهي</span>':'<span class="b bg">ساري</span>')+'</td></tr>';}).join('');
document.getElementById('INT').innerHTML='<tr><th>#</th><th>الموظف</th><th>شركة التأمين</th><th>الفئة</th><th>رقم البطاقة</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr>'+a.map(function(e){var d=e.insuranceExpiry?dl(e.insuranceExpiry):null;return row(e)+'<td>'+(e.insuranceCo||'—')+'</td><td>'+(e.insuranceClass||'—')+'</td><td>'+(e.insuranceCard||'—')+'</td><td>'+(fD(e.insuranceExpiry)||'—')+'</td><td>'+(d==null?'—':dBadge(d))+'</td><td>'+(!e.insuranceCo&&!e.insuranceExpiry?'<span class="b bk">غير مكتمل</span>':d!=null&&d<=0?'<span class="b br">منتهي</span>':'<span class="b bg">ساري</span>')+'</td></tr>';}).join('');
document.getElementById('CTT').innerHTML='<tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>النوع</th><th>المباشرة</th><th>الانتهاء</th><th>المتبقي</th><th>الحالة</th></tr>'+a.map(function(e){var d=e.contractEnd?dl(e.contractEnd):null;return row(e)+'<td>'+(e.employer||'—')+'</td><td>'+(e.contractType||'—')+'</td><td>'+fD(e.contractJoin||e.cj)+'</td><td>'+fD(e.contractEnd||e.ce)+'</td><td>'+(d==null?'—':dBadge(d))+'</td><td>'+(!e.contractEnd&&!e.ce?'<span class="b bk">مفتوح</span>':d!=null&&d<=0?'<span class="b br">منتهي</span>':'<span class="b bg">ساري</span>')+'</td></tr>';}).join('');};
window.printCurrentDocTab=function(){var ids=[['dc1','IQT','الإقامات'],['dc2','PPT','الجوازات'],['dc3','INT','التأمين الطبي'],['dc4','CTT','العقود']];for(var i=0;i<ids.length;i++){var x=ids[i],el=document.getElementById(x[0]);if(el&&el.style.display!=='none'){var t=document.getElementById(x[1]);if(t&&typeof printHtml==='function'){printHtml(x[2],t.outerHTML);return;}}}};
window.printDocPage=function(){var parts=[['IQT','الإقامات'],['PPT','الجوازات'],['INT','التأمين الطبي'],['CTT','العقود']],html='';parts.forEach(function(x){var t=document.getElementById(x[0]);if(t)html+='<h3>'+x[1]+'</h3>'+t.outerHTML;});if(typeof printHtml==='function')printHtml('وثائق الموظفين',html);};
/* Reports: terminated + standalone passport / insurance / contracts reports. */
window.rptTerm=function(){var a=window.tEmps();var html='<table><tr><th>#</th><th>الاسم</th><th>جهة العمل</th><th>الجنسية</th><th>آخر يوم عمل</th><th>السبب</th><th>رجوع</th></tr>'+a.map(function(e){return '<tr><td>'+e.id+'</td><td>'+e.nameAr+'</td><td>'+e.employer+'</td><td>'+ (e.nationality||'—')+'</td><td>'+fD(e.lastDay||e.contractEnd)+'</td><td>'+ (e.terminationReason||e.reason||'—')+'</td><td><button class="btn bsm" style="color:var(--gr)" onclick="reinstate(\''+e.id+'\')"><i class="ti ti-rotate-clockwise"></i></button></td></tr>';}).join('')+'</table>';showRpt('المنتهية خدماتهم ('+a.length+')',html);};
window.rptPp=function(){var a=v60all().filter(function(e){return !e.isTerminated;});showRpt('تقرير الجوازات','<table><tr><th>#</th><th>الموظف</th><th>الجواز</th><th>الجنسية</th><th>الانتهاء</th><th>المتبقي</th></tr>'+a.map(function(e){return '<tr><td>'+(e.empNo!=null?e.empNo:e.id)+'</td><td>'+e.nameAr+'</td><td>'+ (e.passportNo||'—')+'</td><td>'+ (e.nationality||'—')+'</td><td>'+fD(e.passportExpiry)+'</td><td>'+ (e.passportExpiry?dBadge(dl(e.passportExpiry)):'غير مكتمل')+'</td></tr>';}).join('')+'</table>');};
window.rptCt=function(){var a=v60all().filter(function(e){return !e.isTerminated;});showRpt('تقرير العقود','<table><tr><th>#</th><th>الموظف</th><th>جهة العمل</th><th>النوع</th><th>المباشرة</th><th>الانتهاء</th><th>المتبقي</th></tr>'+a.map(function(e){return '<tr><td>'+e.id+'</td><td>'+e.nameAr+'</td><td>'+ (e.employer||'—')+'</td><td>'+ (e.contractType||'—')+'</td><td>'+fD(e.contractJoin||e.cj)+'</td><td>'+fD(e.contractEnd||e.ce)+'</td><td>'+ (e.contractEnd?dBadge(dl(e.contractEnd)):'مفتوح')+'</td></tr>';}).join('')+'</table>');};
window.rptInsurance=function(){var a=v60all().filter(function(e){return !e.isTerminated;});showRpt('تقرير التأمين الطبي','<table><tr><th>#</th><th>الموظف</th><th>شركة التأمين</th><th>الفئة</th><th>رقم البطاقة</th><th>الانتهاء</th><th>المتبقي</th></tr>'+a.map(function(e){return '<tr><td>'+e.id+'</td><td>'+e.nameAr+'</td><td>'+ (e.insuranceCo||'—')+'</td><td>'+ (e.insuranceClass||'—')+'</td><td>'+ (e.insuranceCard||'—')+'</td><td>'+fD(e.insuranceExpiry)+'</td><td>'+ (e.insuranceExpiry?dBadge(dl(e.insuranceExpiry)):'غير مكتمل')+'</td></tr>';}).join('')+'</table>');};
/* Make reports card include a standalone medical-insurance report. */
var oldBuildRpts=window.buildRpts;if(typeof oldBuildRpts==='function'&&!oldBuildRpts.__v60){window.buildRpts=function(){oldBuildRpts.apply(this,arguments);var rg=document.getElementById('RG');if(rg&&!rg.querySelector('[data-v60-ins]')){var c=document.createElement('div');c.setAttribute('data-v60-ins','1');c.setAttribute('onclick','rptInsurance()');c.style.cssText='background:var(--c);border:1px solid var(--bd);border-radius:10px;padding:14px;cursor:pointer';c.innerHTML='<div style="font-weight:800">🩺 التأمين الطبي</div><div style="font-size:10px;color:var(--mu);margin-top:5px">طباعة تقرير التأمين الطبي منفردًا</div>';rg.appendChild(c);}};window.buildRpts.__v60=true;}
/* Prevent the old sync action from re-seeding CLEAN_EMPS. */
window.syncAll=async function(){var a=v60all();v60save(a);try{if(window.aribaSyncEmployee){for(var i=0;i<a.length;i++)try{await window.aribaSyncEmployee(a[i]);}catch(e){}}else if(typeof syncEmployeesToSupabase==='function'){await syncEmployeesToSupabase(a);}}catch(e){}try{rEmps();loadDash();uBadges();}catch(e){}toast('✓ تم حفظ ومزامنة بيانات الموظفين الحالية بدون إعادة البيانات المحذوفة','tin');};
/* On load, reapply lists/docs and remove Bosiri from any existing payroll snapshot. */
/* Preserve local HR fields when Supabase returns its compact employee row, and never resurrect permanently deleted IDs. */
try{
  var oldLoadCloud=window.loadFromSupabase;
  if(typeof oldLoadCloud==='function'&&!oldLoadCloud.__v60){
    window.loadFromSupabase=async function(){
      var before=v60all(),by={};before.forEach(function(e){by[String(e.id)]=e;});
      var remote=await oldLoadCloud.apply(this,arguments);
      var merged=v60json('hr7_emps',[]).map(function(e){return Object.assign({},by[String(e.id)]||{},e);});
      var del=new Set(v60deleted()); merged=merged.filter(function(e){return !del.has(String(e.id));});
      v60save(merged); return merged;
    };window.loadFromSupabase.__v60=true;
  }
}catch(e){}

function v60boot(){try{v60refreshLists();renderMasterLists();}catch(e){}try{if(typeof loadDocs==='function')loadDocs();}catch(e){}try{Object.keys(localStorage).forEach(function(k){if(/^hr7_pay_\d{4}_\d{2}$/.test(k)){var raw=localStorage.getItem(k);try{var x=JSON.parse(raw);if(x&&Array.isArray(x.rows)){x.rows=x.rows.filter(function(r){return !v60isBosiri(r);});localStorage.setItem(k,JSON.stringify(x));}}catch(e){}}});}catch(e){}}
setTimeout(v60boot,900);setTimeout(v60boot,2200);
})();
