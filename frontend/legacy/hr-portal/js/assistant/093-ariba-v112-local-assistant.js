
/* ============================================================
   V112 — مساعد اريبا (بيشتغل جوه البرنامج من غير أي خادم)
   بيفهم أوامر زي:
     "محمد عوض غياب النهارده"         → تسجيل غياب (بعد تأكيد)
     "حسام حضور امبارح الساعة 8:30"     → تسجيل حضور (بعد تأكيد)
     "اجازة سنوية لمحمد من الاحد للخميس" → طلب إجازة (بعد تأكيد)
     "نموذج مباشرة عمل لسارة"          → طباعة النموذج فورًا
     "اعمل مخالصة لأحمد"              → حساب وطباعة المخالصة فورًا
     "رصيد محمد عوض"                  → عرض الرصيد
   بيانات الموظفين مابتخرجش من الجهاز.
   ============================================================ */
(function(){
  'use strict';
  var prevSend = window.sendAribaAI;

  /* ---------------- أدوات ---------------- */
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  function box(){ return document.getElementById('aribaAiLog'); }
  function log(html, cls){
    var b=box(); if(!b) return null;
    var d=document.createElement('div'); d.className='ai-msg '+(cls||'ai-assistant'); d.innerHTML=html;
    b.appendChild(d); b.scrollTop=b.scrollHeight; return d;
  }
  function toArDigits(s){ return String(s); }
  function digits(s){ return String(s||'').replace(/[٠-٩]/g,function(d){return '٠١٢٣٤٥٦٧٨٩'.indexOf(d);}).replace(/[۰-۹]/g,function(d){return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d);}); }
  function N(t){
    return digits(t).replace(/[\u064B-\u065F\u0670\u0640]/g,'')
      .replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي')
      .toLowerCase().replace(/\s+/g,' ').trim();
  }
  function words(t){
    return N(t).replace(/[،,؟?!؛"'()\[\]]/g,' ').replace(/\bعبد\s+/g,'عبد').replace(/\bابو\s+/g,'ابو')
      .split(/\s+/).filter(Boolean);
  }
  function pad(n){ return ('0'+n).slice(-2); }
  function iso(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function today(){ var d=new Date(); d.setHours(0,0,0,0); return d; }
  function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
  var DAYNAMES=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  function showDate(isoStr){ var p=isoStr.split('-'); var d=new Date(+p[0],+p[1]-1,+p[2]); return DAYNAMES[d.getDay()]+' '+(+p[2])+'/'+(+p[1])+'/'+p[0]; }
  function allEmps(){ try{ return (typeof getEmps==='function'?getEmps():[]).filter(function(e){ return e && e.nameAr; }); }catch(e){ return []; } }
  function isTerm(e){ return !!(e.isTerminated||e.term); }
  function lvAr(k){ try{ return (typeof LVL!=='undefined'&&LVL[k]&&LVL[k].ar)||''; }catch(e){ return ''; } }

  var SUPA='https://iwviydmapqpqihcdazpe.supabase.co', SKEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  function rpc(fn,args){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); x.open('POST',SUPA+'/rest/v1/rpc/'+fn);
      x.setRequestHeader('apikey',SKEY); x.setRequestHeader('Authorization','Bearer '+SKEY); x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){ var d=null; try{ d=JSON.parse(x.responseText||'null'); }catch(e){}
        if(x.status>=200&&x.status<300) res(d); else rej(new Error((d&&(d.message||d.hint))||('HTTP '+x.status))); };
      x.onerror=function(){ rej(new Error('تعذر الاتصال')); }; x.send(JSON.stringify(args||{}));
    });
  }
  function needLogin(){ return !/^[0-9a-f-]{36}$/i.test(window.ARIBA_HR_TOKEN||''); }
  function doReset(e){
    if(needLogin()) return '⚠ لازم تكون داخل بحسابك السحابي.';
    return rpc('ariba_hr_reset_password',{p_token:window.ARIBA_HR_TOKEN,p_employee_id:String(e.id)}).then(function(r){
      return '🔑 كلمة مرور مؤقتة لـ '+empLabel(e)+'<div style="margin:8px 0;font-size:15px">اسم المستخدم: <b dir="ltr">'+esc(r.username)+'</b><br>كلمة المرور المؤقتة: <b dir="ltr" style="font-size:17px">'+esc(r.temporary_password)+'</b></div><div class="ai-mini">ادّيها للموظف — أول ما يدخل التطبيق هيتطلب منه يغيّرها. أي جهاز كان داخل على حسابه اتعمله خروج.</div>';
    },function(err){ return '❌ '+esc(err.message||err); });
  }
  function doPwList(){
    if(needLogin()) return '⚠ لازم تكون داخل بحسابك السحابي.';
    return rpc('ariba_hr_default_password_list',{p_token:window.ARIBA_HR_TOKEN}).then(function(r){
      var a=(r&&r.accounts)||[];
      if(!a.length) return '✅ كل الحسابات النشطة غيّرت كلمة المرور الافتراضية.';
      return '🔐 <b>'+a.length+'</b> حساب لسه على كلمة المرور الافتراضية أو المؤقتة (هيتطلب منهم تغييرها أول ما يدخلوا):<div class="ai-mini" style="line-height:1.8;margin-top:4px">'+
        a.map(function(x){ return esc(x.name)+' — <span dir="ltr">'+esc(x.username)+'</span>'+(x.role!=='employee'?' <b>('+esc(x.role)+')</b>':''); }).join('<br>')+'</div>';
    },function(err){ return '❌ '+esc(err.message||err); });
  }
  window.aribaHrResetPassword=function(empId){
    var e=allEmps().find(function(x){ return String(x.id)===String(empId); });
    if(!e){ try{ toast('احفظ الموظف الأول','ter'); }catch(x){} return; }
    if(!confirm('هتطلع كلمة مرور مؤقتة جديدة لـ '+e.nameAr+' في تطبيق الموظف، والقديمة هتبطل. متأكد؟')) return;
    var p=document.getElementById('aribaAiPanel'); if(p && p.style.display!=='block' && typeof window.toggleAribaAI==='function') window.toggleAribaAI();
    var d=log('⏳ جاري إنشاء كلمة مرور مؤقتة…');
    Promise.resolve(doReset(e)).then(function(m){ if(d) d.innerHTML='<div class="ai-action">'+m+'</div>'; });
  };

  /* ---------------- التواريخ والأوقات ---------------- */
  var DAYIDX={'الاحد':0,'الحد':0,'الاثنين':1,'الاتنين':1,'الثلاثاء':2,'الثلاث':2,'التلات':2,'التلاته':2,'الثلاثا':2,'الاربعاء':3,'الاربع':3,'الاربعا':3,'الخميس':4,'الجمعه':5,'السبت':6};
  var MONTHS={'يناير':1,'فبراير':2,'مارس':3,'ابريل':4,'مايو':5,'يونيو':6,'يوليو':7,'اغسطس':8,'سبتمبر':9,'اكتوبر':10,'نوفمبر':11,'ديسمبر':12};
  function parseDates(text, past){
    var t=N(text).replace(/(^|\s)لل(?=\S)/g,'$1ال').replace(/(^|\s)ل(ال\S+)/g,'$1$2').replace(/(^|\s)و(ال\S+)/g,'$1$2'), out=[], m, now=today();
    function push(pos,d){ if(d && !isNaN(d)) out.push({pos:pos,d:iso(d)}); }
    var re1=/(\d{4})-(\d{1,2})-(\d{1,2})/g; while((m=re1.exec(t))) push(m.index,new Date(+m[1],+m[2]-1,+m[3]));
    var t2=t.replace(/(\d{4})-(\d{1,2})-(\d{1,2})/g,function(x){return ' '.repeat(x.length);});
    var re2=/(^|[^\d:])(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?(?![\d:])/g;
    while((m=re2.exec(t2))){ var y=m[4]?(+m[4]<100?2000+(+m[4]):+m[4]):now.getFullYear(); push(m.index+m[1].length,new Date(y,+m[3]-1,+m[2])); }
    var re3=/(\d{1,2})\s*(يناير|فبراير|مارس|ابريل|مايو|يونيو|يوليو|اغسطس|سبتمبر|اكتوبر|نوفمبر|ديسمبر)(?:\s*(\d{4}))?/g;
    while((m=re3.exec(t))) push(m.index,new Date(m[3]?+m[3]:now.getFullYear(),MONTHS[m[2]]-1,+m[1]));
    var rel=[[/بعد بكر[هاة]/g,2],[/(^|\s)(النهارد[هة]|اليوم|انهارد[هة])(\s|$)/g,0],[/(^|\s)(امبارح|امس|البارحه)(\s|$)/g,-1],[/(^|\s)(بكر[هاة]|بكرا|غدا|الغد)(\s|$)/g,1]];
    var used=t;
    rel.forEach(function(r){ var mm; r[0].lastIndex=0; while((mm=r[0].exec(used))){ push(mm.index,addDays(now,r[1])); used=used.slice(0,mm.index)+' '.repeat(mm[0].length)+used.slice(mm.index+mm[0].length); r[0].lastIndex=0; } });
    Object.keys(DAYIDX).forEach(function(k){
      var re=new RegExp('(^|\\s)(يوم\\s+)?'+k+'(\\s|$)','g'), mm;
      while((mm=re.exec(t))){ var diff=past?-((now.getDay()-DAYIDX[k]+7)%7):(DAYIDX[k]-now.getDay()+7)%7; push(mm.index,addDays(now,diff)); }
    });
    out.sort(function(a,b){return a.pos-b.pos;});
    var seen={}, res=[]; out.forEach(function(o){ var k=o.pos+'|'+o.d; if(!seen[o.pos]){ seen[o.pos]=1; res.push(o.d);} });
    return res;
  }
  function parseDuration(text){ var m=N(text).match(/(\d+)\s*(يوم|ايام|يوما)/); return m?+m[1]:0; }
  function parseTime(text){
    var t=N(text), m;
    if((m=t.match(/(\d{1,2}):(\d{2})/))) return pad(+m[1])+':'+m[2];
    if((m=t.match(/الساع[هة]\s*(\d{1,2})(?:[.](\d{2}))?(\s*(ونص|و نص|وربع|و ربع|الا ربع|الا ربع))?/))){
      var h=+m[1], mi=m[2]?+m[2]:0, x=m[4]||'';
      if(/نص/.test(x)) mi=30; else if(/الا ربع/.test(x)){ h=h-1; mi=45; } else if(/ربع/.test(x)) mi=15;
      return pad(h)+':'+pad(mi);
    }
    return '';
  }

  /* ---------------- مطابقة الموظف ---------------- */
  function nameTokens(e){ return words(e.nameAr).filter(function(w){ return w!=='بن' && w!=='بنت' && w!=='ابن'; }); }
  function findEmployees(text){
    var t=N(text), emps=allEmps(), m;
    if((m=t.match(/(?:emp|رقم|الرقم الوظيفي)\s*0*(\d{1,5})/i))){
      var byNo=emps.filter(function(e){ return String(e.empNo||'').replace(/^0+/,'')===m[1]; });
      if(byNo.length) return byNo;
    }
    var cmd=words(text);
    var scored=emps.map(function(e){
      var nt=nameTokens(e), set={}; nt.forEach(function(w){ set[w]=1; });
      var score=0, first=false, hits=[];
      cmd.forEach(function(w){
        var w2=w; if(!set[w2] && w2.length>3 && w2[0]==='ل' && set[w2.slice(1)]) w2=w2.slice(1);
        if(!set[w2] && w2.length>3 && w2.indexOf('وال')===0 && set[w2.slice(1)]) w2=w2.slice(1);
        if(set[w2] && w2.length>=2 && hits.indexOf(w2)<0){ hits.push(w2); score++; if(w2===nt[0]) first=true; }
      });
      return {e:e, score:score, first:first};
    }).filter(function(x){ return x.score>0 && (x.first || x.score>=2); });
    if(!scored.length) return [];
    var best=Math.max.apply(null,scored.map(function(x){return x.score;}));
    var top=scored.filter(function(x){ return x.score===best; });
    var act=top.filter(function(x){ return !isTerm(x.e); });
    if(act.length===1 && top.length>1 && best>=2) return [act[0].e];
    return top.map(function(x){ return x.e; });
  }

  /* ---------------- فهم الأمر ---------------- */
  var LEAVE_TYPES=[['مرضي','sick'],['اضطرار','emergency'],['وفا','death'],['زواج','marriage'],['ابو','paternity'],['امومه','maternity'],['عمره','umrah'],['حج','hajj'],['عن بعد','remote'],['سنوي','annual']];
  function understand(text){
    var t=N(text);
    var has=function(re){ return re.test(t); };
    if(has(/كلم[هة] (ال)?مرور|باسورد|باسوورد|الرقم السري|كلمه السر|password/)){
      if(has(/مين|لسه|قائم[هة]|الافتراضي|ماغير|مغيرش/) && !has(/تعيين|ريست|reset|جديد[هة]|نسي/)) return {kind:'pwlist'};
      return {kind:'reset'};
    }
    if(has(/مخالص|تصفي[هة]|نهاي[هة] (ال)?خدم[هة]|مكافا[هة] نهاي[هة]/) && !has(/انهاء (ال)?خدم|انهاء (ال)?عقد/)) return {kind:'settlement'};
    if(has(/اخلاء( ال)? ?طرف|اخلاء/)) return {kind:'form', form:'clearance'};
    if(has(/انهاء (ال)?خدم|انهاء (ال)?عقد|انذار/)) return {kind:'form', form:'termination'};
    if(has(/مباشر/)) return {kind:'form', form:'onboarding'};
    if(has(/خبر[هة]/)) return {kind:'form', form:'experience'};
    if(has(/تمديد|تجديد/)) return {kind:'form', form:'extension'};
    if(has(/عهد[هة]/)) return {kind:'form', form:'custody'};
    if(has(/تقييم/)) return {kind:'form', form:'evaluation'};
    if(has(/كشف (ال)?راتب|قسيم[هة]|مفردات (ال)?راتب/)) return {kind:'payslip'};
    if(has(/اجاز[هة]|اجازات/) && !has(/رصيد/)){
      var type='annual'; LEAVE_TYPES.forEach(function(p){ if(t.indexOf(p[0])>=0 && type==='annual') type=p[1]; });
      return {kind:'leave', type:type};
    }
    if(has(/غياب|غايب|غائب|(^|\s)غاب(\s|$)|مجاش|ماجاش|لم يحضر/)) return {kind:'att', status:'absent'};
    if(has(/متاخر|تاخر|تاخير/)) return {kind:'att', status:'late'};
    if(has(/عن بعد|ريموت/)) return {kind:'att', status:'remote'};
    if(has(/حضور|حاضر|(^|\s)حضر(\s|$)|(^|\s)(جه|جا|جاء|وصل)(\s|$)/)) return {kind:'att', status:'present'};
    if(has(/رصيد/)) return {kind:'q', q:'balance'};
    if(has(/راتب|مرتب/)) return {kind:'q', q:'salary'};
    if(has(/اقام[هة]/)) return {kind:'q', q:'iqama'};
    if(has(/عقد/)) return {kind:'q', q:'contract'};
    return {kind:'unknown'};
  }

  /* ---------------- التنفيذ ---------------- */
  var PENDING=[];
  function card(summary, run){
    var i=PENDING.push(run)-1;
    return log('<div class="ai-action"><div style="font-weight:700;margin-bottom:6px">'+summary+'</div>'+
      '<div class="ai-actions"><button class="btn bgl bsm" onclick="window.__aribaAiRun('+i+',this)">تنفيذ</button> '+
      '<button class="btn bsm" onclick="this.closest(\'.ai-msg\').remove()">إلغاء</button></div></div>');
  }
  window.__aribaAiRun=function(i,btn){
    var run=PENDING[i]; if(!run) return; PENDING[i]=null;
    var host=btn&&btn.closest('.ai-msg');
    function show(msg){ if(host) host.innerHTML='<div class="ai-action">'+(msg||'✓ تم')+'</div>'; else log(msg); }
    try{ var r=run(); if(r&&typeof r.then==='function'){ if(host) host.innerHTML='<div class="ai-action">⏳ جاري التنفيذ…</div>'; r.then(show,function(e){ show('❌ حصلت مشكلة: '+esc(e&&e.message||e)); }); } else show(r); }
    catch(e){ console.error(e); log('❌ حصلت مشكلة: '+esc(e.message||e)); }
  };
  function empLabel(e){ return '<b>'+esc(e.nameAr)+'</b>'+(e.empNo?' <span class="ai-mini">(رقم '+esc(e.empNo)+')</span>':'')+(isTerm(e)?' <span class="ai-mini">— منتهي الخدمة</span>':''); }

  function ensureOption(sel, e){
    if(!sel) return;
    if(![].some.call(sel.options,function(o){ return String(o.value)===String(e.id); })){
      var o=document.createElement('option'); o.value=e.id; o.textContent=e.nameAr; sel.appendChild(o);
    }
    sel.value=e.id;
  }
  function pageOf(el){ var p=el&&el.closest('.pg'); return p?p.id.replace(/^pg-/,''):''; }

  var ST_AR={absent:'غياب',present:'حضور',late:'تأخير',remote:'عمل عن بعد'};
  function doAttendance(e, status, date, time){
    try{ if(!document.getElementById('AES').options.length && typeof loadAttPg==='function') loadAttPg(); }catch(x){}
    oAttM();
    ensureOption(document.getElementById('AES'), e);
    document.getElementById('AMD').value=date;
    document.getElementById('AMI').value=(status==='absent')?'':(time||'');
    document.getElementById('AMO').value='';
    document.getElementById('AMS').value=status;
    sAtt();
    return '✓ اتسجل '+ST_AR[status]+' لـ '+empLabel(e)+' — '+showDate(date)+(time&&status!=='absent'?' الساعة '+time:'')+'<div class="ai-mini">واتبعت للسحابة وهيظهر في تطبيق الموظف.</div>';
  }
  function doLeave(e, type, from, to){
    showPg('lv', document.querySelector('.ni'));
    try{ sT(document.getElementById('t_lvnew'),'lv3'); }catch(x){}
    ensureOption(document.getElementById('NLE'), e);
    try{ uLvBal(); }catch(x){}
    document.getElementById('NLF').value=from; document.getElementById('NLT').value=to;
    var el=document.getElementById('lt_'+type); try{ selLT(type, el); }catch(x){}
    var n=document.getElementById('NLN'); if(n && !n.value) n.value='مسجلة عن طريق مساعد اريبا';
    try{ cLvP(); }catch(x){}
    var countBefore=(typeof getLvs==='function')?getLvs().length:0;
    return Promise.resolve(subLv()).then(function(){
      var after=(document.getElementById('TST')||{}).textContent||'';
      var countAfter=(typeof getLvs==='function')?getLvs().length:countBefore+1;
      if(countAfter<=countBefore) return '⚠ مااتسجلتش: '+esc(after||'راجع شاشة الإجازات');
      return '✓ اتسجل طلب إجازة '+esc(lvAr(type))+' لـ '+empLabel(e)+' من '+showDate(from)+' إلى '+showDate(to)+'<div class="ai-mini">ظاهر في "الطلبات المعلقة" في صفحة الإجازات.</div>';
    });
  }
  var FORMS={
    onboarding:{fn:'tfPrintOnboarding', ar:'نموذج مباشرة عمل'},
    experience:{fn:'tfPrintExperience', ar:'شهادة خبرة'},
    extension:{fn:'tfPrintExtension', ar:'نموذج تمديد عقد', date:'TF3_END', need:'تاريخ نهاية التمديد'},
    termination:{fn:'tfPrintTermination', ar:'نموذج إنهاء خدمة', date:'TF4_LAST', need:'آخر يوم عمل'},
    clearance:{fn:'tfPrintClearance', ar:'نموذج إخلاء طرف', date:'TF5_LAST', need:'آخر يوم عمل'},
    custody:{fn:'tfPrintCustody', ar:'نموذج استلام عهدة', need:'بنود العهدة'},
    evaluation:{fn:'tfPrintEvaluation', ar:'نموذج تقييم فترة التجربة'}
  };
  function doForm(kind, e, date){
    var f=FORMS[kind];
    try{ showPg('forms', document.querySelector('.ni')); }catch(x){}
    var sel=document.getElementById('TFE');
    if(!sel){ return '❌ صفحة النماذج لسه بتتحمل — جرّب تاني بعد ثانية'; }
    ensureOption(sel, e); sel.dispatchEvent(new Event('change',{bubbles:true}));
    if(f.date && date){ var d=document.getElementById(f.date); if(d) d.value=date; }
    if(kind==='custody'){ return '📝 فتحتلك '+f.ar+' لـ '+empLabel(e)+' — ضيف بنود العهدة واضغط طباعة.'; }
    var printed=false, prev=window.printHtml;
    window.printHtml=function(){ printed=true; return prev.apply(this,arguments); };
    try{ window[f.fn](); } finally { window.printHtml=prev; }
    if(printed) return '🖨️ اتفتح '+f.ar+' لـ '+empLabel(e)+' للطباعة.';
    return '📝 فتحتلك '+f.ar+' لـ '+empLabel(e)+(f.need?' — ناقص <b>'+f.need+'</b>، كمّله في الشاشة واضغط طباعة (أو قولي التاريخ في الأمر، مثلًا: "'+f.ar+' لـ'+esc(e.nameAr.split(' ')[0])+' 30/11/2026").':'.');
  }
  var REASONS=[[/استقال/,'m85'],[/اتفاق|تراضي/,'m74'],[/تقاعد/,'m74r'],[/وفا/,'m74d'],[/تجرب/,'m53'],[/تاديب|فصل/,'m80'],[/تعسف/,'m77'],[/قسري/,'m75']];
  function doSettlement(e, date, text){
    showPg('eoscalc', document.querySelector('.ni'));
    var sel=document.getElementById('sEmpSel'); ensureOption(sel, e);
    try{ sOnSel(); }catch(x){}
    var end=date||e.lastDay||'';
    if(end) document.getElementById('sEndDate').value=end;
    var t=N(text); REASONS.forEach(function(r){ if(r[0].test(t)) document.getElementById('sReason').value=r[1]; });
    sRun();
    var total=(document.getElementById('sTotal')||{}).textContent||'';
    var printed=false, prev=window.printHtml;
    window.printHtml=function(){ printed=true; return prev.apply(this,arguments); };
    try{ if(typeof window.aribaPrintOfficialSettlement==='function') window.aribaPrintOfficialSettlement(); } finally { window.printHtml=prev; }
    var endShown=(document.getElementById('sEndDate')||{}).value;
    return '🧾 مخالصة '+empLabel(e)+' — تاريخ الإنهاء '+(endShown?showDate(endShown):'—')+' — الصافي <b>'+esc(total)+' ريال</b>'+
      (printed?'<div class="ai-mini">واتفتحت للطباعة. الحساب ظاهر كمان في شاشة المخالصة لو حبيت تعدّل حاجة.</div>':'<div class="ai-mini">افتحتلك شاشة المخالصة — راجعها واضغط طباعة.</div>');
  }
  function doPayslip(e){
    var sel=document.getElementById('SLE'); if(!sel) return '❌ مش لاقي شاشة كشف الراتب';
    showPg(pageOf(sel)||'slip', document.querySelector('.ni'));
    ensureOption(sel, e); try{ rSlip(); }catch(x){}
    var printed=false, prev=window.printHtml;
    window.printHtml=function(){ printed=true; return prev.apply(this,arguments); };
    try{ if(typeof window.aribaPrintOfficialPayslip==='function') window.aribaPrintOfficialPayslip(); } finally { window.printHtml=prev; }
    return printed ? '🖨️ اتفتح كشف راتب '+empLabel(e)+' للطباعة.' : '📄 فتحتلك كشف راتب '+empLabel(e)+'.';
  }
  function num(v){ return Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2}); }
  function doQuery(q, e){
    if(q==='balance'){ var b=0; try{ b=(typeof leaveCurrentBalance==='function')?leaveCurrentBalance(e):Number(e.leaveBalance||0); }catch(x){ b=Number(e.leaveBalance||0); }
      return '🏖️ رصيد إجازة '+empLabel(e)+': <b>'+num(b)+' يوم</b> حتى النهارده'; }
    if(q==='salary') return '💰 '+empLabel(e)+': الأساسي '+num(e.salary)+' — الإجمالي '+num(e.salaryTotal)+' — الصافي <b>'+num(e.netSalary)+' ريال</b>';
    if(q==='iqama') return '🪪 إقامة '+empLabel(e)+': '+esc(e.iqamaNo||'—')+' — تنتهي '+esc(e.iqamaExpiry||'—');
    if(q==='contract') return '📄 عقد '+empLabel(e)+': من '+esc(e.contractJoin||'—')+' إلى '+esc(e.contractEnd||'غير محدد');
    return '';
  }

  var HELP='أقدر أعمل الحاجات دي — اكتب زي الأمثلة:'+
    '<div class="ai-mini" style="line-height:1.9;margin-top:4px">'+
    '• محمد عوض غياب النهارده<br>• حسام حضور امبارح الساعة 8:30<br>• محمد متأخر النهارده الساعة 9:40<br>'+
    '• اجازة سنوية لمحمد عوض من الاحد للخميس<br>• اجازة مرضية لزينب 3 ايام من بكرة<br>'+
    '• نموذج مباشرة عمل لسارة<br>• شهادة خبرة لأحمد<br>• تمديد عقد محمد عوض لحد 31/12/2027<br>• إخلاء طرف لفلان آخر يوم 30/10/2026<br>'+
    '• اعمل مخالصة لأحمد استقالة<br>• كشف راتب محمد<br>• رصيد محمد عوض / راتب محمد / اقامة محمد<br>'+
    '• إعادة تعيين كلمة مرور محمد عوض<br>• مين لسه ماغيرش كلمة المرور</div>';

  function handle(text, forced){
    var intent=understand(text);
    if(intent.kind==='unknown'){ log('مافهمتش الطلب ده. '+HELP); return; }
    if(intent.kind==='pwlist'){ var hold=log('⏳ …'); Promise.resolve(doPwList()).then(function(m){ if(hold) hold.innerHTML=m; }); return; }
    var list=forced?[forced]:findEmployees(text);
    if(!forced && list.length>1 && /att|leave|payslip/.test(intent.kind)){ var act=list.filter(function(x){ return !isTerm(x); }); if(act.length) list=act; }
    if(!list.length){ log('❓ مش لاقي موظف بالاسم ده. اكتب الاسم الأول واسم الأب (مثلًا: محمد عوض)، أو الرقم الوظيفي (مثلًا: رقم 10).'); return; }
    if(list.length>1){
      var id='c'+Date.now();
      window['__aiPick_'+id]=function(empId){ var e=allEmps().find(function(x){ return String(x.id)===String(empId); }); if(e) handle(text, e); };
      log('👥 فيه أكتر من موظف بالاسم ده — تقصد مين؟<div class="ai-actions" style="flex-wrap:wrap">'+
        list.slice(0,8).map(function(e){ return '<button class="btn bsm" onclick="window[\'__aiPick_'+id+'\'](\''+esc(e.id)+'\')">'+esc(e.nameAr)+(isTerm(e)?' (منتهي)':'')+'</button>'; }).join(' ')+'</div>');
      return;
    }
    var e=list[0], dates=parseDates(text, intent.kind==='att'), dur=parseDuration(text), time=parseTime(text), td=iso(today());
    if(intent.kind==='reset'){
      card('🔑 إعادة تعيين كلمة مرور تطبيق الموظف لـ '+empLabel(e)+'<div class="ai-mini">هتطلع كلمة مرور مؤقتة، والقديمة هتبطل.</div>', function(){ return doReset(e); });
      return;
    }
    if(intent.kind==='att'){
      var d=dates[0]||td;
      card((intent.status==='absent'?'🚫':'✅')+' تسجيل '+ST_AR[intent.status]+' لـ '+empLabel(e)+'<br>📅 '+showDate(d)+(time&&intent.status!=='absent'?' — الساعة '+time:''),
        function(){ return doAttendance(e,intent.status,d,time); });
      return;
    }
    if(intent.kind==='leave'){
      var from=dates[0]||td, to=dates[1]||(dur?iso(addDays(new Date(from+'T00:00:00'),dur-1)):from);
      if(to<from){
        /* "من الأحد للخميس": لو يوم النهاية وقع قبل البداية، يبقى المقصود الأسبوع اللي بعده */
        var fD=new Date(from+'T00:00:00'), tD=new Date(to+'T00:00:00');
        if((fD-tD)/864e5<=7){ while(tD<fD) tD=addDays(tD,7); to=iso(tD); } else { var tmp=from; from=to; to=tmp; }
      }
      var typeAr=lvAr(intent.type);
      card('🏖️ طلب إجازة '+esc(typeAr)+' لـ '+empLabel(e)+'<br>📅 من '+showDate(from)+' إلى '+showDate(to),
        function(){ return doLeave(e,intent.type,from,to); });
      return;
    }
    if(intent.kind==='form'){ log(doForm(intent.form, e, dates[0]||'')); return; }
    if(intent.kind==='settlement'){ log(doSettlement(e, dates[0]||'', text)); return; }
    if(intent.kind==='payslip'){ log(doPayslip(e)); return; }
    if(intent.kind==='q'){ log(doQuery(intent.q, e)); return; }
  }

  window.sendAribaAI=function(){
    var inp=document.getElementById('aribaAiInput'), text=(inp&&inp.value||'').trim();
    if(!text) return;
    /* لو فيه خادم AI متظبط يدويًا، نستخدمه كما هو */
    if(localStorage.getItem('ariba_ai_endpoint') && typeof prevSend==='function') return prevSend();
    inp.value='';
    log(esc(text),'ai-user');
    try{ handle(text); }catch(e){ console.error(e); log('❌ حصلت مشكلة: '+esc(e.message||e)); }
  };
  window.ARIBA_AI_UNDERSTAND=function(t){ var i=understand(t); return {intent:i, employees:findEmployees(t).map(function(e){return e.nameAr;}), dates:parseDates(t, i.kind==='att'), time:parseTime(t), days:parseDuration(t)}; };

  /* نص المساعد: شيل كلام الخادم وحط أمثلة */
  function fixTexts(){
    document.querySelectorAll('#aribaAiPanel .ai-mini').forEach(function(el){
      if(/8787|خادم AI/.test(el.textContent)) el.textContent='Ctrl + Enter للإرسال • بيشتغل جوه البرنامج — بيانات الموظفين مابتخرجش من جهازك';
    });
    var lg=box(); if(lg && !lg.__v112){ lg.__v112=true; if(!lg.children.length) log(HELP); }
  }
  function addResetButton(){
    var f=document.getElementById('EF2'); if(!f) return;
    var eid=(document.getElementById('EID')||{}).value||'';
    var b=document.getElementById('V113_PW_BTN');
    if(!b){
      var sub=f.querySelector('button[type="submit"], .mf button.bpl, button.bpl'); if(!sub) return;
      b=document.createElement('button'); b.type='button'; b.id='V113_PW_BTN'; b.className='btn bsm'; b.style.marginInlineStart='8px';
      b.innerHTML='🔑 كلمة مرور جديدة لتطبيق الموظف';
      b.onclick=function(){ window.aribaHrResetPassword((document.getElementById('EID')||{}).value||''); };
      sub.parentNode.insertBefore(b, sub.nextSibling);
    }
    b.style.display=eid?'':'none';
  }
  var prevEdit=window.editEmp;
  if(typeof prevEdit==='function'){ window.editEmp=function(){ var r=prevEdit.apply(this,arguments); try{ addResetButton(); }catch(x){} return r; }; }
  var prevAdd=window.oAddEmp;
  if(typeof prevAdd==='function'){ window.oAddEmp=function(){ var r=prevAdd.apply(this,arguments); try{ addResetButton(); }catch(x){} return r; }; }
  fixTexts(); setTimeout(fixTexts,1500);
  var prevToggle=window.toggleAribaAI;
  window.toggleAribaAI=function(){ var r=prevToggle&&prevToggle.apply(this,arguments); fixTexts(); return r; };
})();
