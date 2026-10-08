
/* ============================================================
   ARIBA EMPLOYEE APP — V1: مستندات بانتظار توقيعي
   إضافة فقط: تبويب جديد "مستندات" في الشريط السفلي، بيعرض
   النماذج اللي أرسلتها الموارد البشرية (مباشرة عمل، عهدة،
   تمديد/إنهاء فترة التجربة) وتحتاج رد الموظف: موافقة، أو
   رفض (لازم كتابة السبب قبل ما يتقبل الرفض).
   ملحوظة: الكود هنا مستقل تمامًا (مايعتمدش على T()/EN()/esc()
   العامة لأنها غير موثوقة عالميًا في وقت التشغيل)، عشان يشتغل
   بثبات بغض النظر عن أي كود سابق في الملف.
   ============================================================ */
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  function trAr(ar){ return ar; } // عربي دايمًا (لغة الواجهة الأساسية)
  function escLocal(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function safeToast(msg, type){ try{ if(typeof window.toast === 'function') window.toast(msg, type); }catch(e){} }

  async function docsRpc(fn, args){
    if(!window.ARIBA_SESSION) throw new Error('محتاج تسجيل دخول');
    var r = await fetch(CLOUD_URL+'/rest/v1/rpc/'+fn, {
      method:'POST',
      headers:{apikey:CLOUD_KEY, Authorization:'Bearer '+CLOUD_KEY, 'Content-Type':'application/json', 'Prefer':'return=representation'},
      body: JSON.stringify(Object.assign({p_token: window.ARIBA_SESSION}, args||{}))
    });
    var t = await r.text(), d = null;
    try{ d = t ? JSON.parse(t) : null; }catch(ex){}
    if(!r.ok) throw new Error((d && (d.message||d.hint||d.error)) || 'تعذر الاتصال');
    return d;
  }

  var TYPE_LABELS_AR = {onboarding:'مباشرة عمل', custody:'استلام عهدة تقنية', extension:'تمديد فترة التجربة', termination:'إشعار إنهاء فترة التجربة'};
  var TYPE_ICON = {onboarding:'ti-login-2', custody:'ti-device-laptop', extension:'ti-calendar-plus', termination:'ti-calendar-x'};

  function fmtDate(v){ if(!v) return ''; try{ var d=new Date(v); if(isNaN(d.getTime())) return v; var dd=String(d.getDate()).padStart(2,'0'), mm=String(d.getMonth()+1).padStart(2,'0'), yy=d.getFullYear(); return dd+'/'+mm+'/'+yy; }catch(e){ return v; } }

  function installDocsTab(){
    var nav = document.querySelector('.bnav'); if(!nav || document.getElementById('tb-docs')) return;
    var b = document.createElement('button');
    b.className = 'bni'; b.id = 'tb-docs'; b.style.position = 'relative';
    b.onclick = function(){ window.goTab('docs', b); };
    b.innerHTML = '<i class="ti ti-file-text"></i><span>'+trAr('مستندات')+'</span>'+
      '<span id="docsBadge" style="display:none;position:absolute;top:2px;inset-inline-end:14px;background:#e5484d;color:#fff;border-radius:50%;min-width:16px;height:16px;font-size:9px;align-items:center;justify-content:center;padding:0 3px"></span>';
    nav.appendChild(b);
    refreshDocsBadge();
  }

  async function refreshDocsBadge(){
    try{
      if(!window.ARIBA_SESSION) return;
      var list = await docsRpc('ariba_employee_pending_templates', {});
      var badge = document.getElementById('docsBadge');
      if(!badge) return;
      if(list && list.length){ badge.textContent = list.length; badge.style.display = 'flex'; }
      else { badge.style.display = 'none'; }
    }catch(e){}
  }

  window.renderPendingDocs = async function(){
    var el = document.getElementById('appContent'); if(!el) return;
    el.innerHTML = '<div class="card"><div class="card-title">📄 '+trAr('مستندات بانتظار توقيعي')+'</div>'+
      '<div id="pendingDocsList" style="text-align:center;color:var(--mu);padding:16px;font-size:12px">'+trAr('جاري التحميل...')+'</div></div>';
    try{
      var list = await docsRpc('ariba_employee_pending_templates', {});
      var box = document.getElementById('pendingDocsList'); if(!box) return;
      if(!list || !list.length){
        box.innerHTML = '<div style="padding:14px;color:var(--mu)">'+trAr('لا توجد مستندات بانتظار توقيعك حاليًا ✓')+'</div>';
        refreshDocsBadge();
        return;
      }
      box.innerHTML = list.map(function(x){
        var typeAr = TYPE_LABELS_AR[x.template_type] || x.title || x.template_type;
        var icon = TYPE_ICON[x.template_type] || 'ti-file-text';
        var rid = escLocal(x.request_id);
        var did = escLocal(x.document_id||'');
        return '<div class="card" style="margin-bottom:10px;padding:12px;text-align:right">'+
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'+
            '<i class="ti '+icon+'" style="font-size:18px;color:var(--pri)"></i>'+
            '<strong style="font-size:13px">'+escLocal(typeAr)+'</strong>'+
          '</div>'+
          '<div style="font-size:10.5px;color:var(--mu);margin-bottom:10px">'+escLocal(fmtDate(x.created_at))+'</div>'+
          '<button class="btn" style="width:100%;margin-bottom:6px;background:var(--c2);border:1px solid var(--bd)" onclick="aribaViewDoc(\''+did+'\')"><i class="ti ti-eye"></i> '+trAr('عرض المستند')+'</button>'+
          '<div style="display:flex;gap:6px">'+
            '<button class="btn" style="flex:1;background:#12b76a;color:#fff" onclick="aribaAckDoc(\''+rid+'\',\'approved\',null,this)"><i class="ti ti-check"></i> '+trAr('موافقة')+'</button>'+
            '<button class="btn" style="flex:1;background:#e5484d;color:#fff" onclick="aribaShowReject(\''+rid+'\',this)"><i class="ti ti-x"></i> '+trAr('رفض')+'</button>'+
          '</div>'+
          '<div id="rejBox_'+rid+'" style="display:none;margin-top:8px">'+
            '<textarea id="rejReason_'+rid+'" rows="2" placeholder="'+trAr('اكتب سبب الرفض هنا (إجباري)...')+'" style="width:100%;font-size:11px" oninput="aribaValidateReject(\''+rid+'\')"></textarea>'+
            '<button id="rejConfirm_'+rid+'" class="btn" disabled style="width:100%;margin-top:6px;background:#e5484d;color:#fff;opacity:.5" onclick="aribaAckDoc(\''+rid+'\',\'rejected\',document.getElementById(\'rejReason_'+rid+'\').value,this)">'+trAr('تأكيد الرفض')+'</button>'+
          '</div>'+
        '</div>';
      }).join('');
      refreshDocsBadge();
    }catch(err){
      var box2 = document.getElementById('pendingDocsList');
      if(box2) box2.innerHTML = '<div style="padding:14px;color:#e5484d">'+escLocal(err.message||'تعذر التحميل')+'</div>';
    }
  };

  window.aribaShowReject = function(reqId){
    var box = document.getElementById('rejBox_'+reqId);
    if(box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
  };

  window.aribaValidateReject = function(reqId){
    var reason = (document.getElementById('rejReason_'+reqId)||{}).value || '';
    var btn = document.getElementById('rejConfirm_'+reqId);
    if(!btn) return;
    var ok = reason.trim().length >= 3;
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '.5';
  };

  window.aribaViewDoc = async function(docId){
    if(!docId){ safeToast('المستند غير متاح', 'ter'); return; }
    try{
      var d = await docsRpc('ariba_get_document', {p_document_id: docId});
      if(!d || !d.base64){ safeToast('تعذر فتح المستند', 'ter'); return; }
      var w = window.open('', '_blank');
      if(!w){ safeToast('برجاء السماح بالنوافذ المنبثقة', 'ter'); return; }
      var htmlStr = decodeURIComponent(escape(atob(d.base64)));
      w.document.open();
      w.document.write('<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>مستند</title></head><body>' + htmlStr + '</body></html>');
      w.document.close();
    }catch(err){
      safeToast(err.message || 'تعذر فتح المستند', 'ter');
    }
  };

  window.aribaAckDoc = async function(reqId, action, reason, btn){
    if(action === 'rejected' && (!reason || reason.trim().length < 3)){
      safeToast('برجاء كتابة سبب الرفض', 'ter');
      return;
    }
    var orig = btn ? btn.innerHTML : '';
    try{
      if(btn){ btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i>'; }
      await docsRpc('ariba_employee_ack_template', {p_request_id: reqId, p_action: action, p_reason: reason || null});
      safeToast(action === 'approved' ? '✅ تمت الموافقة' : 'تم إرسال الرفض بالسبب المذكور', 'tin');
      window.renderPendingDocs();
    }catch(err){
      safeToast(err.message || 'تعذر إرسال الرد', 'ter');
      if(btn){ btn.disabled = false; btn.innerHTML = orig; }
    }
  };

  var oldGoTabDocs = window.goTab;
  if(typeof oldGoTabDocs === 'function' && !oldGoTabDocs.__aribaDocsV1){
    window.goTab = function(tab, el){
      if(tab === 'docs'){
        document.querySelectorAll('.bni').forEach(function(x){ x.classList.remove('on'); });
        if(el) el.classList.add('on');
        var pt = document.getElementById('pageTitle'); if(pt) pt.textContent = 'المستندات';
        window.renderPendingDocs();
        return;
      }
      return oldGoTabDocs.apply(this, arguments);
    };
    window.goTab.__aribaDocsV1 = true;
  }

  setTimeout(installDocsTab, 100);
  setTimeout(installDocsTab, 700);
  setTimeout(installDocsTab, 1800);
  setTimeout(refreshDocsBadge, 2200);
  setInterval(refreshDocsBadge, 8000);
})();
