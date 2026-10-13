
/* ============================================================
   ARIBA V65 — إضافة فقط، مستقلة تمامًا
   بصمة الحضور والانصراف من تطبيق الموظف بتتسجل في قاعدة بيانات
   سحابية مشتركة بالفعل. هذا الباتش يقرأها ويعرضها في "سجل الحضور"
   بالموارد البشرية تلقائيًا كل 30 ثانية، بكود مستقل تمامًا عشان
   ميعتمدش على أي كود قديم تاني بالملف.
   ============================================================ */
(function(){
  'use strict';
  var SUPA_URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var SUPA_KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  async function rpc65(fn,args){
    var r=await fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});
    var t=await r.text(),d=null; try{d=t?JSON.parse(t):null;}catch(e){}
    if(!r.ok) throw new Error((d&&(d.message||d.hint||d.error))||'تعذر الاتصال');
    return d;
  }

  async function syncAttendance65(){
    try{
      if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return;
      var dateInput = document.getElementById('AD');
      var date = (dateInput && dateInput.value) || new Date().toISOString().slice(0,10);
      var d = await rpc65('ariba_staff_attendance', {p_token: window.ARIBA_HR_TOKEN, p_date: date});
      var a = (d && d.attendance) || [];
      var mapped = a.map(function(x){
        return {
          id: x.id, empId: x.employee_id, date: x.attendance_date,
          timeIn: x.time_in, timeOut: x.time_out, status: x.status,
          late_minutes: x.late_minutes, early_minutes: x.early_minutes,
          locId: x.location_id, location_name: x.location_name,
          lat: x.latitude, lng: x.longitude,
          hours: (x.time_in && x.time_out) ? Math.round(((new Date('1970-01-01T'+x.time_out) - new Date('1970-01-01T'+x.time_in)) / 3600000) * 100) / 100 : 0
        };
      });
      if(typeof window.dbS === 'function') window.dbS('att', mapped);
      if(typeof window.rAtt === 'function') window.rAtt();
    }catch(e){ /* صامت: لو التوكن غير صالح أو الشبكة غير متاحة، لا داعي لإزعاج المستخدم كل 30 ثانية */ }
  }

  window.aribaStandaloneAttendanceSync = syncAttendance65;
  setTimeout(syncAttendance65, 3000);
  setInterval(syncAttendance65, 30000);
})();
