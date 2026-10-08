
/* V119: قسيمة الراتب بتعرض بدل الإجازة ومكافأة نهاية الخدمة والإضافي (إضافة فقط) */
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


  /* ===== V119: قسيمة الراتب في تطبيق الموظف تعرض بدل الإجازة ومكافأة نهاية الخدمة والإضافي (من نفس صف مسير الـ HR المعتمد) ===== */
  var MN_AR=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'], MN_EN=['','January','February','March','April','May','June','July','August','September','October','November','December'];
  function n0(v){ var n=Number(v); return isFinite(n)?n:0; }
  function mny(v){ return n0(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+T('ر.س','SAR'); }
  function slipHtml(raw){
    var p=(raw&&raw.payload&&typeof raw.payload==='object')?raw.payload:(raw||{});
    if(p.houPay===undefined&&p.salByDays===undefined) return null;                /* مسير قديم قبل V119: نسيب القسيمة الأصلية */
    var cur=p.currency&&p.currency!=='ريال سعودي'?p.currency:'';
    var row=function(l,v,cls,neg){ return '<div class="hr-pay-row'+(cls?' '+cls:'')+'"><span>'+l+'</span><b>'+(neg?'- ':'')+mny(v)+'</b></div>'; };
    var opt=function(l,v,cls,neg){ return n0(v)?row(l,v,cls,neg):''; };
    var insEmp=p.noInsDeduct?0:n0(p.insEmp);
    var h=row(T('الراتب الأساسي (حسب أيام العمل)','Basic salary (by working days)'),p.salByDays)+row(T('بدل السكن','Housing allowance'),p.houPay)+row(T('بدل النقل','Transport allowance'),p.traPay)
      +opt(T('بدل المشروع','Project allowance'),p.prjPay)+opt(T('بدلات أخرى','Other allowances'),n0(p.othPay)+n0(p.otherAllow))
      +opt(T('الإضافي','Overtime'),p.overtime)+opt(T('بدل الإجازة','Leave allowance'),p.leaveComp)+opt(T('مكافأة نهاية الخدمة','End-of-service award'),p.eosAmt)
      +row(T('إجمالي المستحق','Total due'),p.totalDue,'hr-pay-total')
      +row(T('استقطاع التأمينات','Insurance deduction'),insEmp,'hr-pay-ded',true)+opt(T('سلف / غياب','Advances / absence'),p.loanDeduct,'hr-pay-ded',true)+opt(T('استقطاعات أخرى','Other deductions'),p.otherDeduct,'hr-pay-ded',true)
      +row(T('صافي الراتب','Net salary'),(p.netSAR!==undefined&&p.netSAR!==null)?p.netSAR:p.net,'hr-pay-net');
    if(cur) h+='<div class="hr-pay-row"><span>'+T('الصافي بالعملة الأصلية','Net in original currency')+'</span><b>'+n0(p.net).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' '+esc(cur)+'</b></div>';
    var t=((EN()?MN_EN:MN_AR)[Number(raw&&raw.month)||0]||'')+(raw&&raw.year?(' '+raw.year):'');
    return '<div class="card-title"><i class="ti ti-file-invoice"></i> '+T('قسيمة الراتب','Payslip')+(t?' — '+esc(t):'')+'</div>'+h;
  }
  function EN(){ return isEN(); }
  function enhance(){
    try{
      var root=document.getElementById('appContent'); if(!root||!window.ME||!Array.isArray(ME.payroll)||!ME.payroll.length) return;
      var cards=[].slice.call(root.querySelectorAll('.hr-pay-card')).filter(function(c){ return c.querySelector('.card-title .ti-file-invoice'); });
      cards.forEach(function(c,i){
        var raw=ME.payroll[i===0?0:i-1]; if(!raw) return;
        var sig=JSON.stringify([raw.year,raw.month,isEN()]); if(c.getAttribute('data-a19')===sig) return;
        var h=slipHtml(raw); if(h===null){ c.setAttribute('data-a19',sig); return; }
        c.innerHTML=h; c.setAttribute('data-a19',sig);
      });
    }catch(e){}
  }
  setInterval(enhance,800);
  (function(){ var f=window.renderPay; if(typeof f==='function'&&!f.__a19){ var g=function(){ var r=f.apply(this,arguments); setTimeout(enhance,0); return r; }; g.__a19=1; window.renderPay=g; } })();
})();
