/* eslint-disable */
// @ts-nocheck
// V119 payroll engine — copied VERBATIM from frontend/legacy/hr-portal/js/payroll/107-ariba-v119-payroll.js
// (lines 7–122, the PAYX engine body). Same Excel formulas column by column (A..AW). Do not edit by hand:
// if the legacy file changes, copy it again.
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

export const PAYX = { compute, REASONS, findReason, datedif, edate, eosFactor, isTrainee, isSaudiNat, CAP };
export type PayxResult = Record<string, any>;
