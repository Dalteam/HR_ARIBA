
/* ============================================================
   ARIBA V83 — إضافة فقط: شاشة إدارة صلاحيات الموظفين في تبويب
   "الإعدادات" — اختيار موظف، تحديد صلاحيته (موظف/مدير/مالية/
   موارد بشرية/رئيس تنفيذي/Admin)، وحفظها مباشرة، مع جدول يعرض
   كل الصلاحيات الحالية.
   ============================================================ */
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  async function cloudRpc83(fn, args){
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

  var ROLE_LABELS = {employee:'موظف عادي', manager:'مدير', finance:'مالية', hr:'موارد بشرية', ceo:'رئيس تنفيذي', admin:'مدير عام (كل الصلاحيات)'};

  function empsList83(){
    try{
      var a = (typeof window.v60all === 'function') ? window.v60all() : [];
      if(Array.isArray(a) && a.length) return a;
    }catch(e){}
    try{
      var b = (typeof window.aEmps === 'function') ? window.aEmps() : [];
      if(Array.isArray(b) && b.length) return b;
    }catch(e){}
    return [];
  }

  function buildCard(){
    var card = document.createElement('div');
    card.className = 'card';
    card.id = 'V83_ROLES_CARD';
    card.style.cssText = 'padding:12px;margin-top:12px';
    card.innerHTML =
      '<div class="ct" style="margin-bottom:8px"><i class="ti ti-shield-lock"></i> صلاحيات المستخدمين</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px">'+
        '<div style="flex:1;min-width:220px"><label style="font-size:10px;color:var(--mu);display:block;margin-bottom:2px">الموظف</label>'+
          '<select id="V83_EMP" style="width:100%"></select></div>'+
        '<div style="min-width:180px"><label style="font-size:10px;color:var(--mu);display:block;margin-bottom:2px">الصلاحية الجديدة</label>'+
          '<select id="V83_ROLE" style="width:100%">'+
            Object.keys(ROLE_LABELS).map(function(k){ return '<option value="'+k+'">'+ROLE_LABELS[k]+'</option>'; }).join('')+
          '</select></div>'+
        '<button class="btn bsm" style="background:#014D3D;color:#fff" onclick="v83SaveRole()"><i class="ti ti-device-floppy"></i> حفظ</button>'+
      '</div>'+
      '<div id="V83_CURRENT" style="font-size:11px;color:var(--mu);margin-bottom:10px"></div>'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'+
        '<b style="font-size:12px">الصلاحيات الحالية لكل المستخدمين</b>'+
        '<button class="btn bsm" onclick="v83RefreshList()"><i class="ti ti-refresh"></i> تحديث القائمة</button>'+
      '</div>'+
      '<div id="V83_LIST" style="max-height:280px;overflow-y:auto"></div>';
    return card;
  }

  function populateSelect83(){
    var sel = document.getElementById('V83_EMP'); if(!sel) return;
    var cur = sel.value;
    var list = empsList83();
    sel.innerHTML = '<option value="">— اختر الموظف —</option>' + list.map(function(e){
      return '<option value="'+e.id+'">'+(e.nameAr||e.nameEn||e.id)+'</option>';
    }).join('');
    if(cur) sel.value = cur;
  }

  window.v83SaveRole = async function(){
    var empSel = document.getElementById('V83_EMP');
    var roleSel = document.getElementById('V83_ROLE');
    if(!empSel || !empSel.value){ if(typeof toast==='function') toast('اختر الموظف أولاً', 'ter'); return; }
    var list = empsList83();
    var e = list.find(function(x){ return String(x.id) === String(empSel.value); });
    var lookupId = e && e.empNo != null ? String(e.empNo) : empSel.value;
    try{
      var res = await cloudRpc83('ariba_hr_set_role', {p_employee_id: lookupId, p_role: roleSel.value});
      if(typeof toast==='function') toast('✓ تم ضبط الصلاحية: '+ROLE_LABELS[roleSel.value], 'tin');
      window.v83RefreshList();
    }catch(err){
      if(typeof toast==='function') toast('⚠️ '+(err.message||'تعذر الحفظ'), 'ter');
    }
  };

  window.v83RefreshList = async function(){
    var box = document.getElementById('V83_LIST'); if(!box) return;
    box.innerHTML = '<div style="padding:10px;text-align:center;color:var(--mu);font-size:11px">جاري التحميل...</div>';
    try{
      var rows = await cloudRpc83('ariba_hr_list_roles', {});
      if(!rows || !rows.length){ box.innerHTML = '<div style="padding:10px;text-align:center;color:var(--mu);font-size:11px">لا توجد بيانات</div>'; return; }
      box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px">'+
        '<tr style="color:var(--mu);text-align:right"><th style="padding:5px">الاسم</th><th style="padding:5px">اليوزر</th><th style="padding:5px">الصلاحية</th></tr>'+
        rows.map(function(r){
          return '<tr style="border-top:1px solid var(--bd)">'+
            '<td style="padding:5px">'+(r.name_ar||r.employee_id)+'</td>'+
            '<td style="padding:5px;font-family:monospace">'+r.username+'</td>'+
            '<td style="padding:5px"><b>'+(ROLE_LABELS[r.role]||r.role)+'</b></td>'+
          '</tr>';
        }).join('')+
      '</table>';
    }catch(err){
      box.innerHTML = '<div style="padding:10px;text-align:center;color:var(--rd);font-size:11px">'+(err.message||'تعذر التحميل')+'</div>';
    }
  };

  function ensureCard83(){
    try{
      var page = document.getElementById('pg-set');
      if(page && !document.getElementById('V83_ROLES_CARD')){
        page.appendChild(buildCard());
        var sel = document.getElementById('V83_EMP');
        if(sel){
          sel.onchange = function(){
            var list = empsList83();
            var e = list.find(function(x){ return String(x.id) === String(sel.value); });
            var box = document.getElementById('V83_CURRENT');
            box.textContent = '';
          };
        }
      }
      populateSelect83();
    }catch(e){}
  }
  setInterval(ensureCard83, 1500);
})();
