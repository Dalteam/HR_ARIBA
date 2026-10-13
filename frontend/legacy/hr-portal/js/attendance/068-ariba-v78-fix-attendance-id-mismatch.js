
/* ============================================================
   ARIBA V78 — إصلاح جذري: مزامنة الحضور كانت بتجيب بيانات صح
   من السحابة، لكن معرّف الموظف السحابي (رقم بسيط زي "100") ما
   كانش بيتطابق مع معرّف نفس الموظف محليًا (زي "XLS-aaa410..")
   لأن الموظفين المستوردين من إكسل معرّفاتهم المحلية مختلفة عن
   المعرّفات اللي اتولدت لهم سحابيًا وقت المزامنة. فكانت الحضور
   توصل لكن تفضل "غير مطابقة" فمحدش يظهر حاضر.
   الحل: إعادة بناء دالة مزامنة الحضور بحيث تربط كل سجل حضور
   بالموظف المحلي الصحيح عن طريق الرقم الوظيفي (empNo) كمان،
   مش المعرّف بس. بدون تعديل أي معادلة حساب موجودة.
   ============================================================ */
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  window.syncSecureAttendance = async function(){
    if(!window.ARIBA_HR_TOKEN) return {ok:false, reason:'NO_TOKEN'};
    if(window.ARIBA_HR_TOKEN === 'local_admin_token') return {ok:false, reason:'LOCAL_ONLY'};
    try{
      var dateVal = (document.getElementById('AD') && document.getElementById('AD').value) || (typeof tod==='function' ? tod() : new Date().toISOString().slice(0,10));
      var r = await fetch(CLOUD_URL+'/rest/v1/rpc/ariba_staff_attendance', {
        method:'POST',
        headers:{apikey:CLOUD_KEY, Authorization:'Bearer '+CLOUD_KEY, 'Content-Type':'application/json', 'Prefer':'return=representation'},
        body: JSON.stringify({p_token: window.ARIBA_HR_TOKEN, p_date: dateVal})
      });
      var t = await r.text(), d = null;
      try{ d = t ? JSON.parse(t) : null; }catch(ex){}
      if(!r.ok) return {ok:false, reason:'HTTP_ERROR', status:r.status, detail:(d && (d.message||d.hint||d.error)) || t};
      var records = (d && d.attendance) || [];

      // بناء جدول مطابقة: الرقم الوظيفي (empNo) ← المعرّف المحلي
      var list = (typeof window.aEmps === 'function') ? window.aEmps() : [];
      var byEmpNo = {}, byId = {};
      list.forEach(function(e){
        if(e.empNo != null) byEmpNo[String(e.empNo)] = e.id;
        byId[String(e.id)] = e.id;
      });

      function resolveLocalId(cloudEmployeeId){
        // لو المعرّف السحابي نفسه موجود محليًا (موظف متزامن بنفس المعرّف)، استخدمه مباشرة
        if(byId[String(cloudEmployeeId)]) return cloudEmployeeId;
        // غير كده، طابق بالرقم الوظيفي
        if(byEmpNo[String(cloudEmployeeId)]) return byEmpNo[String(cloudEmployeeId)];
        return cloudEmployeeId; // ما لقيناش تطابق، سيبه زي ما هو
      }

      // تجميع السجلات: لو الموظف بصم أكتر من مرة في نفس اليوم (فطرة غداء
      // مثلاً)، نجمعهم في سجل واحد معروض (أول حضور، آخر انصراف، مجموع الساعات)
      var byEmpDate = {};
      records.forEach(function(x){
        var localId = resolveLocalId(x.employee_id);
        var key = localId + '|' + x.attendance_date;
        var sessHours = (x.time_in && x.time_out) ? ((new Date('1970-01-01T'+x.time_out) - new Date('1970-01-01T'+x.time_in))/3600000) : 0;
        if(!byEmpDate[key]){
          byEmpDate[key] = {
            id: x.id, empId: localId, date: x.attendance_date,
            timeIn: x.time_in, timeOut: x.time_out,
            status: x.status, late_minutes: x.late_minutes, early_minutes: x.early_minutes,
            locId: x.location_id, location_name: x.location_name, lat: x.latitude, lng: x.longitude,
            hours: sessHours, sessionCount: 1
          };
        }else{
          var g = byEmpDate[key];
          g.sessionCount += 1;
          if(x.time_in && x.time_in < g.timeIn) g.timeIn = x.time_in;
          if(x.time_out===null || (g.timeOut!==null && x.time_out>g.timeOut)) g.timeOut = x.time_out;
          g.hours = Math.round((g.hours + sessHours)*100)/100;
          if(x.late_minutes>0) g.late_minutes = g.late_minutes>0 ? Math.min(g.late_minutes,x.late_minutes) : x.late_minutes;
          if(x.early_minutes>0 && (g.timeOut===x.time_out)) g.early_minutes = x.early_minutes;
          if(x.status==='late') g.status='late';
        }
      });
      var mapped = Object.values(byEmpDate).map(function(g){
        g.hours = Math.round(g.hours*100)/100;
        if(g.sessionCount>1) g.location_name = (g.location_name||'') + ' (× '+g.sessionCount+' بصمات)';
        return g;
      });
      if(typeof window.dbS === 'function') window.dbS('att', mapped);
      if(typeof window.rAtt === 'function') window.rAtt();
      return {ok:true, count: mapped.length, date: dateVal};
    }catch(e){ return {ok:false, reason:'EXCEPTION', detail: e.message}; }
  };
})();
