
/* V124: حذف طلباتي ومستنداتي + تحميل HTML بترميز سليم (إضافة فقط) */
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


  /* ===== V124: تطبيق الموظف — حذف طلباتي ومستنداتي + تحميل ملفات HTML بترميز سليم ===== */
  function tokenE(){ var t=window.ARIBA_SESSION||''; return UUID.test(t)?t:''; }
  var HK='ariba_emp_hidden_reqs';
  function hidden(){ try{ return JSON.parse(localStorage.getItem(HK)||'[]'); }catch(e){ return []; } }
  function hideLocal(id){ var a=hidden(); if(a.indexOf(id)<0) a.push(id); try{ localStorage.setItem(HK,JSON.stringify(a)); }catch(e){} }
  function htmlFile(text,en,title){
    var parts=String(text).split('<!--ARIBA_EN-->'), useEn=!!(en&&parts[1]), body=useEn?parts[1]:parts[0];
    if(!/<html[\s>]/i.test(body)) return '<!doctype html><html dir="'+(useEn?'ltr':'rtl')+'" lang="'+(useEn?'en':'ar')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title||'')+'</title></head><body style="margin:0">'+body+'</body></html>';
    return /charset/i.test(body)?body:body.replace(/<head[^>]*>/i,function(m){ return m+'<meta charset="utf-8">'; });
  }
  /* تحميل أي مستند: لو HTML نحمّله صفحة كاملة UTF-8 بنسخة لغة واحدة */
  (function(){ var orig=window.aribaDownloadDoc; if(typeof orig==='function'&&orig.__v124) return;
    var g=async function(id){
      try{ var t=tokenE(); if(!t) return orig.apply(this,arguments);
        var d=await rpc('ariba_get_document',{p_token:t,p_document_id:id}); if(!d||!d.base64) return orig.apply(this,arguments);
        var bin=atob(d.base64), u8=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u8[i]=bin.charCodeAt(i);
        var name=d.file_name||'document', isHtml=/\.html?$/i.test(name)||/text\/html/i.test(d.mime_type||''), blob;
        blob=isHtml?new Blob([htmlFile(new TextDecoder('utf-8').decode(u8),isEN(),name)],{type:'text/html;charset=utf-8'}):new Blob([u8],{type:d.mime_type||'application/octet-stream'});
        var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function(){ URL.revokeObjectURL(a.href); },3000);
      }catch(e){ return orig.apply(this,arguments); }
    }; g.__v124=1; window.aribaDownloadDoc=g; })();

  async function delRequest(r,done){
    var t=tokenE(); if(!t){ notify(T('لازم تكون داخل بحسابك','You need to be signed in'),true); return; }
    var approved=r.status==='approved', isTpl=String(r.request_type||'').indexOf('template:')===0;
    var msg=approved&&!isTpl?T('إخفاء الطلب من قائمتك؟','Hide this request from your list?'):(isTpl?T('حذف المستند؟','Delete the document?'):T('حذف الطلب؟','Delete the request?'));
    if(!confirm(msg)) return;
    if(approved&&!isTpl){ hideLocal(String(r.id)); notify('✓ '+T('اتشال من قائمتك','Removed from your list'),false); if(done) done(true); return; }
    try{ await rpc('ariba_delete_request',{p_token:t,p_request_id:r.id}); try{ ME.workflowRequests=(ME.workflowRequests||[]).filter(function(x){ return String(x.id)!==String(r.id); }); }catch(e){} notify('✓ '+T('اتحذف','Deleted'),false); try{ if(window.refreshAribaContext) await window.refreshAribaContext(); }catch(e){} if(done) done(false); }
    catch(e){ var m=String(e&&e.message||e); notify(T('تعذر الحذف: ','Could not delete: ')+(m==='CANNOT_DELETE_APPROVED'?T('الطلب معتمد','the request is approved'):m),true); }
  }
  function activeTab(){ var b=document.querySelector('.bnav .bni.on'); return b?b.id.replace('tb-',''):''; }
  var CSSD='.a24-del{background:transparent;border:1px solid rgba(229,72,77,.5);color:#e5484d;border-radius:9px;padding:2px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;margin-inline-start:6px}.a24-del:active{transform:scale(.95)}';
  var stl=document.createElement('style'); stl.id='ariba124-css'; stl.textContent=CSSD; document.head.appendChild(stl);

  /* 1) طلباتي: كل صف ↔ ME.workflowRequests بنفس الترتيب */
  function decorateRequests(){
    try{
      var root=document.getElementById('appContent'); if(!root||!window.ME) return;
      var card=[].slice.call(root.querySelectorAll('.card')).filter(function(c){ var t=c.querySelector('.card-title'); return t&&/(طلباتي|My Requests)/.test(t.textContent); })[0]; if(!card) return;
      var rows=[].slice.call(card.children).filter(function(c){ return c.tagName==='DIV'&&c.style&&/padding:\s*10px 0/.test(c.getAttribute('style')||''); }), reqs=ME.workflowRequests||[], hid=hidden();
      rows.forEach(function(row,i){
        var r=reqs[i]; if(!r) return; if(hid.indexOf(String(r.id))>=0){ row.style.display='none'; return; }
        if(row.querySelector('.a24-del')&&row.getAttribute('data-a24id')===String(r.id)) return;
        var old=row.querySelector('.a24-del'); if(old) old.remove(); row.setAttribute('data-a24id',String(r.id));
        var head=row.firstElementChild; if(!head) return;
        var b=document.createElement('button'); b.type='button'; b.className='a24-del'; b.title=T('حذف','Delete'); b.textContent='🗑';
        b.onclick=function(ev){ ev.stopPropagation(); delRequest(r,function(hiddenOnly){ if(hiddenOnly) row.style.display='none'; else { row.remove(); } }); };
        head.appendChild(b);
      });
    }catch(e){}
  }
  /* 2) مستندات بانتظار توقيعي */
  function decorateDocs(){
    try{
      var box=document.getElementById('pendingDocsList'); if(!box) return;
      [].slice.call(box.children).forEach(function(card){
        if(card.querySelector('.a24-doc')) return; var m=(card.innerHTML.match(/aribaAckDoc\(\\?'([0-9a-f-]{36})/i)||[])[1]; if(!m) return;
        var b=document.createElement('button'); b.type='button'; b.className='a24-doc btn'; b.style.cssText='width:100%;margin-top:6px;background:transparent;color:#e5484d;border:1px solid rgba(229,72,77,.5)'; b.innerHTML='🗑 '+T('حذف المستند','Delete the document');
        b.onclick=function(){ delRequest({id:m,status:'pending',request_type:'template:x'},function(){ card.remove(); try{ var t=document.getElementById('tb-docs'); if(t&&!box.children.length) t.click(); }catch(e){} }); };
        card.appendChild(b);
      });
    }catch(e){}
  }
  setInterval(function(){ var t=activeTab(); if(t==='lv') decorateRequests(); if(t==='docs') decorateDocs(); },800);
})();
