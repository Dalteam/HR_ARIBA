
/* V114: عرض نوع وسبب طلب نسيان البصمة في طلبات الموظفين المعلقة (إضافة فقط) */
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

  /* ---------- HR: عرض تفاصيل طلب "نسيان بصمة" في قائمة الطلبات المعلقة ---------- */
  var KIND={in:T('دخول','Check-in'),out:T('خروج','Check-out'),both:T('دخول وخروج','Check-in & out')};
  function fmt(t){ return String(t||'').slice(0,5); }
  function decorate(){
    try{
      var box=document.getElementById('LVP'); if(!box) return;
      var q=window.ARIBA_WORKFLOW_QUEUE||[];
      q.forEach(function(x){
        var r=x&&x.request; if(!r || r.request_type!=='forgot_punch') return;
        var btns=box.querySelectorAll('button');
        var b=null; for(var i=0;i<btns.length;i++){ if((btns[i].getAttribute('onclick')||'').indexOf(r.id)>=0){ b=btns[i]; break; } }
        if(!b) return;
        var row=b.closest('div[style*="padding:12px 14px"]'); if(!row || row.getAttribute('data-fp')==='1') return;
        var left=row.querySelector('div[style*="min-width:260px"]'); if(!left) return;
        row.setAttribute('data-fp','1');
        left.querySelectorAll('.b.ba').forEach(function(c){ if(c.textContent.trim()==='forgot_punch') c.textContent=T('نسيان بصمة','Forgot punch'); });
        var p=r.payload||{};
        var times = p.kind==='both' ? fmt(p.time)+' → '+fmt(p.time2) : fmt(p.time);
        var d=document.createElement('div');
        d.style.cssText='margin-top:6px;padding:8px 10px;background:rgba(14,165,233,.08);border-radius:8px;font-size:12px;line-height:1.8';
        d.innerHTML='<b>'+esc(KIND[p.kind]||'')+'</b> — '+esc(p.date||'')+' — <span dir="ltr">'+esc(times)+'</span>'+(p.notes?'<br>'+T('السبب','Reason')+': '+esc(p.notes):'')
          +'<br><span style="color:#0f766e">'+T('عند الموافقة يتسجل تلقائيًا في سجل حضور الموظف.','On approval it is recorded automatically in the employee attendance.')+'</span>';
        left.appendChild(d);
      });
    }catch(e){}
  }
  setInterval(decorate,800);
})();
