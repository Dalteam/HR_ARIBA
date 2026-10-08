// DATA
function migrateLeaveBalanceV7(){try{if(db('leave_balance_v7_migrated',false))return;const a=db('emps',null);if(Array.isArray(a)){a.forEach(e=>{if(e.leaveYearOverrides===undefined)e.leaveYearOverrides={};});dbS('emps',a);}dbS('leave_balance_v7_migrated',true);}catch(e){}}
migrateLeaveBalanceV7();

function dedupeEmployeeList(list){
  const map=new Map();
  (list||[]).forEach(function(e){
    const key=String(e.empNo||e.id||'').trim()||('id:'+String(e.id));
    const old=map.get(key);
    if(!old){map.set(key,e);return;}
    const score=function(x){return Object.keys(x||{}).filter(function(k){return x[k]!==null&&x[k]!==undefined&&x[k]!=='';}).length;};
    const keep=score(e)>score(old)?e:old;
    const other=keep===e?old:e;
    map.set(key,Object.assign({},other,keep));
  });
  return Array.from(map.values());
}
function getEmps(){let s=db('emps',null);if(!s||!s.length)return [];return dedupeEmployeeList(s).map(function(e){var dEntry=null;if(e.empNo===undefined||e.empNo===null||e.empNo==='')e.empNo=String(e.id||'');if(!e.insSystem)e.insSystem=e.isSaudi?'old':'expat';if(!e.wpsType||e.wpsType==='wps'){var et=(e.empType||'').toLowerCase();if(et.includes('تمهير')||et.includes('tamheer'))e.wpsType='tamheer';else if(et.includes('متدرب')||et.includes('تدريب')||et.includes('trainee'))e.wpsType='trainee';else e.wpsType='wps';}if(!e.currency)e.currency='ريال سعودي';if(!e.payMethod)e.payMethod='مدد';if(e.extraAllowance===undefined)e.extraAllowance=0;
/* SALARY MODEL: keep local currency as the source of truth. */
var _rate=(e.currency==='ريال سعودي')?1:(Number(e.exchRate)>0?Number(e.exchRate):defaultExchangeRate(e.currency));
if(!_rate||_rate<=0)_rate=defaultExchangeRate(e.currency);
var _gross=Number(e.salaryTotal)||0;
var _rawNet=Number(e.netSalaryLocal);
if(!(_rawNet>0)) _rawNet=Number(e.netSalary)||0;
var _ins=Number(e.insuranceSub)||0, _ded=Number(e.otherDeductions)||0;
if(e.currency!=='ريال سعودي' && _gross>0){
  /* Older builds stored the SAR equivalent in netSalary. Detect and convert it back once. */
  var _ratio=_rawNet/_gross;
  if(_rawNet>_gross*2 && Math.abs(_ratio-_rate)<0.05) _rawNet=_rawNet/_rate;
  else if(_rawNet>_gross*20) _rawNet=Math.max(0,_gross-_ins-_ded);
}
if(!(_rawNet>0) && _gross>0) _rawNet=Math.max(0,_gross-_ins-_ded);
e.exchRate=_rate;
e.netSalaryLocal=_rawNet;
e.netSalary=_rawNet;
e.netSalarySAR=_rawNet*_rate;
return e;});}
async function supaUpsert(tbl,data){
  var url=SUPA_URL+'/rest/v1/'+tbl;
  return fetch(url,{
    method:'POST',
    headers:{
      'apikey':SUPA_KEY,
      'Authorization':'Bearer '+SUPA_KEY,
      'Content-Type':'application/json',
      'Prefer':'resolution=merge-duplicates,return=representation'
    },
    body:JSON.stringify(data)
  }).then(function(r){
    if(!r.ok) throw new Error('Supabase error: '+r.status);
    return r.json();
  });
}
function employeeCloudRow(e){return {employee_id:String(e.id),username:e.username||null,name_ar:e.nameAr||e.name||null,name_en:e.nameEn||null,employer:e.employer||e.em||null,department:e.dept||e.dep||null,job_title:e.jobTitle||e.job||e.jt||null,nationality:e.nationality||e.nat||null,iqama_no:e.iqamaNo||e.iq||null,dob:e.dob||null,join_date:e.contractJoin||e.joinDate||e.cj||null,manager_id:e.managerId||e.manager_id||null,active:!e.isTerminated,data:e};}
function saveEmps(d){
  if(typeof clearLeavePerfCache==='function')clearLeavePerfCache();
  dbS('emps',d);
  // حفظ في localStorage لـ Employee App
  try{
    var empArr=d.map(function(e){
      return {
        id:e.id, empNo:e.empNo, nameAr:e.nameAr||e.name||'', nameEn:e.nameEn||'',
        employer:e.employer||e.em||'', dept:e.dept||e.dep||'', jobTitle:e.jobTitle||e.jt||'',
        nationality:e.nationality||e.nat||'', isSaudi:e.isSaudi||e.saudi||false,
        salary:e.salary||e.sal||0, housingAllowance:e.housingAllowance||e.hou||0,
        transportAllowance:e.transportAllowance||e.tra||0, netSalary:e.netSalary||e.net||0,
        leaveBalance:e.leaveBalance||e.leave_bal||0, leaveDaysContract:e.leaveDaysContract||e.lb||21,
        iqamaNo:e.iqamaNo||e.iq||'', iqamaExpiry:e.iqamaExpiry||e.iqe||'',
        contractJoin:e.contractJoin||e.cj||'', contractEnd:e.contractEnd||e.ce||'',
        managerId:e.managerId||'', gender:e.gender||e.gen||'',
        isTerminated:e.isTerminated||e.term||false,
        u:'EMP'+String(e.empNo||'').padStart(3,'0'),
        pw:''
      };
    });
    /* V102: كانت بتكتب نسخة ناقصة الحقول فوق بيانات الموظفين عند كل فتح للصفحة — اتلغت */
    void empArr;
  }catch(ex){}
  // حفظ في Supabase
  if(typeof supa!=='undefined'&&supa){
    var supaRows=d.map(function(e){
      return {
        id:e.id, emp_no:e.empNo,
        name_ar:e.nameAr||e.name||'', name_en:e.nameEn||'',
        employer:e.employer||e.em||'', dept:e.dept||e.dep||'',
        job_title:e.jobTitle||e.jt||'', nationality:e.nationality||e.nat||'',
        is_saudi:e.isSaudi||e.saudi||false,
        salary:e.salary||e.sal||0,
        housing_allowance:e.housingAllowance||e.hou||0,
        transport_allowance:e.transportAllowance||e.tra||0,
        net_salary:e.netSalary||e.net||0,
        leave_days_contract:e.leaveDaysContract||e.lb||21,
        iqama_no:e.iqamaNo||e.iq||'', iqama_expiry:e.iqamaExpiry||e.iqe||null,
        contract_join:e.contractJoin||e.cj||null, contract_end:e.contractEnd||e.ce||null,
        manager_id:e.managerId||'', gender:e.gender||e.gen||'',
        username:'EMP'+String(e.empNo||'').padStart(3,'0'),
        password_hash:'',
        is_terminated:e.isTerminated||e.term||false
      };
    });
    supa.from('employees').upsert(supaRows,{onConflict:'id'})
      .then(function(){console.log('✓ Employees synced to Supabase');})
      .catch(function(err){console.warn('Supabase sync error:',err);});
  }
  var pg=document.getElementById('pg-pay');
  if(pg&&pg.classList.contains('on')) initPayroll();
}
function aEmps(){
  // أولاً من CLEAN_EMPS المدمجة (الحاليون فقط)
  if(typeof CLEAN_EMPS!=='undefined'&&CLEAN_EMPS.length&&!localStorage.getItem('hr7_emps')){
    var active=CLEAN_EMPS.filter(function(e){return !e.isTerminated&&!e.term;});
    if(active.length) return active;
  }
  // ثم من hr7_emps
  try{
    var s=localStorage.getItem('hr7_emps');
    if(s){
      var arr=JSON.parse(s).filter(function(e){return !e.isTerminated&&!e.term;});
      if(arr.length) return arr;
    }
  }catch(ex){}
  return getEmps().filter(function(e){return !e.isTerminated;});
}

function tEmps(){
  try{
    var s=localStorage.getItem('hr7_term_emps');
    if(s){
      var arr=JSON.parse(s);
      if(arr&&arr.length>0) return arr;
    }
  }catch(ex){}
  return [];
}

function getLvs(){
  try{
    var raw=db('leaves',[]);
    if(!Array.isArray(raw)) raw=JSON.parse(localStorage.getItem('hr7_leaves')||'[]');
    if(!Array.isArray(raw)) return [];
    raw.forEach(function(l,i){
      if(!l.id) raw[i].id=String(Date.now()+i);
      if(!l.empId&&l.emp_id) raw[i].empId=String(l.emp_id);
    });
    return raw;
  }catch(ex){return db('leaves',[]);}
}
function getPerms(){
  try{
    var raw=JSON.parse(localStorage.getItem('hr7_perms')||'[]');
    if(!Array.isArray(raw)) return [];
    raw.forEach(function(l,i){
      if(!l.id) raw[i].id=String(Date.now()+i);
      if(!l.empId&&l.emp_id) raw[i].empId=String(l.emp_id);
    });
    return raw;
  }catch(ex){return db('perms',[]);}
}
function saveLvs(v){
  if(typeof clearLeavePerfCache==='function')clearLeavePerfCache();
  dbS('leaves',v);
  // حدث status في Supabase
  v.forEach(function(l){if(l.id&&l.status){supaPatch('leave_requests',l.id,{status:l.status,hr_status:l.hr_status||l.status}).catch(function(){});}});
}
function getAtt(){return db('att',[]);}
function saveAtt2(v){dbS('att',v);}
function getLocs(){const s=db('locs',null);if(s&&s.length)return s;const def=[{id:'L1',name:'مكتب الشركة — اريبا',nameEn:'Ariba HQ',employer:'اريبا',type:'hq',lat:24.7136,lng:46.6753,radius:200,color:'#29B35E'},{id:'L2',name:'مشروع التحول البلدي (أمانة الرياض)',nameEn:'Municipal Transformation',employer:'all',type:'project',lat:24.6800,lng:46.7200,radius:300,color:'#29B35E'},{id:'L3',name:'مشروع أوبتيموم',nameEn:'Optimum Project',employer:'أوبتيموم',type:'project',lat:24.7500,lng:46.6900,radius:300,color:'#014D3D'},{id:'L4',name:'مشروع الجيوميكانية',nameEn:'Geomechanics Project',employer:'الجيوميكانية',type:'project',lat:24.7300,lng:46.7100,radius:300,color:'#E4E4BC'},{id:'L5',name:'مشروع عنيزة',nameEn:'Unaizah Project',employer:'all',type:'project',lat:26.0840,lng:43.9940,radius:300,color:'#6B7280'},{id:'L6',name:'عمل عن بعد',nameEn:'Remote Work',employer:'all',type:'remote',lat:0,lng:0,radius:999999,color:'#014D3D'}];dbS('locs',def);return def;}
function saveLocs(v){dbS('locs',v);try{localStorage.setItem('ariba_locations_dirty',JSON.stringify(v));}catch(e){}if(window.ARIBA_HR_TOKEN&&window.syncLocationsToCloud)window.syncLocationsToCloud(v).catch(function(e){console.warn('location cloud sync',e);});}
function getDefaultHolidays(){return [
  {id:'h1',name:'عيد الفطر المبارك',nameEn:'Eid Al-Fitr',date:'2026-03-20',days:4,recurring:false},
  {id:'h2',name:'عيد الأضحى المبارك',nameEn:'Eid Al-Adha',date:'2026-05-27',days:4,recurring:false},
  {id:'h3',name:'اليوم الوطني السعودي',nameEn:'Saudi National Day',date:'2026-09-23',days:1,recurring:true},
  {id:'h4',name:'يوم التأسيس السعودي',nameEn:'Saudi Founding Day',date:'2026-02-22',days:1,recurring:true}
];}
function getHols(){
  const s=db('hols',null);
  // ترحيل تلقائي للنسخة القديمة: إذا كانت القائمة فارغة بسبب الإصدار السابق، أظهر القائمة الافتراضية مرة واحدة.
  if(Array.isArray(s)&&s.length)return s;
  if(s===null||!db('hols_v2_seeded',false)){
    const def=getDefaultHolidays(); dbS('hols',def); dbS('hols_v2_seeded',true); return def;
  }
  return Array.isArray(s)?s:[];
}
function saveHols(v){if(typeof clearLeavePerfCache==='function')clearLeavePerfCache();dbS('hols',v);dbS('hols_v2_seeded',true);if(window.aribaSyncHolidays)window.aribaSyncHolidays(v).catch(function(e){console.warn('holiday cloud sync',e);});}
