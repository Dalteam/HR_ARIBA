
/* ============================================================
   ARIBA V67 — إضافة فقط
   1) سنوات كشف الراتب كانت محدودة جدًا (5 سنوات بس). توسيعها
      لعدد أكبر بكتير من السنوات.
   2) تبويب الإجازات ← "كل الطلبات": كان بيعرض بس السجلات المحلية
      القديمة + الطلبات السحابية المعلقة فقط (بدون فلترة بالموظف
      المختار)، فأي طلب سحابي خلص واتوافق عليه كان يختفي تمامًا
      ولا يظهر لأي موظف. الحل: جلب كل الطلبات السحابية (بكل حالاتها:
      معلقة/موافق عليها/مرفوضة) واحترام فلتر الموظف المختار في نفس
      الشاشة، بنفس الطريقة اللي بيشتغل بيها فلتر الموظف على البيانات
      المحلية بالظبط.
   ============================================================ */
(function(){
  'use strict';
  var SUPA_URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var SUPA_KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  async function rpc67(fn,args){
    var r=await fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});
    var t=await r.text(),d=null; try{d=t?JSON.parse(t):null;}catch(e){}
    if(!r.ok) throw new Error((d&&(d.message||d.hint||d.error))||'تعذر الاتصال');
    return d;
  }

  /* ---------- 1) سنوات أكتر لكشف الراتب ---------- */
  function widenSlipYears(){
    try{
      var y = document.getElementById('SLY');
      if(!y || y.getAttribute('data-v67-done')) return;
      y.innerHTML = '';
      var cy = new Date().getFullYear();
      for(var yy = cy - 15; yy <= cy + 10; yy++){
        var o = document.createElement('option');
        o.value = yy; o.textContent = yy;
        if(yy === cy) o.selected = true;
        y.appendChild(o);
      }
      y.setAttribute('data-v67-done', '1');
    }catch(e){}
  }
  widenSlipYears();
  setInterval(widenSlipYears, 1500);

  /* ---------- 2) كل الطلبات: جلب كل الحالات + احترام فلتر الموظف ---------- */
  window.ARIBA_ALL_CLOUD_REQUESTS = window.ARIBA_ALL_CLOUD_REQUESTS || [];

  async function loadAllCloudRequests(){
    if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token') return [];
    try{
      var d = await rpc67('ariba_staff_requests', {p_token: window.ARIBA_HR_TOKEN});
      window.ARIBA_ALL_CLOUD_REQUESTS = (d && d.requests) || [];
    }catch(e){ /* صامت */ }
    return window.ARIBA_ALL_CLOUD_REQUESTS;
  }

  function esc67(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

  function renderAllCloudSection(){
    try{
      var box = document.getElementById('LAT');
      if(!box) return;
      // إزالة أي قسم سحابي إضافي كنا ضفناه قبل كده لتجنب التكرار
      var oldExtra = document.getElementById('v67CloudAllBox');
      if(oldExtra) oldExtra.remove();

      var ef = document.getElementById('LFE') ? document.getElementById('LFE').value : '';
      var sf = document.getElementById('LFS') ? document.getElementById('LFS').value : '';
      var h = (typeof LANG !== 'undefined' && LANG === 'en');

      var list = (window.ARIBA_ALL_CLOUD_REQUESTS || []).filter(function(x){
        var r = x.request || {}, e = x.employee || {};
        var eid = String(r.employee_id || e.id || '');
        var status = String(r.status || '').toLowerCase();
        if(ef && eid !== String(ef)) return false;
        if(sf && status !== sf) return false;
        return true;
      });

      if(!list.length) return; // مفيش حاجة سحابية تتضاف تحت الجدول المحلي

      var stB = {pending:'<span class="b ba">'+(h?'Pending':'معلق')+'</span>', approved:'<span class="b bg">'+(h?'Approved':'موافق')+'</span>', rejected:'<span class="b br">'+(h?'Rejected':'مرفوض')+'</span>'};

      var html = '<div id="v67CloudAllBox" class="card" style="margin-top:12px"><div class="ct" style="padding:10px 12px">🔐 '+(h?'Cloud Requests (Employee App)':'طلبات سحابية (تطبيق الموظف)')+'</div><div class="tw"><table><tr><th>'+(h?'Employee':'الموظف')+'</th><th>'+(h?'Type':'النوع')+'</th><th>'+(h?'Details':'التفاصيل')+'</th><th>'+(h?'Status':'الحالة')+'</th></tr>';
      html += list.map(function(x){
        var r = x.request || {}, e = x.employee || {}, p = r.payload || {};
        var name = h ? (e.nameEn || e.nameAr || r.employee_id || '—') : (e.nameAr || e.nameEn || r.employee_id || '—');
        var detail = p.from ? (p.from + ' ← ' + p.to + ' | ' + (p.days || 0) + ' ' + (h?'days':'يوم')) : (p.date || '') + (p.amount ? ' | ' + Number(p.amount).toLocaleString('en-US') + ' SAR' : '');
        var status = String(r.status || 'pending').toLowerCase();
        return '<tr><td style="font-weight:600">' + esc67(name) + '</td><td>' + esc67(r.request_type || '') + '</td><td>' + esc67(detail) + '</td><td>' + (stB[status] || esc67(status)) + '</td></tr>';
      }).join('') + '</table></div></div>';

      box.insertAdjacentHTML('afterend', html);
    }catch(e){ console.warn('ARIBA V67 all requests', e); }
  }

  var oldRAllLv67 = window.rAllLv;
  window.rAllLv = function(){
    var r = (typeof oldRAllLv67 === 'function') ? oldRAllLv67.apply(this, arguments) : undefined;
    loadAllCloudRequests().then(renderAllCloudSection);
    return r;
  };

  // تحديث قائمة "كل الموظفين" في فلتر الطلبات لتشمل موظفين لهم طلبات سحابية حتى لو مش في القائمة المحلية
  async function ensureEmployeeFilterOptions(){
    try{
      var sel = document.getElementById('LFE');
      if(!sel) return;
      await loadAllCloudRequests();
      var have = {};
      Array.prototype.forEach.call(sel.options, function(o){ have[o.value] = true; });
      (window.ARIBA_ALL_CLOUD_REQUESTS || []).forEach(function(x){
        var r = x.request || {}, e = x.employee || {};
        var eid = String(r.employee_id || e.id || '');
        if(eid && !have[eid]){
          var o = document.createElement('option');
          o.value = eid;
          o.textContent = e.nameAr || e.nameEn || eid;
          sel.appendChild(o);
          have[eid] = true;
        }
      });
    }catch(e){}
  }

  var oldShowPg67 = window.showPg;
  if(typeof oldShowPg67 === 'function' && !oldShowPg67.__v67){
    window.showPg = function(id, el){
      var r = oldShowPg67.apply(this, arguments);
      if(id === 'lv'){ setTimeout(ensureEmployeeFilterOptions, 400); setTimeout(function(){ if(typeof window.rAllLv==='function') window.rAllLv(); }, 500); }
      if(id === 'slip'){ setTimeout(widenSlipYears, 60); }
      return r;
    };
    window.showPg.__v67 = true;
  }
})();
