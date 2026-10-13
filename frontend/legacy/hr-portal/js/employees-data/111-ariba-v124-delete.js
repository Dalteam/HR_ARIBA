
/* V124: حذف الطلبات والمستندات المرسلة (إضافة فقط) */
(function(){
  'use strict';
  var SUPA='https://iwviydmapqpqihcdazpe.supabase.co', KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isEN(){
    try{ if(typeof window.ARIBA_UI_LANG==='function') return window.ARIBA_UI_LANG()==='en'; }catch(e){}
    try{ return (typeof LANG!=='undefined' && LANG==='en'); }catch(e){}
    return false;
  }
  function T(ar,en){ return isEN()?en:ar; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function token(){ return window.ARIBA_HR_TOKEN || window.ARIBA_SESSION || ''; }
  function notify(msg,isErr){
    try{ if(typeof window.toast==='function'){ window.toast(msg, isErr?'ter':'tin'); return; } }catch(e){}
    alert(msg);
  }
  function rpc(fn,args){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); x.open('POST',SUPA+'/rest/v1/rpc/'+fn);
      x.setRequestHeader('apikey',KEY); x.setRequestHeader('Authorization','Bearer '+KEY); x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){ var d=null; try{ d=JSON.parse(x.responseText||'null'); }catch(e){}
        if(x.status>=200&&x.status<300) res(d); else rej(new Error((d&&(d.message||d.hint))||('HTTP '+x.status))); };
      x.onerror=function(){ rej(new Error(T('تعذر الاتصال بالإنترنت','Cannot connect to the internet'))); };
      x.send(JSON.stringify(args||{}));
    });
  }
  var INP='width:100%;box-sizing:border-box;padding:10px;margin-bottom:8px;border:1px solid #ccc;border-radius:8px;font-size:14px;background:#fff;color:#111';
  function overlay(id){
    var w=document.createElement('div'); w.id=id;
    w.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Tahoma,Arial,sans-serif';
    w.dir=isEN()?'ltr':'rtl';
    return w;
  }
  function closeOn(w){
    function esc_(e){ if(e.key==='Escape'){ kill(); } }
    function kill(){ document.removeEventListener('keydown',esc_); if(w.parentNode) w.parentNode.removeChild(w); }
    document.addEventListener('keydown',esc_);
    w.addEventListener('mousedown',function(e){ if(e.target===w) kill(); });
    return kill;
  }


  /* ===== V124: حذف الطلبات والمستندات من برنامج الـ HR (طلبات الموظفين + المستندات المرسلة + المرفقات) ===== */
  function tokenD(){ var t=window.ARIBA_HR_TOKEN||''; return UUID.test(t)?t:''; }
  function dropLocal(id){
    try{ var sid=String(id);
      window.ARIBA_ALL_CLOUD_REQUESTS=(window.ARIBA_ALL_CLOUD_REQUESTS||[]).filter(function(x){ return String((x.request||{}).id)!==sid; });
      window.ARIBA_WORKFLOW_QUEUE=(window.ARIBA_WORKFLOW_QUEUE||[]).filter(function(x){ return String((x.request||{}).id)!==sid; });
      if(typeof getLvs==='function'&&typeof saveLvs==='function'){ var l=getLvs(), n=l.filter(function(x){ return String(x.workflowRequestId||'')!==sid; }); if(n.length!==l.length) saveLvs(n); }
    }catch(e){}
  }
  async function refreshAll(){
    try{ if(typeof window.loadWorkflowQueue==='function') await window.loadWorkflowQueue(); }catch(e){}
    try{ if(typeof window.tfRefreshStatus==='function') await window.tfRefreshStatus(); }catch(e){}
    try{ var c=document.getElementById('ariba116AllCloud'); if(c) c.remove(); }catch(e){}
    try{ if(typeof window.rLvPend==='function') window.rLvPend(); }catch(e){}
    try{ if(window.ARIBA117&&window.ARIBA117.refreshAtts) window.ARIBA117.refreshAtts(); }catch(e){}
  }
  window.ARIBA_DELREQ=async function(id,label,status){
    var t=tokenD(); if(!t){ notify(T('لازم تكون داخل بحسابك السحابي','A cloud sign-in is required'),true); return; }
    var msg=T('هيتحذف "'+(label||'الطلب')+'" نهائياً من عند الموارد البشرية ومن تطبيق الموظف، مع مرفقاته وإشعاراته، وبيتسجّل في أرشيف المحذوفات.','"'+(label||'The request')+'" will be deleted for good from HR and from the Employee App, with its attachments and notifications, and recorded in the deleted-items archive.');
    if(status==='approved') msg+='\n\n'+T('⚠️ الطلب معتمد: لو كان إجازة، رصيد الموظف هيرجع. (البصمات اللي اتسجلت بسبب نسيان بصمة معتمد بتفضل.)','⚠️ The request is approved: if it is a leave, the employee\'s balance is restored. (Punches added by an approved forgot-punch stay.)');
    if(!confirm(msg+'\n\n'+T('متأكد؟','Are you sure?'))) return;
    try{ await rpc('ariba_delete_request',{p_token:t,p_request_id:id}); dropLocal(id); notify('✓ '+T('اتحذف','Deleted'),false); await refreshAll(); }
    catch(e){ notify(T('تعذر الحذف: ','Could not delete: ')+(e&&e.message||e),true); }
  };
  /* ---------- 1) الطلبات المعلقة (LVP): زر حذف جنب الموافقة/الرفض ---------- */
  function decorateQueue(){
    var box=document.getElementById('LVP'); if(!box) return;
    box.querySelectorAll('button[onclick*="ariba62Approve"]').forEach(function(ap){
      if(ap.getAttribute('data-a24')==='1') return; ap.setAttribute('data-a24','1');
      var it=null; try{ it=JSON.parse(ap.getAttribute('data-item')||'null'); }catch(e){} var r=(it&&it.request)||{}; if(!r.id) return;
      var e=(it&&it.employee)||{}, nm=String((e.nameAr||e.nameEn||'')).split(' ').slice(0,3).join(' ');
      var b=document.createElement('button'); b.type='button'; b.className=ap.className; b.title=T('حذف الطلب','Delete the request');
      b.setAttribute('style',(ap.getAttribute('style')||'')+';background:transparent;color:#e5484d;border:1px solid #e5484d;margin-inline-start:4px'); b.innerHTML='🗑 '+T('حذف','Delete');
      b.onclick=function(ev){ ev.stopPropagation(); window.ARIBA_DELREQ(r.id,(nm?nm+' — ':'')+(r.request_type||''),r.status); };
      ap.parentNode.insertBefore(b,ap.nextSibling);
    });
  }
  /* ---------- 2) كارت "طلبات أخرى" + جدول حالة النماذج المرسلة: أزرار بتتحط من الكود الأساسي (data-rid) ---------- */
  function decorateRows(root){
    (root||document).querySelectorAll('button[data-a24del]').forEach(function(b){
      if(b.getAttribute('data-bound')==='1') return; b.setAttribute('data-bound','1');
      b.onclick=function(ev){ ev.stopPropagation(); window.ARIBA_DELREQ(b.getAttribute('data-a24del'),b.getAttribute('data-lbl')||'',b.getAttribute('data-st')||''); };
    });
  }
  setInterval(function(){ decorateQueue(); decorateRows(); },900);

  /* ---------- جدول حالة النماذج المرسلة (إعادة رسم بنفس الشكل + زر حذف) — إضافة بدل تعديل الكود القديم ---------- */
  var TYPE_L={onboarding:'مباشرة عمل',custody:'استلام عهدة',extension:'تمديد التجربة',termination:'إشعار الإنهاء',clearance:'إخلاء طرف',experience:'شهادة خبرة',evaluation:'تقييم فترة التجربة',contract_end:'إشعار انتهاء العقد',salary_cert:'تعريف بالراتب'};
  function empNameD(id){ try{ var a=(typeof window.tfEmps71==='function')?window.tfEmps71():[]; var f=a.find(function(x){ return String(x.id)===String(id); }); return f?(f.nameAr||f.nameEn||id):id; }catch(e){ return id; } }
  var origStatus=window.tfRefreshStatus;
  window.tfRefreshStatus=async function(){
    var box=document.getElementById('TF_STATUS_BOX'); if(!box) return;
    var t=tokenD(); if(!t){ if(origStatus) return origStatus.apply(this,arguments); return; }
    try{
      var list=await rpc('ariba_hr_template_status',{p_token:t});
      if(!list||!list.length){ box.innerHTML='<div style="padding:14px;text-align:center;color:var(--mu);font-size:12px">'+T('لا توجد نماذج مُرسلة بعد','No forms sent yet')+'</div>'; return; }
      var SL={pending:T('⏳ بانتظار الموظف','⏳ Awaiting employee'),approved:T('✅ تمت الموافقة','✅ Approved'),rejected:T('⚠️ معترَض عليه','⚠️ Objected to')};
      box.innerHTML='<table style="width:100%;border-collapse:collapse;font-size:11.5px"><tr style="text-align:right;color:var(--mu)"><th style="padding:6px">'+T('الموظف','Employee')+'</th><th style="padding:6px">'+T('النموذج','Form')+'</th><th style="padding:6px">'+T('الحالة','Status')+'</th><th style="padding:6px">'+T('السبب','Reason')+'</th><th style="padding:6px">'+T('التاريخ','Date')+'</th><th style="padding:6px"></th></tr>'
        +list.map(function(x){ var lbl=empNameD(x.employee_id)+' — '+(TYPE_L[x.template_type]||x.template_type||'');
          return '<tr style="border-top:1px solid var(--bd)" data-rid="'+esc(x.request_id)+'"><td style="padding:6px">'+esc(empNameD(x.employee_id))+'</td><td style="padding:6px">'+esc(TYPE_L[x.template_type]||x.template_type||'')+'</td><td style="padding:6px">'+(SL[x.status]||esc(x.status))+'</td><td style="padding:6px;color:var(--rd)">'+esc(x.rejection_reason||'—')+'</td><td style="padding:6px;color:var(--mu)">'+(x.updated_at?new Date(x.updated_at).toLocaleString(isEN()?'en-GB':'ar-SA'):'')+'</td><td style="padding:6px"><button type="button" class="btn bsm" data-a24del="'+esc(x.request_id)+'" data-st="'+esc(x.status)+'" data-lbl="'+esc(lbl)+'" style="background:transparent;color:#e5484d;border:1px solid #e5484d" title="'+T('حذف','Delete')+'">🗑</button></td></tr>'; }).join('')+'</table>';
      decorateRows(box);
    }catch(err){ box.innerHTML='<div style="padding:14px;text-align:center;color:var(--rd);font-size:12px">'+esc((err&&err.message)||err)+'</div>'; }
  };
})();
