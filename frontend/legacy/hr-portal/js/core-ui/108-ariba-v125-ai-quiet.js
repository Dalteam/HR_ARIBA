
/* V125: مساعد اريبا AI بدون شرح (إضافة فقط) */
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


  /* ===== V125: مساعد اريبا AI بدون أي شرح — بس حقل الكتابة والردود المختصرة ===== */
  var st=document.createElement('style'); st.id='ariba125-ai-quiet'; st.textContent='#aribaAiPanel .ai-mini{display:none!important}'; document.head.appendChild(st);
  function quiet(){
    var p=document.getElementById('aribaAiPanel'); if(!p) return;
    p.querySelectorAll('.ai-mini').forEach(function(el){ el.remove(); });
    var ta=document.getElementById('aribaAiInput'); if(ta&&ta.getAttribute('placeholder')) ta.setAttribute('placeholder','');
    var lg=document.getElementById('aribaAiLog'); if(!lg) return;
    [].slice.call(lg.querySelectorAll('.ai-msg')).forEach(function(m){
      var t=m.textContent||'';
      if(/أقدر أعمل الحاجات دي/.test(t)){ if(/^\s*مافهمتش/.test(t)) m.textContent='مافهمتش الطلب ده.'; else m.remove(); }          /* قايمة الأمثلة */
      else if(/اكتب الاسم الأول واسم الأب/.test(t)) m.textContent='❓ مش لاقي موظف بالاسم ده.';                                       /* شرح طريقة كتابة الاسم */
    });
  }
  /* فورًا لما أي رسالة تتضاف (قبل ما تتعرض) */
  try{ new MutationObserver(quiet).observe(document.body,{childList:true,subtree:true}); }catch(e){}
  setInterval(quiet,700); quiet();
})();
