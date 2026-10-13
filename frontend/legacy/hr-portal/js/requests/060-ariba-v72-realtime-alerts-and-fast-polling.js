
/* ============================================================
   ARIBA V72 — إضافة فقط: تسريع المزامنة + تنبيهات فورية
   1) يقلل فترة تحديث الحضور والطلبات من 20-30 ثانية إلى 8 ثواني
   2) عند وصول بصمة جديدة أو طلب جديد أو قرار موافقة/رفض على
      نموذج، يظهر إشعار (toast) فوري بدل التحديث الصامت
   3) بانر تحذير واضح وثابت لو الدخول محلي فقط (مش سحابي حقيقي)
      عشان يبقى واضح ليه المزامنة الفورية مش شغالة
   ============================================================ */
(function(){
  'use strict';
  var SUPA_URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var SUPA_KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var FAST_MS = 8000;

  async function rpc72(fn,args){
    var r=await fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});
    var t=await r.text(),d=null; try{d=t?JSON.parse(t):null;}catch(e){}
    if(!r.ok) throw new Error((d&&(d.message||d.hint||d.error))||'تعذر الاتصال');
    return d;
  }

  /* ---------- بانر تنبيه لو الدخول محلي فقط ---------- */
  function ensureBanner(){
    var isLocal = !window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token';
    var el = document.getElementById('v72LocalBanner');
    if(isLocal){
      if(!el){
        el = document.createElement('div');
        el.id = 'v72LocalBanner';
        el.style.cssText = 'position:fixed;top:0;inset-inline:0;z-index:99999;background:#c0392b;color:#fff;text-align:center;padding:7px 10px;font-size:12px;font-weight:700';
        el.innerHTML = '⚠️ أنت مسجّل دخول محلي فقط — الإشعارات الفورية ومزامنة الحضور والطلبات معطّلة الآن. سجّل دخول سحابي حقيقي (يوزر وباسورد حقيقيين) لتفعيلها.';
        document.body.appendChild(el);
      }
    } else if(el){ el.remove(); }
  }

  /* ---------- تحديث سريع للحضور + تنبيه ببصمة جديدة ---------- */
  var lastAttIds = null;
  async function fastAttendance(){
    try{
      if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return;
      var dateInput = document.getElementById('AD');
      var date = (dateInput && dateInput.value) || new Date().toISOString().slice(0,10);
      var d = await rpc72('ariba_staff_attendance', {p_token: window.ARIBA_HR_TOKEN, p_date: date});
      var a = (d && d.attendance) || [];
      var curIds = new Set(a.map(function(x){ return String(x.id); }));
      if(lastAttIds !== null){
        var newOnes = a.filter(function(x){ return !lastAttIds.has(String(x.id)); });
        if(newOnes.length && typeof toast === 'function'){
          newOnes.forEach(function(x){
            toast('🟢 بصمة جديدة: موظف #'+(x.employee_id||'')+' — '+(x.location_name||''), 'tin');
          });
        }
      }
      lastAttIds = curIds;
      var mapped = a.map(function(x){
        return { id:x.id, empId:x.employee_id, date:x.attendance_date, timeIn:x.time_in, timeOut:x.time_out,
          status:x.status, late_minutes:x.late_minutes, early_minutes:x.early_minutes, locId:x.location_id,
          location_name:x.location_name, lat:x.latitude, lng:x.longitude,
          hours:(x.time_in && x.time_out) ? Math.round(((new Date('1970-01-01T'+x.time_out) - new Date('1970-01-01T'+x.time_in)) / 3600000) * 100) / 100 : 0 };
      });
      if(typeof window.dbS === 'function') window.dbS('att', mapped);
      if(typeof window.rAtt === 'function') window.rAtt();
    }catch(e){}
  }

  /* ---------- تحديث سريع للطلبات المعلقة + تنبيه بطلب جديد ---------- */
  var lastReqIds = null;
  async function fastRequests(){
    try{
      if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return;
      if(typeof window.loadWorkflowQueue !== 'function') return;
      await window.loadWorkflowQueue();
      var q = window.ARIBA_APPROVAL_QUEUE || [];
      var curIds = new Set(q.map(function(x){ return String(x.id||x.request_id||''); }));
      if(lastReqIds !== null){
        var newOnes = q.filter(function(x){ return !lastReqIds.has(String(x.id||x.request_id||'')); });
        if(newOnes.length && typeof toast === 'function'){
          toast('📩 وصل '+newOnes.length+' طلب جديد من الموظفين', 'tin');
        }
      }
      lastReqIds = curIds;
      if(typeof window.rWorkflowQueue === 'function') window.rWorkflowQueue();
      if(typeof window.uBadges === 'function') window.uBadges();
    }catch(e){}
  }

  /* ---------- تنبيه بقرارات الموظفين على النماذج (موافقة/رفض) ---------- */
  var lastTplStatuses = null;
  async function fastTemplateStatus(){
    try{
      if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return;
      var list = await rpc72('ariba_hr_template_status', {p_token: window.ARIBA_HR_TOKEN});
      if(!Array.isArray(list)) return;
      var curMap = {};
      list.forEach(function(x){ curMap[x.request_id] = x.status; });
      if(lastTplStatuses !== null){
        Object.keys(curMap).forEach(function(rid){
          var prevStatus = lastTplStatuses[rid];
          var nowStatus = curMap[rid];
          if(prevStatus === 'pending' && nowStatus !== 'pending' && typeof toast === 'function'){
            var item = list.find(function(x){ return x.request_id === rid; });
            if(nowStatus === 'approved') toast('✅ الموظف وافق على: '+(item ? (item.title||item.template_type) : ''), 'tin');
            else if(nowStatus === 'rejected') toast('⚠️ الموظف رفض: '+(item ? (item.title||item.template_type) : '')+' — السبب: '+(item ? (item.rejection_reason||'') : ''), 'ter');
          }
        });
      }
      lastTplStatuses = curMap;
      if(typeof window.tfRefreshStatus === 'function') window.tfRefreshStatus();
    }catch(e){}
  }

  ensureBanner();
  setInterval(ensureBanner, 3000);
  setTimeout(fastAttendance, 2000);
  setInterval(fastAttendance, FAST_MS);
  setTimeout(fastRequests, 2500);
  setInterval(fastRequests, FAST_MS);
  setTimeout(fastTemplateStatus, 3000);
  setInterval(fastTemplateStatus, FAST_MS);
})();
