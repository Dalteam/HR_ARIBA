
/* V117: تطبيق الموظف — رجوع للعمل بعد خروج بالخطأ، والانصراف المحسوب = آخر انصراف (إضافة فقط) */
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


  /* ========== الحضور: رجوع للعمل بعد خروج بالخطأ + الانصراف المحسوب = آخر انصراف ========== */
  var STL={present:['حاضر','Present'],late:['متأخر','Late'],remote:['عن بعد','Remote'],absent:['غائب','Absent'],leave:['إجازة','Leave']};
  function stName(s){ var x=STL[s]; return x?T(x[0],x[1]):(s||'—'); }
  function todayS(){ try{ var p={}; new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).forEach(function(x){ p[x.type]=x.value; }); return p.year+'-'+p.month+'-'+p.day; }catch(e){} try{ if(typeof tod==='function') return tod(); }catch(e){} var d=new Date(); return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
  function hm(t){ return t?String(t).slice(0,5):''; }
  function dOf(a){ return String(a.attendance_date||a.date||'').slice(0,10); }
  function rowsOn(date){
    return ((window.ME&&ME.attendance)||[]).filter(function(a){ return dOf(a)===date && a.time_in; }).sort(function(a,b){ return String(a.time_in).localeCompare(String(b.time_in)); });
  }
  function fixAtt(){
    try{
      var el=document.getElementById('appContent'); if(!el||!document.getElementById('liveClock')) return;
      var cards=[].slice.call(el.querySelectorAll('.card')); if(!cards.length) return;
      var sc=null,hc=null;
      cards.forEach(function(c){ var t=(c.querySelector('.card-title')||{}).textContent||''; if(!sc&&(c.querySelector('button[onclick*="doIn"],button[onclick*="doOut"],.att-status'))) sc=c; if(!hc&&/31/.test(t)) hc=c; });
      var rows=rowsOn(todayS()), n=rows.length, open=rows.filter(function(r){ return !r.time_out; }).pop();
      var firstIn=n?rows[0].time_in:'', outs=rows.filter(function(r){ return r.time_out; }).map(function(r){ return String(r.time_out); }).sort(), lastOut=outs.length?outs[outs.length-1]:'';
      if(sc && sc.getAttribute('data-v117')!==JSON.stringify([n,!!open,lastOut])){
        var title=(sc.querySelector('.card-title')||{outerHTML:'<div class="card-title">'+T('حالة الحضور اليوم','Today\'s attendance status')+'</div>'}).outerHTML;
        var h=title, btnS='margin-top:10px;width:100%';
        if(!n){ h+='<div class="att-status att-none">'+T('لم تسجل حضورك بعد','You have not checked in yet')+'</div><button class="btn btn-success" style="'+btnS+'" onclick="doIn()">📍 '+T('تسجيل الحضور','Check in')+'</button>'; }
        else if(open){ h+='<div class="att-status att-in">✅ '+T('حضور','Checked in')+' — '+hm(firstIn)+(n>1?' ('+T('جلسة حالية من ','current session from ')+hm(open.time_in)+')':'')+'</div>'
            +(lastOut&&n>1?'<div style="font-size:11px;color:var(--mu);text-align:center;margin:4px 0">'+T('رجعت للعمل بعد انصراف الساعة ','You returned after a check-out at ')+hm(lastOut)+'</div>':'')
            +'<button class="btn btn-danger" style="'+btnS+'" onclick="doOut()">🚪 '+T('تسجيل الانصراف','Check out')+'</button>'; }
        else { h+='<div class="att-status att-in">🚪 '+T('آخر انصراف','Last check-out')+' — '+hm(lastOut)+'</div><div style="font-size:11px;color:var(--mu);text-align:center;margin:4px 0;line-height:1.7">'+T('انصرفت بالخطأ؟ تقدر ترجع تسجل حضور تاني، وبيتحسب انصرافك على آخر مرة بتسجل فيها انصراف.','Checked out by mistake? You can check in again; your check-out counts as the last time you check out.')+'</div><button class="btn btn-success" style="'+btnS+'" onclick="doIn()">↩ '+T('رجوع للعمل — تسجيل حضور مرة أخرى','Back to work — check in again')+'</button>'; }
        if(n>1){ h+='<div style="margin-top:8px;font-size:11px;color:var(--mu)">'+T('جلسات اليوم:','Today\'s sessions:')+' '+rows.map(function(r){ return '<span dir="ltr">'+hm(r.time_in)+' → '+(r.time_out?hm(r.time_out):'…')+'</span>'; }).join(' &nbsp;|&nbsp; ')+'</div>'; }
        sc.innerHTML=h; sc.setAttribute('data-v117',JSON.stringify([n,!!open,lastOut]));
      }
      if(hc && !hc.getAttribute('data-v117h')){
        var all=((window.ME&&ME.attendance)||[]).filter(function(a){ return a.time_in; }), by={};
        all.forEach(function(a){ (by[dOf(a)]=by[dOf(a)]||[]).push(a); });
        var dates=Object.keys(by).sort().reverse().slice(0,31), th=(hc.querySelector('.card-title')||{outerHTML:'<div class="card-title">'+T('سجل آخر 31 يوم','Last 31 days log')+'</div>'}).outerHTML;
        var body=dates.map(function(d){
          var rs=by[d].slice().sort(function(a,b){ return String(a.time_in).localeCompare(String(b.time_in)); }), last=rs[rs.length-1], st=rs[0].status||'present';
          var out=last.time_out?hm(last.time_out):'…'; var st2=(rs.some(function(r){return r.status==='late';})&&rs[0].status==='late')?'late':st;
          return '<div style="display:flex;justify-content:space-between;gap:6px;padding:7px 0;border-bottom:1px solid var(--bd);font-size:11px"><span>'+esc(d)+'</span><span dir="ltr">'+hm(rs[0].time_in)+' → '+out+(rs.length>1?' (×'+rs.length+')':'')+'</span><span>'+esc(stName(st2))+'</span></div>';
        }).join('')||'<div style="text-align:center;color:var(--mu);padding:15px">'+T('لا يوجد سجل','No records')+'</div>';
        hc.innerHTML=th+body; hc.setAttribute('data-v117h','1');
      }
    }catch(e){}
  }
  (function(){
    var f=window.renderAtt; if(typeof f==='function'&&!f.__v117){ var g=function(){ var r=f.apply(this,arguments); fixAtt(); return r; }; g.__v117=1; window.renderAtt=g; }
    setInterval(fixAtt,1000);
    /* بعد أي بصمة: حدّث بيانات الحضور من السيرفر فورًا (بدل ما نستنى المزامنة التلقائية) وامنع الضغط المزدوج */
    var busy=false;
    ['doIn','doOut'].forEach(function(nm){
      var o=window[nm]; if(typeof o!=='function'||o.__v117) return;
      var w=async function(){
        if(busy) return; busy=true;
        try{ var r=await o.apply(this,arguments);
          try{ if(typeof window.refreshAribaContext==='function') await window.refreshAribaContext(); }catch(e){}
          try{ var el=document.getElementById('appContent'); if(el&&document.getElementById('liveClock')&&typeof window.renderAtt==='function') window.renderAtt(); }catch(e){}
          return r;
        } finally { setTimeout(function(){ busy=false; },1500); }
      };
      w.__v117=1; window[nm]=w;
    });
  })();
})();
