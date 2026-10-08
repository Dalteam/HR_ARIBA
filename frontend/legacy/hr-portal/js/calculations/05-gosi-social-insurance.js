function empAge(emp){if(!emp.dob)return 30;var d=new Date(emp.dob),n=new Date(),a=n.getFullYear()-d.getFullYear();if(n.getMonth()<d.getMonth()||(n.getMonth()===d.getMonth()&&n.getDate()<d.getDate()))a--;return a;}
function noIns_wps(emp){return (emp.wpsType||'wps')!=='wps';}
function insStatusText(emp){if(!emp.isSaudi)return 'غير سعودي';if(noIns_wps(emp))return 'لا يطبق';return emp.insSystem==='new'?'يطابق':'لا يطابق';}
const INS_RULES_DEFAULT={
  wageCap:45000,
  ageThreshold:55,
  effectiveRules:[
    {date:'2026-01-01',matchEmp:10.75,matchEmp55:10.50,matchEr:12.75,matchEr55:12.50,noMatchEmp:9.75,noMatchEmp55:9.00,noMatchEr:11.75,noMatchEr55:11.00,nonSaudiEr:2.00},
    {date:'2027-07-01',matchEmp:11.25,matchEmp55:11.00,matchEr:13.25,matchEr55:13.00,noMatchEmp:10.25,noMatchEmp55:9.50,noMatchEr:12.25,noMatchEr55:11.50,nonSaudiEr:2.00}
  ]
};
function getInsSettings(){
  var s=db('insuranceRules',null);
  if(!s||!Array.isArray(s.effectiveRules)||!s.effectiveRules.length){
    s=JSON.parse(JSON.stringify(INS_RULES_DEFAULT)); dbS('insuranceRules',s);
  }
  s.wageCap=Number(s.wageCap)||45000; s.ageThreshold=Number(s.ageThreshold)||55;
  return s;
}
function gosiRuleFor(asOf){
  var s=getInsSettings(), d=asOf?new Date(asOf):new Date(); if(isNaN(d))d=new Date();
  var key=d.toISOString().slice(0,10), rules=s.effectiveRules.slice().sort(function(a,b){return String(a.date).localeCompare(String(b.date));});
  var chosen=rules[0]; rules.forEach(function(r){if(String(r.date)<=key)chosen=r;});
  return {settings:s,rule:chosen};
}
function gosiRates(emp,asOf){
  var x=gosiRuleFor(asOf), r=x.rule, age=empAge(emp), oldAge=age>=x.settings.ageThreshold;
  if(!emp.isSaudi)return {emp:0,er:(Number(r.nonSaudiEr)||0)/100};
  var match=(emp.insSystem||'old')==='new';
  if(match){return {emp:(Number(oldAge?r.matchEmp55:r.matchEmp)||0)/100,er:(Number(oldAge?r.matchEr55:r.matchEr)||0)/100};}
  return {emp:(Number(oldAge?r.noMatchEmp55:r.noMatchEmp)||0)/100,er:(Number(oldAge?r.noMatchEr55:r.noMatchEr)||0)/100};
}
function calcInsBase(sal,hou,wd,md){var s=getInsSettings();return Math.min((s.wageCap/md)*wd,sal+hou);}
function calcIns(emp,wd,md,asOf){var isConsultant=((emp.excelCategory||'')==='consultant')||/استشاري/.test(String(emp.jobTitle||''))||/مهمة محددة/.test(String(emp.empType||''));var sal=emp.salary||0,hou=emp.housingAllowance||0,skip=noIns_wps(emp);if(isConsultant||skip)return{base:0,empAmt:0,erAmt:0,status:isConsultant?'لا يطبق':'لا يطبق'};var rates=gosiRates(emp,asOf),base=calcInsBase(sal,hou,wd,md);return{base:Math.round(base*100)/100,empAmt:Math.round(base*rates.emp*100)/100,erAmt:Math.round(base*rates.er*100)/100,status:insStatusText(emp),empRate:rates.emp,erRate:rates.er};}

function rInsSettings(){
  var el=document.getElementById('INS_RULES_BOX'); if(!el)return; var s=getInsSettings();
  el.innerHTML=`<div class="g2" style="margin-top:10px"><div><label>حد أجر الاشتراك</label><input id="INS_CAP" type="number" min="0" step="1" value="${s.wageCap}"></div><div><label>حد العمر</label><input id="INS_AGE" type="number" min="0" step="1" value="${s.ageThreshold}"></div></div>`+
  `<div class="tw" style="margin-top:12px;max-height:420px;overflow:auto"><table><thead><tr><th>تاريخ السريان</th><th>يطابق أقل من العمر</th><th>يطابق العمر فأكثر</th><th>شركة يطابق أقل</th><th>شركة يطابق فأكثر</th><th>لا يطابق موظف أقل</th><th>لا يطابق موظف فأكثر</th><th>لا يطابق شركة أقل</th><th>لا يطابق شركة فأكثر</th><th>غير سعودي شركة</th><th></th></tr></thead><tbody>`+s.effectiveRules.map(function(r,i){return `<tr><td><input type="date" data-ir="date" data-i="${i}" value="${r.date||''}"></td><td><input type="number" step="0.01" data-ir="matchEmp" data-i="${i}" value="${r.matchEmp??''}"></td><td><input type="number" step="0.01" data-ir="matchEmp55" data-i="${i}" value="${r.matchEmp55??''}"></td><td><input type="number" step="0.01" data-ir="matchEr" data-i="${i}" value="${r.matchEr??''}"></td><td><input type="number" step="0.01" data-ir="matchEr55" data-i="${i}" value="${r.matchEr55??''}"></td><td><input type="number" step="0.01" data-ir="noMatchEmp" data-i="${i}" value="${r.noMatchEmp??''}"></td><td><input type="number" step="0.01" data-ir="noMatchEmp55" data-i="${i}" value="${r.noMatchEmp55??''}"></td><td><input type="number" step="0.01" data-ir="noMatchEr" data-i="${i}" value="${r.noMatchEr??''}"></td><td><input type="number" step="0.01" data-ir="noMatchEr55" data-i="${i}" value="${r.noMatchEr55??''}"></td><td><input type="number" step="0.01" data-ir="nonSaudiEr" data-i="${i}" value="${r.nonSaudiEr??''}"></td><td><button class="btn bd bsm" onclick="delInsRule(${i})">حذف</button></td></tr>`}).join('')+`</tbody></table></div><div style="display:flex;gap:8px;margin-top:10px"><button class="btn" onclick="addInsRule()">+ إضافة فترة جديدة</button><button class="btn bpl" onclick="saveInsSettings()">حفظ إعدادات التأمينات</button></div><div class="al alb" style="margin-top:10px"><i class="ti ti-info-circle"></i><span>النسب المدخلة هنا هي النسب الإجمالية المستخدمة في معادلة اريبا وتشمل المعاشات وساند، وحصة الشركة تشمل الأخطار المهنية وفق النسبة التي تدخلها. لا يتم تعديل النسب التاريخية عند إضافة فترة جديدة.</span></div>`;
}
function addInsRule(){var s=getInsSettings(), last=s.effectiveRules[s.effectiveRules.length-1]||{}; s.effectiveRules.push({date:'',matchEmp:last.matchEmp||0,matchEmp55:last.matchEmp55||0,matchEr:last.matchEr||0,matchEr55:last.matchEr55||0,noMatchEmp:last.noMatchEmp||0,noMatchEmp55:last.noMatchEmp55||0,noMatchEr:last.noMatchEr||0,noMatchEr55:last.noMatchEr55||0,nonSaudiEr:last.nonSaudiEr||2}); dbS('insuranceRules',s); rInsSettings();}
function delInsRule(i){var s=getInsSettings();if(s.effectiveRules.length<=1){toast('يجب الإبقاء على فترة واحدة على الأقل','ter');return;}s.effectiveRules.splice(i,1);dbS('insuranceRules',s);rInsSettings();}
function saveInsSettings(){var s=getInsSettings();s.wageCap=Number(document.getElementById('INS_CAP')?.value)||45000;s.ageThreshold=Number(document.getElementById('INS_AGE')?.value)||55;document.querySelectorAll('[data-ir]').forEach(function(el){var i=Number(el.dataset.i),k=el.dataset.ir;if(!s.effectiveRules[i])return;s.effectiveRules[i][k]=k==='date'?el.value:(Number(el.value)||0);});s.effectiveRules.sort(function(a,b){return String(a.date).localeCompare(String(b.date));});if(s.effectiveRules.some(function(r){return !r.date;})){toast('أدخل تاريخ سريان لكل فترة','ter');return;}dbS('insuranceRules',s);rInsSettings();refreshInsuranceDependentViews();toast('✓ تم حفظ إعدادات التأمينات','tin');}
function refreshInsuranceDependentViews(){try{var emps=getEmps(),now=new Date();emps.forEach(function(e){var ic=calcIns(e,31,31,now);e.insuranceSub=ic.empAmt;e.insuranceComp=ic.erAmt;e.netSalary=Math.round(((e.salaryTotal||0)-ic.empAmt-(e.otherDeductions||0))*100)/100;e.netSalaryLocal=e.netSalary;});saveEmps(emps);}catch(e){}try{if(typeof rPay==='function')rPay();}catch(e){}try{if(typeof rSlip==='function'&&document.getElementById('SLE')?.value)rSlip();}catch(e){}}
