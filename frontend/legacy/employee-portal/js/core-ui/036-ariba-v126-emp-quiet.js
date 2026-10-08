
/* V126: تطبيق الموظف بدون شرح وبردود قصيرة (إضافة فقط) */
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


  /* ===== V126: تطبيق الموظف بدون شرح ولا ردود طويلة — الأرقام والعناوين والأزرار بس ===== */
  /* جمل الشرح (جزء مميّز من كل جملة بالعربي + الإنجليزي) */
  var EXPL=[
    'مسار الاعتماد','أي طلب ترسله سيمر','مسار الطلب','يمكن إرسال الطلب بدون مرفق','المرفق اختياري','تقدر تغيّر كلمة المرور في أي وقت','اختر نوع البصمة اللي نسيتها','اكتب كلمة المرور الحالية ثم الجديدة','انصرفت بالخطأ؟','الاستحقاق يُحسب على أيام العمل','والسنة الأولى تُحتسب','دي المواقع اللي حددتها لك','لسه مفيش مواقع محددة لك','يتم التحديد من البرنامج الرئيسي','التحقق يتم من الخادم','سيتم التحقق منه على الخادم',
    'Approval path','Any request you send','Request path','without an attachment','Attachment is optional','change your password at any time','Choose the missed punch','Enter your current password','Punched out by mistake','These are the locations HR assigned','No locations are assigned','set from the main program','verified by the server'
  ];
  function isExpl(t){ for(var i=0;i<EXPL.length;i++){ if(t.toLowerCase().indexOf(EXPL[i].toLowerCase())>=0) return true; } return false; }
  /* عناوين فيها جزء شارح: نقصّها */
  var TRIM=[ [/^الراتب الحالي\s*[—-]\s*من نظام الموارد البشرية$/,'الراتب الحالي'], [/^💰\s*الراتب من الموارد البشرية$/,'💰 الراتب'], [/^Current salary\s*[—-]\s*from the HR system$/i,'Current salary'], [/^💰\s*Salary from HR$/i,'💰 Salary'],
    [/^لم يتم تحديد الفريق بعد.*$/,'لا يوجد فريق'], [/^لم يتم تحديد موظفين تحت إدارتك\.?$/,'لا يوجد موظفين'], [/^📍 تم تحديد موقعك.*$/,'📍 تم تحديد موقعك'], [/^جاري التحقق من الموقع.*$/,'📍 جاري تحديد الموقع'],
    [/^لسه على كلمة المرور الافتراضية.*$/,'غيّر كلمة المرور الافتراضية'], [/^You are still on the default password.*$/i,'Change the default password'],
    [/^لا توجد طلبات حتى الآن$/,'لا توجد طلبات'], [/^لم يتم إصدار مسير معتمد( للموظف)? حتى الآن\.?$/,'لا يوجد مسير معتمد'], [/^لا توجد مسيرات معتمدة حتى الآن\.?$/,'لا توجد مسيرات'],
    [/^لا توجد مستندات بانتظار توقيعك حاليًا\s*✓?$/,'لا توجد مستندات'], [/^✅?\s*لا توجد طلبات بانتظار موافقتك حالياً\.?$/,'لا توجد طلبات'], [/^لا توجد قسيمة راتب معتمدة.*$/,'لا توجد قسيمة'],
    [/^No requests yet$/i,'No requests'], [/^No approved payroll has been issued yet\.?$/i,'No approved payroll'],
    [/^الكلمة الجديدة لازم تختلف عن الحالية$/,'الكلمة الجديدة لازم تختلف'] ];
  function clean(root){
    try{
      /* عنوان شاشة الدخول: الكود الأصلي كان بيطلّعه "تطبيق الموظف | تطبيق الموظف | الموظف App" */
      var ls=document.querySelector('.logo-sub'); if(ls){ var want=isEN()?'Employee App':'تطبيق الموظف'; if(ls.textContent!==want) ls.textContent=want; }
      /* زر اللغة التاني (الفاضي من الكود القديم) بنشيله فعلاً بدل ما نخفيه — عشان مفيش عنصرين بنفس المعرّف */
      document.querySelectorAll('.ariba-top-actions #aribaLangBtn,.ariba-top-actions .ariba-lang-btn').forEach(function(b){ if(document.querySelectorAll('#aribaLangBtn').length>1||b.textContent.trim()==='') b.remove(); });
      var w=document.createTreeWalker(root||document.body,NodeFilter.SHOW_TEXT,null), n, list=[];
      while((n=w.nextNode())){ var p=n.parentNode; if(!p||/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(p.nodeName)) continue; var t=(n.nodeValue||'').replace(/\s+/g,' ').trim(); if(t.length>3) list.push([n,t]); }
      list.forEach(function(x){ var node=x[0], t=x[1];
        for(var i=0;i<TRIM.length;i++){ if(TRIM[i][0].test(t)){ node.nodeValue=TRIM[i][1]; return; } }
        if(!isExpl(t)) return;
        var el=node.parentNode; /* نشيل أصغر عنصر شارح، من غير ما نلمس عناصر فيها حقول أو أزرار */
        while(el&&el.parentNode&&el.id!=='appContent'&&el.children.length<=1&&el.textContent.replace(/\s+/g,' ').trim().length<=t.length+4&&!el.querySelector('input,button,select,textarea')){ if(el.parentNode.id==='appContent') break; if(el.parentNode.textContent.replace(/\s+/g,' ').trim().length>t.length+4) break; el=el.parentNode; }
        if(el&&el.querySelectorAll&&!el.querySelector('input,button,select,textarea')&&el.id!=='appContent') el.remove(); else node.nodeValue='';
      });
      (root||document).querySelectorAll('[placeholder]').forEach(function(e){ var v=e.getAttribute('placeholder')||''; if(/\(8 على الأقل|8 characters|min 8/i.test(v)) e.setAttribute('placeholder',(window.isEN&&0)?'':v.replace(/\s*\((?:8 على الأقل[^)]*|min 8[^)]*|8 characters[^)]*)\)/i,'')); });
    }catch(e){}
  }
  /* ردود قصيرة بدل الطويلة */
  var SHORT=[ [/^✅?\s*تم إرسال الطلب\s*[—-].*$/,'✅ تم إرسال الطلب'], [/^✅?\s*تمت الموافقة وانتقل الطلب.*$/,'✅ تمت الموافقة'],
    [/^✅?\s*تم إرسال الإشعار.*$/,'✅ تم'], [/^❌?\s*أنت خارج النطاق الجغرافي المسموح به[\s\S]*$/,'❌ خارج نطاق العمل'], [/^❌?\s*أنت خارج نطاق مواقع العمل المسموح بها.*$/,'❌ خارج نطاق العمل'],
    [/^Request sent\s*[—-].*$/i,'Request sent'], [/^✅ Request sent\s*[—-].*$/i,'✅ Request sent'], [/^❌ You are outside the allowed[\s\S]*$/i,'❌ Outside the work area'] ];
  function shorten(m){ if(typeof m!=='string') return m; var t=m.replace(/\s+/g,' ').trim(); for(var i=0;i<SHORT.length;i++){ if(SHORT[i][0].test(m)||SHORT[i][0].test(t)) return SHORT[i][1]; } return m; }
  ['toast'].forEach(function(nm){ var f=window[nm]; if(typeof f==='function'&&!f.__v126){ var g=function(m){ var a=[].slice.call(arguments); a[0]=shorten(a[0]); return f.apply(this,a); }; g.__v126=1; window[nm]=g; } });
  try{ new MutationObserver(function(){ clean(); }).observe(document.body,{childList:true,subtree:true}); }catch(e){}
  setInterval(clean,900); setTimeout(clean,300);
})();
