
/* ============================================================
   ARIBA EMPLOYEE APP — V3: إضافة إمكانية للموظف يشوف سجل حضوره
   وانصرافه لأي فترة تاريخ يختارها بنفسه، مش بس آخر 31 يوم ثابتة.
   ============================================================ */
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  function esc93(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function fD93(v){ if(!v) return '—'; try{ return new Date(v).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{weekday:'short',year:'numeric',month:'short',day:'numeric'}); }catch(e){ return v; } }
  function fT93(t){ if(!t) return '—'; return String(t).slice(0,5); }

  window.aribaSearchMyAttendance = async function(){
    var fromEl = document.getElementById('V93_FROM');
    var toEl = document.getElementById('V93_TO');
    var box = document.getElementById('V93_RESULTS');
    if(!fromEl.value || !toEl.value){ if(typeof toast==='function') toast('حدد الفترة من وإلى', 'ter'); return; }
    box.innerHTML = '<div style="text-align:center;color:var(--mu);padding:12px;font-size:12px">جاري البحث...</div>';
    try{
      var r = await fetch(CLOUD_URL+'/rest/v1/rpc/ariba_my_attendance_range', {
        method:'POST',
        headers:{apikey:CLOUD_KEY, Authorization:'Bearer '+CLOUD_KEY, 'Content-Type':'application/json', 'Prefer':'return=representation'},
        body: JSON.stringify({p_token: window.ARIBA_SESSION, p_from: fromEl.value, p_to: toEl.value})
      });
      var t = await r.text(), d = null;
      try{ d = t ? JSON.parse(t) : null; }catch(ex){}
      if(!r.ok) throw new Error((d && (d.message||d.hint||d.error)) || 'تعذر البحث');
      var records = d || [];
      if(!records.length){ box.innerHTML = '<div style="text-align:center;color:var(--mu);padding:12px;font-size:12px">لا يوجد سجل حضور في هذه الفترة</div>'; return; }
      box.innerHTML = records.map(function(a){
        var badge = a.status==='late' ? '<span style="color:#c0392b;font-weight:700">متأخر</span>' : '<span style="color:#0a7a3f;font-weight:700">حاضر</span>';
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--bd);font-size:11.5px">'+
          '<span>'+fD93(a.date)+'</span>'+
          '<span>'+fT93(a.time_in)+' → '+fT93(a.time_out)+'</span>'+
          '<span>'+(a.hours||0).toFixed(1)+' س</span>'+
          '<span>'+badge+'</span>'+
        '</div>';
      }).join('');
    }catch(err){
      box.innerHTML = '<div style="text-align:center;color:#c0392b;padding:12px;font-size:12px">'+esc93(err.message||'حدث خطأ')+'</div>';
    }
  };

  function injectLookupCard(){
    try{
      var el = document.getElementById('appContent');
      if(!el || !document.querySelector('.att-big')) return; // مش في تبويب الحضور
      if(document.getElementById('V93_CARD')) return;
      var card = document.createElement('div');
      card.className = 'card';
      card.id = 'V93_CARD';
      var today = new Date().toISOString().slice(0,10);
      var monthAgo = new Date(Date.now() - 30*86400000).toISOString().slice(0,10);
      card.innerHTML =
        '<div class="card-title">🔍 استعلام عن حضور بفترة محددة</div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'+
          '<input type="date" id="V93_FROM" value="'+monthAgo+'" style="flex:1;min-width:120px">'+
          '<input type="date" id="V93_TO" value="'+today+'" style="flex:1;min-width:120px">'+
        '</div>'+
        '<button class="btn btn-success" style="width:100%" onclick="aribaSearchMyAttendance()">بحث</button>'+
        '<div id="V93_RESULTS" style="margin-top:10px"></div>';
      el.appendChild(card);
    }catch(e){}
  }
  setInterval(injectLookupCard, 1200);
})();
