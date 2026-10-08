
/* V121: جهات العمل (اريبا/أوبتيموم) + مواقع العمل مربوطة بمواقع البصمة (إضافة فقط) */
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


  /* ================= V121: جهات العمل (اريبا / أوبتيموم) + مواقع العمل المربوطة بمواقع البصمة ================= */
  var EMPLOYERS=['اريبا','أوبتيموم'];
  function normEmployer(v){
    var s=String(v==null?'':v).trim(); if(!s) return s;
    var n=s.replace(/[\u064B-\u065F]/g,'').replace(/[أإآ]/g,'ا').replace(/\s+/g,' ');
    if(n==='اريبا'||n==='شركة اريبا') return 'اريبا';
    if(n==='الجيوميكانيه'||n==='الجيوميكانية'||/^الجيو/.test(n)) return 'اريبا';       /* الجيوميكانية اتحولت على اريبا */
    if(n==='اوبتيموم') return 'أوبتيموم';
    return s;
  }
  window.ARIBA_NORM_EMPLOYER=normEmployer;
  function readJson(k,d){ try{ var r=localStorage.getItem(k); return r?JSON.parse(r):d; }catch(e){ return d; } }
  /* ---------- ترحيل مرة واحدة: توحيد جهات العمل في الموظفين (الحاليين والمنتهين) والمواقع وقوائم الإعدادات ---------- */
  function migrate(){
    if(localStorage.getItem('ariba_v121_mig')) return true;
    var all; try{ all=getEmps(); }catch(e){ return false; } if(!all||!all.length) return false;
    var changed=0;
    all.forEach(function(e){ var n=normEmployer(e.employer||e.em); if(n&&n!==(e.employer||e.em)){ e.employer=n; if(e.em) e.em=n; changed++; } });
    if(changed){ try{ saveEmps(all); }catch(e){} }
    var t=readJson('hr7_term_emps',[]); if(Array.isArray(t)&&t.length){ var tc=0; t.forEach(function(e){ var n=normEmployer(e.employer||e.em); if(n&&n!==(e.employer||e.em)){ e.employer=n; if(e.em) e.em=n; tc++; } }); if(tc){ try{ localStorage.setItem('hr7_term_emps',JSON.stringify(t)); }catch(e){} } }
    var ml=readJson('hr7_master_lists',null);
    if(ml&&typeof ml==='object'){ var keep=(ml.employers||[]).map(normEmployer).filter(function(x){ return x&&EMPLOYERS.indexOf(x)<0&&['دار التميز','أمانة الرياض','الصحة','تمهير'].indexOf(x)<0; }); ml.employers=EMPLOYERS.concat(keep.filter(function(x,i,a){ return a.indexOf(x)===i; })); try{ localStorage.setItem('hr7_master_lists',JSON.stringify(ml)); }catch(e){} }
    else { try{ localStorage.setItem('hr7_master_lists',JSON.stringify({departments:['التشغيل','الاستشارات','الخدمات اللوجيستية','المالية','التسويق','الموارد البشرية','تدريب','أخرى'],employers:EMPLOYERS.slice()})); }catch(e){} }
    try{ var locs=getLocs(), lc=0; locs.forEach(function(l){ var n=normEmployer(l.employer); if(l.employer&&l.employer!=='all'&&n!==l.employer){ l.employer=n; lc++; } }); if(lc) saveLocs(locs); }catch(e){}
    localStorage.setItem('ariba_v121_mig','1');
    try{ if(typeof v60refreshLists==='function') v60refreshLists(); }catch(e){}
    if(changed) notify(T('اتوحّدت جهات العمل: '+changed+' موظف (اريبا / أوبتيموم)','Employers unified: '+changed+' employees (Ariba / Optimum)'),false);
    return true;
  }
  /* ---------- مواقع العمل المتاحة للربط (مقرات ومشاريع، مش العمل عن بعد) ---------- */
  function physLocs(){ var a=[]; try{ a=getLocs(); }catch(e){} return a.filter(function(l){ return l&&l.active!==false&&l.type!=='remote'; }).sort(function(x,y){ return String(x.name||'').localeCompare(String(y.name||''),'ar'); }); }
  function typeTag(l){ return l.type==='hq'?T('مقر رئيسي','HQ'):T('مشروع','Project'); }
  var CSS_L='#WL_BOX{grid-column:1/-1;background:var(--c2);border:1px solid var(--bd);border-radius:10px;padding:10px 12px}#WL_BOX .t{font-size:12px;font-weight:800;margin-bottom:3px}#WL_BOX .h{font-size:10.5px;color:var(--mu);line-height:1.7;margin-bottom:6px}#WL_LIST{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:4px 12px}#WL_LIST label{display:flex;gap:6px;align-items:center;font-size:12px;cursor:pointer;margin:0;font-weight:500;color:var(--tx)}#WL_LIST input{width:auto;margin:0}#WL_LIST .tg{font-size:9.5px;background:rgba(41,179,94,.15);color:#1f9a4f;border-radius:8px;padding:0 6px}#WL_LIST .em{font-size:9.5px;color:var(--mu)}';
  var stl=document.createElement('style'); stl.id='ariba121-css'; stl.textContent=CSS_L; document.head.appendChild(stl);
  function selectedIds(){ return [].slice.call(document.querySelectorAll('#WL_LIST input:checked')).map(function(c){ return c.value; }); }
  function setIds(ids){ var set={}; (ids||[]).forEach(function(i){ set[String(i)]=1; }); document.querySelectorAll('#WL_LIST input').forEach(function(c){ c.checked=!!set[c.value]; }); }
  function buildList(keep){
    var lst=document.getElementById('WL_LIST'); if(!lst) return; var cur=keep||selectedIds(), locs=physLocs();
    lst.innerHTML=locs.length?locs.map(function(l){ return '<label><input type="checkbox" value="'+esc(l.id)+'"><span>'+esc(isEN()?(l.nameEn||l.name):l.name)+'</span><span class="tg">'+typeTag(l)+'</span>'+(l.employer&&l.employer!=='all'?'<span class="em">'+esc(l.employer)+'</span>':'')+'</label>'; }).join(''):'<div style="font-size:11px;color:var(--mu)">'+T('مفيش مواقع بصمة — أضف من "مواقع البصمة".','No punch locations — add them from "Punch locations".')+'</div>';
    setIds(cur);
  }
  function ensureForm(){
    var f=document.getElementById('EF2'); if(!f) return; var sel=f.elements['em']; if(!sel) return;
    if(!document.getElementById('WL_BOX')){
      var anchor=sel.parentNode, box=document.createElement('div'); box.id='WL_BOX';
      box.innerHTML='<div class="t"><i class="ti ti-map-pin"></i> '+T('مواقع العمل (مربوطة بمواقع البصمة)','Work locations (linked to punch locations)')+'</div><div class="h">'+T('اختار موقع أو أكتر — الموظف هيبصم في المواقع دي بس. لو سيبتها فاضية، هيبصم في مواقع جهة عمله زي الأول.','Pick one or more — the employee can punch only at these. If left empty, he punches at his employer\'s locations as before.')+'</div><div id="WL_LIST"></div>';
      anchor.parentNode.insertBefore(box,anchor.nextSibling); buildList([]);
    }
    /* لما يتغير الموظف المفتوح في الفورم: نحمّل مواقعه ونضبط قايمة جهة العمل (اريبا / أوبتيموم + جهة الموظف الحالية لو غيرهم) */
    var eid=(document.getElementById('EID')||{}).value||'';
    if(f.getAttribute('data-wlfor')!==eid){
      f.setAttribute('data-wlfor',eid); var e=null; try{ e=eid?(aEmps().concat(tEmps())).find(function(x){ return String(x.id)===String(eid); }):null; }catch(x){}
      buildList(e&&Array.isArray(e.workLocationIds)?e.workLocationIds:[]);
      var want=EMPLOYERS.slice(), cur=e?normEmployer(e.employer||e.em):''; if(cur&&want.indexOf(cur)<0) want.push(cur);
      sel.innerHTML='<option value="">'+T('اختر...','Select...')+'</option>'+want.map(function(x){ return '<option>'+esc(x)+'</option>'; }).join(''); if(cur) sel.value=cur;
    }
  }
  /* ---------- الحفظ: نضيف workLocationIds على الموظف في نفس حفظ الفورم ---------- */
  var CTX=null;
  (function(){ var o=window.sEmp; if(typeof o!=='function'||o.__v121) return;
    var g=function(ev){ var f=document.getElementById('EF2'); CTX={ids:selectedIds(),eid:(document.getElementById('EID')||{}).value||'',empNo:f&&f.elements['empNo']?String(f.elements['empNo'].value||'').trim():'',t:Date.now()}; return o.apply(this,arguments); }; g.__v121=1; window.sEmp=g; })();
  (function(){ var o=window.saveEmps; if(typeof o!=='function'||o.__v121) return;
    var g=function(d){ try{ if(CTX&&Date.now()-CTX.t<6000&&Array.isArray(d)){ d.forEach(function(e){ var hit=CTX.eid?(String(e.id)===String(CTX.eid)):(CTX.empNo&&String(e.empNo)===CTX.empNo); if(hit){ if(CTX.ids.length) e.workLocationIds=CTX.ids.slice(); else delete e.workLocationIds; } }); } }catch(x){} return o.apply(this,arguments); }; g.__v121=1; window.saveEmps=g; })();

  /* ---------- شاشة مواقع البصمة: مين مربوط بكل موقع ---------- */
  function paintSummary(){
    var grid=document.getElementById('LCG'); if(!grid||!grid.parentNode) return;
    var box=document.getElementById('WL_SUM');
    if(!box){ box=document.createElement('div'); box.id='WL_SUM'; box.className='card'; box.style.marginTop='12px'; grid.parentNode.appendChild(box); }
    var emps=[]; try{ emps=aEmps(); }catch(e){} var by={}, none=[];
    emps.forEach(function(e){ var ids=Array.isArray(e.workLocationIds)?e.workLocationIds:[]; if(!ids.length) none.push(e); ids.forEach(function(i){ (by[i]=by[i]||[]).push(e); }); });
    var nm=function(e){ return esc(String(isEN()?(e.nameEn||e.nameAr):(e.nameAr||e.nameEn)||'').split(' ').slice(0,3).join(' ')); };
    var rows=physLocs().map(function(l){ var a=by[l.id]||[]; return '<tr><td style="font-weight:700">'+esc(isEN()?(l.nameEn||l.name):l.name)+'</td><td>'+typeTag(l)+'</td><td style="text-align:center">'+a.length+'</td><td style="font-size:11px;color:var(--mu)">'+(a.length?a.map(nm).join('، '):'—')+'</td></tr>'; }).join('');
    var sig=JSON.stringify([rows,none.length]); if(box.getAttribute('data-sig')===sig) return; box.setAttribute('data-sig',sig);
    box.innerHTML='<div class="ct" style="padding:0 0 8px"><i class="ti ti-users"></i> '+T('الموظفين المربوطين بمواقع البصمة','Employees linked to punch locations')+'</div><div class="tw"><table><tr><th>'+T('الموقع','Location')+'</th><th>'+T('النوع','Type')+'</th><th>'+T('عدد الموظفين','Employees')+'</th><th>'+T('الأسماء','Names')+'</th></tr>'+rows+'</table></div><div style="font-size:11px;color:var(--mu);margin-top:6px">'+T('غير محدد لهم موقع ('+none.length+' موظف): بيبصموا في مواقع جهة عملهم.','No location assigned ('+none.length+' employees): they punch at their employer\'s locations.')+'</div>';
  }
  /* ---------- التشغيل ---------- */
  setInterval(function(){ if(!localStorage.getItem('ariba_v121_mig')) migrate(); ensureForm(); paintSummary(); },1200);
  setTimeout(function(){ migrate(); },1500);

  /* ===== V123: حد العمل عن بعد (يوم/سنة) بيتحفظ في السحابة مع إعدادات الحضور ويظهر في تطبيق الموظف ===== */
  (function(){ var o=window.saveSet; if(typeof o!=='function'||o.__v123) return;
    var g=function(){ var r=o.apply(this,arguments);
      try{ var rm=parseInt((document.getElementById('CO_RMT')||{}).value,10), st=(document.getElementById('CO_ST')||{}).value, tol=(document.getElementById('CO_TOL')||{}).value, t=window.ARIBA_HR_TOKEN||'';
        if(UUID.test(t)&&st&&tol!==''&&!isNaN(rm)){
          rpc('ariba_hr_set_attendance_settings',{p_token:t,p_work_start:st+':00',p_tolerance_minutes:parseInt(tol,10),p_remote_days_per_year:rm})
            .then(function(){ notify(T('✓ حد العمل عن بعد وصل لتطبيق الموظف','✓ Remote-work limit reached the Employee App'),false); })
            .catch(function(e){ notify(T('⚠️ حد العمل عن بعد اتحفظ محليًا بس: ','⚠️ Remote-work limit saved locally only: ')+(e&&e.message||e),true); });
        } }catch(x){}
      return r; };
    g.__v123=1; window.saveSet=g; })();
  var rmtLoaded=false;
  setInterval(function(){
    try{ var pg=document.getElementById('pg-set'), el=document.getElementById('CO_RMT'), t=window.ARIBA_HR_TOKEN||'';
      if(!pg||!pg.classList.contains('on')||!el||rmtLoaded||!UUID.test(t)) return; rmtLoaded=true;
      rpc('ariba_get_attendance_settings',{p_token:t}).then(function(r){ if(r&&r.remote_days_per_year!=null&&document.activeElement!==el) el.value=r.remote_days_per_year; }).catch(function(){ rmtLoaded=false; });
    }catch(e){}
  },1500);
  window.ARIBA_V121={migrate:migrate,normEmployer:normEmployer,selectedIds:selectedIds,physLocs:physLocs};
})();
