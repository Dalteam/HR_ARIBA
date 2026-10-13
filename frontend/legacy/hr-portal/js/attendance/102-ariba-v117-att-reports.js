
/* V117: تقارير الحضور المتقدمة + إصلاح التقرير الشهري (إضافة فقط) */
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


  /* ================= تقارير الحضور المتقدمة (V117) =================
     المصدر: ariba_hr_attendance_range (السيرفر) لأي مدى تواريخ — مش الحضور المحلي لليوم الواحد.
     القواعد (موثّقة في ذيل كل تقرير):
       - يوم العمل = مش جمعة/سبت (حسب إعداد البرنامج) ومش عطلة رسمية، وبعد تاريخ مباشرة الموظف، ومن غير اليوم الحالي.
       - حاضر/متأخر/عن بعد/غائب/إجازة حسب سجل البصمة؛ لو مفيش سجل: إجازة معتمدة => إجازة، غير كده => غائب.
       - التأخير والخروج المبكر من حساب السيرفر (الساعة المرنة + السماح) مش من حساب تاني. */
  var ST_AR={present:'حاضر',late:'متأخر',absent:'غائب',leave:'إجازة',remote:'عن بعد',off:'عطلة',pending:'لم يُسجَّل بعد'};
  var ST_EN={present:'Present',late:'Late',absent:'Absent',leave:'Leave',remote:'Remote',off:'Day off',pending:'Not yet'};
  function stL(s){ return (isEN()?ST_EN:ST_AR)[s]||s; }
  function pad(n){ return (n<10?'0':'')+n; }
  function ymd(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function parseD(s){ var p=String(s).slice(0,10).split('-'); return new Date(+p[0],+p[1]-1,+p[2]); }
  function todayS(){ return ymd(new Date()); }
  function secs(t){ if(!t) return null; var p=String(t).split(':'); return (+p[0])*3600+(+p[1]||0)*60+(parseFloat(p[2])||0); }
  function hm(t){ return t?String(t).slice(0,5):''; }
  function r2(n){ return Math.round(n*100)/100; }
  function dayName(d){ return d.toLocaleDateString(isEN()?'en-US':'ar-SA',{weekday:'long'}); }
  function dispD(s){ var p=String(s).split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }

  /* ---- الجلب ---- */
  async function fetchRange(from,to){
    var t=window.ARIBA_HR_TOKEN||'';
    if(!UUID.test(t)) throw new Error(T('محتاج تسجيل دخول سحابي عشان التقرير يقرأ الحضور الحقيقي','A real cloud sign-in is required to read attendance'));
    var rows=await rpc('ariba_hr_attendance_range',{p_token:t,p_from:from,p_to:to,p_employee_id:null});
    return Array.isArray(rows)?rows:[];
  }
  function empKey(e){ return String(e.id); }
  function joinOf(e){ return e.contractJoin||e.join||e.joinDate||e.join_date||''; }
  function buildEmpMaps(){
    var all=(typeof window.aEmps==='function'?window.aEmps():[]); var byId={},byNo={};
    all.forEach(function(e){ byId[String(e.id)]=e; if(e.empNo!=null&&e.empNo!=='') byNo[String(e.empNo)]=e; });
    return {all:all,byId:byId,byNo:byNo};
  }
  /* تجميع بصمات اليوم الواحد (أكتر من جلسة) في سجل واحد */
  function groupRows(rows,maps){
    var g={};
    rows.forEach(function(r){
      var e=maps.byId[String(r.emp_id)]||maps.byNo[String(r.emp_id)]; if(!e) return;
      var k=empKey(e)+'|'+r.date; (g[k]=g[k]||{e:e,date:String(r.date).slice(0,10),rows:[]}).rows.push(r);
    });
    Object.keys(g).forEach(function(k){
      var x=g[k], rs=x.rows.slice().sort(function(a,b){ return (secs(a.time_in)==null?1e9:secs(a.time_in))-(secs(b.time_in)==null?1e9:secs(b.time_in)); });
      /* صفوف متطابقة (نفس وقت الدخول) = بصمة مكررة بالغلط: نحسبها مرة واحدة */
      var seenIn={}, uniq=[];
      rs.forEach(function(r){ if(r.time_in && seenIn[String(r.time_in)]!==undefined){ var q=uniq[seenIn[String(r.time_in)]]; if((secs(r.time_out)||0)>(secs(q.time_out)||0)) uniq[seenIn[String(r.time_in)]]=r; } else { if(r.time_in) seenIn[String(r.time_in)]=uniq.length; uniq.push(r); } });
      rs=uniq;
      var first=rs[0], withIn=rs.filter(function(r){ return r.time_in; });
      var isAuto=function(r){ return /إغلاق تلقائي|auto/i.test(String(r.notes||'')); };
      var hours=0, anyAuto=false;
      withIn.forEach(function(r){ var au=isAuto(r); if(au) anyAuto=true; if(r.time_out && !au){ var dd=(secs(r.time_out)-secs(r.time_in))/3600; if(dd>0) hours+=dd; } });
      /* الجلسة الأخيرة (آخر دخول): انصرافها هو "الانصراف المحسوب" — لو الموظف خرج بالغلط ورجع، يُحسب آخر خروج */
      var lastS=withIn.length?withIn[withIn.length-1]:first, finalReal=!!(lastS&&lastS.time_out&&!isAuto(lastS));
      var anyLate=rs.some(function(r){ return r.status==='late'; }), st=first.status||'present';
      x.in=first.time_in||null; x.out=finalReal?lastS.time_out:null;
      x.status=(st==='absent'||st==='leave'||st==='remote')?st:((first.status==='late'||(anyLate&&withIn.length<=1))?'late':'present');
      x.late=(first.status==='late'||st==='late')?(Number(first.late_minutes)||0):0;
      x.early=finalReal?(Number(lastS.early_minutes)||0):0; x.hours=r2(hours); x.open=!finalReal&&!!(lastS&&!lastS.time_out); x.auto=anyAuto;
      x.noOut=!!first.time_in && !finalReal; x.sessions=withIn.length;
      x.loc=first.location_name||''; x.notes=rs.map(function(r){return r.notes;}).filter(Boolean).join(' | ');
    });
    return g;
  }
  function leaveMap(){
    var m={};
    try{
      (typeof getLvs==='function'?getLvs():[]).forEach(function(l){
        if(String(l.status||'').toLowerCase()!=='approved') return;
        var eid=String(typeof leaveEmployeeId==='function'?leaveEmployeeId(l):(l.empId||l.emp_id)); if(!eid) return;
        var f=typeof leaveDateValue==='function'?leaveDateValue(l,'from'):(l.from||l.from_date), t=typeof leaveDateValue==='function'?leaveDateValue(l,'to'):(l.to||l.to_date);
        if(!f) return; t=t||f; var type=typeof leaveTypeValue==='function'?leaveTypeValue(l):(l.type||'');
        var a=parseD(f), b=parseD(t); for(var d=new Date(a); d<=b; d.setDate(d.getDate()+1)){ (m[eid]=m[eid]||{})[ymd(d)]=(type==='remote'?'remote':'leave'); }
      });
    }catch(e){}
    return m;
  }
  function isOff(d){ try{ return !(typeof isLeaveWorkday==='function'?isLeaveWorkday(d):(d.getDay()!==5&&d.getDay()!==6)) || (typeof isOfficialHoliday==='function'&&isOfficialHoliday(d)); }catch(e){ return d.getDay()===5||d.getDay()===6; } }

  /* ---- الحساب: لكل موظف ولكل يوم ---- */
  function compute(rows,from,to,emps,maps){
    var grp=groupRows(rows,maps), lv=leaveMap(), today=todayS(), out=[];
    var a=parseD(from), b=parseD(to);
    emps.forEach(function(e){
      var jn=joinOf(e), id=empKey(e), days=[];
      var s={e:e,expected:0,present:0,late:0,absent:0,leave:0,remote:0,offWorked:0,lateMin:0,early:0,earlyDays:0,noOut:0,hours:0,inSum:0,inCnt:0};
      for(var d=new Date(a); d<=b; d.setDate(d.getDate()+1)){
        var ds=ymd(d); if(ds>today) break; if(jn && ds<String(jn).slice(0,10)) continue;
        var g=grp[id+'|'+ds], off=isOff(d), cls, rec=null;
        if(g){ rec=g; cls=g.status; }
        else if(off){ cls='off'; }
        else if(lv[id]&&lv[id][ds]){ cls=lv[id][ds]; }
        else if(ds===today){ cls='pending'; }
        else cls='absent';
        if(rec && (cls==='present'||cls==='late'||cls==='remote') && off) s.offWorked++;
        if(cls!=='off'&&cls!=='pending'&&!(off&&rec)) s.expected++;
        if(cls==='present') s.present++; else if(cls==='late') s.late++; else if(cls==='absent') s.absent++; else if(cls==='leave') s.leave++; else if(cls==='remote') s.remote++;
        if(rec){
          if(cls==='late') s.lateMin+=rec.late;
          if(rec.early>0){ s.early+=rec.early; s.earlyDays++; }
          if(rec.noOut && ds<today) s.noOut++;
          s.hours+=rec.hours;
          if(rec.in){ s.inSum+=secs(rec.in); s.inCnt++; }
        }
        days.push({date:ds,dow:dayName(d),cls:cls,rec:rec});
      }
      s.hours=r2(s.hours); s.days=days;
      var base=s.expected-s.leave; s.rate=base>0?Math.round(((s.present+s.late+s.remote)/base)*1000)/10:null;
      s.avgIn=s.inCnt?(function(x){ var m=Math.round(x/60); return pad(Math.floor(m/60))+':'+pad(m%60); })(s.inSum/s.inCnt):'';
      out.push(s);
    });
    return out;
  }
  var FILTERS={
    all:{ar:'كل الموظفين',en:'All employees',f:function(){return true;}},
    late:{ar:'المتأخرون فقط',en:'Late only',f:function(s,n){return s.late>=n;}},
    absent:{ar:'الغائبون فقط',en:'Absent only',f:function(s,n){return s.absent>=n;}},
    early:{ar:'عندهم خروج مبكر',en:'Early exit',f:function(s,n){return s.earlyDays>=n;}},
    noout:{ar:'بدون بصمة انصراف',en:'Missing check-out',f:function(s,n){return s.noOut>=n;}},
    remote:{ar:'عن بعد',en:'Remote',f:function(s,n){return s.remote>=n;}},
    leave:{ar:'في إجازة',en:'On leave',f:function(s,n){return s.leave>=n;}},
    clean:{ar:'ملتزمون (بدون تأخير أو غياب)',en:'Fully compliant',f:function(s){return s.late===0&&s.absent===0&&(s.present+s.remote)>0;}}
  };

  /* ---- الواجهة ---- */
  var STATE={sel:null,res:null,from:'',to:'',mode:'sum'};
  function monthStart(d){ return ymd(new Date(d.getFullYear(),d.getMonth(),1)); }
  function ensureUI(){
    var pg=document.getElementById('pg-att'); if(!pg || document.getElementById('ariba117AttCard')) return;
    var c=document.createElement('div'); c.className='card'; c.id='ariba117AttCard'; c.style.cssText='padding:12px;margin-top:12px';
    var now=new Date();
    c.innerHTML='<div class="ct" style="margin-bottom:10px"><i class="ti ti-report-analytics"></i> '+T('تقارير الحضور والانصراف','Attendance reports')+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;align-items:end">'
      +fld2(T('من تاريخ','From'),'<input type="date" id="A117F" value="'+monthStart(now)+'">')
      +fld2(T('إلى تاريخ','To'),'<input type="date" id="A117T" value="'+ymd(now)+'">')
      +fld2(T('الفلتر','Filter'),'<select id="A117Flt">'+Object.keys(FILTERS).map(function(k){ return '<option value="'+k+'">'+FILTERS[k][isEN()?'en':'ar']+'</option>'; }).join('')+'</select>')
      +fld2(T('الحد الأدنى للأيام','Min. days'),'<input type="number" id="A117N" min="1" value="1">')
      +fld2(T('نوع التقرير','Report type'),'<select id="A117M"><option value="sum">'+T('ملخص لكل موظف','Summary per employee')+'</option><option value="det">'+T('تفصيلي يومي','Daily detail')+'</option></select>')
      +'</div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">'
      +['m0:'+T('هذا الشهر','This month'),'m1:'+T('الشهر الماضي','Last month'),'d7:'+T('آخر 7 أيام','Last 7 days'),'y0:'+T('هذه السنة','This year')].map(function(x){ var p=x.split(':'); return '<button type="button" class="btn bgr bsm" data-q="'+p[0]+'">'+p[1]+'</button>'; }).join('')
      +'<button type="button" class="btn bgr bsm" id="A117EmpBtn"><i class="ti ti-users"></i> <span id="A117EmpLbl">'+T('كل الموظفين','All employees')+'</span></button></div>'
      +'<div id="A117Panel" style="display:none;border:1px solid var(--bd);border-radius:8px;padding:8px;margin-bottom:8px">'
      +'<div style="display:flex;gap:6px;margin-bottom:6px"><input id="A117Q" placeholder="'+T('بحث بالاسم أو الرقم الوظيفي','Search name or no.')+'" style="flex:1"><select id="A117Dep"><option value="">'+T('كل الأقسام','All departments')+'</option></select><button type="button" class="btn bgr bsm" id="A117All">'+T('تحديد الكل','Select all')+'</button><button type="button" class="btn bgr bsm" id="A117None">'+T('إلغاء الكل','Clear')+'</button></div>'
      +'<div id="A117List" style="max-height:200px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:2px 10px"></div></div>'
      +'<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn bpl bsm" id="A117Run"><i class="ti ti-search"></i> '+T('عرض التقرير','Show report')+'</button>'
      +'<button type="button" class="btn bgr bsm" id="A117Print"><i class="ti ti-printer"></i> '+T('طباعة','Print')+'</button>'
      +'<button type="button" class="btn bgr bsm" id="A117Xls"><i class="ti ti-file-spreadsheet"></i> Excel</button></div>'
      +'<div id="A117Out" style="margin-top:10px"></div>';
    pg.appendChild(c);
    function setQ(q){ var n=new Date(), f,t; if(q==='m0'){ f=monthStart(n); t=ymd(n); } else if(q==='m1'){ f=ymd(new Date(n.getFullYear(),n.getMonth()-1,1)); t=ymd(new Date(n.getFullYear(),n.getMonth(),0)); } else if(q==='d7'){ f=ymd(new Date(n.getFullYear(),n.getMonth(),n.getDate()-6)); t=ymd(n); } else { f=n.getFullYear()+'-01-01'; t=ymd(n); } document.getElementById('A117F').value=f; document.getElementById('A117T').value=t; }
    c.querySelectorAll('[data-q]').forEach(function(b){ b.onclick=function(){ setQ(b.getAttribute('data-q')); run(); }; });
    document.getElementById('A117EmpBtn').onclick=function(){ var p=document.getElementById('A117Panel'); p.style.display=p.style.display==='none'?'block':'none'; fillList(); };
    document.getElementById('A117Q').oninput=fillList; document.getElementById('A117Dep').onchange=fillList;
    document.getElementById('A117All').onclick=function(){ STATE.sel=null; fillList(true); lbl(); };
    document.getElementById('A117None').onclick=function(){ STATE.sel={}; fillList(); lbl(); };
    document.getElementById('A117Run').onclick=run; document.getElementById('A117Print').onclick=doPrint; document.getElementById('A117Xls').onclick=doXls;
  }
  function fld2(l,i){ return '<div><label style="font-size:10px;color:var(--mu);font-weight:600;display:block;margin-bottom:2px">'+l+'</label>'+i.replace('<input','<input style="width:100%"').replace('<select','<select style="width:100%"')+'</div>'; }
  function empName(e){ return isEN()?(e.nameEn||e.nameAr||e.id):(e.nameAr||e.nameEn||e.id); }
  function deptOf(e){ return e.dept||e.department||''; }
  function lbl(){ var el=document.getElementById('A117EmpLbl'); if(!el) return; var n=STATE.sel?Object.keys(STATE.sel).filter(function(k){return STATE.sel[k];}).length:0; el.textContent=STATE.sel?(n+' '+T('موظف محدد','selected')):T('كل الموظفين','All employees'); }
  function fillList(forceAll){
    var box=document.getElementById('A117List'); if(!box) return;
    var maps=buildEmpMaps(), q=(document.getElementById('A117Q').value||'').trim().toLowerCase(), dep=document.getElementById('A117Dep').value;
    var ds={}; maps.all.forEach(function(e){ if(deptOf(e)) ds[deptOf(e)]=1; });
    var sel=document.getElementById('A117Dep'); if(sel.options.length<=1){ Object.keys(ds).forEach(function(d){ sel.insertAdjacentHTML('beforeend','<option>'+esc(d)+'</option>'); }); }
    var list=maps.all.filter(function(e){ return (!dep||deptOf(e)===dep) && (!q||(String(e.nameAr||'')+' '+String(e.nameEn||'')+' '+String(e.empNo||'')).toLowerCase().indexOf(q)>=0); });
    box.innerHTML=list.map(function(e){ var on=!STATE.sel||STATE.sel[empKey(e)]; return '<label style="display:flex;gap:5px;align-items:center;font-size:12px"><input type="checkbox" data-id="'+esc(empKey(e))+'"'+(on?' checked':'')+'> '+esc(empName(e))+'</label>'; }).join('')||'<div style="color:var(--mu)">—</div>';
    box.querySelectorAll('input').forEach(function(cb){ cb.onchange=function(){ var all=buildEmpMaps().all; if(!STATE.sel){ STATE.sel={}; all.forEach(function(e){ STATE.sel[empKey(e)]=true; }); } STATE.sel[cb.getAttribute('data-id')]=cb.checked; lbl(); }; });
  }
  function selectedEmps(){ var all=buildEmpMaps().all; return STATE.sel?all.filter(function(e){ return STATE.sel[empKey(e)]; }):all; }

  async function run(){
    var out=document.getElementById('A117Out'); if(!out) return null;
    var from=document.getElementById('A117F').value, to=document.getElementById('A117T').value;
    if(!from||!to||to<from){ notify(T('حدد فترة صحيحة (من ≤ إلى)','Choose a valid date range'),true); return null; }
    var fk=document.getElementById('A117Flt').value, n=Math.max(1,parseInt(document.getElementById('A117N').value)||1), mode=document.getElementById('A117M').value;
    out.innerHTML='<div style="padding:14px;color:var(--mu)">'+T('جاري تحميل الحضور من السيرفر…','Loading attendance…')+'</div>';
    try{
      var rows=await fetchRange(from,to), maps=buildEmpMaps(), emps=selectedEmps();
      var res=compute(rows,from,to,emps,maps).filter(function(s){ return FILTERS[fk].f(s,n); });
      STATE.res=res; STATE.from=from; STATE.to=to; STATE.mode=mode; STATE.fk=fk; STATE.n=n; STATE.rawCount=rows.length;
      out.innerHTML=renderTable(res,mode,false);
      return res;
    }catch(e){ out.innerHTML='<div style="padding:14px;color:var(--rd)">'+esc(e.message||e)+'</div>'; return null; }
  }
  function kpis(res){
    var t={emps:res.length,present:0,late:0,absent:0,leave:0,remote:0,lateMin:0,hours:0};
    res.forEach(function(s){ t.present+=s.present; t.late+=s.late; t.absent+=s.absent; t.leave+=s.leave; t.remote+=s.remote; t.lateMin+=s.lateMin; t.hours+=s.hours; }); t.hours=r2(t.hours); return t;
  }
  function hdrs(){ return isEN()?['#','Employee','Working days','Present','Late','Absent','Leave','Remote','Late (min)','Early exit (min)','No check-out','Hours','Attendance %']:['#','الموظف','أيام العمل','حاضر','متأخر','غائب','إجازة','عن بعد','دقائق التأخير','خروج مبكر (د)','بدون انصراف','الساعات','نسبة الحضور']; }
  function sumRow(s,i){ return [i+1,empName(s.e),s.expected,s.present,s.late,s.absent,s.leave,s.remote,s.lateMin,s.early,s.noOut,s.hours,s.rate==null?'':s.rate]; }
  function renderTable(res,mode,forPrint){
    if(!res.length) return '<div style="padding:16px;text-align:center;color:var(--mu)">'+T('لا توجد نتائج مطابقة للفلتر','No matching results')+'</div>';
    var k=kpis(res), dir=isEN()?'ltr':'rtl';
    var box=function(v,l){ return '<div style="background:var(--c2);border-radius:8px;padding:6px 10px;text-align:center;min-width:80px"><div style="font-weight:800;font-size:15px">'+v+'</div><div style="font-size:10px;color:var(--mu)">'+l+'</div></div>'; };
    var h='<div dir="'+dir+'">'+(forPrint?'':'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">'+box(k.emps,T('موظف','Employees'))+box(k.present,T('حاضر','Present'))+box(k.late,T('متأخر','Late'))+box(k.absent,T('غائب','Absent'))+box(k.leave,T('إجازة','Leave'))+box(k.remote,T('عن بعد','Remote'))+box(k.lateMin,T('دقائق التأخير','Late min'))+'</div>');
    if(mode==='det'){
      h+=res.map(function(s){
        return '<div style="font-weight:800;margin:10px 0 4px">'+esc(empName(s.e))+' <span style="font-weight:400;color:var(--mu);font-size:11px">'+esc(s.e.empNo||'')+'</span></div><div class="tw"><table><tr>'+detHdr().map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr>'+s.days.filter(function(d){ return d.cls!=='off'||d.rec; }).map(function(d){ return '<tr>'+detRow(d).map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'</tr>'; }).join('')+'</table></div>';
      }).join('');
    } else {
      h+='<div class="tw"><table><tr>'+hdrs().map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr>'+res.map(function(s,i){ return '<tr>'+sumRow(s,i).map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'</tr>'; }).join('')+'</table></div>';
    }
    return h+'</div>';
  }
  function detHdr(){ return isEN()?['Date','Day','Status','Check-in','Check-out','Late (min)','Early exit (min)','Hours','Notes']:['التاريخ','اليوم','الحالة','دخول','خروج','تأخير (د)','خروج مبكر (د)','الساعات','ملاحظات']; }
  function detRow(d){
    var r=d.rec, note='';
    if(r){ note=r.auto?T('الجلسة الأخيرة اتقفلت تلقائيًا (بدون بصمة انصراف)','Last session auto-closed (no check-out)'):(r.noOut?T('بدون بصمة انصراف','No check-out'):'');
      if(r.sessions>1) note=(note?note+' — ':'')+r.sessions+T(' جلسات، الانصراف = آخر جلسة',' sessions, check-out = last session'); }
    return [dispD(d.date),d.dow,stL(d.cls),r?hm(r.in):'',r?hm(r.out):'',r&&d.cls==='late'?r.late:'',r&&r.early>0?r.early:'',r?r.hours:'',note];
  }

  /* ---- الطباعة على نموذج أريبا ---- */
  function letterhead(){
    var h=window.tfWrap71('x','y',''), m1=h.match(/<img[^>]*class="lh-head"[^>]*src="([^"]+)"/), m2=h.match(/<img[^>]*class="lh-foot"[^>]*src="([^"]+)"/);
    return {head:m1?m1[1]:'',foot:m2?m2[1]:''};
  }
  var PCSS='<style>@page{size:A4;margin:0}*{box-sizing:border-box}body{font-family:"ARIBA Two","Segoe UI",Tahoma,Arial,sans-serif;color:#14231d;margin:0;font-size:10px}.doc{max-width:210mm;margin:0 auto;padding:0 12mm}.lh-head{width:calc(100% + 24mm);display:block;margin:0 -12mm 4mm -12mm;max-width:none}.lh-foot{width:100%;display:block;position:fixed;bottom:0;left:0}.body{padding-bottom:30mm}.t{text-align:center;font-size:16px;font-weight:900;color:#014D3D}.s{text-align:center;color:#555;margin:1mm 0 4mm;font-size:11px}.k{display:flex;gap:5px;margin-bottom:4mm}.k div{flex:1;background:#eef5f2;border:1px solid #d8e2de;border-radius:7px;padding:5px;text-align:center}.k b{display:block;font-size:14px;color:#014D3D}.k span{font-size:8.5px;color:#666}table{width:100%;border-collapse:collapse;font-size:8.5px;margin-bottom:3mm}th{background:#014D3D;color:#fff;padding:4px 3px;text-align:center}td{padding:3px;border-bottom:1px solid #e5ece9;text-align:center}tr{page-break-inside:avoid}tr:nth-child(even){background:#f8faf9}h4{background:#014D3D;color:#fff;padding:4px 8px;border-radius:5px;margin:4mm 0 1mm;font-size:11px;page-break-after:avoid}.n{margin-top:4mm;padding-top:2mm;border-top:1px solid #ddd;font-size:8px;color:#777;line-height:1.7}</style>';
  function printHtmlDoc(res,mode){
    var lh=letterhead(), k=kpis(res), dir=isEN()?'ltr':'rtl';
    var title=T('تقرير الحضور والانصراف','Attendance Report'), sub=T('من ','From ')+dispD(STATE.from)+T(' إلى ',' to ')+dispD(STATE.to)+' — '+FILTERS[STATE.fk||'all'][isEN()?'en':'ar'];
    var kp='<div class="k">'+[[k.emps,T('موظف','Employees')],[k.present,T('حاضر','Present')],[k.late,T('متأخر','Late')],[k.absent,T('غائب','Absent')],[k.leave,T('إجازة','Leave')],[k.remote,T('عن بعد','Remote')],[k.lateMin,T('دقائق التأخير','Late min')]].map(function(x){ return '<div><b>'+x[0]+'</b><span>'+x[1]+'</span></div>'; }).join('')+'</div>';
    var body;
    if(mode==='det'){ body=res.map(function(s){ return '<h4>'+esc(empName(s.e))+' — '+esc(s.e.empNo||'')+'</h4><table><tr>'+detHdr().map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr>'+s.days.filter(function(d){return d.cls!=='off'||d.rec;}).map(function(d){ return '<tr>'+detRow(d).map(function(x){return '<td>'+esc(x)+'</td>';}).join('')+'</tr>'; }).join('')+'</table>'; }).join(''); }
    else body='<table><tr>'+hdrs().map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr>'+res.map(function(s,i){ return '<tr>'+sumRow(s,i).map(function(x,j){ return '<td'+(j===1?' style="text-align:'+(isEN()?'left':'right')+'"':'')+'>'+esc(x)+'</td>'; }).join('')+'</tr>'; }).join('')+'</table>';
    var note=T('طريقة الحساب: يوم العمل = غير الجمعة/السبت والعطلات الرسمية وبعد تاريخ المباشرة ولا يشمل اليوم الحالي. الغياب = يوم عمل بدون بصمة وبدون إجازة معتمدة. التأخير والخروج المبكر من حساب النظام (الساعة المرنة وفترة السماح). السجلات المُقفلة تلقائيًا (بدون بصمة انصراف) لا تدخل في مجموع الساعات.','Method: a working day excludes Fri/Sat, official holidays, days before the hire date and today. Absent = working day with no punch and no approved leave. Late / early-exit minutes come from the system (flexible hours and grace). Auto-closed records (no check-out) are excluded from total hours.');
    return PCSS+'<div class="doc" dir="'+dir+'"><img class="lh-head" src="'+lh.head+'"><div class="body"><div class="t">'+title+'</div><div class="s">'+esc(sub)+'</div>'+kp+body+'<div class="n">'+note+'</div></div><img class="lh-foot" src="'+lh.foot+'"></div>';
  }
  async function doPrint(){
    var res=await run(); if(!res) return; if(!res.length){ notify(T('مفيش بيانات للطباعة','Nothing to print'),true); return; }
    if(typeof window.printHtml==='function') window.printHtml(T('تقرير الحضور','Attendance report'), printHtmlDoc(res,STATE.mode));
  }

  /* ---- Excel حقيقي (.xlsx) بدون مكتبات ---- */
  var CRC=(function(){ var t=[],c,n,k; for(n=0;n<256;n++){ c=n; for(k=0;k<8;k++) c=c&1?0xEDB88320^(c>>>1):c>>>1; t[n]=c>>>0; } return t; })();
  function crc32(u8){ var c=0xFFFFFFFF; for(var i=0;i<u8.length;i++) c=CRC[(c^u8[i])&255]^(c>>>8); return (c^0xFFFFFFFF)>>>0; }
  function u8(s){ return new TextEncoder().encode(s); }
  function zip(files){
    var chunks=[],central=[],off=0;
    function w16(a,v){ a.push(v&255,(v>>>8)&255); } function w32(a,v){ a.push(v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255); }
    files.forEach(function(f){
      var name=u8(f.name), data=u8(f.data), crc=crc32(data), h=[]; w32(h,0x04034b50); w16(h,20); w16(h,0x0800); w16(h,0); w16(h,0); w16(h,0x21); w32(h,crc); w32(h,data.length); w32(h,data.length); w16(h,name.length); w16(h,0);
      chunks.push(new Uint8Array(h),name,data);
      var c=[]; w32(c,0x02014b50); w16(c,20); w16(c,20); w16(c,0x0800); w16(c,0); w16(c,0); w16(c,0x21); w32(c,crc); w32(c,data.length); w32(c,data.length); w16(c,name.length); w16(c,0); w16(c,0); w16(c,0); w16(c,0); w32(c,0); w32(c,off);
      central.push(new Uint8Array(c),name); off+=h.length+name.length+data.length;
    });
    var csz=0; central.forEach(function(x){ csz+=x.length; });
    var e=[]; w32(e,0x06054b50); w16(e,0); w16(e,0); w16(e,files.length); w16(e,files.length); w32(e,csz); w32(e,off); w16(e,0);
    return new Blob(chunks.concat(central,[new Uint8Array(e)]),{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function colL(i){ var s=''; i++; while(i>0){ var m=(i-1)%26; s=String.fromCharCode(65+m)+s; i=Math.floor((i-1)/26); } return s; }
  function xesc(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,''); }
  function sheetXml(rows,widths){
    var x='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"'+(isEN()?'':' rightToLeft="1"')+'><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'+widths.map(function(w,i){ return '<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>'; }).join('')+'</cols><sheetData>';
    rows.forEach(function(r,ri){ x+='<row r="'+(ri+1)+'">'+r.map(function(v,ci){ var ref=colL(ci)+(ri+1), st=ri===0?' s="1"':''; if(typeof v==='number'&&isFinite(v)) return '<c r="'+ref+'"'+st+'><v>'+v+'</v></c>'; if(v===''||v==null) return '<c r="'+ref+'"'+st+'/>'; return '<c r="'+ref+'" t="inlineStr"'+st+'><is><t xml:space="preserve">'+xesc(v)+'</t></is></c>'; }).join('')+'</row>'; });
    return x+'</sheetData></worksheet>';
  }
  function buildXlsx(sheets){
    var ct='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map(function(s,i){ return '<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('')+'</Types>';
    var rels='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    var wb='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'+sheets.map(function(s,i){ return '<sheet name="'+xesc(s.name).slice(0,31)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>'; }).join('')+'</sheets></workbook>';
    var wbr='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map(function(s,i){ return '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>'; }).join('')+'<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
    var st='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF014D3D"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
    var files=[{name:'[Content_Types].xml',data:ct},{name:'_rels/.rels',data:rels},{name:'xl/workbook.xml',data:wb},{name:'xl/_rels/workbook.xml.rels',data:wbr},{name:'xl/styles.xml',data:st}];
    sheets.forEach(function(s,i){ files.push({name:'xl/worksheets/sheet'+(i+1)+'.xml',data:sheetXml(s.rows,s.widths)}); });
    return zip(files);
  }
  function xlsxSheets(res){
    var sumRows=[hdrs().slice(1).concat([T('متوسط وقت الدخول','Avg check-in')])].concat(res.map(function(s,i){ return sumRow(s,i).slice(1).concat([s.avgIn]); }));
    var detRows=[[T('الموظف','Employee'),T('الرقم الوظيفي','Emp. no')].concat(detHdr())];
    res.forEach(function(s){ s.days.filter(function(d){return d.cls!=='off'||d.rec;}).forEach(function(d){ detRows.push([empName(s.e),String(s.e.empNo||'')].concat(detRow(d).map(function(v,i){ return (i===5||i===6||i===7)&&v!==''?Number(v):v; }))); }); });
    return [{name:T('ملخص','Summary'),rows:sumRows,widths:[26,12,10,10,10,10,10,12,14,12,10,12,16]},{name:T('تفصيلي','Detail'),rows:detRows,widths:[26,12,12,12,12,10,10,12,14,10,28]}];
  }
  async function doXls(){
    var res=await run(); if(!res) return; if(!res.length){ notify(T('مفيش بيانات للتصدير','Nothing to export'),true); return; }
    var blob=buildXlsx(xlsxSheets(res)), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='attendance_'+STATE.from+'_to_'+STATE.to+'.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  }
  window.ARIBA117={compute:compute,groupRows:groupRows,buildXlsx:buildXlsx,xlsxSheets:xlsxSheets,STATE:STATE,fetchRange:fetchRange};


  /* ---- سجل الحضور اليومي (بالتاريخ المختار): نفس مصدر وحساب التقارير — أول دخول، آخر انصراف، تأخير/خروج مبكر السيرفر ---- */
  var DAILY={date:null,rows:null,at:0,loading:false};
  function dailyDate(){ return (document.getElementById('AD')||{}).value||''; }
  function dailyReady(){ return !!(DAILY.rows && DAILY.date===dailyDate() && UUID.test(token())); }
  function findDiv(col,icon){ var ds=col.querySelectorAll(':scope > div'); for(var i=0;i<ds.length;i++){ if(ds[i].textContent.trim().indexOf(icon)===0) return ds[i]; } return null; }
  function putLine(col,after,icon,text,color){
    var el=findDiv(col,icon);
    if(!text){ if(el&&el.parentNode) el.parentNode.removeChild(el); return; }
    if(!el){ el=document.createElement('div'); el.style.cssText='font-size:10px;color:'+color; after.parentNode.insertBefore(el,after.nextSibling); }
    el.textContent=text;
  }
  function applyDaily(){
    try{
      if(!dailyReady()) return;
      var box=document.getElementById('ATL'); if(!box) return;
      var emps=(typeof window.aEmps==='function'?window.aEmps():[]); if(box.children.length!==emps.length) return;
      var maps=buildEmpMaps(), grp=groupRows(DAILY.rows,maps), date=DAILY.date;
      for(var i=0;i<emps.length;i++){
        var g=grp[empKey(emps[i])+'|'+date]; if(!g) continue;
        var cols=box.children[i].querySelectorAll(':scope > div'), col=cols[2]; if(!col) continue;
        var anchor=null; [].forEach.call(col.querySelectorAll(':scope > div'),function(d){ if(!anchor&&d.textContent.indexOf('\u2192')>=0) anchor=d; });
        if(!anchor) continue;
        anchor.textContent=hm(g.in)+' \u2192 '+(g.out?hm(g.out):'\u2026')+(g.sessions>1?'  (\u00D7'+g.sessions+')':'');
        var last=anchor;
        putLine(col,last,'\u23F0',(g.status==='late'&&g.late>0)?('\u23F0 '+T('تأخير ','Late ')+g.late+T(' دقيقة',' min')):'','var(--am)'); last=findDiv(col,'\u23F0')||last;
        putLine(col,last,'\uD83D\uDEAA',g.early>0?('\uD83D\uDEAA '+T('خروج مبكر ','Early exit ')+g.early+T(' دقيقة',' min')):'','var(--rd)'); last=findDiv(col,'\uD83D\uDEAA')||last;
        putLine(col,last,'\u23F1',g.hours>0?('\u23F1 '+g.hours+T(' ساعة',' h')):'','var(--mu)');
      }
    }catch(e){}
  }
  function loadDaily(){
    var d=dailyDate(); if(!d||!UUID.test(token())||DAILY.loading) return;
    if(DAILY.date===d && Date.now()-DAILY.at<15000) return;
    DAILY.loading=true;
    fetchRange(d,d).then(function(rows){ DAILY.rows=rows; DAILY.date=d; DAILY.at=Date.now(); applyDaily(); }).catch(function(){}).then(function(){ DAILY.loading=false; });
  }
  (function(){
    var f=window.rAtt; if(typeof f==='function'&&!f.__v117d){ var g=function(){ var r=f.apply(this,arguments); applyDaily(); loadDaily(); return r; }; g.__v117d=1; window.rAtt=g; }
    setInterval(function(){ loadDaily(); applyDaily(); },1500);
  })();
  window.ARIBA117.dailyReady=dailyReady;

  /* ---- التقرير الشهري القديم (الجدول الصغير): يقرأ من السيرفر للشهر كامل بدل اليوم الواحد المحلي ---- */
  window.rMonAtt=async function(){
    var tb=document.getElementById('AMT'); if(!tb) return;
    var eid=(document.getElementById('AME')||{}).value||'', mon=(document.getElementById('AMM')||{}).value||'';
    if(!mon) return;
    var p=mon.split('-'), from=mon+'-01', to=ymd(new Date(+p[0],+p[1],0)), H=isEN()?['Employee','Present','Late','Absent','Leave','Remote','Late (min)','Hours']:['الموظف','حاضر','متأخر','غائب','إجازة','عن بعد','دقائق التأخير','الساعات'];
    tb.innerHTML='<tr><td style="padding:14px;color:var(--mu)">'+T('جاري التحميل…','Loading…')+'</td></tr>';
    try{
      var rows=await fetchRange(from,to), maps=buildEmpMaps(), emps=maps.all.filter(function(e){ return !eid||String(e.id)===String(eid); });
      var res=compute(rows,from,to,emps,maps);
      tb.innerHTML='<tr>'+H.map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr>'+res.map(function(s){ return '<tr><td>'+esc(empName(s.e).split(' ').slice(0,3).join(' '))+'</td><td style="color:var(--gr)">'+s.present+'</td><td style="color:var(--am)">'+s.late+'</td><td style="color:var(--rd)">'+s.absent+'</td><td style="color:var(--pu)">'+s.leave+'</td><td style="color:var(--cy)">'+s.remote+'</td><td>'+s.lateMin+'</td><td>'+s.hours+'</td></tr>'; }).join('');
    }catch(e){ tb.innerHTML='<tr><td style="padding:14px;color:var(--rd)">'+esc(e.message||e)+'</td></tr>'; }
  };
  /* كارت "طباعة تقرير الحضور" القديم (V88) بيؤدي نفس وظيفة كارت التقارير الجديد → نخفيه عشان مايبقاش فيه تكرار */
  function hideOld(){ var o=document.getElementById('V88_REPORT_CARD'); if(o&&o.style.display!=='none') o.style.display='none'; }
  setInterval(function(){ ensureUI(); hideOld(); },1000); setTimeout(ensureUI,300);
})();
