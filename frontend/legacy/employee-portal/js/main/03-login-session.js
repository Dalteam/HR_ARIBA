// ====== LOGIN ======
function doLogin(){
  var u=(document.getElementById('loginUser').value||'').trim().toUpperCase();
  var p=(document.getElementById('loginPass').value||'').trim();
  if(!u||!p)return;
  
  // حاول Supabase أولاً
  if(typeof supa!=='undefined'){
    supa.from('employees').select('*').eq('username',u).eq('password_hash',p).eq('is_terminated',false).single()
    .then(function(res){
      if(res.data){
        var d=res.data;
        var found=buildEmp({
          id:d.id, u:d.username, pw:d.password_hash,
          na:d.name_ar, ne:d.name_en, em:d.employer,
          dep:d.dept, jt:d.job_title, nat:d.nationality,
          saudi:d.is_saudi, sal:d.salary, hou:d.housing_allowance,
          tra:d.transport_allowance, net:d.net_salary,
          lb:d.leave_days_contract, iq:d.iqama_no, iqe:d.iqama_expiry,
          cj:d.contract_join, ce:d.contract_end,
          managerId:d.manager_id, gen:d.gender
        });
        ME=found;
        finishLogin();
      } else {
        loginFromLocal(u,p);
      }
    }).catch(function(){ loginFromLocal(u,p); });
    return;
  }
  loginFromLocal(u,p);
}

function loginFromLocal(u,p){
  var found=null;
  for(var j=0;j<EMP_D.length;j++){
    var d=EMP_D[j];
    if((d.u||'').toUpperCase()===u&&d.pw===p&&!d.term){found=buildEmp(d);break;}
  }
  if(!found){var el=document.getElementById('loginErr');if(el)el.style.display='block';return;}
  ME=found;
  finishLogin();
}

function finishLogin(){
  var el=document.getElementById('loginErr');if(el)el.style.display='none';
  document.getElementById('sc-login').classList.remove('on');
  document.getElementById('sc-app').classList.add('on');
  var hdr=document.getElementById('userNameHdr');
  if(hdr)hdr.textContent=(ME.name||'').split(' ').slice(0,3).join(' ');
  // جلب بيانات محدثة من Supabase
  if(typeof supa!=='undefined'&&ME&&ME.id){
    supa.from('employees').select('*').eq('id',ME.id).single().then(function(res){
      if(res.data){
        var d=res.data;
        // حدّث ME بأحدث بيانات
        ME.salary=d.salary||ME.salary;
        ME.hou=d.housing_allowance||ME.hou;
        ME.tra=d.transport_allowance||ME.tra;
        ME.net=d.net_salary||ME.net;
        ME.leave_bal=d.leave_days_contract||ME.leave_bal;
        // حفظ في sessionStorage لـ getD
        var empData={id:d.id,u:d.username,pw:d.password_hash,
          na:d.name_ar,ne:d.name_en,em:d.employer,dep:d.dept,jt:d.job_title,
          nat:d.nationality,saudi:d.is_saudi,sal:d.salary,hou:d.housing_allowance,
          tra:d.transport_allowance,net:d.net_salary,lb:d.leave_days_contract,
          iq:d.iqama_no,iqe:d.iqama_expiry,cj:d.contract_join,ce:d.contract_end,
          managerId:d.manager_id,gen:d.gender,term:d.is_terminated};
        sessionStorage.setItem('supa_emp_'+ME.id, JSON.stringify(empData));
        // جلب الطلبات
        return supa.from('leave_requests').select('*').eq('emp_id',ME.id);
      }
    }).then(function(res){
      if(res&&res.data) localStorage.setItem('hr7_leaves',JSON.stringify(res.data.map(function(l){
        return {id:l.id,empId:l.emp_id,type:l.type,from_date:l.from_date,to_date:l.to_date,
          days:l.days_count,reason:l.reason,status:l.status};
      })));
    }).catch(function(){});
  }
  // جلب بيانات محدثة من Supabase
  if(typeof supa!=='undefined'&&ME){
    Promise.all([
      supa.from('leave_requests').select('*').eq('emp_id',ME.id),
      supa.from('attendance').select('*').eq('emp_id',ME.id).order('date',{ascending:false}).limit(30)
    ]).then(function(results){
      if(results[0].data) localStorage.setItem('hr7_leaves',JSON.stringify(results[0].data));
      if(results[1].data) localStorage.setItem('hr7_att_'+ME.id,JSON.stringify(results[1].data));
    }).catch(function(){});
  }
  goTab('home',document.getElementById('tb-home'));
}

function buildEmp(d){
  return {
    id:String(d.id),
    username:d.u||d.username||'',
    name:d.na||d.nameAr||'',
    name_en:d.ne||d.nameEn||'',
    employer:d.em||d.employer||'',
    job:d.jt||d.jobTitle||'',
    dept:d.dep||d.dept||'',
    nationality:d.nat||d.nationality||'',
    salary:d.sal||d.salary||0,
    hou:d.hou||d.housingAllowance||0,
    tra:d.tra||d.transportAllowance||0,
    prj:d.prj||d.projectAllowance||0,
    oth:d.oth||d.otherAllowance||0,
    net:d.nsar||d.net||d.netSalary||0,
    leave_bal:d.lb||d.leaveBalance||21,
    leave_carry:d.leaveCarryover||0,
    leave_contract:d.ldc||d.leaveDaysContract||21,
    remote_used:d.remoteDaysUsed||0,
    remote_limit:10,
    mgr_id:String(d.managerId||d.manager_id||''),
    is_saudi:d.saudi||d.isSaudi||false,
    iqama:d.iq||d.iqamaNo||'',
    iqama_exp:d.iqe||d.iqamaExpiry||'',
    join:d.cj||d.contractJoin||'',
    end:d.ce||d.contractEnd||'',
    contractNature:d.contractNature||d.contract_nature||'',
    contractDuration:d.contractDuration||d.dur||'',
    leaveYearEnd:d.leaveYearEnd??d.leave_year_end??0,
    leaveCarryover:d.leaveCarryover??d.leave_carryover??0,
    leaveAccruedToday:d.leaveAccruedToday??0,
    leaveAccruedYearEnd:d.leaveAccruedYearEnd??0,
    leaveUsedToday:d.leaveUsedToday??0,
    leaveUsedYear:d.leaveUsedYear??0,
    leaveUsedSinceStart:d.leaveUsedSinceStart??0,
    leaveTotalSinceStart:d.leaveTotalSinceStart??0,
    leaveAvailableSinceStart:d.leaveAvailableSinceStart??0,
    leaveEosExcess:d.leaveEosExcess??0,
    mobile:d.mb||d.mobile||'',
    email:d.ml||d.email||'',
    iban:d.bk||d.ib||d.iban||'',
    dob:d.dob||''
  };
}

function syncFromHR(){
  if(!ME) return;
  var hrEmps=gLSJ(HR+'emps');
  if(hrEmps){
    for(var i=0;i<hrEmps.length;i++){
      if(String(hrEmps[i].id)===ME.id){
        var e=hrEmps[i];
        ME.job=e.jobTitle||e.jt||ME.job;
        ME.dept=e.dept||e.dep||ME.dept;
        ME.mobile=e.mobile||e.mb||ME.mobile;
        ME.email=e.email||e.ml||ME.email;
        ME.iban=e.iban||e.bk||e.ib||ME.iban;
        ME.iqama=e.iqamaNo||e.iq||ME.iqama;
        ME.iqama_exp=e.iqamaExpiry||e.iqe||ME.iqama_exp;
        ME.join=e.contractJoin||e.cj||ME.join;
        ME.end=e.contractEnd||e.ce||ME.end;
        ME.contractNature=e.contractNature||e.contract_nature||ME.contractNature;
        ME.contractDuration=e.contractDuration||e.dur||ME.contractDuration;
        ME.leave_bal=e.leaveBalance||e.lb||ME.leave_bal;
        ME.leave_carry=e.leaveCarryover||ME.leave_carry;
        ME.remote_used=e.remoteDaysUsed||ME.remote_used;
        ME.mgr_id=String(e.managerId||e.manager_id||ME.mgr_id);
        ME.salary=e.salary||e.sal||ME.salary;
        ME.net=e.netSalary||e.nsar||e.net||ME.net;
        break;
      }
    }
  }
  var sets=gLSJ(HR+'settings');
  if(sets) ME.remote_limit=parseInt(sets.rmt)||10;
}

function doLogout(){ME=null;document.getElementById('sc-app').classList.remove('on');document.getElementById('sc-login').classList.add('on');}

