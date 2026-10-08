
// ================================================================
// PAYROLL MODULE v2 - مسير الرواتب
// ================================================================

var _PAY_DIRTY = false;

function initPayroll(){
  var ys = document.getElementById('payYear');
  if(ys && !ys.options.length){
    var cy = new Date().getFullYear();
    for(var y=cy-2; y<=cy+2; y++){
      var o=document.createElement('option');
      o.value=y; o.textContent=y;
      if(y===cy) o.selected=true;
      ys.appendChild(o);
    }
  }
  var pm = document.getElementById('payMonth');
  if(pm) pm.value = new Date().getMonth()+1;
  autoSetDays();
  populatePayEmps();
  loadPayroll();
}

function autoSetDays(){
  var m = parseInt(document.getElementById('payMonth')?.value||8);
  var y = parseInt(document.getElementById('payYear')?.value||2026);
  var days = new Date(y, m, 0).getDate();
  var pd = document.getElementById('payDays');
  if(pd) pd.value = days;
}

function populatePayEmps(){
  var sel = document.getElementById('payEmp');
  if(!sel) return;
  var cur = sel.value;
  sel.innerHTML = '<option value="">كل جهات العمل</option>';
  var employers = [...new Set(
    aEmps().filter(function(e){ return !e.isTerminated && !e.isHourly && e.nameAr !== 'عبد الكريم العقل'; })
      .map(function(e){ return e.employer; })
  )].sort();
  employers.forEach(function(em){
    var o=document.createElement('option'); o.value=em; o.textContent=em; sel.appendChild(o);
  });
  if(cur) sel.value = cur;
}

function getPayKey(){
  var m = ('0'+(document.getElementById('payMonth')?.value||'8')).slice(-2);
  var y = document.getElementById('payYear')?.value||'2026';
  return 'pay_'+y+'_'+m;
}

function loadPayroll(){
  autoSetDays();
  var key = getPayKey();
  var saved = null;
  try{
    var raw=localStorage.getItem('hr7_'+key);
    if(raw) saved=JSON.parse(raw);
    if(!saved){var bak=localStorage.getItem('hr7_archive_'+key);if(bak)saved=JSON.parse(bak);}
    // fallback لأغسطس 2026
    if(!saved){var aug=localStorage.getItem('hr7_pay_2026_08');if(aug)saved=JSON.parse(aug);}
  }catch(e){}

  // المسير المعتمد يُعاد كما حُفظ حرفيًا ولا يُعاد بناؤه من بيانات الموظفين.
  if(saved && saved.approved && Array.isArray(saved.rows)){
    renderPayroll(saved.rows,true,saved.approvedAt||null);
    return;
  }

  var freshRows = buildPayrollRows();
  var manualFields=['days','workDays','overtime','leaveComp','otherAllow','loanDeduct','otherDeduct','eosLaw','eosLawAmt','payMethod','notes','absentDays','otherAdd'];
  if(saved && Array.isArray(saved.rows)){
    freshRows = freshRows.map(function(fr){
      var old = saved.rows.find(function(r){return String(r.id)===String(fr.id);});
      if(old){
        manualFields.forEach(function(field){if(old[field]!==undefined)fr[field]=old[field];});
        fr.manualEdits=old.manualEdits||{};
        fr.edited=!!old.edited;
        recalcRow(fr);
      }
      return fr;
    });
  }
  renderPayroll(freshRows,(saved&&saved.approved)||false,(saved&&saved.approvedAt)||null);
}


// نسب التأمينات من المحرك المركزي
function payrollAsOf(){var y=Number(document.getElementById('payYear')?.value)||new Date().getFullYear();var m=Number(document.getElementById('payMonth')?.value)||new Date().getMonth()+1;return new Date(y,m-1,1);}
function insEmpRate(emp){return gosiRates(emp,payrollAsOf()).emp;}
function insErRate(emp){return gosiRates(emp,payrollAsOf()).er;}
// هل خاضع لحماية الأجور
function isWPS(emp){
  var t = emp.wpsType||'wps';
  return ['wps'].includes(t);
}
// هل بدون تأمينات اجتماعية
function noIns(emp){
  var t = emp.wpsType||'wps';
  return ['consultant','external','no_wps','remote','trainee','tamheer'].includes(t);
}

function buildPayrollRows(){
  var days = parseInt(document.getElementById('payDays')?.value||31);
  var emps = aEmps().filter(function(e){
    return !e.isTerminated && !e.isHourly && e.empType!=='consultant_external' && e.excludeFromPayroll!==true;
  });

  return emps.map(function(e, idx){
    var sal   = e.salary||e.sal||0;
    var hou   = e.housingAllowance||e.hou||0;
    var tra   = e.transportAllowance||e.tra||0;
    var prj   = e.projectAllowance||0;
    var oth   = e.otherAllowance||0;
    var tot   = Math.round((sal+hou+tra+prj+oth)*100)/100;

    // العملة ومعدل الصرف
    var currency = e.currency||'ريال سعودي';
    var exchRate = e.exchRate||1;

    // الراتب حسب الأيام = الإجمالي (كامل الشهر افتراضياً)
    var workDays  = days;
    var salByDays = Math.round((tot/days)*workDays*100)/100;

    // التأمينات: مصدر حساب واحد لكل النظام
    var insCalc = calcIns(e,workDays,days);
    var insBase = insCalc.base, insEmp = insCalc.empAmt, insEr = insCalc.erAmt;
    var insStatus = insCalc.status;

    // إجمالي المستحق والصافي
    var totalDue = Math.round((salByDays)*100)/100;
    var totalDed = Math.round((insEmp)*100)/100;
    var net = Math.round((totalDue - totalDed)*100)/100;

    // صافي بالريال: احسب من صافي العملة المحلية × سعر الصرف مرة واحدة.
    // لا نستخدم netSalary كقيمة SAR حتى لا يحدث تحويل مزدوج أو تفسير خاطئ للعملة.
    var netSAR = Math.round(net * (currency === 'ريال سعودي' ? 1 : (Number(exchRate)>0?Number(exchRate):1)) * 100)/100;

    // مكافأة نهاية الخدمة
    var ys2 = e.yearsOfService||0;
    var eos = calcEOS(sal,ys2,hou);

    return {
      idx: idx+1,
      id: e.id,
      empNo: e.empNo||e.id||'',
      name: e.nameAr||'',
      nat: e.nationality||'',
      employer: e.employer||'',
      job: e.jobTitle||'',
      isSaudi: e.isSaudi||false,
      wpsType: e.wpsType||'wps',
      insSystem: e.insSystem||'new',
      currency: currency,
      exchRate: exchRate,
      sal: sal, hou: hou, tra: tra, prj: prj, oth: oth,
      tot: tot,
      days: days,
      workDays: workDays,
      salByDays: salByDays,
      overtime: 0,
      leaveComp: 0,
      otherAllow: 0,
      totalDue: totalDue,
      loanDeduct: 0,
      insEmp: insEmp,
      insBase: insBase,
      otherDeduct: 0,
      totalDeduct: totalDed,
      net: net,
      netSAR: netSAR,
      insEr: insEr,
      insStatus: insStatus,
      eos: eos,
      yearsOfService: e.yearsOfService||0,
      eosLaw: '',
      eosLawAmt: 0,
      payMethod: e.payMethod||'مدد',
      iban: e.iban||'',
      notes: '',
      edited: false
    };
  });
}

function recalcRow(r){
  var days = r.days||31;
  r.salByDays   = Math.round((r.tot/days)*r.workDays*100)/100;
  r.totalDue    = Math.round((r.salByDays + r.overtime + r.leaveComp + r.otherAllow)*100)/100;
  r.totalDeduct = Math.round((r.insEmp + r.loanDeduct + r.otherDeduct)*100)/100;
  r.net         = Math.round((r.totalDue - r.totalDeduct)*100)/100;
  r.netSAR      = Math.round(r.net*(r.exchRate||1)*100)/100;
}

function recalcPayroll(){
  var key = getPayKey();
  var saved = null;
  try{ var raw=localStorage.getItem('hr7_'+key); if(raw) saved=JSON.parse(raw); }catch(e){}
  var days = parseInt(document.getElementById('payDays')?.value||31);
  if(saved && saved.rows){
    saved.rows.forEach(function(r){ if(!r.edited){ r.days=days; recalcRow(r); } });
    renderPayroll(saved.rows, saved.approved, saved.approvedAt);
  } else {
    loadPayroll();
  }
}

function filterPayroll(){
  var key = getPayKey();
  var saved = null;
  try{ var raw=localStorage.getItem('hr7_'+key); if(raw) saved=JSON.parse(raw); }catch(e){}
  if(saved && saved.rows) renderPayroll(saved.rows, saved.approved, saved.approvedAt);
  else { var rows=buildPayrollRows(); renderPayroll(rows,false,null); }
}

var currentRows=[],currentApproved=false,currentApprovedAt=null;
function renderPayroll(rows, approved, approvedAt){
  if(rows&&rows.length){currentRows=rows;currentApproved=approved;currentApprovedAt=approvedAt;}
  var filter = document.getElementById('payEmp')?.value||'';
  var filtered = filter ? rows.filter(function(r){return r.employer===filter;}) : rows;
  var eosLawEl=document.getElementById('eosLaw');
  var selLaw=(eosLawEl&&eosLawEl.value)||'';
  function calcEosRow(r){
    var sal=r.sal||0,hou=r.hou||0,base=sal+hou,yrs=r.yearsOfService||0;
    var y1=Math.min(yrs,5),y2=Math.max(0,yrs-5);
    var e84=Math.round(((base/2)*y1+base*y2)*100)/100;
    if(!selLaw) return 0;
    if(selLaw==='m84'||selLaw==='m74'||selLaw==='m74r'||selLaw==='m74d') return e84;
    if(selLaw==='m85'||selLaw==='m75'){if(yrs<2)return 0;if(yrs<5)return Math.round(e84/3*100)/100;if(yrs<10)return Math.round(e84*2/3*100)/100;return e84;}
    if(selLaw==='m77'){var c77=Math.max(Math.round(base*2),Math.round((base/30*15)*yrs));return Math.round((e84+c77)*100)/100;}
    return 0;
  }
  var totEosLaw=0;

  // KPIs
  var totGross=0, totNet=0, totInsEr=0, totEos=0, totNetSAR=0;
  var totByCur={};
  var totEosLawKPI=0;
  filtered.forEach(function(r){
    totGross  += r.totalDue||0;
    totNet    += r.net||0;
    totInsEr  += r.insEr||0;
    totEos    += r.eos||0;
    totNetSAR += (r.netSAR||0) + (r.eosLawAmt||0);
    totEosLawKPI += r.eosLawAmt||0;
    var cur=r.currency||'ريال سعودي';
    if(!totByCur[cur]) totByCur[cur]=0;
    totByCur[cur]+= (r.net||0) + (r.eosLawAmt||0);
  });
  // إجمالي نهائي (صافي + نهاية الخدمة) بالعملة
  var totFinalByCur={};
  filtered.forEach(function(r){
    var cur=r.currency||'ريال سعودي';
    if(!totFinalByCur[cur]) totFinalByCur[cur]=0;
    totFinalByCur[cur]+= (r.net||0) + (r.eosLawAmt||0);
  });
  var finalText=Object.keys(totFinalByCur).map(function(cur){
    return fN(Math.round(totFinalByCur[cur]))+(cur==='ريال سعودي'?' ر.س':' '+cur);
  }).join(' | ');
  // إجمالي صافي العملات
  var grossText=Object.keys(totByCur).map(function(cur){
    return fN(Math.round(totByCur[cur]))+(cur==='ريال سعودي'?' ر.س':' '+cur);
  }).join(' | ');
  document.getElementById('payKPIs').innerHTML =
    payKPI('إجمالي صافي العملات', grossText, 'var(--bl)') +
    payKPI('إجمالي الصافي (ر.س)', fN(Math.round(totNetSAR)), 'var(--gr)') +
    payKPI('تأمينات المنشأة', fN(Math.round(totInsEr)), 'var(--am)') +
    (totEosLawKPI>0?payKPI('نهاية الخدمة', fN(Math.round(totEosLawKPI))+' ر.س', 'var(--pu)'):'') +
    (totEosLawKPI>0?payKPI('الإجمالي النهائي', finalText, 'var(--cy)'):payKPI('عدد الموظفين', filtered.length, 'var(--cy)')) +
    (totEosLawKPI>0?payKPI('عدد الموظفين', filtered.length, 'var(--cy)'):'');

  // Status
  var stEl = document.getElementById('payStatus');
  if(stEl) stEl.innerHTML = approved
    ? '<span style="background:rgba(16,185,129,.15);color:var(--gr);padding:3px 10px;border-radius:6px;font-size:11px;font-weight:700">✓ معتمد '+(approvedAt?'— '+approvedAt:'')+'</span>'
    : '<span style="background:rgba(245,158,11,.1);color:var(--am);padding:3px 10px;border-radius:6px;font-size:11px">⏳ غير معتمد</span>';

  // Headers
  var TH = [
    'م','الرقم','الاسم','الجنسية','نطاق العمل','الوظيفة',
    'الأساسي','سكن','مواصلات','مشروع','أخرى','الإجمالي',
    'العملة','معدل الصرف','عدد الأيام','أيام الحضور','الراتب/الأيام',
    'إضافي','بدل إجازة','بدلات أخرى','إجمالي المستحق',
    'سلف/غياب','تأمينات موظف','خصومات أخرى','إجمالي المستقطع',
    'نهاية الخدمة','حسبة نهاية الخدمة',
    'صافي/العملة','صافي/ريال',
    'تأمينات منشأة','حالة التأمينات',
    'طريقة الدفع','ملاحظات'
  ];
  var th='background:var(--c2);padding:6px 7px;text-align:right;font-size:10px;font-weight:700;border-bottom:2px solid var(--bl);white-space:nowrap;position:sticky;top:0;z-index:2;border-left:1px solid rgba(36,48,68,.3)';
  document.getElementById('payHead').innerHTML='<tr>'+TH.map(function(h){return '<th style="'+th+'">'+h+'</th>';}).join('')+'</tr>';

  // Body
  var isLocked = approved;
  var td='padding:5px 7px;border-bottom:1px solid rgba(36,48,68,.25);text-align:right;white-space:nowrap;font-size:11px;border-left:1px solid rgba(36,48,68,.15)';
  var tbody='';

  function numI(rid,field,val){
    if(isLocked) return fN(val);
    return '<input type="number" value="'+val+'" style="background:transparent;border:none;color:var(--tx);font-size:11px;width:70px;text-align:right;padding:2px" onchange="updatePayRow(\''+rid+'\',\''+field+'\',this.value)" step="0.01">';
  }
  function selI(rid,field,val,opts){
    if(isLocked) return val;
    var s='<select style="background:var(--c2);border:1px solid var(--bd);border-radius:4px;font-size:10px;color:var(--tx);padding:2px" onchange="updatePayRow(\''+rid+'\',\''+field+'\',this.value)">';
    opts.forEach(function(o){ s+='<option value="'+o[0]+'"'+(o[0]===val?' selected':'')+'>'+o[1]+'</option>'; });
    s+='</select>';
    return s;
  }

  filtered.forEach(function(r){
    var insC = r.insEmp>0?'var(--am)':'var(--dm)';
    var isSAR = (r.currency==='ريال سعودي'||!r.currency);
    var eosAmt=calcEosRow(r); totEosLaw+=eosAmt;
    tbody+='<tr>'+
      '<td style="'+td+';color:var(--dm)">'+r.idx+'</td>'+
      '<td style="'+td+'">'+r.empNo+'</td>'+
      '<td style="'+td+';font-weight:600;min-width:120px">'+r.name.split(' ').slice(0,3).join(' ')+'</td>'+
      '<td style="'+td+'">'+r.nat+'</td>'+
      '<td style="'+td+'"><span class="b bb" style="font-size:10px">'+r.employer+'</span></td>'+
      '<td style="'+td+';color:var(--mu);max-width:100px;overflow:hidden;text-overflow:ellipsis">'+r.job+'</td>'+
      '<td style="'+td+';color:var(--gr)">'+fN(r.sal)+'</td>'+
      '<td style="'+td+'">'+fN(r.hou)+'</td>'+
      '<td style="'+td+'">'+fN(r.tra)+'</td>'+
      '<td style="'+td+'">'+fN(r.prj)+'</td>'+
      '<td style="'+td+'">'+fN(r.oth)+'</td>'+
      '<td style="'+td+';color:var(--cy);font-weight:700">'+fN(r.tot)+'</td>'+
      '<td style="'+td+';color:'+(isSAR?'var(--dm)':'var(--am)')+'">'+r.currency+'</td>'+
      '<td style="'+td+'">'+r.exchRate+'</td>'+
      '<td style="'+td+'">'+numI(r.id,'days',r.days)+'</td>'+
      '<td style="'+td+'">'+numI(r.id,'workDays',r.workDays)+'</td>'+
      '<td style="'+td+';color:var(--cy)">'+fN(r.salByDays)+'</td>'+
      '<td style="'+td+'">'+numI(r.id,'overtime',r.overtime)+'</td>'+
      '<td style="'+td+'">'+numI(r.id,'leaveComp',r.leaveComp)+'</td>'+
      '<td style="'+td+'">'+numI(r.id,'otherAllow',r.otherAllow)+'</td>'+
      '<td style="'+td+';color:var(--bl);font-weight:700">'+fN(r.totalDue)+(r.currency&&r.currency!=='ريال سعودي'?' '+r.currency:' ر.س')+'</td>'+
      '<td style="'+td+';color:var(--rd)">'+numI(r.id,'loanDeduct',r.loanDeduct)+'</td>'+
      '<td style="'+td+';color:'+insC+'">'+fN(r.insEmp)+'</td>'+
      '<td style="'+td+'">'+numI(r.id,'otherDeduct',r.otherDeduct)+'</td>'+
      '<td style="'+td+';color:var(--rd)">'+fN(r.totalDeduct)+'</td>'+
      '<td style="'+td+';padding:3px 5px">'+
        (isLocked?
          '<span style="color:var(--pu);font-size:10px">'+(r.eosLaw||'—')+'</span>'
          :
          '<select style="background:var(--c2);border:1px solid var(--bd);border-radius:4px;font-size:10px;color:var(--tx);padding:2px 4px;width:90px" onchange="updatePayRow(\''+r.id+'\',\'eosLaw\',this.value)">'+
          '<option value=""'+((!r.eosLaw)?'selected':'')+'>—</option>'+
          '<option value="م.84"'+(r.eosLaw==='م.84'?'selected':'')+'>م.84 إنهاء</option>'+
          '<option value="م.74"'+(r.eosLaw==='م.74'?'selected':'')+'>م.74 اتفاق</option>'+
          '<option value="م.85"'+(r.eosLaw==='م.85'?'selected':'')+'>م.85 استقالة</option>'+
          '<option value="م.75"'+(r.eosLaw==='م.75'?'selected':'')+'>م.75 قسرية</option>'+
          '<option value="م.77"'+(r.eosLaw==='م.77'?'selected':'')+'>م.77 تعسفي</option>'+
          '<option value="م.80"'+(r.eosLaw==='م.80'?'selected':'')+'>م.80 تأديبي</option>'+
          '<option value="م.74ر"'+(r.eosLaw==='م.74ر'?'selected':'')+'>م.74(4) تقاعد</option>'+
          '</select>'
        )+'</td>'+
      '<td style="'+td+';color:var(--pu);font-weight:700">'+
        (r.eosLawAmt>0?fN(r.eosLawAmt)+' ر.س':'—')+'</td>'+
      '<td style="'+td+';color:var(--gr);font-weight:700">'+fN(Math.round(((r.net||0)+(r.eosLawAmt||0))*100)/100)+(isSAR?'':' '+r.currency)+'</td>'+
      '<td style="'+td+';color:var(--gr);font-weight:800;font-size:12px">'+fN(Math.round(((r.netSAR||0)+(r.eosLawAmt||0))*100)/100)+'</td>'+
      '<td style="'+td+'">'+fN(r.insEr)+'</td>'+
      '<td style="'+td+';color:'+(r.insStatus==='يطابق'?'var(--gr)':r.insStatus==='لا يطبق'?'var(--mu)':'var(--rd)')+';font-size:10px">'+r.insStatus+'</td>'+
      '<td style="'+td+'">'+selI(r.id,'payMethod',r.payMethod,[['مدد','مدد'],['تحويل','تحويل بنكي'],['تحويل دولي','تحويل دولي'],['نقد','نقداً']])+'</td>'+
      '<td style="'+td+';min-width:80px">'+(isLocked?r.notes:'<input type="text" value="'+r.notes+'" style="background:transparent;border:none;color:var(--tx);font-size:10px;width:80px" onchange="updatePayRow(\''+r.id+'\',\'notes\',this.value)">')+'</td>'+
      '</tr>';
  });

  document.getElementById('payBody').innerHTML = tbody;

  // Footer
  var totals={sal:0,hou:0,tra:0,prj:0,oth:0,tot:0,salByDays:0,overtime:0,leaveComp:0,otherAllow:0,totalDue:0,loanDeduct:0,insEmp:0,otherDeduct:0,totalDeduct:0,net:0,netSAR:0,insEr:0,eos:0,eosLawAmt:0};
  var byCurrency={};
  filtered.forEach(function(r){
    Object.keys(totals).forEach(function(k){ totals[k]+=(r[k]||0); });
    var cur=r.currency||'ريال سعودي';
    if(!byCurrency[cur]) byCurrency[cur]={totalDue:0,net:0};
    byCurrency[cur].totalDue+=r.totalDue||0;
    byCurrency[cur].net+=r.net||0;
  });
  var ftd='padding:7px;background:rgba(59,130,246,.08);border-top:2px solid var(--bl);font-weight:700;font-size:11px;text-align:right';
  var ft='<tr>';
  ft+='<td style="'+ftd+'" colspan="6">الإجمالي ('+filtered.length+' موظف)</td>';
  ft+='<td style="'+ftd+';color:var(--gr)">'+fN(Math.round(totals.sal))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.hou))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.tra))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.prj))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.oth))+'</td>';
  ft+='<td style="'+ftd+';color:var(--cy)">'+fN(Math.round(totals.tot))+'</td>';
  ft+='<td style="'+ftd+'" colspan="4"></td>';
  ft+='<td style="'+ftd+';color:var(--cy)">'+fN(Math.round(totals.salByDays))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.overtime))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.leaveComp))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.otherAllow))+'</td>';
  ft+='<td style="'+ftd+';color:var(--bl)">'+Object.keys(byCurrency).map(function(cur){return fN(Math.round(byCurrency[cur].totalDue))+(cur==='ريال سعودي'?' ر.س':' '+cur);}).join(' | ')+'</td>';
  ft+='<td style="'+ftd+';color:var(--rd)">'+fN(Math.round(totals.loanDeduct))+'</td>';
  ft+='<td style="'+ftd+';color:var(--am)">'+fN(Math.round(totals.insEmp))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.otherDeduct))+'</td>';
  ft+='<td style="'+ftd+';color:var(--rd)">'+fN(Math.round(totals.totalDeduct))+'</td>';
  ft+='<td style="'+ftd+'"></td>';
  ft+='<td style="'+ftd+';color:var(--pu);font-weight:700">'+fN(Math.round(totals.eosLawAmt||0))+(totals.eosLawAmt>0?' ر.س':'')+'</td>';
  ft+='<td style="'+ftd+'"></td>';
  ft+='<td style="'+ftd+';color:var(--gr);font-size:13px">'+fN(Math.round(totals.netSAR+(totals.eosLawAmt||0)))+'</td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.insEr))+'</td>';
  ft+='<td style="'+ftd+'" colspan="2"></td>';
  ft+='<td style="'+ftd+'">'+fN(Math.round(totals.eosLawAmt||0))+(totals.eosLawAmt>0?' ر.س':'')+'</td>';
  ft+='<td style="'+ftd+'" colspan="2"></td>';
  ft+='</tr>';
  document.getElementById('payFoot').innerHTML = ft;

  savePayroll(rows, approved, approvedAt);
}

function payKPI(l,v,c){
  return '<div style="background:'+c+'15;border:1px solid '+c+'44;border-radius:8px;padding:7px 14px;display:flex;align-items:center;gap:8px;white-space:nowrap">'+
    '<span style="font-size:11px;color:var(--mu)">'+l+'</span>'+
    '<span style="font-size:14px;font-weight:800;color:'+c+'">'+v+'</span></div>';
}

function updatePayRow(empId, field, val){
  // ابحث في currentRows مباشرة
  var row = currentRows.find(function(r){return r.id===empId;});
  if(!row) return;
  var numVal = parseFloat(val);
  row[field] = isNaN(numVal) ? val : numVal;
  row.edited = true;
  row.manualEdits = row.manualEdits || {};
  row.manualEdits[field] = true;
  savePayroll(currentRows,currentApproved,currentApprovedAt);
  // لما تختار قانون نهاية الخدمة، احسب المبلغ
  if(field==='eosLaw'){
    var sal=row.sal||0, hou=row.hou||0, base=sal+hou;
    var yrs=row.yearsOfService||0;
    var y1=Math.min(yrs,5), y2=Math.max(0,yrs-5);
    var e84=Math.round(((base/2)*y1+base*y2)*100)/100;
    var law=val;
    var amt=0;
    if(law==='م.84'||law==='م.74'||law==='م.74ر') amt=e84;
    else if(law==='م.85'||law==='م.75'){if(yrs<2)amt=0;else if(yrs<5)amt=Math.round(e84/3*100)/100;else if(yrs<10)amt=Math.round(e84*2/3*100)/100;else amt=e84;}
    else if(law==='م.77'){var c77=Math.max(Math.round(base*2),Math.round((base/30*15)*yrs));amt=Math.round((e84+c77)*100)/100;}
    else amt=0;
    row.eosLawAmt=amt;
    // حدث الجدول مباشرة بدون reload كامل
    renderPayroll(currentRows, currentApproved, currentApprovedAt);
    return;
  }
  recalcRow(row);
  setTimeout(function(){renderPayroll(currentRows, currentApproved, currentApprovedAt);},30);
}

function savePayroll(rows, approved, approvedAt){
  var key = getPayKey();
  var payload={rows:rows||[],approved:!!approved,approvedAt:approvedAt||null,savedAt:new Date().toISOString(),version:3};
  try{
    var json=JSON.stringify(payload);
    localStorage.setItem('hr7_'+key,json);
    localStorage.setItem('hr7_archive_'+key,json);
  }catch(e){console.error('savePayroll',e);toast('تعذر حفظ المسير محليًا','ter');}
  // حفظ نسخة سحابية مركزية؛ الموظف يرى فقط المسيرات المعتمدة
  if(window.ARIBA_HR_TOKEN){
    var yy=Number(document.getElementById('payYear')?.value)||new Date().getFullYear();
    var mm=Number(document.getElementById('payMonth')?.value)||new Date().getMonth()+1;
    fetch('https://iwviydmapqpqihcdazpe.supabase.co/rest/v1/rpc/ariba_sync_payroll',{
      method:'POST',headers:{apikey:'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB',Authorization:'Bearer sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB','Content-Type':'application/json'},
      body:JSON.stringify({p_token:window.ARIBA_HR_TOKEN,p_year:yy,p_month:mm,p_approved:!!approved,p_approved_at:approvedAt||null,p_rows:rows||[]})
    }).catch(function(e){console.warn('payroll cloud sync',e);});
  }

  // إشعار تطبيق الموظف بتحديث المسير
  try{localStorage.setItem('hr7_sync_ts', String(Date.now()));}catch(ex){}
  try{localStorage.setItem('hr7_pay_updated', JSON.stringify({month:new Date().getMonth()+1,year:new Date().getFullYear(),ts:Date.now()}));}catch(ex){}
}

function approvePayroll(){
  if(!confirm('اعتماد مسير الرواتب؟ لن يمكن التعديل بعد الاعتماد.')) return;
  var key = getPayKey();
  var saved=null;
  try{ var raw=localStorage.getItem('hr7_'+key); if(raw) saved=JSON.parse(raw); }catch(e){}
  if(!saved){ saved={rows:buildPayrollRows(),approved:false,approvedAt:null}; }
  if(currentRows&&currentRows.length) saved.rows=currentRows;
  var now=new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn');
  saved.approved=true; saved.approvedAt=now;
  savePayroll(saved.rows,true,now);
  try{localStorage.setItem('hr7_approved_archive_'+key,JSON.stringify({rows:saved.rows,approved:true,approvedAt:now,savedAt:new Date().toISOString()}));}catch(e){}
  renderPayroll(saved.rows,true,now);
  toast('✓ تم اعتماد مسير الرواتب');
}

function addPayRow(){
  var key = getPayKey();
  var saved=null;
  try{ var raw=localStorage.getItem('hr7_'+key); if(raw) saved=JSON.parse(raw); }catch(e){}
  if(!saved||!saved.rows){ saved={rows:buildPayrollRows(),approved:false,approvedAt:null}; }
  if(saved.approved){ toast('المسير معتمد - لا يمكن التعديل','ter'); return; }
  // أضف صف فارغ
  var newRow={
    idx:saved.rows.length+1, id:'new_'+Date.now(), empNo:'', name:'موظف جديد',
    nat:'', employer:'', job:'', isSaudi:false, wpsType:'wps', insSystem:'new',
    currency:'ريال سعودي', exchRate:1,
    sal:0,hou:0,tra:0,prj:0,oth:0,tot:0,
    days:parseInt(document.getElementById('payDays')?.value||31),
    workDays:parseInt(document.getElementById('payDays')?.value||31),
    salByDays:0,overtime:0,leaveComp:0,otherAllow:0,totalDue:0,
    loanDeduct:0,insEmp:0,insBase:0,otherDeduct:0,totalDeduct:0,
    net:0,netSAR:0,insEr:0,insStatus:'—',eos:0,payMethod:'مدد',iban:'',notes:'',edited:true
  };
  saved.rows.push(newRow);
  savePayroll(saved.rows,saved.approved,saved.approvedAt);
  renderPayroll(saved.rows,saved.approved,saved.approvedAt);
}

function removePayRow(empId){
  if(!confirm('حذف هذا الموظف من المسير؟')) return;
  var key = getPayKey();
  var saved=null;
  try{ var raw=localStorage.getItem('hr7_'+key); if(raw) saved=JSON.parse(raw); }catch(e){}
  if(!saved||!saved.rows) return;
  saved.rows = saved.rows.filter(function(r){return r.id!==empId;});
  saved.rows.forEach(function(r,i){r.idx=i+1;});
  savePayroll(saved.rows,saved.approved,saved.approvedAt);
  renderPayroll(saved.rows,saved.approved,saved.approvedAt);
}

function resetPayroll(){
  var key=getPayKey(),saved=null;
  try{var raw=localStorage.getItem('hr7_'+key);if(raw)saved=JSON.parse(raw);}catch(e){}
  if(saved&&saved.approved){toast('المسير معتمد ومحفوظ — لا يمكن إعادة بنائه.','ter');return;}
  if(!confirm('إعادة بناء المسير من بيانات الموظفين؟ ستُفقد التعديلات اليدوية غير المعتمدة.')) return;
  localStorage.removeItem('hr7_'+key);
  loadPayroll();
  toast('✓ تم إعادة بناء المسير');
}

function cloneForPrint(el){
  var c=el.cloneNode(true);
  c.querySelectorAll('input,textarea').forEach(function(x){var sp=document.createElement('span');sp.textContent=x.value||'';sp.style.cssText='display:inline-block;min-width:55px;color:#111';x.replaceWith(sp);});
  c.querySelectorAll('select').forEach(function(x){var sp=document.createElement('span');sp.textContent=x.options[x.selectedIndex]?x.options[x.selectedIndex].text:'';sp.style.cssText='color:#111';x.replaceWith(sp);});
  c.querySelectorAll('.no-print,.btn').forEach(function(x){x.remove();});
  return c;
}
function printPayroll(){
  var page=document.getElementById('pg-pay');if(!page)return;
  var printable=cloneForPrint(page);
  var m=document.getElementById('payMonth')?.value||'';
  var y=document.getElementById('payYear')?.value||'';
  var months=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  var status=currentApproved?'مسير معتمد':'مسير غير معتمد';
  var win=window.open('','_blank','width=1400,height=900');if(!win){toast('اسمح بالنوافذ المنبثقة للطباعة','ter');return;}
  win.document.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>مسير رواتب '+(months[Number(m)]||m)+' '+y+'</title><style>'+printCSS()+'</style></head><body>');
  win.document.write('<div class="report-head"><div class="brand">شركة اريبا لخدمات الأعمال</div><h1>مسير الرواتب الشهري</h1><div class="meta">'+(months[Number(m)]||m)+' '+y+' — '+status+'</div></div>');
  win.document.write(printable.innerHTML);
  win.document.write('<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script>\n</body></html>');win.document.close();
}
function printCSS(){return '@page{size:A3 landscape;margin:5mm} html,body{width:100%;margin:0!important;padding:0!important;background:#fff!important;color:#111;direction:rtl;font-family:"ARIBA Two Medium","Segoe UI",Arial,sans-serif;font-size:7px!important} body{box-sizing:border-box}.report-head{width:100%;box-sizing:border-box;text-align:center;margin:0 0 7px;border-bottom:2px solid #014D3D;padding:0 0 5px}.brand{font-size:12px;font-weight:800;color:#014D3D}.report-head h1{margin:2px 0;font-size:15px}.meta{font-size:8px;color:#555} .card,.tw{width:100%!important;max-width:none!important;border:0!important;box-shadow:none!important;background:#fff!important;padding:0!important;margin:0!important;overflow:visible!important}.tw{overflow:visible!important}.tw table,#payT,table{width:100%!important;max-width:none!important;min-width:0!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:6.2px!important;margin:0!important}.tw th,#payT th,th{background:#014D3D!important;color:#fff!important;padding:2px 2px!important;border:1px solid #bfc8d4!important;white-space:normal!important;word-break:break-word!important;line-height:1.15!important;font-size:6px!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.tw td,#payT td,td{padding:2px 2px!important;border:1px solid #cfd6df!important;text-align:right!important;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important;line-height:1.15!important;font-size:6.2px!important;max-width:none!important;overflow:visible!important}.tw td input,.tw td select,#payT input,#payT select{font-size:6px!important;width:auto!important;max-width:100%!important}.tw tr:nth-child(even),#payT tr:nth-child(even),tr:nth-child(even){background:#f7faf9!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ch,.tbar,#payKPIs,.no-print,.btn{display:none!important}thead{display:table-header-group!important}tr{break-inside:avoid!important;page-break-inside:avoid!important} .b{font-size:5.5px!important;padding:1px!important;white-space:normal!important}.report-head+*{width:100%!important}@media print{html,body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';}
function printCurrentPage(){
  var pg=document.querySelector('.pg.on');if(!pg){window.print();return;}
  if(pg.id==='pg-pay'){printPayroll();return;}
  var printable=cloneForPrint(pg),title=(document.getElementById('PTT')?.textContent||'تقرير اريبا');
  var win=window.open('','_blank','width=1200,height=800');if(!win){toast('اسمح بالنوافذ المنبثقة للطباعة','ter');return;}
  win.document.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>'+title+'</title><style>'+printCSS()+'</style></head><body><div class="report-head"><div class="brand">شركة اريبا لخدمات الأعمال</div><h1>'+title+'</h1><div class="meta">تاريخ الطباعة: '+new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')+'</div></div>'+printable.innerHTML+'<script>window.onload=function(){setTimeout(function(){window.print();},250);};<\/script></body></html>');win.document.close();
}

function exportPayExcel(){
  try{
    var key=getPayKey();
    var saved=null;
    try{ var raw=localStorage.getItem('hr7_'+key); if(raw) saved=JSON.parse(raw); }catch(e){}
    var rows=saved?saved.rows:buildPayrollRows();
    var m=document.getElementById('payMonth')?.value||'8';
    var y=document.getElementById('payYear')?.value||'2026';
    var months=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    var mName=months[parseInt(m)];
    var filter=document.getElementById('payEmp')?.value||'';
    var data=filter?rows.filter(function(r){return r.employer===filter;}):rows;
    var H=['م','الرقم','الاسم','الجنسية','نطاق العمل','الوظيفة',
      'الأساسي','سكن','مواصلات','مشروع','أخرى','الإجمالي',
      'العملة','معدل الصرف','عدد الأيام','أيام الحضور','الراتب/الأيام',
      'إضافي','بدل إجازة','بدلات أخرى','إجمالي المستحق',
      'سلف/غياب','تأمينات موظف','خصومات أخرى','إجمالي المستقطع',
      'صافي/العملة','صافي/ريال','تأمينات منشأة','حالة التأمينات','م.نهاية الخدمة',
      'طريقة الدفع','ملاحظات'];
    var csvRows=[
      ['كشف رواتب ومكافآت — شركة اريبا لخدمات الأعمال'],
      ['الشهر: '+mName+' '+y+(filter?' — '+filter:'')],
      [],
      H
    ];
    data.forEach(function(r){
      csvRows.push([r.idx,r.empNo,r.name,r.nat,r.employer,r.job,
        r.sal,r.hou,r.tra,r.prj,r.oth,r.tot,
        r.currency,r.exchRate,r.days,r.workDays,r.salByDays,
        r.overtime,r.leaveComp,r.otherAllow,r.totalDue,
        r.loanDeduct,r.insEmp,r.otherDeduct,r.totalDeduct,
        r.net,r.netSAR,r.insEr,r.insStatus,r.eos,r.payMethod,r.notes]);
    });
    var tots={sal:0,hou:0,tra:0,prj:0,oth:0,tot:0,salByDays:0,overtime:0,leaveComp:0,otherAllow:0,totalDue:0,loanDeduct:0,insEmp:0,otherDeduct:0,totalDeduct:0,net:0,netSAR:0,insEr:0,eos:0};
    data.forEach(function(r){Object.keys(tots).forEach(function(k){tots[k]+=(r[k]||0);});});
    csvRows.push(['الإجمالي','','','','','',
      Math.round(tots.sal),Math.round(tots.hou),Math.round(tots.tra),Math.round(tots.prj),Math.round(tots.oth),Math.round(tots.tot),
      '','',Math.round(tots.days),Math.round(tots.workDays),Math.round(tots.salByDays),
      Math.round(tots.overtime),Math.round(tots.leaveComp),Math.round(tots.otherAllow),Math.round(tots.totalDue),
      Math.round(tots.loanDeduct),Math.round(tots.insEmp),Math.round(tots.otherDeduct),Math.round(tots.totalDeduct),
      Math.round(tots.net),Math.round(tots.netSAR),Math.round(tots.insEr),'',Math.round(tots.eos),'','']);
    var csv='\uFEFF'+csvRows.map(function(r){return r.map(function(v){return '"'+(v==null?'':v).toString().replace(/"/g,'""')+'"';}).join(',');}).join('\n');
    var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='مسير_رواتب_'+mName+'_'+y+(filter?'_'+filter:'')+'.csv';
    a.click();
    toast('✓ تم تصدير Excel');
  }catch(err){console.error(err);toast('خطأ في التصدير','ter');}
}
