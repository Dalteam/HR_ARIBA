
/* V114: سجل الحضور كان بيحسب "تأخير" و"خروج مبكر" بمعادلة ثابتة (بداية 08:00 + سماح، ونهاية 16:00)
   ومش عارف بالساعة المرنة. دلوقتي السطرين دول بيتطابقوا مع حالة السجل اللي جاية من السيرفر
   (اللي بيحسبها صح مع الساعة المرنة) — إضافة فقط، من غير تعديل دالة rAtt الأصلية. */
(function(){
  'use strict';
  var CLOUD='https://iwviydmapqpqihcdazpe.supabase.co', KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var flex={at:0,enabled:false,hours:8,end:'17:00'}, loading=false;
  function num(v){ if(v===null||v===undefined||v==='') return null; var n=Number(v); return isNaN(n)?null:n; }
  function loadFlex(){
    if(loading || Date.now()-flex.at<60000) return;
    var t=window.ARIBA_HR_TOKEN||''; if(!UUID.test(t)) return;
    loading=true;
    fetch(CLOUD+'/rest/v1/rpc/ariba_get_attendance_settings',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({p_token:t})})
      .then(function(r){ return r.json(); })
      .then(function(d){ flex={at:Date.now(),enabled:!!(d&&d.flexible_enabled),hours:Number(d&&d.shift_hours)||8,end:String((d&&d.flex_window_end)||'17:00').slice(0,5)}; })
      .catch(function(){}).then(function(){ loading=false; });
  }
  function findLine(col,icon){
    var ds=col.querySelectorAll('div');
    for(var i=0;i<ds.length;i++){ if(ds[i].textContent.trim().indexOf(icon)===0) return ds[i]; }
    return null;
  }
  function setLine(col,anchor,icon,text,color){
    var el=findLine(col,icon);
    if(!text){ if(el&&el.parentNode) el.parentNode.removeChild(el); return; }
    if(!el){ el=document.createElement('div'); el.style.cssText='font-size:10px;color:'+color; (anchor.nextSibling?anchor.parentNode.insertBefore(el,anchor.nextSibling):anchor.parentNode.appendChild(el)); }
    el.textContent=text;
  }
  function fix(){
    try{
      if(window.ARIBA117&&window.ARIBA117.dailyReady&&window.ARIBA117.dailyReady()) return;
      var box=document.getElementById('ATL'); if(!box) return;
      var date=(document.getElementById('AD')||{}).value; 
      var recs=(typeof getAtt==='function'?getAtt():[]).filter(function(a){ return !date || a.date===date; });
      var em={}; recs.forEach(function(r){ em[r.empId||r.emp_id]=r; });
      var emps=(typeof aEmps==='function'?aEmps():[]);
      if(box.children.length!==emps.length) return;
      var tol=15; try{ tol=parseInt((db('settings',{})).tol)||15; }catch(e){}
      for(var i=0;i<emps.length;i++){
        var r=em[emps[i].id]; if(!r) continue;
        var row=box.children[i], cols=row.querySelectorAll(':scope > div');
        var col=cols[2]; if(!col) continue;
        var anchor=null; col.querySelectorAll(':scope > div').forEach(function(d){ if(!anchor && d.textContent.indexOf('→')>=0) anchor=d; });
        if(!anchor) continue;
        /* التأخير: يتبع حالة السجل (late) وقيمة السيرفر */
        var lm=num(r.late_minutes);
        if(r.status==='late'){ if(lm&&lm>0) setLine(col,anchor,'⏰','⏰ تأخير '+lm+' دقيقة','var(--am)'); }
        else setLine(col,anchor,'⏰','', '');
        /* الخروج المبكر: قيمة السيرفر لو موجودة، وإلا مع الساعة المرنة = دخول + عدد الساعات */
        var em_=num(r.early_minutes), tin=String(r.timeIn||r.time_in||''), tout=String(r.timeOut||r.time_out||'');
        var hasLine=findLine(col,'🚪');
        var early=null;
        if(em_!==null) early=em_;
        else if(flex.enabled && tin && tout){
          var a=tin.split(':'), b=tout.split(':');
          var expected=(+a[0])*60+(+a[1])+flex.hours*60, outM=(+b[0])*60+(+b[1]);
          if(r.status==='late'){ var fe=flex.end.split(':'); expected=Math.min(expected,(+fe[0])*60+(+fe[1])); }
          early=Math.max(0,expected-outM);
        }
        if(early!==null){
          var last=findLine(col,'⏰')||anchor;
          setLine(col,last,'🚪',early>0?('🚪 خروج مبكر '+early+' دقيقة'):'','var(--rd)');
        }
      }
    }catch(e){}
  }
  function wrap(){
    var f=window.rAtt; if(typeof f!=='function' || f.__v114 || window.__a114rAtt) return;
    var g=function(){ var r=f.apply(this,arguments); loadFlex(); fix(); return r; }; g.__v114=true; window.__a114rAtt=true; window.rAtt=g;
  }
  wrap(); setInterval(function(){ wrap(); loadFlex(); },2000);
  setTimeout(function(){ try{ if(typeof window.rAtt==='function') window.rAtt(); }catch(e){} },2500);
})();
