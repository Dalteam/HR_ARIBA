
/* ============================================================
   ARIBA V86 — إضافة فقط: بطاقة "الساعة المرنة" في الإعدادات —
   تفعيل/إلغاء، وتحديد عدد ساعات الدوام (وقت الانصراف المفروض
   = وقت الدخول + عدد الساعات دي، بدل وقت بداية ثابت).
   ============================================================ */
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  async function cloudRpc86(fn, args){
    if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token'){
      throw new Error('محتاج تسجيل دخول سحابي حقيقي');
    }
    var r = await fetch(CLOUD_URL+'/rest/v1/rpc/'+fn, {
      method:'POST',
      headers:{apikey:CLOUD_KEY, Authorization:'Bearer '+CLOUD_KEY, 'Content-Type':'application/json', 'Prefer':'return=representation'},
      body: JSON.stringify(Object.assign({p_token: window.ARIBA_HR_TOKEN}, args||{}))
    });
    var t = await r.text(), d = null;
    try{ d = t ? JSON.parse(t) : null; }catch(ex){}
    if(!r.ok) throw new Error((d && (d.message||d.hint||d.error)) || 'تعذر الاتصال');
    return d;
  }

  function buildCard(){
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'V86_FLEX_CARD';
    card.style.cssText = 'padding:12px;margin-top:12px;max-width:900px';
    card.innerHTML =
      '<div class="ct" style="margin-bottom:8px"><i class="ti ti-clock-hour-4"></i> الساعة المرنة</div>'+
      '<div style="font-size:11.5px;color:var(--mu);margin-bottom:10px">لما تتفعّل، الموظف يدخل أي وقت داخل نطاق الدوام المحدد تحت، ووقت انصرافه المفروض = وقت دخوله + عدد الساعات (مثال: نطاق 8 إلى 5، دوام 8 ساعات → دخل 8 يمشي 4، دخل 9 يمشي 5). لو الدخول هيخلي الانصراف يعدي نهاية النطاق، البصمة بترفض.</div>'+
      '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">'+
        '<div><label style="font-size:10px;color:var(--mu);display:block;margin-bottom:2px">من الساعة</label>'+
          '<input type="time" id="V86_FROM" value="08:00" style="width:110px"></div>'+
        '<div><label style="font-size:10px;color:var(--mu);display:block;margin-bottom:2px">إلى الساعة</label>'+
          '<input type="time" id="V86_TO" value="17:00" style="width:110px"></div>'+
        '<div><label style="font-size:10px;color:var(--mu);display:block;margin-bottom:2px">عدد ساعات الدوام</label>'+
          '<input type="number" id="V86_HOURS" value="8" min="1" max="16" step="0.5" style="width:100px"></div>'+
        '<button class="btn bsm" style="background:#0a7a3f;color:#fff" onclick="v86Toggle(true)"><i class="ti ti-clock-play"></i> تفعيل الساعة المرنة</button>'+
        '<button class="btn bsm" style="background:var(--rd);color:#fff" onclick="v86Toggle(false)"><i class="ti ti-clock-cancel"></i> إلغاء الساعة المرنة</button>'+
      '</div>'+
      '<div id="V86_STATUS" style="margin-top:10px;font-size:12px;font-weight:700"></div>';
    return card;
  }

  window.v86Toggle = async function(enabled){
    var hoursEl = document.getElementById('V86_HOURS');
    var fromEl = document.getElementById('V86_FROM');
    var toEl = document.getElementById('V86_TO');
    var hours = parseFloat(hoursEl.value) || 8;
    var from = (fromEl.value || '08:00') + ':00';
    var to = (toEl.value || '17:00') + ':00';
    try{
      await cloudRpc86('ariba_hr_set_flexible_hours', {p_enabled: enabled, p_shift_hours: hours, p_window_start: from, p_window_end: to});
      if(typeof toast==='function') toast(enabled ? '✓ اتفعّلت الساعة المرنة ('+fromEl.value+' - '+toEl.value+'، '+hours+' ساعات)' : '✓ اتلغت الساعة المرنة، رجعنا لوقت الحضور الثابت', 'tin');
      window.v86RefreshStatus();
    }catch(err){
      if(typeof toast==='function') toast('⚠️ '+(err.message||'تعذر الحفظ'), 'ter');
    }
  };

  window.v86RefreshStatus = async function(){
    var box = document.getElementById('V86_STATUS'); if(!box) return;
    try{
      var res = await cloudRpc86('ariba_get_attendance_settings', {});
      if(res && res.flex_window_start) document.getElementById('V86_FROM').value = String(res.flex_window_start).slice(0,5);
      if(res && res.flex_window_end) document.getElementById('V86_TO').value = String(res.flex_window_end).slice(0,5);
      if(res && res.flexible_enabled){
        box.innerHTML = '<span style="color:#0a7a3f">🟢 الساعة المرنة مفعّلة الآن — نطاق '+String(res.flex_window_start).slice(0,5)+' إلى '+String(res.flex_window_end).slice(0,5)+'، '+res.shift_hours+' ساعات دوام</span>';
        document.getElementById('V86_HOURS').value = res.shift_hours;
      } else {
        box.innerHTML = '<span style="color:var(--mu)">⚪ الساعة المرنة غير مفعّلة (وقت حضور ثابت)</span>';
      }
    }catch(e){}
  };

  function ensureCard86(){
    try{
      var page = document.getElementById('pg-set');
      if(page && !document.getElementById('V86_FLEX_CARD')){
        page.appendChild(buildCard());
      }
      if(page && page.classList.contains('on')) window.v86RefreshStatus();
    }catch(e){}
  }
  setInterval(ensureCard86, 1500);
})();
