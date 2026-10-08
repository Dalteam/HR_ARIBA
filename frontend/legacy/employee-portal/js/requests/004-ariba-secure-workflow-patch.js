
/* ARIBA EMPLOYEE APP - SECURE CLOUD WORKFLOW PATCH */
(function(){
  'use strict';
  var SUPA_URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var SUPA_KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var TOKEN_KEY='ariba_employee_session_v2';
  window.ARIBA_SUPA={url:SUPA_URL,key:SUPA_KEY};
  window.ARIBA_SESSION=localStorage.getItem(TOKEN_KEY)||'';
  window.ARIBA_CTX=null;
  function headers(){return {'apikey':SUPA_KEY,'Authorization':'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'};}
  async function rpc(fn,args){
    var r=await fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:headers(),body:JSON.stringify(args||{})});
    var text=await r.text(); var data=null; try{data=text?JSON.parse(text):null;}catch(e){data={};}
    if(!r.ok){throw new Error((data&&data.message)||data?.hint||data?.error||'تعذر الاتصال بقاعدة البيانات');}
    return data;
  }
  window.aribaRpc=rpc;
  function normalizeProfile(d){
    var e=d||{};
    return buildEmp({
      id:e.id, username:e.username||e.u, password:'', nameAr:e.nameAr||e.na, nameEn:e.nameEn||e.ne,
      employer:e.employer||e.em, jobTitle:e.jobTitle||e.jt, dept:e.dept||e.dep, nationality:e.nationality||e.nat,
      salary:e.salary||e.sal, housingAllowance:e.housingAllowance||e.hou, transportAllowance:e.transportAllowance||e.tra,
      projectAllowance:e.projectAllowance||e.prj, otherAllowance:e.otherAllowance||e.oth, netSalary:e.netSalary||e.net,
      leaveBalance:e.leaveBalance??e.lb, leaveYearEnd:e.leaveYearEnd??e.leave_year_end??0, leaveCarryover:e.leaveCarryover??e.leave_carryover??0, leaveAccruedToday:e.leaveAccruedToday??0, leaveAccruedYearEnd:e.leaveAccruedYearEnd??0, leaveUsedToday:e.leaveUsedToday??0, leaveUsedYear:e.leaveUsedYear??0, leaveUsedSinceStart:e.leaveUsedSinceStart??0, leaveTotalSinceStart:e.leaveTotalSinceStart??0, leaveAvailableSinceStart:e.leaveAvailableSinceStart??0, leaveEosExcess:e.leaveEosExcess??0, leaveYear:e.leaveYear??new Date().getFullYear(), leaveYearOverrides:e.leaveYearOverrides||{}, leaveDaysContract:e.leaveDaysContract||e.ldc||21,
      managerId:e.managerId||e.manager_id||'', isSaudi:e.isSaudi||e.saudi||false, iqamaNo:e.iqamaNo||e.iq,
      iqamaExpiry:e.iqamaExpiry||e.iqe, contractJoin:e.contractJoin||e.cj, contractEnd:e.contractEnd||e.ce, contractNature:e.contractNature||e.contract_nature, contractDuration:e.contractDuration||e.dur,
      mobile:e.mobile||e.mb, email:e.email||e.ml, iban:e.iban||e.ib, dob:e.dob||e.dob,
      isTerminated:e.isTerminated||e.term||false, gender:e.gender||e.gen, job:e.job||e.jobTitle||e.jt, empNo:e.empNo||e.emp_no||e.id, photoUrl:e.photoUrl||e.photo_url||''
    });
  }
  async function refreshContext(){
    if(!window.ARIBA_SESSION)return null;
    var c=await rpc('ariba_employee_context',{p_token:window.ARIBA_SESSION});
    window.ARIBA_CTX=c||null;
    if(c&&c.employee){
      ME=normalizeProfile(c.employee);
      ME.role=c.role||'employee';
      ME.notifications=c.notifications||[];
      ME.workflowRequests=c.requests||[];
      ME.locations=c.locations||[];
      ME.team=c.team||[];
    }
    return c;
  }
  window.refreshAribaContext=refreshContext;
  function hasApprovalRole(){return !!(ME&&(ME.role==='manager'||ME.role==='hr'||ME.role==='ceo'))}
  function ensureApprovalNav(){
    var nav=document.querySelector('.bnav'); if(!nav||!ME)return;
    var old=document.getElementById('tb-approvals');
    if(hasApprovalRole()&&!old){
      var b=document.createElement('button');b.className='bni';b.id='tb-approvals';b.onclick=function(){goTab('approvals',this)};
      b.innerHTML='<i class="ti ti-checks"></i><span>الموافقات</span><b id="approvalBadge" style="display:none;position:absolute;margin:-4px 0 0 -10px;background:var(--rd);color:#fff;border-radius:10px;padding:1px 5px;font-size:9px"></b>';
      nav.appendChild(b);
    }
    if(!hasApprovalRole()&&old)old.remove();
  }
  function pendingCount(){return (window.ARIBA_APPROVAL_QUEUE||[]).length;}
  async function loadApprovalQueue(){
    if(!hasApprovalRole())return [];
    try{var d=await rpc('ariba_staff_queue',{p_token:window.ARIBA_SESSION});window.ARIBA_APPROVAL_QUEUE=d.queue||[];}
    catch(e){window.ARIBA_APPROVAL_QUEUE=[];}
    var b=document.getElementById('approvalBadge');if(b){var n=pendingCount();b.textContent=n;b.style.display=n?'inline-block':'none';}
    return window.ARIBA_APPROVAL_QUEUE;
  }
  window.loadApprovalQueue=loadApprovalQueue;
  function reqLabel(t){return (LVL[t]&&LVL[t].ar)||t||'طلب';}
  function reqDetail(r){
    var p=r.payload||{};
    if(p.from||p.to)return (p.from||'')+' ← '+(p.to||'')+(p.days!=null?' | '+p.days+' يوم':'');
    if(p.date)return p.date+(p.time?' '+p.time:'')+(p.dur?' | '+p.dur+' ساعة':'');
    if(p.amount)return 'المبلغ: '+Number(p.amount).toLocaleString('ar-SA')+' ر.س';
    return p.notes||'';
  }
  function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  window.renderApprovals=async function(){
    var el=document.getElementById('appContent');if(!el)return;
    el.innerHTML='<div class="card"><div class="card-title">⏳ الموافقات</div><div style="text-align:center;color:var(--mu);padding:20px">جاري تحميل الطلبات...</div></div>';
    var q=await loadApprovalQueue();
    if(!q.length){el.innerHTML='<div class="card" style="text-align:center;padding:35px;color:var(--mu)">✅ لا توجد طلبات بانتظار موافقتك حالياً.</div>';return;}
    var html='<div class="card"><div class="card-title">طلبات بانتظار موافقتك <span class="b ba">'+q.length+'</span></div>';
    q.forEach(function(x){var r=x.request||{},e=x.employee||{},name=e.nameAr||e.na||r.employee_id||'الموظف';html+='<div style="background:var(--c2);border:1px solid var(--bd);border-right:3px solid var(--am);border-radius:12px;padding:12px;margin-bottom:10px">'+
      '<div style="display:flex;justify-content:space-between;gap:8px"><strong>'+escapeHtml(name)+'</strong><span class="b ba">'+escapeHtml(reqLabel(r.request_type))+'</span></div>'+
      '<div style="font-size:11px;color:var(--mu);margin:6px 0">'+escapeHtml(reqDetail(r))+'</div>'+ (r.payload&&r.payload.notes?'<div style="font-size:11px;color:var(--dm);margin-bottom:8px">'+escapeHtml(r.payload.notes)+'</div>':'')+
      '<div style="display:flex;gap:8px"><button class="btn btn-success" style="flex:1" onclick="workflowDecision(\''+r.id+'\',\'approved\')">✓ موافقة</button><button class="btn btn-danger" style="flex:1" onclick="workflowDecision(\''+r.id+'\',\'rejected\')">✗ رفض</button></div></div>';});
    html+='</div><div class="card"><div class="card-title">مسار الطلب</div><div style="font-size:11px;color:var(--mu)">الموظف → المدير المباشر → الموارد البشرية → الرئيس التنفيذي → الموظف</div></div>';el.innerHTML=html;
  };
  window.workflowDecision=async function(id,action){
    var reason='';if(action==='rejected'){reason=prompt('سبب الرفض:');if(reason===null)return;}
    try{await rpc('ariba_workflow_action',{p_token:window.ARIBA_SESSION,p_request_id:id,p_action:action,p_reason:reason||null});toast(action==='approved'?'✅ تمت الموافقة وانتقل الطلب للمرحلة التالية':'❌ تم رفض الطلب');await refreshContext();await loadApprovalQueue();renderApprovals();}
    catch(e){toast(e.message||'تعذر تنفيذ الإجراء','ter');}
  };
  async function secureLogin(){
    var u=(document.getElementById('loginUser').value||'').trim(),p=(document.getElementById('loginPass').value||'').trim();if(!u||!p)return;
    var btn=document.querySelector('.btn-login');if(btn)btn.disabled=true;
    try{
      var d=await rpc('ariba_login',{p_username:u,p_password:p});
      if(!d||!d.token)throw new Error('بيانات الدخول غير صحيحة');
      window.ARIBA_SESSION=d.token;localStorage.setItem(TOKEN_KEY,d.token);
      await refreshContext();
      document.getElementById('loginErr').style.display='none';document.getElementById('sc-login').classList.remove('on');document.getElementById('sc-app').classList.add('on');
      document.getElementById('userNameHdr').textContent=(ME.name||'').split(' ').slice(0,2).join(' ');ensureApprovalNav();await loadApprovalQueue();goTab('home',document.getElementById('tb-home'));
    }catch(e){var er=document.getElementById('loginErr');er.textContent=e.message||'بيانات الدخول غير صحيحة';er.style.display='block';}
    finally{if(btn)btn.disabled=false;}
  }
  window.doLogin=secureLogin;
  window.syncFromHR=function(){return refreshContext().catch(function(){return null;});};
  window.doLogout=async function(){try{localStorage.removeItem(TOKEN_KEY);}catch(e){}window.ARIBA_SESSION='';window.ARIBA_CTX=null;ME=null;document.getElementById('sc-app').classList.remove('on');document.getElementById('sc-login').classList.add('on');};
  window.getMyLeaves=function(){return (ME&&ME.workflowRequests)||[];};
  window.goTab=(function(orig){return function(tab,el){
    if(tab==='approvals'){document.querySelectorAll('.bni').forEach(function(b){b.classList.remove('on')});if(el)el.classList.add('on');document.getElementById('pageTitle').textContent='الموافقات';renderApprovals();return;}
    return orig(tab,el);
  };})(window.goTab);
  window.renderHome=(function(orig){return function(){orig();ensureApprovalNav();var el=document.getElementById('appContent');if(!el)return;var ns=(ME&&ME.notifications)||[];if(ns.length){var box=document.createElement('div');box.className='card';box.innerHTML='<div class="card-title">🔔 الإشعارات <span class="b ba">'+ns.length+'</span></div>'+ns.slice(0,5).map(function(n){return '<div style="padding:8px 0;border-bottom:1px solid var(--bd);font-size:11px"><strong>'+escapeHtml(n.title)+'</strong><div style="color:var(--mu);margin-top:2px">'+escapeHtml(n.body)+'</div></div>';}).join('');el.insertBefore(box,el.firstChild);}}
  })(window.renderHome);
  window.renderTeam=(function(orig){return async function(){orig();if(hasApprovalRole())await loadApprovalQueue();ensureApprovalNav();}}
  )(window.renderTeam);
  window.submitLv=async function(){
    var notes=document.getElementById('lvNotes'),isPerm=selType==='perm'||selType==='perm_mat'||selType==='early_leave';var payload={notes:notes?notes.value:'',type:selType};
    if(isPerm){var pd=document.getElementById('permDate'),pt=document.getElementById('permTime'),pdur=document.getElementById('permDur');if(!pd?.value||!pt?.value){toast('حدد التاريخ والوقت','ter');return;}payload.date=pd.value;payload.time=pt.value;payload.dur=parseFloat(pdur?.value)||1;}
    else{var from=document.getElementById('lvFrom'),to=document.getElementById('lvTo');if(!from?.value||!to?.value){toast('حدد التاريخ','ter');return;}var days=0;if(selType==='annual'){var hols=(ARIBA_CTX&&ARIBA_CTX.holidays)||gLSJ(HR+'hols')||[],hs={};hols.forEach(function(h){hs[h.date||'']=true});var d=new Date(from.value),en=new Date(to.value);while(d<=en){var ds=d.toISOString().slice(0,10);if(d.getDay()>=0&&d.getDay()<=4&&!hs[ds])days++;d.setDate(d.getDate()+1);}if(days>Number(ME.leave_bal||0)){toast('يتجاوز الرصيد المتاح','ter');return;} }else days=Math.round((new Date(to.value)-new Date(from.value))/86400000)+1;payload.from=from.value;payload.to=to.value;payload.days=days;}
    try{await rpc('ariba_submit_request',{p_token:window.ARIBA_SESSION,p_type:selType,p_payload:payload});toast('✅ تم إرسال الطلب — بانتظار المدير المباشر');await refreshContext();renderLv();}
    catch(e){toast(e.message||'تعذر إرسال الطلب','ter');}
  };
  window.doIn=async function(){
    if(!userLoc){await new Promise(function(resolve){navigator.geolocation?.getCurrentPosition(function(p){userLoc={lat:p.coords.latitude,lng:p.coords.longitude};resolve();},function(){resolve();},{enableHighAccuracy:true,maximumAge:0,timeout:10000});});}
    if(!userLoc){toast('❌ يجب السماح بتحديد الموقع','ter');return;}
    try{var r=await rpc('ariba_attendance',{p_token:window.ARIBA_SESSION,p_action:'in',p_lat:userLoc.lat,p_lng:userLoc.lng});toast('✅ تم تسجيل الحضور'+(r.late_minutes>0?' — تأخير '+r.late_minutes+' دقيقة':'')+(r.flexible_enabled&&r.expected_checkout?' — متوقع انصرافك الساعة '+String(r.expected_checkout).slice(0,5):''));renderAtt();}
    catch(e){
      var msg = e.message==='OUTSIDE_GEOFENCE' ? '❌ أنت خارج نطاق مواقع العمل المسموح بها'
        : e.message==='TOO_EARLY_FOR_FLEXIBLE_WINDOW' ? '❌ لسه بدري، الحضور المرن يبدأ لاحقًا حسب إعدادات الشركة'
        : e.message==='TOO_LATE_FOR_FLEXIBLE_WINDOW' ? '❌ الوقت متأخر — دوامك مش هيكمل جوه نطاق ساعات العمل المسموح بيها'
        : (e.message||'تعذر تسجيل الحضور');
      toast(msg,'ter');
    }
  };
  window.doOut=async function(){
    if(!userLoc){await new Promise(function(resolve){navigator.geolocation?.getCurrentPosition(function(p){userLoc={lat:p.coords.latitude,lng:p.coords.longitude};resolve();},function(){resolve();},{enableHighAccuracy:true,maximumAge:0,timeout:10000});});}
    if(!userLoc){toast('❌ يجب السماح بتحديد الموقع','ter');return;}
    try{var r=await rpc('ariba_attendance',{p_token:window.ARIBA_SESSION,p_action:'out',p_lat:userLoc.lat,p_lng:userLoc.lng});toast('🚪 تم تسجيل الانصراف'+(r.flexible_enabled&&r.early_minutes>0?' — قبل الموعد المتوقع بـ '+r.early_minutes+' دقيقة':''));renderAtt();}
    catch(e){toast(e.message==='OUTSIDE_GEOFENCE'?'❌ أنت خارج نطاق مواقع العمل المسموح بها':(e.message||'تعذر تسجيل الانصراف'),'ter');}
  };
  window.renderAtt=(function(orig){return function(){orig();if(ME&&ME.locations&&ME.locations.length){setTimeout(function(){var txt=document.getElementById('locTxt');if(txt&&!nearLoc)txt.textContent='جاري التحقق من الموقع من الخادم...';},50);}};})(window.renderAtt);
  // Initial session restore.
  (async function(){if(window.ARIBA_SESSION){try{await refreshContext();if(ME){document.getElementById('sc-login').classList.remove('on');document.getElementById('sc-app').classList.add('on');document.getElementById('userNameHdr').textContent=(ME.name||'').split(' ').slice(0,2).join(' ');ensureApprovalNav();await loadApprovalQueue();goTab('home',document.getElementById('tb-home'));}}catch(e){localStorage.removeItem(TOKEN_KEY);window.ARIBA_SESSION='';}}})();
})();
/* Render the cloud workflow requests instead of the old localStorage request shape. */
(function(){
  function e(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function statusText(r){if(r.status==='approved')return ['موافق','bg'];if(r.status==='rejected')return ['مرفوض','br'];if(r.current_stage==='manager')return ['بانتظار المدير المباشر','ba'];if(r.current_stage==='hr')return ['بانتظار الموارد البشرية','ba'];if(r.current_stage==='ceo')return ['بانتظار الرئيس التنفيذي','ba'];return ['مكتمل','bg'];}
  window.renderLv=function(){
    // renderLv may be called by navigation; never call it from the background
    // refresh while an input is focused.

    var el=document.getElementById('appContent');if(!el)return;var reqs=(ME&&ME.workflowRequests)||[];var html='<div class="card"><div class="card-title"><i class="ti ti-send"></i> طلباتي</div>';
    if(!reqs.length)html+='<div style="text-align:center;color:var(--mu);padding:20px">لا توجد طلبات حتى الآن</div>';
    reqs.forEach(function(r){var p=r.payload||{},st=statusText(r);var detail=p.from?(p.from+' ← '+p.to+' | '+(p.days||0)+' يوم'):(p.date||'')+(p.time?' '+p.time:'')+(p.amount?' | '+Number(p.amount).toLocaleString('ar-SA')+' ر.س':'');html+='<div style="padding:11px 0;border-bottom:1px solid var(--bd)"><div style="display:flex;justify-content:space-between;gap:8px"><strong style="font-size:12px">'+e((LVL[r.request_type]&&LVL[r.request_type].ar)||r.request_type)+'</strong><span class="b '+st[1]+'">'+st[0]+'</span></div><div style="font-size:11px;color:var(--mu);margin-top:4px">'+e(detail)+'</div>'+(p.notes?'<div style="font-size:10px;color:var(--dm);margin-top:3px">'+e(p.notes)+'</div>':'')+'<div style="font-size:10px;color:var(--dm);margin-top:5px">المرحلة: '+e(r.current_stage)+'</div></div>';});
    html+='</div>';
    html+='<div class="card"><div class="card-title">إرسال طلب جديد</div><div style="font-size:11px;color:var(--mu);margin-bottom:8px">أي طلب ترسله سيمر تلقائياً: المدير المباشر → الموارد البشرية → الرئيس التنفيذي.</div><div id="lvNewRequestHost"></div></div>';
    el.innerHTML=html;
    // Reuse the existing form by temporarily rebuilding it through the original function would be complex;
    // render a compact form directly here.
    var host=document.getElementById('lvNewRequestHost');if(host){
      host.innerHTML='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px">'+Object.keys(LVL).map(function(k){return '<button class="lv-type" data-k="'+k+'" onclick="selType=\''+k+'\';document.querySelectorAll(\'.lv-type\').forEach(function(x){x.classList.remove(\'on\')});this.classList.add(\'on\')">'+e(LVL[k].ar)+'</button>';}).join('')+'</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div><label>من تاريخ</label><input type="date" id="lvFrom"></div><div><label>إلى تاريخ</label><input type="date" id="lvTo"></div></div><label>ملاحظات</label><textarea id="lvNotes" rows="2"></textarea><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="submitLv()"><i class="ti ti-send"></i> إرسال الطلب</button>';
      var first=host.querySelector('.lv-type');if(first)first.classList.add('on');
    }
  };
  window.renderTeam=function(){
    var el=document.getElementById('appContent');if(!el)return;var team=(ME&&ME.team)||[];var html='<div class="card"><div class="card-title">👥 فريقي</div>';
    if(!team.length)html+='<div style="text-align:center;color:var(--mu);padding:20px">لم يتم تحديد موظفين تحت إدارتك.</div>';
    team.forEach(function(x){var n=x.nameAr||x.na||'',j=x.jobTitle||x.jt||'';html+='<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--bd)"><div style="width:38px;height:38px;border-radius:50%;background:var(--bl)22;color:var(--bl);display:flex;align-items:center;justify-content:center;font-weight:800">'+e(n.charAt(0))+'</div><div><div style="font-weight:700;font-size:12px">'+e(n)+'</div><div style="font-size:10px;color:var(--mu)">'+e(j)+'</div></div></div>';});html+='</div>';el.innerHTML=html;if(hasApprovalRole())loadApprovalQueue();};
})();
(function(){
  function esc(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  window.changeRequestType=function(k){selType=k;window.selType=k;document.querySelectorAll('.lv-type').forEach(function(x){x.classList.toggle('on',x.getAttribute('data-k')===k)});var h=document.getElementById('lvFields');if(!h)return;var isPerm=['perm','perm_mat','early_leave'].includes(k);if(k==='advance')h.innerHTML='<label>مبلغ السلفة</label><input type="number" id="reqAmount" min="0" step="0.01" placeholder="0.00">';else if(isPerm)h.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px"><div><label>التاريخ</label><input type="date" id="permDate"></div><div><label>الوقت</label><input type="time" id="permTime"></div><div><label>المدة (س)</label><input type="number" id="permDur" value="1" min="0.5" step="0.5"></div></div>';else h.innerHTML='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px"><div><label>من تاريخ</label><input type="date" id="lvFrom"></div><div><label>إلى تاريخ</label><input type="date" id="lvTo"></div></div>';};
  window.renderLv=function(){
    var el=document.getElementById('appContent');if(!el)return;var reqs=(ME&&ME.workflowRequests)||[];var html='<div class="card"><div class="card-title">📋 طلباتي</div>';
    if(!reqs.length)html+='<div style="text-align:center;color:var(--mu);padding:18px">لا توجد طلبات حتى الآن</div>';
    reqs.forEach(function(r){var p=r.payload||{}, st=r.status==='approved'?['موافق','bg']:r.status==='rejected'?['مرفوض','br']:r.current_stage==='manager'?['بانتظار المدير المباشر','ba']:r.current_stage==='hr'?['بانتظار الموارد البشرية','ba']:['بانتظار الرئيس التنفيذي','ba'];var detail=p.from?(p.from+' ← '+p.to+' | '+(p.days||0)+' يوم'):(p.date||'')+(p.time?' '+p.time:'')+(p.amount?' | '+Number(p.amount).toLocaleString('ar-SA')+' ر.س':'');html+='<div style="padding:10px 0;border-bottom:1px solid var(--bd)"><div style="display:flex;justify-content:space-between"><strong style="font-size:12px">'+esc((LVL[r.request_type]&&LVL[r.request_type].ar)||r.request_type)+'</strong><span class="b '+st[1]+'">'+st[0]+'</span></div><div style="font-size:11px;color:var(--mu);margin-top:4px">'+esc(detail)+'</div>'+(p.notes?'<div style="font-size:10px;color:var(--dm);margin-top:3px">'+esc(p.notes)+'</div>':'')+'</div>';});html+='</div>';
    html+='<div class="card"><div class="card-title">إرسال طلب جديد</div><div style="font-size:11px;color:var(--mu);margin-bottom:8px">مسار الاعتماد: المدير المباشر → الموارد البشرية → الرئيس التنفيذي.</div><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">'+Object.keys(LVL).map(function(k){return '<button class="lv-type '+(k==='annual'?'on':'')+'" data-k="'+k+'" onclick="changeRequestType(\''+k+'\')">'+esc(LVL[k].ar)+'</button>';}).join('')+'</div><div id="lvFields"></div><label>ملاحظات</label><textarea id="lvNotes" rows="2" placeholder="اختياري"></textarea><button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="submitLv()"><i class="ti ti-send"></i> إرسال الطلب</button></div>';
    el.innerHTML=html;changeRequestType(window.selType||selType||'annual');
  };
  window.submitLv=async function(){
    var p={notes:document.getElementById('lvNotes')?.value||''};
    try{
      if(selType==='advance'){p.amount=parseFloat(document.getElementById('reqAmount')?.value||0);if(!(p.amount>0)){toast('أدخل مبلغ السلفة','ter');return;}}
      else if(['perm','perm_mat','early_leave'].includes(selType)){p.date=document.getElementById('permDate')?.value||'';p.time=document.getElementById('permTime')?.value||'';p.dur=parseFloat(document.getElementById('permDur')?.value||0)||0;if(!p.date||!p.time){toast('حدد التاريخ والوقت','ter');return;}}
      else{p.from=document.getElementById('lvFrom')?.value||'';p.to=document.getElementById('lvTo')?.value||'';if(!p.from||!p.to||p.to<p.from){toast('حدد الفترة بشكل صحيح','ter');return;}var days=0;if(selType==='annual'){var hols=(ARIBA_CTX&&ARIBA_CTX.holidays)||gLSJ(HR+'hols')||[],hs={};hols.forEach(function(h){hs[h.date||'']=true});var d=new Date(p.from),en=new Date(p.to);while(d<=en){var ds=d.toISOString().slice(0,10);if(d.getDay()>=0&&d.getDay()<=4&&!hs[ds])days++;d.setDate(d.getDate()+1);}p.days=days;if(days>Number(ME.leave_bal||0)){toast('يتجاوز الرصيد المتاح','ter');return;}}else p.days=Math.round((new Date(p.to)-new Date(p.from))/86400000)+1;}
      await aribaRpc('ariba_submit_request',{p_token:ARIBA_SESSION,p_type:selType,p_payload:p});toast('✅ تم إرسال الطلب — بانتظار المدير المباشر');await refreshAribaContext();renderLv();renderHome();
    }catch(e){toast(e.message||'تعذر إرسال الطلب','ter');}
  };
})();
(function(){
  // Background synchronization is handled by the silent live-sync controller below.
})();
(function(){
  // Correct zero-valued balances and use server attendance records for display.
  var oldNormalize=null;
  window.renderAtt=function(){
    var el=document.getElementById('appContent');if(!el)return;var arr=(ME&&ME.attendance)||[];var today=tod();var rec=arr.find(function(x){return String(x.attendance_date||x.date)===today})||null;var now=new Date();var html='<div class="att-big"><div class="att-time" id="liveClock">'+now.toLocaleTimeString('ar-SA-u-nu-latn',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'</div><div class="att-date">'+now.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{weekday:'long',year:'numeric',month:'long',day:'numeric'})+'</div></div><div class="loc-badge"><div class="loc-dot" style="background:'+(userLoc?'var(--gr)':'var(--am)')+'"></div><span style="color:var(--mu)">'+(userLoc?'📍 تم تحديد موقعك — سيتم التحقق منه على الخادم':'جاري تحديد الموقع...')+'</span></div><div class="card"><div class="card-title">📌 حالة الحضور اليوم</div>';
    if(rec){html+='<div class="att-status att-in">✅ حضور — '+(rec.time_in||'')+'</div><div style="font-size:11px;color:var(--mu);text-align:center">📍 '+(rec.location_name||'موقع معتمد')+'</div>';if(!rec.time_out)html+='<button class="btn btn-danger" style="margin-top:10px" onclick="doOut()">🚪 تسجيل الانصراف</button>';else html+='<div class="att-status" style="margin-top:8px">🚪 انصراف — '+rec.time_out+'</div>';}else html+='<div class="att-status att-none">لم تسجل حضورك بعد</div><button class="btn btn-success" onclick="doIn()">📍 تسجيل الحضور</button>';
    html+='</div><div class="card"><div class="card-title">📅 سجل آخر 31 يوم</div>';
    if(!arr.length)html+='<div style="text-align:center;color:var(--mu);padding:15px">لا يوجد سجل</div>';else arr.forEach(function(a){html+='<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--bd);font-size:11px"><span>'+e(a.attendance_date)+'</span><span>'+e(a.time_in||'—')+' → '+e(a.time_out||'...')+'</span><span>'+e(a.status||'—')+'</span></div>';});html+='</div>';el.innerHTML=html;startClock();
    navigator.geolocation?.getCurrentPosition(function(p){userLoc={lat:p.coords.latitude,lng:p.coords.longitude};var t=document.querySelector('.loc-badge span');if(t)t.textContent='📍 تم تحديد موقعك — التحقق يتم من الخادم';},function(){var t=document.querySelector('.loc-badge span');if(t)t.textContent='❌ تعذر تحديد الموقع';},{enableHighAccuracy:true,maximumAge:0,timeout:10000});
  };
  function e(s){return String(s??'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  if(typeof normalizeProfile!=='undefined'){
  var oldNormProfile=normalizeProfile;
  normalizeProfile=function(raw){var m=oldNormProfile(raw);m.leave_bal=(raw.leaveBalance!==undefined?Number(raw.leaveBalance):(raw.lb!==undefined?Number(raw.lb):0));m.leaveYearEnd=(raw.leaveYearEnd!==undefined?Number(raw.leaveYearEnd):Number(raw.leave_year_end||0));m.leave_carry=(raw.leaveCarryover!==undefined?Number(raw.leaveCarryover):Number(raw.leave_carryover||0));m.leaveTotalSinceStart=Number(raw.leaveTotalSinceStart||0);m.leaveUsedSinceStart=Number(raw.leaveUsedSinceStart||0);m.leaveAvailableSinceStart=Number(raw.leaveAvailableSinceStart||0);m.leaveEosExcess=Number(raw.leaveEosExcess||0);m.leaveYear=Number(raw.leaveYear||new Date().getFullYear());m.leaveYearOverrides=raw.leaveYearOverrides||{};return m;};
  }
  var oldRefresh=refreshAribaContext;
  refreshAribaContext=async function(){var c=await oldRefresh();if(c&&ME){ME.attendance=c.attendance||[];ME.workflowRequests=c.requests||[];ME.notifications=c.notifications||[];}return c;};
})();

