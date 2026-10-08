
/* V119: مسير الرواتب بمعادلات الإكسيل: محرك الحساب + الإجازة ونهاية الخدمة + جدول بنفس الأعمدة + طباعة مختصرة + Excel (إضافة فقط) */
/* ===== محرك مسير الرواتب — نفس معادلات إكسيل "مسير رواتب سبتمبر 2026" بالحرف =====
   كل دالة موثّقة بالعمود المقابل في الإكسيل (A..BT). مفيش تقريب في الوسط إلا حيث إكسيل بيقرّب (N و P).      */
(function(G){
  'use strict';
  var CAP=45000;                                   /* حد الأجر الخاضع للتأمينات (الافتراضي) */
  var RATES={matchEmp:.1075,matchEmp55:.105,matchEr:.1275,matchEr55:.125,noMatchEmp:.0975,noMatchEmp55:.09,noMatchEr:.1175,noMatchEr55:.11,nonSaudiEr:.02,cap:45000,ageThr:55};
  function num(v){ var n=Number(v); return isFinite(n)?n:0; }
  function isBlank(v){ return v===null||v===undefined||v===''; }
  function pd(s){ if(!s) return null; if(s instanceof Date) return new Date(s.getFullYear(),s.getMonth(),s.getDate()); var m=String(s).slice(0,10).split('-'); return m.length===3?new Date(+m[0],+m[1]-1,+m[2]):null; }
  function dim(y,m){ return new Date(y,m+1,0).getDate(); }              /* m = 0..11 */
  function edate(d,months){ var y=d.getFullYear(),m=d.getMonth()+months, dd=d.getDate(); var t=new Date(y,m,1); var last=dim(t.getFullYear(),t.getMonth()); return new Date(t.getFullYear(),t.getMonth(),Math.min(dd,last)); }
  /* DATEDIF مثل إكسيل: y / ym / md */
  function datedif(a,b,u){
    if(!a||!b||b<a) return NaN;
    var y=b.getFullYear()-a.getFullYear(), mo=b.getMonth()-a.getMonth(), d=b.getDate()-a.getDate();
    if(u==='y'){ if(mo<0||(mo===0&&d<0)) y--; return y; }
    if(u==='ym'){ var m=mo-(d<0?1:0); return ((m%12)+12)%12; }
    if(u==='md'){ if(d>=0) return d; var pm=new Date(b.getFullYear(),b.getMonth(),0).getDate(); return d+pm; }
    return NaN;
  }
  function age(dob,asOf){ var a=pd(dob), b=pd(asOf); if(!a||!b) return 0; var y=datedif(a,b,'y'); return isNaN(y)?0:y; }
  function r2(x){ return Math.round((x+Number.EPSILON)*100)/100; }
  var isTrainee=function(emp){ return /تمهير|تدريب/.test(String(emp||'')); };
  var isSaudiNat=function(n){ return /^سعود/.test(String(n||'').trim()); };

  /* أسباب إنهاء العقد (جدول "بيانات" P8:P15 في الإكسيل) ومعامل مكافأة نهاية الخدمة */
  var REASONS=[
    {k:'agree',   f:1,      ar:'اتفاق العامل وصاحب العمل على إنهاء العقد',                                  en:'Mutual agreement to end the contract'},
    {k:'expiry',  f:1,      ar:'انتهاء مدة العقد',                                                         en:'Contract term expired'},
    {k:'art80',   f:0,      ar:'فسخ العقد من قبل صاحب العمل لإحدى الحالات الواردة المادة (80)',             en:'Termination by employer under Article (80)'},
    {k:'arb77',   f:1,      ar:'فسخ العقد من قبل صاحب العمل لغير الحالات الواردة في المادة (80)',          en:'Termination by employer not under Article (80)'},
    {k:'retire',  f:1,      ar:'بلوغ سن التقاعد / العجز / الوفاة',                                         en:'Retirement / disability / death'},
    {k:'art81',   f:1,      ar:'ترك العامل العمل للحالات الواردة في المادة (81)',                           en:'Employee left work under Article (81)'},
    {k:'abandon', f:0,      ar:'ترك العامل العمل دون تقديم استقالة لغير الحالات الواردة في المادة (81)',    en:'Employee left without resignation (not under Art. 81)'},
    {k:'resign',  f:'tier', ar:'استقالة',                                                                  en:'Resignation'}
  ];
  function normTxt(s){ return String(s||'').replace(/[\u064B-\u065F\u0640]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/\s+/g,' ').trim(); }
  function findReason(v){
    if(isBlank(v)) return null; var s=normTxt(v), i;
    for(i=0;i<REASONS.length;i++){ if(REASONS[i].k===v||normTxt(REASONS[i].ar)===s) return REASONS[i]; }
    if(/اتفاق/.test(s)) return REASONS[0];
    if(/انتهاء مده|انتهاء المده/.test(s)) return REASONS[1];
    if(/ماده \(?80|ماده 80/.test(s)&&/صاحب/.test(s)&&!/لغير/.test(s)) return REASONS[2];
    if(/صاحب/.test(s)&&/لغير/.test(s)) return REASONS[3];
    if(/تقاعد|وفاه|عجز/.test(s)) return REASONS[4];
    if(/دون/.test(s)&&/استقاله/.test(s)) return REASONS[6];
    if(/ماده \(?81|ماده 81/.test(s)) return REASONS[5];
    if(/استقاله/.test(s)) return REASONS[7];
    return null;
  }
  function eosFactor(reason,K){          /* AK: العامل حسب سبب الإنهاء (K = سنوات الخدمة) */
    var R=findReason(reason); if(!R) return 0;
    if(R.f==='tier'){ if(K<2) return 0; if(K<=5) return 1/3; if(K<=10) return 2/3; return 1; }
    return R.f;
  }

  /* ===== الدالة الرئيسية =====
     in: basic, houRate, traRate, prj(شهري), oth(شهري), allIn(T اختياري), days(AN2), work(U), otHours(W),
         advances(AN), otherDed(AP), fx(S), insStatus(AS), nat(D), employer(E), dob(G), join(H), lastDay(I اختياري),
         contractMonths(J), reason(L), leaveDays(M), used(O: رقم أو null=تلقائي), usedAuto, noInsDeduct, asOf */
  function compute(x){
    var o={}, Q=num(x.basic), days=num(x.days)||30, U=isBlank(x.work)?days:num(x.work), W=num(x.otHours);
    var trainee=(x.trainee!==undefined&&x.trainee!==null)?!!x.trainee:isTrainee(x.employer), saudi=(x.saudi!==undefined&&x.saudi!==null)?!!x.saudi:isSaudiNat(x.nat);
    var R=Object.assign({},RATES,x.rates||{}), cap=R.cap||CAP;
    var asOf=pd(x.asOf)||new Date();
    /* الراتب والبدلات */
    o.V=Q*(U/days);                                                         /* V */
    var houRate=isBlank(x.houRate)?0.25:num(x.houRate), traRate=isBlank(x.traRate)?0.10:num(x.traRate);
    o.Y=trainee?0:Q*houRate*(U/days);                                       /* Y سكن */
    o.Z=trainee?0:Q*traRate*(U/days);                                       /* Z مواصلات */
    o.AA=num(x.prj)*(U/days);                                               /* AA مشروع */
    o.AB=num(x.oth)*(U/days);                                               /* AB أخرى */
    o.T=isBlank(x.allIn)?(Q+Q*houRate+Q*traRate+num(x.prj)+num(x.oth)):num(x.allIn);   /* T الراتب شامل البدلات */
    o.X=(W>0)?((o.T/days/8*W)+(Q/days/8/2*W)):num(x.otAmount);                  /* X الإضافي (بالساعات أو مبلغ يدوي) */
    /* الإجازة ونهاية الخدمة */
    var H=pd(x.join), J=isBlank(x.contractMonths)?null:num(x.contractMonths), I=pd(x.lastDay), Iex=I;
    if(!I&&H&&J!==null) I=edate(H,J);                                       /* I نهاية العقد (من المدة: الحد الفاصل بعد آخر يوم، فمفيش +1) */
    /* آخر يوم بيكتبه المستخدم بيتحسب يومه كامل: مدة الخدمة بتمتد لحد آخر اليوم ده (ما تحتاجش تكتب اليوم اللي بعده) */
    var Ieff=(Iex&&x.lastDayInclusive!==false)?new Date(Iex.getFullYear(),Iex.getMonth(),Iex.getDate()+1):I;
    o.I=I?I.getFullYear()+'-'+('0'+(I.getMonth()+1)).slice(-2)+'-'+('0'+I.getDate()).slice(-2):'';
    var AD=datedif(H,Ieff,'y'), AE=datedif(H,Ieff,'ym'), AF=datedif(H,Ieff,'md');
    o.AD=AD; o.AE=AE; o.AF=AF;
    var K=(isNaN(AD)||isNaN(AE)||isNaN(AF))?NaN:(AD/1+AE/12+AF/360); o.K=K;  /* K */
    var M=isBlank(x.leaveDays)?21:num(x.leaveDays);
    var N=null;
    if(!isNaN(K)&&!(H&&asOf<H)){ N=r2(K<=0?0:(K<=5?K*M:105+((K-5)*30))); }   /* N */
    o.N=N;
    var hasReason=!!findReason(x.reason)||!isBlank(x.reason);
    var Oauto=num(x.usedAuto);
    var O=!isBlank(x.used)?num(x.used):(hasReason?Oauto:0); o.O=O;          /* O ما تم استحقاقه */
    o.P=(N===null)?null:r2(N-O);                                            /* P الرصيد المستحق */
    o.AC=(!hasReason||o.P===null)?num(x.leaveManual):o.P*(o.T/30);          /* AC بدل أجازة */
    if(trainee||isNaN(AD)){ o.AG=o.AH=o.AI=0; }
    else {
      o.AG=(AD<=5)?(AD*o.T*0.5):((5*o.T*0.5)+(AD-5)*o.T*1);                 /* AG */
      o.AH=(AD>=5)?((AE/12)*o.T):((AE/12)*o.T*0.5);                         /* AH */
      o.AI=(AD>=5)?((AF/365)*o.T):((AF/360)*o.T*0.5);                       /* AI */
    }
    o.AJ=o.AG+o.AH+o.AI;                                                    /* AJ */
    o.AK=hasReason?o.AJ*eosFactor(x.reason,K):0;                            /* AK مكافأة نهاية الخدمة */
    o.AM=o.V+o.X+o.Y+o.Z+o.AA+o.AB+o.AC+o.AK;                               /* AM إجمالي المستحق */
    /* التأمينات الاجتماعية */
    /* أيام التأمينات (Ins): لو ما اتبعتتش بتساوي أيام العمل (زي الإكسيل بالظبط). بتتحسب منها: الأجر الخاضع + حصة الموظف + حصة الشركة */
    var Ins=(x.insDays===undefined||x.insDays===null||x.insDays==='')?U:Math.max(0,Math.min(days,num(x.insDays))); o.INS=Ins;
    var a55=age(x.dob,asOf)>=(R.ageThr||55), st=String(x.insStatus||'').trim(), insBase=Math.min(cap/days*Ins, (Q+Q*0.25)/days*Ins);
    if(trainee||x.noIns){ o.AO=0; o.AR=0; o.AQ=0; }
    else if(st==='لا يطبق'||st==='غير خاضع'){ o.AO=0; o.AR=0; o.AQ=(Q>cap)?Math.min(cap,Q+Q*0.25):((Ins<days)?Math.min(cap,(Q+Q*0.25)*Ins/days):Math.min(cap,Q+Q*0.25)); }
    else {
      if(saudi){
        if(st==='يطابق'){ o.AO=insBase*(a55?R.matchEmp55:R.matchEmp); o.AR=insBase*(a55?R.matchEr55:R.matchEr); }
        else if(st==='لا يطابق'){ o.AO=insBase*(a55?R.noMatchEmp55:R.noMatchEmp); o.AR=insBase*(a55?R.noMatchEr55:R.noMatchEr); }
        else { o.AO=0; o.AR=0; }
      } else { o.AO=0; o.AR=Math.min(cap/days*Ins, ((Q+Q*0.25)/days*Ins))*R.nonSaudiEr; }
      o.AQ=(Q>cap)?Math.min(cap,Q+Q*0.25):((Ins<days)?Math.min(cap,(Q+Q*0.25)*Ins/days):Math.min(cap,Q+Q*0.25));   /* AQ الأجر الخاضع */
    }
    o.AU=num(x.otherDed)+(x.noInsDeduct?0:o.AO)+num(x.advances);            /* AU إجمالي المستقطع */
    o.AV=o.AM-o.AU;                                                         /* AV المستحق بالعملة */
    o.AW=o.AV*(isBlank(x.fx)?1:num(x.fx));                                  /* AW الصافي بالريال */
    return o;
  }
  G.PAYX={compute:compute,REASONS:REASONS,findReason:findReason,datedif:datedif,edate:edate,eosFactor:eosFactor,isTrainee:isTrainee,isSaudiNat:isSaudiNat,CAP:CAP};
  if(typeof module!=='undefined') module.exports=G.PAYX;
})(typeof window!=='undefined'?window:(typeof global!=='undefined'?global:this));

/* ===== V119: مسير الرواتب بمعادلات الإكسيل (إجازة + نهاية خدمة + طباعة مختصرة + Excel) ===== */
(function(){
  'use strict';
  var X=window.PAYX; if(!X||typeof window.renderPayroll!=='function') return;
  var UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var EN=function(){ try{ return typeof LANG!=='undefined'&&LANG==='en'; }catch(e){ return false; } };
  var T=function(a,b){ return EN()?b:a; };
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function num(v){ var n=Number(v); return isFinite(n)?n:0; }
  function money(n){ n=num(n); return n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
  function p2(n){ return (n<10?'0':'')+n; }
  function iso(d){ return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
  function dmy(s){ var a=String(s||'').slice(0,10).split('-'); return a.length===3&&a[0]?(a[2]+'/'+a[1]+'/'+a[0]):''; }
  var MONTHS_AR=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var MONTHS_EN=['','January','February','March','April','May','June','July','August','September','October','November','December'];

  /* ---------- سياق الشهر + الموظفين ---------- */
  function ctx(){
    var y=+((document.getElementById('payYear')||{}).value)||new Date().getFullYear(), m=+((document.getElementById('payMonth')||{}).value)||new Date().getMonth()+1;
    var days=new Date(y,m,0).getDate(), sel=+((document.getElementById('payDays')||{}).value); if(sel>=28&&sel<=31) days=sel;
    return {y:y,m:m,days:days,start:new Date(y,m-1,1),end:new Date(y,m-1,days)};
  }
  function allEmps(){ var a=[]; try{ a=a.concat(aEmps()); }catch(e){} try{ a=a.concat(tEmps()); }catch(e){} return a; }
  function empById(id){ var s=String(id); return allEmps().filter(function(e){ return String(e.id)===s; })[0]||null; }
  function rates(end){ try{ var g=gosiRuleFor(new Date(end.getFullYear(),end.getMonth(),end.getDate(),12)), r=g.rule, s=g.settings, p=function(v){ return (Number(v)||0)/100; }; return {matchEmp:p(r.matchEmp),matchEmp55:p(r.matchEmp55),matchEr:p(r.matchEr),matchEr55:p(r.matchEr55),noMatchEmp:p(r.noMatchEmp),noMatchEmp55:p(r.noMatchEmp55),noMatchEr:p(r.noMatchEr),noMatchEr55:p(r.noMatchEr55),nonSaudiEr:p(r.nonSaudiEr),cap:s.wageCap,ageThr:s.ageThreshold}; }catch(e){ return null; } }
  function isTrainee(e,r){ return X.isTrainee(r.employer); }   /* بدلات السكن/النقل بتتصفّر بس لو جهة العمل "تمهير/تدريب" (قاعدة الإكسيل). الاستشاري/التمهير/التدريب: التأمينات بتتلغي من حالة "غير خاضع" مش من البدلات */
  /* ما تم استحقاقه (إجازة سنوية مأخوذة) من بداية الخدمة لحد آخر يوم — من سجلات الإجازات في البرنامج */
  function usedThrough(e,end){
    try{
      if(!e||!end||typeof leaveStartYear!=='function'||typeof leaveDefaultUsed!=='function') return 0;
      var sy=leaveStartYear(e), ey=end.getFullYear(), tot=0;
      for(var y=sy;y<=ey;y++){
        var o=(typeof leaveYearOverride==='function')?leaveYearOverride(e,y):null;
        if(o&&o.used!==undefined&&y<ey) tot+=Math.max(0,Number(o.used)||0);
        else tot+=num(leaveDefaultUsed(e,y,(y===ey)?end:leaveYearDates(y).end));
      }
      return Math.round(tot*100)/100;
    }catch(x){ return 0; }
  }
  /* أيام التأمينات الافتراضية: أيام الشهر كاملة، إلا لو الموظف باشر أو انتهت خدمته جوه الشهر (وقتها بتتحسب من/إلى اليوم ده) */
  function defaultInsDays(r,e,m){
    var days=m.days, st=1, en=days, jn=r.join?new Date(r.join+'T00:00:00'):null, ld=r.lastDay&&X.findReason(r.reason)?new Date(r.lastDay+'T00:00:00'):null;
    if(jn&&jn>m.end) return 0; if(jn&&jn>=m.start) st=jn.getDate();
    if(ld){ if(ld<m.start) return 0; if(ld<=m.end) en=ld.getDate(); }
    return Math.max(0,Math.min(days,en-st+1));
  }
  function reasonFromEmp(e){ var R=X.findReason(e&&(e.terminationReason||e.termReason)); return R?R.k:''; }
  function insDefault(e){
    if(!e) return 'لا يطابق';
    if(window.ARIBA_INS_EXEMPT&&window.ARIBA_INS_EXEMPT(e)) return 'غير خاضع';
    var cons=((e.excelCategory||'')==='consultant')||/استشاري/.test(String(e.jobTitle||''))||/مهمة محددة/.test(String(e.empType||''));
    if(cons) return 'لا يطبق';
    try{ if(typeof insStatusText==='function') return insStatusText(e); }catch(x){}
    if(!e.isSaudi) return 'غير سعودي'; if((e.wpsType||'wps')!=='wps') return 'لا يطبق'; return e.insSystem==='new'?'يطابق':'لا يطابق';
  }
  /* القيمة الافتراضية لكل حقل من بيانات الموظف (للرجوع التلقائي ↺) */
  function empDefault(field,e){
    e=e||{};
    if(field==='insStatus') return insDefault(e);
    if(field==='otAmount') return num(e.extraAllowance);
    if(field==='prj') return num(e.projectAllowance);
    if(field==='oth') return num(e.otherAllowance);
    if(field==='exchRate') return num(e.exchRate)||1;
    if(field==='leaveDays') return (typeof leaveAnnual==='function')?leaveAnnual(e):(num(e.leaveDaysContract)||21);
    return undefined;
  }

  /* ---------- إعادة حساب صف واحد (نفس معادلات الإكسيل) ---------- */
  function recalc(r){
    var m=ctx(), e=empById(r.id)||{};
    var days=m.days; r.days=days;          /* أيام الشهر دايمًا من الشهر/السنة (أو الخانة اللي فوق) — مش من قيمة قديمة متخزنة مع المسير */
    var manualW=!!(r.manualEdits&&r.manualEdits.workDays);
    if(!manualW||r.workDays===undefined||r.workDays===null||r.workDays==='') r.workDays=defaultInsDays(r,e,m);      /* أيام العمل التلقائية = أيام الشهر (أو من المباشرة/لآخر يوم) */
    var U=Math.max(0,Math.min(days,num(r.workDays))); r.workDays=U;
    var sal=num(r.sal), hou=num(r.hou), tra=num(r.tra), reasonSet=!!X.findReason(r.reason);
    var manualIns=!!(r.manualEdits&&r.manualEdits.insDays);
    if(!manualIns||r.insDays===undefined||r.insDays===null||r.insDays===''){ r.insDays=defaultInsDays(r,e,m); }
    r.insDays=Math.max(0,Math.min(days,num(r.insDays)));
    var lastD=r.lastDay?new Date(r.lastDay+'T00:00:00'):null;
    var endForUsed=lastD||(function(){ var jn=r.join?new Date(r.join+'T00:00:00'):null; return (jn&&r.contractMonths!=null)?X.edate(jn,num(r.contractMonths)):m.end; })();
    var usedAuto=reasonSet?usedThrough(e,endForUsed):0; r.usedAuto=usedAuto;
    var o=X.compute({basic:sal,houRate:sal>0?hou/sal:0,traRate:sal>0?tra/sal:0,prj:r.prj,oth:r.oth,allIn:(r.allInManual===null||r.allInManual===undefined||r.allInManual==='')?null:r.allInManual,
      days:days,work:U,insDays:r.insDays,otHours:r.otHours,otAmount:r.otAmount,advances:r.loanDeduct,otherDed:r.otherDeduct,fx:r.exchRate,insStatus:r.insStatus,
      saudi:!!(r.isSaudi||X.isSaudiNat(r.nat)),trainee:isTrainee(e,r),nat:r.nat,employer:r.employer,dob:r.dob||e.dob,join:r.join,lastDay:r.lastDay||null,
      contractMonths:r.contractMonths,reason:r.reason,leaveDays:r.leaveDays||21,used:(r.usedManual===null||r.usedManual===undefined||r.usedManual==='')?null:r.usedManual,usedAuto:usedAuto,
      noIns:(function(){ var ex=!!(window.ARIBA_INS_EXEMPT&&window.ARIBA_INS_EXEMPT(e)); var man=!!(r.manualEdits&&r.manualEdits.insStatus); return ex&&!(man&&!/لا يطبق|غير خاضع/.test(String(r.insStatus||''))); })(),
      leaveManual:r.leaveManual,noInsDeduct:r.noInsDeduct,asOf:m.end,rates:rates(m.end)});
    r.salByDays=o.V; r.houPay=o.Y; r.traPay=o.Z; r.prjPay=o.AA; r.othPay=o.AB; r.allIn=o.T; r.overtime=o.X;
    r.contractEnd=o.I; r.K=o.K; r.N=o.N; r.O=o.O; r.P=o.P; r.leaveComp=o.AC; r.svcY=o.AD; r.svcM=o.AE; r.svcD=o.AF;
    r.costY=o.AG; r.costM=o.AH; r.costD=o.AI; r.eos=o.AJ; r.eosAmt=o.AK; r.eosLawAmt=0;
    var extra=num(r.otherAllow);
    r.totalDue=o.AM+extra; r.insEmp=o.AO; r.insEr=o.AR; r.insBase=o.AQ; r.totalDeduct=o.AU; r.net=o.AV+extra; r.netSAR=(o.AV+extra)*(r.exchRate===''||r.exchRate==null?1:num(r.exchRate));
    var R=X.findReason(r.reason); r.eosLaw=R?R.ar:'';
    return r;
  }
  window.recalcPayrollRowWithInsuranceDays=recalc; window.recalcRow=recalc;

  /* ---------- بناء الصفوف: بيانات الإكسيل الإضافية + المنتهية خدماتهم + حفظ التعديلات اليدوية ---------- */
  var MANUAL=['insDays','workDays','days','otHours','otAmount','leaveManual','otherAllow','loanDeduct','otherDeduct','payMethod','notes','reason','lastDay','usedManual','allInManual','noInsDeduct','insStatus','prj','oth','exchRate','leaveDays','manualEdits','edited'];
  function savedRows(){ try{ var raw=localStorage.getItem('hr7_'+getPayKey()); var s=raw?JSON.parse(raw):null; return (s&&Array.isArray(s.rows))?s.rows:[]; }catch(e){ return []; } }
  function baseRow(e,days){
    var sal=num(e.salary||e.sal), hou=num(e.housingAllowance||e.hou), tra=num(e.transportAllowance||e.tra), prj=num(e.projectAllowance), oth=num(e.otherAllowance);
    return {idx:0,id:e.id,empNo:e.empNo||e.id||'',name:e.nameAr||'',nat:e.nationality||'',employer:e.employer||'',job:e.jobTitle||'',isSaudi:!!e.isSaudi,wpsType:e.wpsType||'wps',insSystem:e.insSystem||'new',
      currency:e.currency||'ريال سعودي',exchRate:num(e.exchRate)||1,sal:sal,hou:hou,tra:tra,prj:prj,oth:oth,tot:Math.round((sal+hou+tra+prj+oth)*100)/100,days:days,workDays:days,
      salByDays:0,overtime:0,leaveComp:0,otherAllow:0,totalDue:0,loanDeduct:0,insEmp:0,insBase:0,otherDeduct:0,totalDeduct:0,net:0,netSAR:0,insEr:0,insStatus:'',eos:0,
      yearsOfService:e.yearsOfService||0,eosLaw:'',eosLawAmt:0,payMethod:e.payMethod||'مدد',iban:e.iban||'',notes:'',edited:false};
  }
  function enrich(r,e,prev){
    r.join=String(e.contractJoin||e.join_date||'').slice(0,10); r.dob=String(e.dob||'').slice(0,10);
    r.contractMonths=(e.contractDuration!==undefined&&e.contractDuration!==null&&e.contractDuration!=='')?num(e.contractDuration):null;
    r.leaveDays=(typeof leaveAnnual==='function')?leaveAnnual(e):(num(e.leaveDaysContract)||21);
    r.nat=r.nat||e.nationality||''; r.isSaudi=!!e.isSaudi;
    var isT=!!(e.isTerminated||e.term);
    r.reason=isT?reasonFromEmp(e):''; r.lastDay=isT?String(e.terminationDate||e.lastWorkingDay||'').slice(0,10):'';
    r.usedManual=null; r.otHours=0; r.otAmount=num(e.extraAllowance); r.leaveManual=0; r.allInManual=null; r.noInsDeduct=false; r.insStatus=insDefault(e);
    /* القيم دي بتيجي من بيانات الموظف، ومنحتفظش بنسخة المسير القديمة إلا لو اتعدّلت يدوي في المسير نفسه */
    var FOLLOW_EMP={prj:1,oth:1,exchRate:1,insStatus:1,leaveDays:1,otAmount:1,workDays:1};
    if(prev){ MANUAL.forEach(function(k){ if(prev[k]===undefined) return; if(FOLLOW_EMP[k]&&!(prev.manualEdits&&prev.manualEdits[k])) return; r[k]=prev[k]; });
      if(prev.overtime>0&&prev.otHours===undefined&&prev.otAmount===undefined&&!(r.otAmount>0)) r.otAmount=prev.overtime;       /* قيم قديمة اتكتبت يدويًا */
      if(prev.leaveComp>0&&!X.findReason(prev.reason)&&prev.leaveManual===undefined&&prev.reason===undefined) r.leaveManual=prev.leaveComp; }
    return r;
  }
  function terminatedInMonth(e,m){ var d=String(e.terminationDate||e.lastWorkingDay||'').slice(0,10); return !!d&&d>=iso(m.start)&&d<=iso(m.end); }
  var oldBuild=window.buildPayrollRows;
  window.buildPayrollRows=function(){
    var m=ctx(), rows=(typeof oldBuild==='function'?oldBuild.apply(this,arguments):[])||[], prevMap={}; savedRows().forEach(function(p){ prevMap[String(p.id)]=p; });
    var have={}; rows.forEach(function(r){ have[String(r.id)]=1; });
    var terminated=[]; try{ terminated=tEmps(); }catch(e){}
    terminated.forEach(function(e){ var id=String(e.id); if(have[id]) return; if(terminatedInMonth(e,m)||(prevMap[id]&&prevMap[id].addedTerminated)){ var b=baseRow(e,m.days); b.addedTerminated=true; rows.push(b); have[id]=1; } });
    rows.forEach(function(r){ var e=empById(r.id)||{}; enrich(r,e,prevMap[String(r.id)]); r.days=m.days; if(r.workDays===undefined||r.workDays===null) r.workDays=m.days; recalc(r); });
    rows.sort(function(a,b){ var x=Number(String(a.empNo||a.id||'').replace(/\D/g,'')),y=Number(String(b.empNo||b.id||'').replace(/\D/g,'')); return (isFinite(x)?x:999999)-(isFinite(y)?y:999999); });
    rows.forEach(function(r,i){ r.idx=i+1; });
    return rows;
  };
  /* إضافة موظف منتهي الخدمة (يدويًا) للمسير */
  window.addTerminatedPayRow=function(id){
    var e=empById(id); if(!e) return; var m=ctx(); var rows=window.currentRows||[];
    if(rows.some(function(r){ return String(r.id)===String(id); })){ toast(T('الموظف موجود في المسير','Employee already in the payroll'),'ter'); return; }
    var b=baseRow(e,m.days); b.addedTerminated=true; enrich(b,e,null); b.edited=true;
    if(b.reason&&!b.lastDay) b.lastDay=iso(m.end);
    autoWork(b); recalc(b); rows.push(b); rows.forEach(function(r,i){ r.idx=i+1; });
    savePayroll(rows,window.currentApproved,window.currentApprovedAt); window.renderPayroll(rows,window.currentApproved,window.currentApprovedAt);
  };
  function autoWork(r){ var m=ctx(); if(r.lastDay&&X.findReason(r.reason)&&!(r.manualEdits&&r.manualEdits.workDays)){ var d=new Date(r.lastDay+'T00:00:00'); if(d>=m.start&&d<=m.end) r.workDays=d.getDate(); else if(d<m.start) r.workDays=0; } }

  /* ---------- التعديل اليدوي ---------- */
  var NUMF={insDays:1,days:1,workDays:1,otHours:1,otAmount:1,prj:1,oth:1,loanDeduct:1,otherDeduct:1,exchRate:1,leaveDays:1,otherAllow:1,leaveManual:1};
  window.updatePayRow=function(id,field,val){
    var rows=window.currentRows||[], row=rows.filter(function(r){ return String(r.id)===String(id); })[0]; if(!row) return;
    var m=ctx();
    if(val==='auto'&&(field==='insDays'||field==='workDays')){ if(row.manualEdits) delete row.manualEdits[field]; row[field]=defaultInsDays(row,empById(row.id)||{},m); row.edited=true; recalc(row); savePayroll(rows,window.currentApproved,window.currentApprovedAt); setTimeout(function(){ window.renderPayroll(rows,window.currentApproved,window.currentApprovedAt); },20); return; }
    if(val==='auto'&&empDefault(field,empById(row.id))!==undefined){ row[field]=empDefault(field,empById(row.id)); if(row.manualEdits) delete row.manualEdits[field]; row.edited=true; recalc(row); savePayroll(rows,window.currentApproved,window.currentApprovedAt); setTimeout(function(){ window.renderPayroll(rows,window.currentApproved,window.currentApprovedAt); },20); return; }
    if(NUMF[field]){ var n=parseFloat(val); row[field]=isNaN(n)?0:n; }
    else if(field==='usedManual'||field==='allInManual'){ row[field]=(val===''||val==='auto'||val===null)?null:num(val); }
    else if(field==='noInsDeduct'){ row[field]=(val===true||val==='true'||val==='1'||val===1); }
    else if(field==='reason'){ row.reason=val||''; if(row.reason&&!row.lastDay) row.lastDay=iso(m.end); if(!row.reason){ row.manualEdits&&delete row.manualEdits.workDays; } }
    else row[field]=val;
    row.edited=true; row.manualEdits=row.manualEdits||{}; row.manualEdits[field]=true;
    if(field==='lastDay'||field==='reason'){ if(field==='lastDay'&&row.manualEdits.workDays&&false){} autoWork(row); }
    if(field==='insStatus'){ var e=empById(row.id); }
    recalc(row);
    savePayroll(rows,window.currentApproved,window.currentApprovedAt);
    setTimeout(function(){ window.renderPayroll(rows,window.currentApproved,window.currentApprovedAt); },20);
  };

  /* ---------- أعمدة الجدول (بنفس ترتيب الإكسيل) ---------- */
  var REASON_OPTS=[['','—']].concat(X.REASONS.map(function(r){ return [r.k,r.ar]; }));
  var ST_OPTS=[['يطابق','يطابق'],['لا يطابق','لا يطابق'],['غير سعودي','غير سعودي'],['غير خاضع','غير خاضع'],['لا يطبق','لا يطبق']];
  var PAY_OPTS=[['مدد','مدد'],['تحويل','تحويل بنكي'],['تحويل دولي','تحويل دولي'],['نقد','نقداً']];
  var TDS='padding:5px 7px;border-bottom:1px solid rgba(36,48,68,.25);text-align:right;white-space:nowrap;font-size:11px;border-left:1px solid rgba(36,48,68,.15)';
  var INP='background:transparent;border:1px solid transparent;border-radius:4px;color:var(--tx);font-size:11px;text-align:right;padding:2px;';
  function inp(r,field,val,w,locked,type,step){ if(locked) return (type==='date')?dmy(val):(val===null||val===undefined||val===''?'':esc(val)); return '<input type="'+(type||'number')+'" value="'+esc(val===null||val===undefined?'':val)+'" style="'+INP+'width:'+(w||70)+'px" step="'+(step||'0.01')+'" onfocus="this.style.borderColor=\'var(--bd)\'" onblur="this.style.borderColor=\'transparent\'" onchange="updatePayRow(\''+esc(r.id)+'\',\''+field+'\',this.value)">'; }
  function sel(r,field,val,opts,locked,w){ if(locked){ var o=opts.filter(function(x){ return x[0]===val; })[0]; return esc(o?o[1]:val); } return '<select style="background:var(--c2);border:1px solid var(--bd);border-radius:4px;font-size:10px;color:var(--tx);padding:2px;max-width:'+(w||110)+'px" onchange="updatePayRow(\''+esc(r.id)+'\',\''+field+'\',this.value)">'+opts.map(function(o){ return '<option value="'+esc(o[0])+'"'+(o[0]===val?' selected':'')+'>'+esc(o[1])+'</option>'; }).join('')+'</select>'; }
  function f2(v){ return (v===null||v===undefined||v==='')?'':money(v); }
  var COLS=[
    {g:'بيانات الموظف',t:'م',v:function(r){ return r.idx; },cl:'sticky'},
    {t:'الرقم',v:function(r){ return esc(r.empNo); }},
    {t:'الاسم',v:function(r){ return '<b>'+esc(String(r.name||'').split(' ').slice(0,3).join(' '))+'</b>'+(r.reason?' <span style="color:#d97706;font-size:9px">●</span>':''); },st:'min-width:130px',cl:'sticky'},
    {t:'الجنسية',v:function(r){ return esc(r.nat); }},
    {t:'نطاق العمل',v:function(r){ return '<span class="b bb" style="font-size:10px">'+esc(r.employer)+'</span>'; }},
    {t:'الوظيفة',v:function(r){ return '<span style="color:var(--mu)">'+esc(r.job)+'</span>'; },st:'max-width:120px;overflow:hidden;text-overflow:ellipsis'},
    {g:'التعاقد والإجازة',t:'بداية العقد',v:function(r){ return dmy(r.join); }},
    {t:'نهاية العقد / آخر يوم',v:function(r,L){ return inp(r,'lastDay',r.lastDay||r.contractEnd,118,L,'date'); }},
    {t:'مدة التعاقد (شهر)',v:function(r){ return r.contractMonths==null?'':r.contractMonths; }},
    {t:'سنوات الخدمة',v:function(r){ return (r.K===null||r.K===undefined||isNaN(r.K))?'':num(r.K).toFixed(2); }},
    {t:'سبب الإنهاء',v:function(r,L){ return sel(r,'reason',(X.findReason(r.reason)||{}).k||'',REASON_OPTS,L,170); },st:'min-width:150px'},
    {t:'المستحق سنويًا (يوم)',v:function(r,L){ return inp(r,'leaveDays',r.leaveDays,50,L); }},
    {t:'رصيد المستحق خلال فترة التعاقد',v:function(r){ return (r.N===null||r.N===undefined)?'':f2(r.N); }},
    {t:'ما تم استحقاقه (يوم)',v:function(r,L){ var auto=X.findReason(r.reason); var man=(r.usedManual!==null&&r.usedManual!==undefined&&r.usedManual!==''); return inp(r,'usedManual',(man?r.usedManual:(auto?num(r.usedAuto):'')),70,L)+(!L&&man?' <a href="#" title="رجوع للقيمة التلقائية من سجل الإجازات" style="color:var(--cy);text-decoration:none" onclick="updatePayRow(\''+esc(r.id)+'\',\'usedManual\',\'auto\');return false">↺</a>':''); }},
    {t:'الرصيد المستحق (يوم)',v:function(r){ return (r.P===null||r.P===undefined)?'':'<b>'+f2(r.P)+'</b>'; }},
    {g:'الراتب',t:'الأساسي',v:function(r){ return '<span style="color:var(--gr)">'+money(r.sal)+'</span>'; }},
    {t:'العملة',v:function(r){ return esc(r.currency); }},
    {t:'معدل الصرف',v:function(r,L){ return inp(r,'exchRate',r.exchRate,56,L); }},
    {t:'الراتب شامل البدلات',v:function(r,L){ var man=(r.allInManual!==null&&r.allInManual!==undefined&&r.allInManual!==''); return inp(r,'allInManual',man?r.allInManual:num(r.allIn).toFixed(2),84,L)+(!L&&man?' <a href="#" title="رجوع للحساب التلقائي" style="color:var(--cy);text-decoration:none" onclick="updatePayRow(\''+esc(r.id)+'\',\'allInManual\',\'auto\');return false">↺</a>':''); }},
    {t:'أيام العمل',v:function(r,L){ var man=!!(r.manualEdits&&r.manualEdits.workDays); return '<span style="color:'+(man?'var(--am)':'inherit')+'">'+inp(r,'workDays',r.workDays,48,L)+'</span>'+(!L&&man?' <a href="#" title="رجوع لأيام العمل التلقائية (أيام الشهر)" style="color:var(--cy);text-decoration:none" onclick="updatePayRow(\''+esc(r.id)+'\',\'workDays\',\'auto\');return false">↺</a>':''); }},
    {t:'أيام التأمينات',v:function(r,L){ var man=!!(r.manualEdits&&r.manualEdits.insDays); return '<span style="color:'+(man?'var(--am)':'inherit')+'">'+inp(r,'insDays',r.insDays,48,L)+'</span>'+(!L&&man?' <a href="#" title="رجوع لأيام التأمينات التلقائية (أيام الشهر)" style="color:var(--cy);text-decoration:none" onclick="updatePayRow(\''+esc(r.id)+'\',\'insDays\',\'auto\');return false">↺</a>':''); }},
    {t:'الراتب حسب الأيام',v:function(r){ return '<span style="color:var(--cy)">'+money(r.salByDays)+'</span>'; }},
    {g:'البدلات',t:'ساعات الإضافي',v:function(r,L){ return inp(r,'otHours',r.otHours||'',52,L); }},
    {t:'إضافي',v:function(r,L){ if(num(r.otHours)>0) return money(r.overtime); var man=!!(r.manualEdits&&r.manualEdits.otAmount); return inp(r,'otAmount',r.otAmount||'',64,L)+(!L&&man?' <a href="#" title="رجوع لقيمة الإضافي في بيانات الموظف" style="color:var(--cy);text-decoration:none" onclick="updatePayRow(\''+esc(r.id)+'\',\'otAmount\',\'auto\');return false">↺</a>':''); }},
    {t:'سكن',v:function(r){ return money(r.houPay); }},
    {t:'مواصلات',v:function(r){ return money(r.traPay); }},
    {t:'مشروع (شهري)',v:function(r,L){ return inp(r,'prj',r.prj,70,L); }},
    {t:'أخرى (شهري)',v:function(r,L){ return inp(r,'oth',r.oth,70,L); }},
    {t:'بدل أجازة',v:function(r,L){ return X.findReason(r.reason)?'<b style="color:#d97706">'+money(r.leaveComp)+'</b>':(num(r.leaveManual)>0?inp(r,'leaveManual',r.leaveManual,64,L):money(0)); }},
    {g:'مكافأة نهاية الخدمة',t:'خدمة (سنة)',v:function(r){ return r.svcY===undefined||isNaN(r.svcY)?'':r.svcY; }},
    {t:'خدمة (شهر)',v:function(r){ return r.svcM===undefined||isNaN(r.svcM)?'':r.svcM; }},
    {t:'خدمة (يوم)',v:function(r){ return r.svcD===undefined||isNaN(r.svcD)?'':r.svcD; }},
    {t:'تكلفة السنوات',v:function(r){ return money(r.costY); }},
    {t:'تكلفة الشهور',v:function(r){ return money(r.costM); }},
    {t:'تكلفة الأيام',v:function(r){ return money(r.costD); }},
    {t:'إجمالي المكافأة',v:function(r){ return money(r.eos); }},
    {t:'مكافأة نهاية الخدمة',v:function(r){ return X.findReason(r.reason)?'<b style="color:var(--pu)">'+money(r.eosAmt)+'</b>':money(0); }},
    {g:'الإجمالي',t:'إجمالي المستحق',v:function(r){ return '<b style="color:var(--bl)">'+money(r.totalDue)+'</b>'; }},
    {g:'الاستقطاعات',t:'سلف / غياب',v:function(r,L){ return inp(r,'loanDeduct',r.loanDeduct||'',64,L); }},
    {t:'تأمينات موظف',v:function(r,L){ return '<span style="color:'+(r.noInsDeduct?'var(--dm);text-decoration:line-through':'var(--am)')+'">'+money(r.insEmp)+'</span>'+(L?'':' <label title="لا يُخصم من الموظف" style="font-size:9px;color:var(--mu)"><input type="checkbox" '+(r.noInsDeduct?'checked':'')+' onchange="updatePayRow(\''+esc(r.id)+'\',\'noInsDeduct\',this.checked)">بدون خصم</label>'); }},
    {t:'أخرى',v:function(r,L){ return inp(r,'otherDeduct',r.otherDeduct||'',64,L); }},
    {t:'الأجر الخاضع للتأمينات',v:function(r){ return money(r.insBase); }},
    {t:'تأمينات شركة',v:function(r){ return money(r.insEr); }},
    {t:'حالة التأمينات',v:function(r,L){ var man=!!(r.manualEdits&&r.manualEdits.insStatus); return sel(r,'insStatus',r.insStatus,ST_OPTS,L,90)+(!L&&man?' <a href="#" title="رجوع لحالة التأمينات المكتوبة في بيانات الموظف" style="color:var(--cy);text-decoration:none" onclick="updatePayRow(\''+esc(r.id)+'\',\'insStatus\',\'auto\');return false">↺</a>':''); }},
    {t:'إجمالي المستقطع',v:function(r){ return '<b style="color:var(--rd)">'+money(r.totalDeduct)+'</b>'; }},
    {g:'الصافي',t:'المستحق بالعملة',v:function(r){ return '<b style="color:var(--gr)">'+money(r.net)+'</b>'+(r.currency&&r.currency!=='ريال سعودي'?' <span style="font-size:9px;color:var(--am)">'+esc(r.currency)+'</span>':''); }},
    {t:'الصافي (ريال سعودي)',v:function(r){ return '<b style="color:var(--gr);font-size:12px">'+money(r.netSAR)+'</b>'; }},
    {t:'طريقة الدفع',v:function(r,L){ return sel(r,'payMethod',r.payMethod,PAY_OPTS,L,100); }},
    {t:'ملاحظات',v:function(r,L){ return L?esc(r.notes):'<input type="text" value="'+esc(r.notes)+'" style="'+INP+'width:90px;font-size:10px" onchange="updatePayRow(\''+esc(r.id)+'\',\'notes\',this.value)">'; }}
  ];
  var SUMK={sal:1,salByDays:1,overtime:1,houPay:1,traPay:1,prjPay:1,othPay:1,leaveComp:1,eosAmt:1,totalDue:1,loanDeduct:1,insEmp:1,otherDeduct:1,insBase:1,insEr:1,totalDeduct:1,net:1,netSAR:1};
  function sums(rows){ var s={}; Object.keys(SUMK).forEach(function(k){ s[k]=0; }); rows.forEach(function(r){ Object.keys(SUMK).forEach(function(k){ s[k]+=num(r[k]); }); }); return s; }
  var SUMCOL={'الأساسي':'sal','الراتب حسب الأيام':'salByDays','إضافي':'overtime','سكن':'houPay','مواصلات':'traPay','مشروع (شهري)':'prjPay','أخرى (شهري)':'othPay','بدل أجازة':'leaveComp','مكافأة نهاية الخدمة':'eosAmt','إجمالي المستحق':'totalDue','سلف / غياب':'loanDeduct','تأمينات موظف':'insEmp','أخرى':'otherDeduct','الأجر الخاضع للتأمينات':'insBase','تأمينات شركة':'insEr','إجمالي المستقطع':'totalDeduct','المستحق بالعملة':'net','الصافي (ريال سعودي)':'netSAR'};
  function totalRow(label,rows,bg){
    var s=sums(rows), h='<tr>'; var first=true;
    COLS.forEach(function(c,i){ if(first){ h+='<td colspan="3" style="'+TDS+';background:'+bg+';font-weight:800;position:sticky;right:0">'+label+' ('+rows.length+')</td>'; first=false; return; } if(i<3) return; var k=SUMCOL[c.t]; h+='<td style="'+TDS+';background:'+bg+';font-weight:800">'+(k?money(s[k]):'')+'</td>'; });
    return h+'</tr>';
  }
  /* ---------- الرسم ---------- */
  window.renderPayroll=function(rows,approved,approvedAt){
    rows=rows||[]; if(rows.length){ window.currentRows=rows; window.currentApproved=approved; window.currentApprovedAt=approvedAt; }
    rows.forEach(function(r){ var em=empById(r.id)||{}; if(r.join===undefined){ enrich(r,em,r); }
      if(!approved&&em.employer&&r.employer!==em.employer){ r.employer=em.employer; }          /* جهة العمل بتتبع بيانات الموظف الحالية: لو اتغيرت بينتقل لمجموعتها في المسير */
      recalc(r); });
    var filter=(document.getElementById('payEmp')||{}).value||'', list=filter?rows.filter(function(r){ return r.employer===filter; }):rows, locked=!!approved;
    /* KPIs */
    var byCur={}, sAll=sums(list); list.forEach(function(r){ var c=r.currency||'ريال سعودي'; byCur[c]=(byCur[c]||0)+num(r.net); });
    var grossText=Object.keys(byCur).map(function(c){ return money(byCur[c])+(c==='ريال سعودي'?' ر.س':' '+c); }).join(' | ');
    var kp=document.getElementById('payKPIs');
    if(kp) kp.innerHTML=payKPI('إجمالي صافي العملات',grossText,'var(--bl)')+payKPI('إجمالي الصافي (ر.س)',money(sAll.netSAR),'var(--gr)')+payKPI('تأمينات المنشأة',money(sAll.insEr),'var(--am)')+(sAll.leaveComp?payKPI('بدل الإجازة',money(sAll.leaveComp),'var(--pu)'):'')+(sAll.eosAmt?payKPI('مكافأة نهاية الخدمة',money(sAll.eosAmt),'var(--pu)'):'')+payKPI('عدد الموظفين',list.length,'var(--cy)');
    var st=document.getElementById('payStatus'); if(st) st.innerHTML=approved?'<span style="background:rgba(16,185,129,.15);color:var(--gr);padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700">✓ معتمد '+(approvedAt?'— '+approvedAt:'')+'</span>':'<span style="background:rgba(245,158,11,.1);color:var(--am);padding:3px 10px;border-radius:6px;font-size:11px">⏳ غير معتمد</span>';
    /* الرأس (مجموعات + عناوين) */
    var thS='background:var(--c2);padding:6px 7px;text-align:right;font-size:10px;font-weight:700;border-bottom:2px solid var(--bl);white-space:nowrap;position:sticky;top:0;z-index:2;border-left:1px solid rgba(36,48,68,.3)';
    var gS='background:rgba(1,77,61,.18);padding:5px 7px;text-align:center;font-size:10.5px;font-weight:800;white-space:nowrap;border-left:2px solid var(--bd)';
    var groups=[],cur=null; COLS.forEach(function(c){ if(c.g){ cur={t:c.g,n:0}; groups.push(cur); } cur.n++; });
    var head='<tr>'+groups.map(function(g){ return '<th colspan="'+g.n+'" style="'+gS+'">'+g.t+'</th>'; }).join('')+'</tr><tr>'+COLS.map(function(c){ return '<th style="'+thS+'">'+c.t+'</th>'; }).join('')+'</tr>';
    document.getElementById('payHead').innerHTML=head;
    /* الجسم: مجموعات حسب نطاق العمل مع إجماليات */
    var order=[], by={}; list.forEach(function(r){ var k=r.employer||'—'; if(!by[k]){ by[k]=[]; order.push(k); } by[k].push(r); });
    var body='';
    order.forEach(function(k){
      by[k].forEach(function(r){
        var term=!!X.findReason(r.reason);
        body+='<tr'+(term?' style="background:rgba(217,119,6,.07)"':'')+'>'+COLS.map(function(c){ var sty=TDS+(c.st?';'+c.st:''); return '<td style="'+sty+'">'+c.v(r,locked)+'</td>'; }).join('')+'</tr>';
      });
      if(order.length>1) body+=totalRow('إجمالي '+k,by[k],'rgba(1,77,61,.10)');
    });
    document.getElementById('payBody').innerHTML=body;
    /* الفوتر: الإجمالي العام + طرق الدفع */
    var pay={}; list.forEach(function(r){ var m=r.payMethod||'مدد'; pay[m]=(pay[m]||0)+num(r.netSAR); });
    var payTxt=Object.keys(pay).map(function(k){ return k+': <b>'+money(pay[k])+'</b>'; }).join(' &nbsp; | &nbsp; ');
    document.getElementById('payFoot').innerHTML=totalRow('الإجمالي العام',list,'rgba(59,130,246,.12)')+'<tr><td colspan="'+COLS.length+'" style="'+TDS+';background:rgba(59,130,246,.06);font-size:11px">إجمالي حسب طريقة الدفع (ر.س): '+payTxt+'</td></tr>';
    /* قائمة إضافة موظف منتهي الخدمة */
    var bar=document.getElementById('x119Bar');
    if(!bar){ var host=document.getElementById('payStatus'); if(host&&host.parentNode){ bar=document.createElement('span'); bar.id='x119Bar'; host.parentNode.insertBefore(bar,host.nextSibling); } }
    if(bar){ var have={}; rows.forEach(function(r){ have[String(r.id)]=1; }); var tl=[]; try{ tl=tEmps(); }catch(e){} tl=tl.filter(function(e){ return !have[String(e.id)]&&num(e.salary||e.sal)>0; });
      var btn=function(id,txt,title){ return '<button type="button" id="'+id+'" class="btn bsm" style="font-size:11px;padding:3px 9px;margin-inline-start:6px" title="'+title+'">'+txt+'</button>'; };
      bar.innerHTML=locked?'':((tl.length?'<select id="x119Term" style="font-size:11px;max-width:190px"><option value="">+ إضافة موظف منتهي الخدمة…</option>'+tl.map(function(e){ return '<option value="'+esc(e.id)+'">'+esc(e.nameAr)+'</option>'; }).join('')+'</select>':'')
        +btn('x119WkAuto','↺ أيام العمل تلقائي','ترجع أيام العمل لأيام الشهر (أو من المباشرة/لآخر يوم) لكل الموظفين')
        +btn('x119InsEq','أيام التأمينات = أيام العمل','تنسخ أيام العمل لأيام التأمينات لكل الموظفين (زي ما كان في إكسيل المسير)')
        +btn('x119InsAuto','↺ أيام التأمينات تلقائي','ترجع أيام التأمينات لأيام الشهر (أو من المباشرة/الانتهاء) لكل الموظفين'));
      var eq=document.getElementById('x119InsEq'); if(eq) eq.onclick=function(){ rows.forEach(function(r){ r.insDays=num(r.workDays); r.manualEdits=r.manualEdits||{}; r.manualEdits.insDays=true; r.edited=true; recalc(r); }); savePayroll(rows,approved,approvedAt); window.renderPayroll(rows,approved,approvedAt); };
      var wa=document.getElementById('x119WkAuto'); if(wa) wa.onclick=function(){ var mm=ctx(); rows.forEach(function(r){ if(r.manualEdits) delete r.manualEdits.workDays; r.workDays=defaultInsDays(r,empById(r.id)||{},mm); r.edited=true; recalc(r); }); savePayroll(rows,approved,approvedAt); window.renderPayroll(rows,approved,approvedAt); };
      var au=document.getElementById('x119InsAuto'); if(au) au.onclick=function(){ var mm=ctx(); rows.forEach(function(r){ if(r.manualEdits) delete r.manualEdits.insDays; r.insDays=defaultInsDays(r,empById(r.id)||{},mm); r.edited=true; recalc(r); }); savePayroll(rows,approved,approvedAt); window.renderPayroll(rows,approved,approvedAt); };
      var ts=document.getElementById('x119Term'); if(ts) ts.onchange=function(){ if(this.value) window.addTerminatedPayRow(this.value); }; }
    savePayroll(rows,approved,approvedAt);
  };

  /* ---------- الطباعة المختصرة (A4 عرضي) ---------- */
  function printData(){
    var rows=window.currentRows||[], filter=(document.getElementById('payEmp')||{}).value||''; return filter?rows.filter(function(r){ return r.employer===filter; }):rows;
  }
  function logoImg(){ return window.ARIBA_COMPANY_LOGO||((typeof LOGO_PRINT==='string')?LOGO_PRINT:''); }
  var PCSS='<style>@page{size:A4 landscape;margin:8mm 9mm}*{box-sizing:border-box}body{margin:0;font-family:"ARIBA Two","Segoe UI",Tahoma,Arial,sans-serif;color:#10231c;font-size:8.2px;direction:rtl}'
   +'.hd{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #014D3D;padding-bottom:4px;margin-bottom:5px}.hd img{height:12mm}.hd .t{text-align:center;flex:1}.hd .t b{display:block;font-size:13px;color:#014D3D}.hd .t span{font-size:9.5px;color:#555}'
   +'table{width:100%;border-collapse:collapse;table-layout:auto}thead{display:table-header-group}tr{page-break-inside:avoid}th{background:#014D3D;color:#fff;padding:3px 2px;font-size:8px;font-weight:700;text-align:center;border:1px solid #014D3D}td{padding:1.5px 3px;border:1px solid #d9e3df;text-align:center;font-variant-numeric:tabular-nums;white-space:nowrap}td.n{text-align:right;font-weight:700;white-space:normal}'
   +'tr.g td{background:#e8f3ee;font-weight:800;color:#014D3D;text-align:right}tr.s td{background:#f1f6f4;font-weight:800}tr.gt td{background:#014D3D;color:#fff;font-weight:800;font-size:9px}'
   +'.sum{display:flex;gap:5px;margin:4px 0}.sum div{flex:1;border:1px solid #d9e3df;border-radius:6px;padding:4px 6px;background:#f7faf9}.sum b{display:block;font-size:11px;color:#014D3D}.sum span{font-size:8px;color:#666}'
   +'.sg{display:flex;justify-content:space-around;margin-top:3px;page-break-inside:avoid}.sg div{text-align:center;width:26%;font-size:8.5px;font-weight:700}.sg i{display:block;border-top:1px solid #333;margin-top:9px;padding-top:1px;font-style:normal;font-weight:400;color:#555}'
   +'.ft{margin-top:3px;font-size:7.5px;color:#777;text-align:center;border-top:1px solid #ddd;padding-top:3px}.cur{color:#a15c00}</style>';
  function printHtmlDoc(){
    var rows=printData(), m=ctx(), mn=(EN()?MONTHS_EN:MONTHS_AR)[m.m]+' '+m.y, order=[], by={};
    rows.forEach(function(r){ var k=r.employer||'—'; if(!by[k]){ by[k]=[]; order.push(k); } by[k].push(r); });
    var HEN=['#','Employee','Days','Ins. days','Basic','Housing','Transport','Project + other','Overtime','Leave pay','End-of-service','Total due','Advances / absence','Employee insurance','Other deductions','Total deductions','Net','Currency','Net (SAR)'];
    var H=EN()?HEN:['م','الاسم','أيام','أيام التأمينات','الأساسي','سكن','مواصلات','مشروع + أخرى','إضافي','بدل إجازة','مكافأة نهاية الخدمة','إجمالي المستحق','سلف / غياب','تأمينات الموظف','خصومات أخرى','إجمالي المستقطع','الصافي','العملة','الصافي (ر.س)'];
    var tr=function(r,i){ return '<tr><td>'+(i+1)+'</td><td class="n">'+esc(String(r.name||'').split(' ').slice(0,3).join(' '))+(X.findReason(r.reason)?' <span class="cur">●</span>':'')+'</td><td>'+num(r.workDays)+'</td><td>'+num(r.insDays)+'</td><td>'+money(r.sal)+'</td><td>'+money(r.houPay)+'</td><td>'+money(r.traPay)+'</td><td>'+money(num(r.prjPay)+num(r.othPay)+num(r.otherAllow))+'</td><td>'+money(r.overtime)+'</td><td>'+money(r.leaveComp)+'</td><td>'+money(r.eosAmt)+'</td><td><b>'+money(r.totalDue)+'</b></td><td>'+money(r.loanDeduct)+'</td><td>'+money(r.insEmp&&!r.noInsDeduct?r.insEmp:0)+'</td><td>'+money(r.otherDeduct)+'</td><td><b>'+money(r.totalDeduct)+'</b></td><td><b>'+money(r.net)+'</b></td><td class="cur">'+esc(r.currency&&r.currency!=='ريال سعودي'?r.currency:'ر.س')+'</td><td><b>'+money(r.netSAR)+'</b></td></tr>'; };
    var srow=function(label,list,cls){ var s=sums(list); return '<tr class="'+cls+'"><td colspan="4" style="text-align:right">'+label+' ('+list.length+')</td><td>'+money(s.sal)+'</td><td>'+money(s.houPay)+'</td><td>'+money(s.traPay)+'</td><td>'+money(s.prjPay+s.othPay)+'</td><td>'+money(s.overtime)+'</td><td>'+money(s.leaveComp)+'</td><td>'+money(s.eosAmt)+'</td><td>'+money(s.totalDue)+'</td><td>'+money(s.loanDeduct)+'</td><td>'+money(list.reduce(function(a,r){ return a+(r.noInsDeduct?0:num(r.insEmp)); },0))+'</td><td>'+money(s.otherDeduct)+'</td><td>'+money(s.totalDeduct)+'</td><td>'+money(s.net)+'</td><td></td><td>'+money(s.netSAR)+'</td></tr>'; };
    var body='', n=0; order.forEach(function(k){ body+='<tr class="g"><td colspan="'+H.length+'">'+esc(k)+'</td></tr>'; by[k].forEach(function(r,i){ body+=tr(r,n++); }); body+=srow('إجمالي '+k,by[k],'s'); });
    body+=srow('الإجمالي العام',rows,'gt');
    var byCur={}, byPay={}, s=sums(rows); rows.forEach(function(r){ var c=(r.currency&&r.currency!=='ريال سعودي')?r.currency:'ر.س'; byCur[c]=(byCur[c]||0)+num(r.net); var p=r.payMethod||'مدد'; byPay[p]=(byPay[p]||0)+num(r.netSAR); });
    var box=function(v,l){ return '<div><b>'+v+'</b><span>'+l+'</span></div>'; };
    var curTxt=Object.keys(byCur).map(function(c){ return money(byCur[c])+' '+c; }).join(' + ');
    var payTxt=Object.keys(byPay).map(function(k){ return k+' '+money(byPay[k]); }).join(' · ');
    var logo=logoImg(), HRG=(window.ARIBA_HRSIG&&window.ARIBA_HRSIG.get())||{titleAr:'مدير الموارد البشرية',nameAr:'عبد الله العنبر'};
    return PCSS+'<div class="hd"><div class="t"><b>كشف رواتب ومكافآت موظفي شركة حلول أريبا لخدمات الأعمال</b><span>عن شهر '+mn+' — عدد الموظفين '+rows.length+'</span></div>'+(logo?'<img src="'+logo+'">':'')+'</div>'
      +'<table><thead><tr>'+H.map(function(h){ return '<th>'+h+'</th>'; }).join('')+'</tr></thead><tbody>'+body+'</tbody></table>'
      +'<div class="sum">'+box(money(s.totalDue),'إجمالي المستحقات')+box(money(s.totalDeduct),'إجمالي الاستقطاعات')+box(curTxt,'الصافي بالعملات')+box(money(s.netSAR),'الصافي (ر.س)')+box(money(s.insEr),'تأمينات الشركة')+'</div>'
      +'<div class="ft">حسب طريقة الدفع (ر.س): '+payTxt+' &nbsp;|&nbsp; ● موظف منتهي الخدمة (يشمل بدل الإجازة ومكافأة نهاية الخدمة)</div>'
      +'<div class="sg"><div>'+esc(HRG.titleAr)+'<i>'+esc(HRG.nameAr)+'</i></div><div>المدير المالي<i>مطر المطر</i></div><div>الرئيس التنفيذي<i>حسام الحوراني</i></div></div>';
  }
  window.printPayroll=function(){
    if(!printData().length){ toast(T('لا توجد بيانات للطباعة','Nothing to print'),'ter'); return; }
    var m=ctx(), title='مسير الرواتب '+MONTHS_AR[m.m]+' '+m.y;
    var w=window.open('','_blank'); if(!w){ toast(T('اسمح بالنوافذ المنبثقة','Allow pop-ups'),'ter'); return; }
    w.document.open(); w.document.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>'+esc(title)+'</title></head><body>'+printHtmlDoc()+'</body></html>'); w.document.close();
    setTimeout(function(){ try{ w.focus(); w.print(); }catch(e){} },500);
  };
  window.ARIBA_PAYROLL_PRINT_HTML=printHtmlDoc;

  /* ---------- Excel (xlsx) ---------- */
  window.exportPayExcel=function(){
    var rows=printData(); if(!rows.length){ toast(T('لا توجد بيانات','No data'),'ter'); return; }
    if(!(window.ARIBA117&&window.ARIBA117.buildXlsx)){ toast(T('محرك Excel غير جاهز','Excel engine not ready'),'ter'); return; }
    var m=ctx(), head=COLS.map(function(c){ return c.t; });
    var val=function(r,c){ var t=c.t, g={'م':r.idx,'الرقم':r.empNo,'الاسم':r.name,'الجنسية':r.nat,'نطاق العمل':r.employer,'الوظيفة':r.job,'بداية العقد':dmy(r.join),'نهاية العقد / آخر يوم':dmy(r.lastDay||r.contractEnd),'مدة التعاقد (شهر)':r.contractMonths,'سنوات الخدمة':(r.K==null||isNaN(r.K))?'':Math.round(r.K*100)/100,'سبب الإنهاء':r.eosLaw,'المستحق سنويًا (يوم)':r.leaveDays,'رصيد المستحق خلال فترة التعاقد':r.N,'ما تم استحقاقه (يوم)':X.findReason(r.reason)||r.usedManual!=null?num(r.usedManual!=null?r.usedManual:r.usedAuto):'','الرصيد المستحق (يوم)':r.P,'الأساسي':r.sal,'العملة':r.currency,'معدل الصرف':r.exchRate,'الراتب شامل البدلات':r.allIn,'أيام العمل':r.workDays,'أيام التأمينات':r.insDays,'الراتب حسب الأيام':r.salByDays,'ساعات الإضافي':r.otHours||0,'إضافي':r.overtime,'سكن':r.houPay,'مواصلات':r.traPay,'مشروع (شهري)':r.prjPay,'أخرى (شهري)':r.othPay,'بدل أجازة':r.leaveComp,'خدمة (سنة)':r.svcY,'خدمة (شهر)':r.svcM,'خدمة (يوم)':r.svcD,'تكلفة السنوات':r.costY,'تكلفة الشهور':r.costM,'تكلفة الأيام':r.costD,'إجمالي المكافأة':r.eos,'مكافأة نهاية الخدمة':r.eosAmt,'إجمالي المستحق':r.totalDue,'سلف / غياب':r.loanDeduct,'تأمينات موظف':r.noInsDeduct?0:r.insEmp,'أخرى':r.otherDeduct,'الأجر الخاضع للتأمينات':r.insBase,'تأمينات شركة':r.insEr,'حالة التأمينات':r.insStatus,'إجمالي المستقطع':r.totalDeduct,'المستحق بالعملة':r.net,'الصافي (ريال سعودي)':r.netSAR,'طريقة الدفع':r.payMethod,'ملاحظات':r.notes}[t]; if(typeof g==='number'&&isFinite(g)) return Math.round(g*100)/100; return g==null||(typeof g==='number'&&!isFinite(g))?'':g; };
    var data=[head].concat(rows.map(function(r){ return COLS.map(function(c){ return val(r,c); }); }));
    var s=sums(rows), tot=COLS.map(function(c,i){ if(i===0) return 'الإجمالي'; var k=SUMCOL[c.t]; return k?Math.round(s[k]*100)/100:''; }); data.push(tot);
    var sheets=[{name:'رواتب الموظفين',rows:data,widths:COLS.map(function(c,i){ return i===2?30:(i<6?14:15); })}];
    var blob=window.ARIBA117.buildXlsx(sheets), a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='payroll_'+m.y+'_'+p2(m.m)+'.xlsx'; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  };
  /* خانة "أيام الشهر" فوق: بتتحدّث لوحدها مع السنة والشهر، واختيارك اليدوي بيتحفظ للشهر ده */
  (function(){
    function key(){ var y=(document.getElementById('payYear')||{}).value, mo=(document.getElementById('payMonth')||{}).value; return 'ariba_paydays_'+y+'_'+mo; }
    function real(){ var y=+((document.getElementById('payYear')||{}).value), mo=+((document.getElementById('payMonth')||{}).value); return (y&&mo)?new Date(y,mo,0).getDate():0; }
    var sel=document.getElementById('payDays');
    if(sel&&!sel.__a131){ sel.__a131=1; sel.addEventListener('change',function(){ try{ var v=+sel.value; if(v===real()) localStorage.removeItem(key()); else localStorage.setItem(key(),String(v)); }catch(e){} }); }
    var old=window.autoSetDays; if(typeof old==='function'&&!old.__a131){
      var g=function(){ var r=old.apply(this,arguments); try{ var pd=document.getElementById('payDays'), mv=localStorage.getItem(key()); if(pd&&mv&&+mv>=28&&+mv<=31) pd.value=mv; else if(pd&&real()) pd.value=String(real()); }catch(e){} return r; }; g.__a131=1; window.autoSetDays=g; }
  })();
  window.ARIBA_PAYX={ctx:ctx,recalc:recalc,cols:COLS,sums:sums,usedThrough:usedThrough};
})();

