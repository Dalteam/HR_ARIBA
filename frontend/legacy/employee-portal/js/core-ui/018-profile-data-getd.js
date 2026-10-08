
(function(){
function getD(){
  var me=window.ME;
  if(!me)return null;
  var myId=String(me.id||'');
  var myUser=String(me.username||'').toUpperCase();
  // جرب sessionStorage (محدّث من Supabase)
  try{
    var cached=JSON.parse(sessionStorage.getItem('supa_emp_'+myId)||'null');
    if(cached)return cached;
  }catch(ex){}
  // جرب hr7_emps في localStorage (محدّث من HR)
  try{
    var arr=JSON.parse(localStorage.getItem('hr7_emps')||'[]');
    for(var j=0;j<arr.length;j++){
      if(String(arr[j].id)===myId||String(arr[j].empNo||'')===myUser.replace('EMP',''))
        return {
          id:arr[j].id, u:arr[j].u||arr[j].username,
          na:arr[j].nameAr||arr[j].name_ar||'',
          em:arr[j].employer||'', dep:arr[j].dept||'',
          jt:arr[j].jobTitle||arr[j].job_title||'',
          nat:arr[j].nationality||'', saudi:arr[j].isSaudi||arr[j].is_saudi||false,
          sal:arr[j].salary||0, hou:arr[j].housingAllowance||arr[j].housing_allowance||0,
          tra:arr[j].transportAllowance||arr[j].transport_allowance||0,
          net:arr[j].netSalary||arr[j].net_salary||0,
          lb:arr[j].leaveDaysContract||arr[j].leave_days_contract||21,
          iq:arr[j].iqamaNo||arr[j].iqama_no||'',
          iqe:arr[j].iqamaExpiry||arr[j].iqama_expiry||'',
          cj:arr[j].contractJoin||arr[j].contract_join||'',
          ce:arr[j].contractEnd||arr[j].contract_end||'',
          managerId:arr[j].managerId||arr[j].manager_id||''
        };
    }
  }catch(ex){}
  // fallback لـ EMP_D
  if(typeof EMP_D!=='undefined'){
    for(var i=0;i<EMP_D.length;i++){
      var d=EMP_D[i];
      if(String(d.id)===myId||(d.u||'').toUpperCase()===myUser)return d;
    }
  }
  return null;
}
function calcLye(lb,lc){
  var t=new Date(),e2=new Date(t.getFullYear(),11,31);
  var dl=Math.round((e2-t)/864e5);
  return Math.round((lb+(lc/365)*dl)*100)/100;
}
function myFN(n){return n?Number(n).toLocaleString('ar-SA',{maximumFractionDigits:2}):'0';}
function myFD(d){if(!d)return'—';try{return new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{year:'numeric',month:'short',day:'numeric'});}catch(ex){return d;}}
function myRow(l,v){return '<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid rgba(36,48,68,.3);font-size:12px"><span style="color:var(--mu)">'+l+'</span><span style="font-weight:600">'+v+'</span></div>';}
function myAv(n,c,sz){var el=document.createElement('div');el.textContent=(n||'').charAt(0);el.setAttribute('style','width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:'+c+'22;color:'+c+';display:flex;align-items:center;justify-content:center;font-weight:700;font-size:'+(sz*0.4)+'px;flex-shrink:0');return el.outerHTML;}
function myEc(n){if(!n)return'var(--bl)';var c=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];return c[n.charCodeAt(0)%c.length];}

window.renderHome=function(){
  var el=document.getElementById('appContent');
  if(!el||!ME)return;
  var D=getD();
  /* V112: الرصيد ونهاية العام من حساب السحابة (نفس أرقام الموارد البشرية) — مش من نسخة محفوظة */
  var LV=window.ARIBA_LEAVE_SERVER||null;
  var lb=(LV&&LV.balance!=null)?Number(LV.balance):Number(ME.leaveBalance!=null?ME.leaveBalance:(ME.leave_bal||0));
  var lye=(LV&&LV.yearEnd!=null)?Number(LV.yearEnd):(ME.leaveYearEnd!=null?Number(ME.leaveYearEnd):calcLye(lb,Number(ME.leaveDaysContract||21)));
  var todayStr=new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  var lastPay=null;
  try{
    var pkeys=['hr7_pay_'+new Date().getFullYear()+'_'+('0'+(new Date().getMonth()+1)).slice(-2),'hr7_pay_2026_08'];
    for(var ki=0;ki<pkeys.length;ki++){
      var pr=localStorage.getItem(pkeys[ki]);if(!pr)continue;
      var pd=JSON.parse(pr);
      if(pd&&pd.approved&&pd.rows){
        for(var ri=0;ri<pd.rows.length;ri++){
          if(String(pd.rows[ri].id)===String(ME.id)){
            lastPay={month:pkeys[ki].replace('hr7_pay_','').replace('_','/'),total:Number(pd.rows[ri].totalDue||pd.rows[ri].salaryTotal||0)};break;
          }
        }
        if(lastPay)break;
      }
    }
  }catch(ex){}
  /* V112: آخر مسير معتمد من السحابة (اللي الموارد البشرية اعتمدته) */
  try{
    var prs=(Array.isArray(ME.payroll)?ME.payroll:[]).filter(function(r){return r&&r.approved!==false;});
    prs.sort(function(a,b){return (Number(b.year)*100+Number(b.month))-(Number(a.year)*100+Number(a.month));});
    if(prs.length){var pp=prs[0].payload||{};var tt=Number(pp.totalDue??pp.tot??pp.salaryTotal??pp.net??0);
      if(!lastPay||String(prs[0].year)+'/'+('0'+prs[0].month).slice(-2)>=String(lastPay.month||''))lastPay={month:prs[0].year+'/'+('0'+prs[0].month).slice(-2),total:tt};}
  }catch(ex){}
  var pendCount=0;
  try{pendCount=JSON.parse(localStorage.getItem('hr7_leaves')||'[]').filter(function(l){return String(l.empId||l.emp_id||'')===String(ME.id)&&l.status==='pending';}).length;}catch(ex){}
  el.innerHTML=
    '<div class="card">'+
      '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">'+
        myAv(ME.name,myEc(ME.name),48)+
        '<div><div style="font-weight:700;font-size:16px">'+ME.name+'</div>'+
        '<div style="font-size:12px;color:var(--mu)">'+ME.job+'</div>'+
        '<div style="font-size:11px;color:var(--mu)">'+todayStr+'</div></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px">'+
        '<div style="background:var(--c2);border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:var(--mu)">جهة العمل</div><div style="font-size:12px;font-weight:700">'+ME.employer+'</div></div>'+
        '<div style="background:var(--c2);border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:var(--mu)">القسم</div><div style="font-size:12px;font-weight:700">'+ME.dept+'</div></div>'+
        '<div style="background:var(--c2);border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:var(--mu)">الجنسية</div><div style="font-size:12px;font-weight:700">'+(ME.nationality||'—')+'</div></div>'+
        '<div style="background:var(--c2);border-radius:8px;padding:8px;text-align:center"><div style="font-size:10px;color:var(--mu)">الوظيفة</div><div style="font-size:12px;font-weight:700">'+ME.job+'</div></div>'+
      '</div>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
      '<div class="card" style="text-align:center;padding:16px"><div style="font-size:12px;color:var(--mu)">رصيد الإجازة</div><div style="font-size:28px;font-weight:700;color:var(--gr)">'+lb.toFixed(2)+'</div><div style="font-size:11px;color:var(--mu)">يوم حتى اليوم</div></div>'+
      '<div class="card" style="text-align:center;padding:16px"><div style="font-size:12px;color:var(--mu)">نهاية العام</div><div style="font-size:28px;font-weight:700;color:#f59e0b">'+lye.toFixed(2)+'</div><div style="font-size:11px;color:var(--mu)">31/12</div></div>'+
    '</div>'+
    '<div class="card"><div style="font-weight:700;margin-bottom:8px">آخر راتب معتمد</div>'+
      (lastPay?'<div style="display:flex;justify-content:space-between"><div style="font-weight:700">'+lastPay.month+'</div><div style="font-size:18px;font-weight:700;color:var(--gr)">'+myFN(lastPay.total)+' ر.س</div></div>':
      '<div style="color:var(--mu);font-size:12px">لم يتم إصدار مسير معتمد حتى الآن.</div>')+
    '</div>'+
    (pendCount>0?'<div class="card" style="border-right:3px solid #f59e0b"><div style="font-weight:700;color:#f59e0b">طلبات معلقة</div><div style="font-size:12px;color:var(--mu);margin-top:4px">لديك '+pendCount+' طلب بانتظار الاعتماد.</div></div>':'');
};

window.renderProf=function(){
  var el=document.getElementById('appContent');
  if(!el||!ME)return;
  // جيب أحدث بيانات من Supabase
  if(typeof supa!=='undefined'&&supa&&ME&&ME.id){
    supa.from('employees').select('*').eq('id',ME.id).single()
      .then(function(res){
        if(res.data){
          var d=res.data;
          var empData={id:d.id,u:d.username,na:d.name_ar,ne:d.name_en,
            em:d.employer,dep:d.dept,jt:d.job_title,nat:d.nationality,
            saudi:d.is_saudi,sal:d.salary,hou:d.housing_allowance,
            tra:d.transport_allowance,net:d.net_salary,lb:d.leave_days_contract,
            iq:d.iqama_no,iqe:d.iqama_expiry,cj:d.contract_join,ce:d.contract_end,
            managerId:d.manager_id,gen:d.gender};
          sessionStorage.setItem('supa_emp_'+ME.id,JSON.stringify(empData));
          // أعد رسم الصفحة بالبيانات الجديدة
          window.renderProf();
        }
      }).catch(function(){});
    return; // سيعود بعد جلب البيانات
  }
  var D=getD();
  if(!D){el.innerHTML='<div class="card"><p>جاري التحميل...</p></div>';return;}
  var lb=Number(D.lb||0);
  var lye=calcLye(lb,lb||21);
  el.innerHTML=
    '<div class="card">'+
      myRow('الجنسية',D.nat||ME.nationality||'—')+
      myRow('جهة العمل',D.em||ME.employer||'—')+
      myRow('القسم',D.dep||ME.dept||'—')+
      myRow('الوظيفة',D.jt||ME.job||'—')+
    '</div>'+
    '<div class="card"><div style="font-weight:700;margin-bottom:8px">الوثائق والعقد</div>'+
      myRow('رقم الإقامة',D.iq||'—')+
      myRow('انتهاء الإقامة',D.iqe?myFD(D.iqe):'—')+
      myRow('تاريخ المباشرة',D.cj?myFD(D.cj):'—')+
      myRow('انتهاء العقد',D.ce?myFD(D.ce):'—')+
    '</div>'+
    '<div class="card"><div style="font-weight:700;margin-bottom:8px">أرصدة الإجازات</div>'+
      myRow('الرصيد حتى اليوم',lb.toFixed(2)+' يوم')+
      myRow('الرصيد حتى 31/12',lye.toFixed(2)+' يوم')+
      myRow('المرحل','0.00 يوم')+
    '</div>'+
    (function(){
      var sal=D.sal||0,hou=D.hou||0,tra=D.tra||0,net=D.net||0;
      var subtotal=sal+hou+tra;
      var other=Math.round((net-subtotal)*100)/100;
      return '<div class="card"><div style="font-weight:700;margin-bottom:8px">الراتب</div>'+
        myRow('الراتب الأساسي',myFN(sal)+' ر.س')+
        (hou>0?myRow('بدل السكن',myFN(hou)+' ر.س'):'')+
        (tra>0?myRow('بدل المواصلات',myFN(tra)+' ر.س'):'')+
        myRow('بدل مشروع','0.00 ر.س')+
        (other>0?myRow('بدلات أخرى',myFN(other)+' ر.س'):'')+
        '<div style="border-top:2px solid var(--gr);margin:6px 0"></div>'+
        myRow('الإجمالي',myFN(net)+' ر.س')+
        myRow('الصافي',myFN(net)+' ر.س')+
      '</div>';
    })();
};
})();
