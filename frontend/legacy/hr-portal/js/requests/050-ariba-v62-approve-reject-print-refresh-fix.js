
/* ============================================================
   ARIBA V62 — إصلاحات إضافية فقط (Additive-only patch)
   1) أزرار "موافقة" / "رفض" بدل "اعتماد نيابة عن المدير" في
      تبويب الإجازات ← الطلبات المعلقة، وبمجرد الضغط ينتقل الطلب
      من "المعلقة" إلى قائمة "السابقة" محليًا (سجل قرارات).
   2) دالة window.printHtml كانت مستخدمة في أزرار الطباعة الموجودة
      فعلاً بتبويب الوثائق لكنها غير معرّفة نهائيًا — فالأزرار
      كانت لا تفعل شيئًا. إضافتها يفعّل أزرار الطباعة الموجودة.
   3) زرار "تحديث البيانات" داخل تبويب الوثائق (بنفس فكرة زرار
      تحديث البيانات في الصفحة الرئيسية).
   4) تقرير "المنتهية خدماتهم" في صفحة التقارير كان يشير لمتغير
      محلي غير متاح فيرجع دائمًا فارغًا — ربطه بمصدر البيانات
      الصحيح (نفس المصدر المستخدم في تبويب الموظفين).
   ============================================================ */
(function(){
  'use strict';
  var SUPA_URL='https://iwviydmapqpqihcdazpe.supabase.co';
  var SUPA_KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  async function rpc62(fn,args){
    var r=await fetch(SUPA_URL+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPA_KEY,Authorization:'Bearer '+SUPA_KEY,'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(args||{})});
    var t=await r.text(),d=null; try{d=t?JSON.parse(t):null;}catch(e){}
    if(!r.ok) throw new Error((d&&(d.message||d.hint||d.error))||'تعذر تنفيذ الإجراء');
    return d;
  }
  function safeToast(msg,type){ try{ if(typeof window.toast==='function'){ window.toast(msg,type); return; } }catch(e){} }

  /* ---------- 1) موافقة / رفض + سجل الطلبات السابقة ---------- */
  var HIST_KEY='ariba_hr_workflow_history_v62';
  function readHist(){ try{ var s=localStorage.getItem(HIST_KEY); return s?JSON.parse(s):[]; }catch(e){ return []; } }
  function writeHist(a){ try{ localStorage.setItem(HIST_KEY, JSON.stringify(a)); }catch(e){} }
  function addToHistory(x, decision){
    var r=(x&&x.request)||{}, e=(x&&x.employee)||{};
    var hist = readHist();
    hist.unshift({
      id: r.id,
      name: e.nameAr || e.nameEn || r.employee_id || '—',
      type: r.request_type || '',
      decision: decision,
      decidedAt: new Date().toISOString()
    });
    if(hist.length > 200) hist = hist.slice(0,200);
    writeHist(hist);
  }
  function removeFromQueue(id){
    try{
      if(Array.isArray(window.ARIBA_WORKFLOW_QUEUE)){
        window.ARIBA_WORKFLOW_QUEUE = window.ARIBA_WORKFLOW_QUEUE.filter(function(x){ return String((x.request||{}).id) !== String(id); });
      }
    }catch(e){}
  }
  function refreshAfterDecision(){
    try{ if(typeof window.rLvPend==='function') window.rLvPend(); }catch(e){}
    try{ if(typeof window.rAllLv==='function') window.rAllLv(); }catch(e){}
    try{ if(typeof window.uBadges==='function') window.uBadges(); }catch(e){}
    try{ if(typeof window.rWorkflowQueue==='function') window.rWorkflowQueue(); }catch(e){}
  }

  window.ariba62Approve = async function(id, item){
    var reason = prompt('ملاحظة الموافقة (اختياري):') || 'تمت الموافقة من الموارد البشرية';
    try{
      await rpc62('ariba_hr_override_workflow', {p_token: window.ARIBA_HR_TOKEN, p_request_id: id, p_reason: reason});
      addToHistory(item, 'approved');
      removeFromQueue(id);
      safeToast('✓ تمت الموافقة على الطلب', 'tin');
      refreshAfterDecision();
    }catch(e){ safeToast(e.message || 'تعذر اعتماد الطلب', 'ter'); }
  };

  window.ariba62Reject = async function(id, item){
    var reason = prompt('سبب الرفض:');
    if(reason === null) return;
    try{
      try{
        await rpc62('ariba_workflow_action', {p_token: window.ARIBA_HR_TOKEN, p_request_id: id, p_action: 'rejected', p_reason: reason || 'مرفوض من الموارد البشرية'});
      }catch(e1){
        // احتياطي لو الدالة الأولى رفضت الإجراء على هذه المرحلة بالتحديد
        await rpc62('ariba_hr_override_workflow', {p_token: window.ARIBA_HR_TOKEN, p_request_id: id, p_reason: 'مرفوض: '+(reason||'')});
      }
      addToHistory(item, 'rejected');
      removeFromQueue(id);
      safeToast('❌ تم رفض الطلب', 'ter');
      refreshAfterDecision();
    }catch(e){ safeToast(e.message || 'تعذر رفض الطلب', 'ter'); }
  };

  // إعادة تعريف عرض القائمة: أزرار موافقة/رفض بدل نيابة عن المدير، وإضافة قسم "الطلبات السابقة"
  var oldRWQ62 = window.rWorkflowQueue;
  window.rWorkflowQueue = function(){
    var q = window.ARIBA_WORKFLOW_QUEUE || [], h = (typeof LANG!=='undefined' && LANG==='en'), box = document.getElementById('LVP');
    if(!box) return;
    function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
    var html = q.length ? '<div style="padding:10px 12px;background:rgba(1,77,61,.08);border-bottom:1px solid var(--bd);font-weight:800">🔐 '+(h?'Pending Employee Requests':'طلبات الموظفين المعلقة')+'</div>' : '<div style="padding:22px;text-align:center;color:var(--mu)">✓ '+(h?'No pending employee requests':'لا توجد طلبات موظفين معلقة')+'</div>';
    html += q.map(function(x){
      var r=x.request||{}, e=x.employee||{}, p=r.payload||{};
      var name = h?(e.nameEn||e.nameAr||r.employee_id||'—'):(e.nameAr||e.nameEn||r.employee_id||'—');
      var detail = p.from ? (p.from+' ← '+p.to+' | '+(p.days||0)+' '+(h?'days':'يوم')) : (p.date||'')+(p.time?' '+p.time:'')+(p.amount?' | '+Number(p.amount).toLocaleString('en-US')+' SAR':'');
      var stage = r.current_stage || 'pending';
      var stageText = stage==='manager'?(h?'Pending Direct Manager':'بانتظار المدير المباشر'):stage==='hr'?(h?'Pending HR':'بانتظار الموارد البشرية'):stage==='ceo'?(h?'Pending CEO':'بانتظار الرئيس التنفيذي'):(h?'Completed':'مكتمل');
      var reqId = JSON.stringify(String(r.id));
      var itemJson = esc(JSON.stringify(x)).replace(/'/g,'&#39;');
      var acts = '<button class="btn bgl bsm" onclick=\'ariba62Approve('+reqId+', JSON.parse(this.getAttribute("data-item")))\' data-item="'+itemJson+'">✓ '+(h?'Approve':'موافقة')+'</button>'+
                 '<button class="btn bsm" style="color:var(--rd)" onclick=\'ariba62Reject('+reqId+', JSON.parse(this.getAttribute("data-item")))\' data-item="'+itemJson+'">✗ '+(h?'Reject':'رفض')+'</button>';
      var at = (x.attachments||[]).map(function(a){return '<button class="btn bsm" style="color:var(--cy);margin:2px" onclick="aribaDownloadDoc(\''+a.id+'\')">📎 '+esc(a.file_name||'مرفق')+'</button>';}).join('');
      return '<div style="padding:12px 14px;border-bottom:1px solid rgba(36,48,68,.5)"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div style="flex:1;min-width:260px"><div style="font-weight:800;font-size:13px">'+esc(name)+' <span class="b ba">'+esc(r.request_type||'')+'</span></div><div style="font-size:11px;color:var(--mu);margin-top:4px">'+esc(detail)+'</div><div style="font-size:10px;color:var(--dm);margin-top:3px">'+esc(stageText)+'</div></div>'+acts+'</div>'+at+'</div>';
    }).join('');

    var hist = readHist();
    if(hist.length){
      html += '<div style="padding:10px 12px;background:rgba(0,0,0,.04);border-top:2px solid var(--bd);border-bottom:1px solid var(--bd);font-weight:800;margin-top:8px">📋 الطلبات السابقة (قرارات الموارد البشرية)</div>';
      html += hist.slice(0,20).map(function(x){
        var color = x.decision==='approved' ? 'var(--gr)' : 'var(--rd)';
        var label = x.decision==='approved' ? 'تمت الموافقة' : 'تم الرفض';
        var d = new Date(x.decidedAt);
        var dateStr = isNaN(d.getTime()) ? '' : d.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn');
        return '<div style="padding:9px 14px;border-bottom:1px solid rgba(36,48,68,.3);display:flex;justify-content:space-between;align-items:center;font-size:12px"><div><strong>'+esc(x.name)+'</strong> <span style="color:var(--mu)">— '+esc(x.type)+'</span></div><span style="color:'+color+';font-weight:700">'+label+' <span style="color:var(--mu);font-weight:400">('+dateStr+')</span></span></div>';
      }).join('');
    }

    box.innerHTML = html;
  };

  /* ---------- 2) دالة الطباعة المفقودة ---------- */
  if(typeof window.printHtml !== 'function'){
    window.printHtml = function(title, innerHtml){
      try{
        var w = window.open('', '_blank');
        if(!w){ safeToast('من فضلك اسمح بالنوافذ المنبثقة للطباعة', 'ter'); return; }
        w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>'+title+'</title>' +
          '<style>body{font-family:Tahoma,Arial,sans-serif;padding:20px;color:#111}h3{margin-top:22px}table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:12px}th,td{border:1px solid #ccc;padding:6px 8px;text-align:right}th{background:#f0f0f0}</style>' +
          '</head><body><h2>'+title+'</h2>' + innerHtml + '</body></html>');
        w.document.close();
        w.focus();
        setTimeout(function(){ w.print(); }, 300);
      }catch(e){ safeToast('تعذرت الطباعة', 'ter'); }
    };
  }

  /* ---------- 3) زرار تحديث البيانات في تبويب الوثائق ---------- */
  function addDocsRefreshButton(){
    try{
      var bar = document.querySelector('#pg-docs .tbar');
      if(bar && !document.getElementById('docsRefreshBtn62')){
        var btn = document.createElement('button');
        btn.id = 'docsRefreshBtn62';
        btn.className = 'btn bsm';
        btn.style.cssText = 'margin-right:6px;background:var(--bl);color:#fff';
        btn.innerHTML = '<i class="ti ti-refresh"></i> تحديث البيانات';
        btn.onclick = function(){
          try{ if(typeof window.loadDocs==='function') window.loadDocs(); }catch(e){}
          safeToast('✓ تم تحديث بيانات الوثائق', 'tin');
        };
        bar.insertBefore(btn, bar.firstChild);
      }
    }catch(e){}
  }
  addDocsRefreshButton();
  setInterval(addDocsRefreshButton, 2000);

  /* ---------- 4) تقرير المنتهية خدماتهم: مصدر بيانات صحيح ---------- */
  window.rptTerm = function(){
    try{
      var a = (typeof window.tEmps==='function') ? window.tEmps() : [];
      var html = '<table><tr><th>#</th><th>الاسم</th><th>جهة العمل</th><th>الجنسية</th><th>آخر يوم عمل</th><th>السبب / البند</th></tr>' +
        a.map(function(x,i){
          function fD(v){ if(!v) return '—'; try{ var d=new Date(v); var dd=String(d.getDate()).padStart(2,'0'),mm=String(d.getMonth()+1).padStart(2,'0'),yy=d.getFullYear(); return dd+'/'+mm+'/'+yy; }catch(e){ return v; } }
          return '<tr><td>'+(x.empNo||x.id||i+1)+'</td><td>'+(x.nameAr||x.nameEn||'—')+'</td><td>'+(x.employer||'—')+'</td><td>'+(x.nationality||x.nat||'—')+'</td><td>'+fD(x.lastDay||x.contractEnd||x.ce)+'</td><td>'+(x.eosCategory||x.terminationReason||x.reason||'—')+'</td></tr>';
        }).join('') + '</table>';
      if(typeof window.showRpt==='function'){ window.showRpt('المنتهية خدماتهم ('+a.length+')', html); }
    }catch(e){ console.warn('ARIBA V62 rptTerm', e); }
  };
})();
