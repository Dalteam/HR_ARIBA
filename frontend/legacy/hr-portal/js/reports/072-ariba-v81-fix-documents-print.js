
/* ============================================================
   ARIBA V81 — إصلاح: طباعة تبويب "الوثائق" (إقامات/جوازات/تأمين
   طبي/عقود) كانت بترمي الجدول الخام (بكلاسات التصميم الداخلية
   للبرنامج زي var(--bd)) في نافذة طباعة فاضية من أي تنسيق —
   فتطلع بلا ألوان ولا تنظيم خالص. استبدلتها بطباعة منسقة ومصممة
   بهوية الشركة، بدون أي تعديل على منطق أو بيانات الجدول الأصلي.
   ============================================================ */
(function(){
  'use strict';

  var REPORT_CSS =
    '<style>'+
    '@page{size:A4;margin:12mm}'+
    '*{box-sizing:border-box}'+
    'body{font-family:"ARIBA Two","Segoe UI",Tahoma,Arial,sans-serif;color:#1a1a1a;margin:0;font-size:11px}'+
    '.rp-hd{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #014D3D;padding-bottom:8px;margin-bottom:12px}'+
    '.rp-hd .co{font-size:16px;font-weight:900;color:#014D3D}'+
    '.rp-hd .dt{font-size:10.5px;color:#666}'+
    'h3.rp-sec{color:#014D3D;background:#eef5f2;padding:6px 10px;border-radius:6px;font-size:13px;margin:14px 0 6px;page-break-after:avoid}'+
    'h3.rp-sec:first-of-type{margin-top:0}'+
    'table.rp-tb{width:100%;border-collapse:collapse;margin-bottom:6px;font-size:10px}'+
    'table.rp-tb th{background:#014D3D;color:#fff;padding:6px 8px;text-align:right;font-size:10px;position:sticky;top:0}'+
    'table.rp-tb td{padding:5px 8px;border-bottom:1px solid #e5ece9}'+
    'table.rp-tb tr:nth-child(even){background:#f8faf9}'+
    'table.rp-tb tr{page-break-inside:avoid}'+
    '.rp-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700}'+
    '.rp-g{background:#e6f6ec;color:#0a7a3f}'+
    '.rp-r{background:#fbe9e9;color:#c0392b}'+
    '.rp-a{background:#fff4e0;color:#a15c00}'+
    '.rp-b{background:#e8f0fe;color:#1a56db}'+
    '.rp-k{background:#f0f0f0;color:#666}'+
    '.rp-mono{font-family:monospace}'+
    '.rp-ft{margin-top:16px;padding-top:8px;border-top:1px solid #ddd;font-size:9px;color:#999;text-align:center}'+
    '</style>';

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function fD81(v){ if(!v) return '—'; try{ return new Date(v).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn'); }catch(e){ return v; } }
  function badge(txt, cls){ return '<span class="rp-badge rp-'+cls+'">'+esc(txt)+'</span>'; }
  function statusOf(days, noneLabel, urgentLabel, soonLabel, okLabel, hasVal){
    if(!hasVal) return badge(noneLabel, 'k');
    if(days == null) days = 9999;
    if(days <= 30) return badge(urgentLabel, 'r');
    if(days <= 90) return badge(soonLabel, 'a');
    return badge(okLabel, 'g');
  }
  function shortName(n){ return (n||'').split(' ').slice(0,3).join(' '); }

  function buildIqamaTable(list){
    var rows = list.filter(function(e){ return e.iqamaNo; })
      .sort(function(x,y){ return (x.iqamaDaysLeft||9999)-(y.iqamaDaysLeft||9999); })
      .map(function(e){
        return '<tr><td>'+esc(e.empNo||e.id)+'</td><td style="font-weight:600">'+esc(shortName(e.nameAr))+'</td>'+
          '<td class="rp-mono">'+esc(e.iqamaNo)+'</td><td>'+esc(e.employer)+'</td><td>'+fD81(e.iqamaExpiry)+'</td>'+
          '<td>'+statusOf(e.iqamaDaysLeft, 'غير محدد','عاجل','قريب','سارية', !!e.iqamaExpiry)+'</td></tr>';
      }).join('');
    return '<table class="rp-tb"><tr><th>الرقم</th><th>الموظف</th><th>رقم الإقامة</th><th>جهة العمل</th><th>الانتهاء</th><th>الحالة</th></tr>'+
      (rows || '<tr><td colspan="6" style="text-align:center;color:#999">لا توجد بيانات</td></tr>')+'</table>';
  }
  function buildPassportTable(list){
    var rows = list.filter(function(e){ return e.passportNo; })
      .sort(function(x,y){ return (x.passportDaysLeft||9999)-(y.passportDaysLeft||9999); })
      .map(function(e){
        return '<tr><td>'+esc(e.empNo||e.id)+'</td><td style="font-weight:600">'+esc(shortName(e.nameAr))+'</td>'+
          '<td class="rp-mono">'+esc(e.passportNo)+'</td><td>'+esc(e.nationality)+'</td><td>'+fD81(e.passportExpiry)+'</td>'+
          '<td>'+statusOf(e.passportDaysLeft, 'غير محدد','عاجل','قريب','سارية', !!e.passportExpiry)+'</td></tr>';
      }).join('');
    return '<table class="rp-tb"><tr><th>الرقم</th><th>الموظف</th><th>رقم الجواز</th><th>الجنسية</th><th>الانتهاء</th><th>الحالة</th></tr>'+
      (rows || '<tr><td colspan="6" style="text-align:center;color:#999">لا توجد بيانات</td></tr>')+'</table>';
  }
  function buildInsuranceTable(list){
    var rows = list.filter(function(e){ return e.insuranceCo; })
      .sort(function(x,y){ return (x.insuranceDaysLeft||9999)-(y.insuranceDaysLeft||9999); })
      .map(function(e){
        return '<tr><td>'+esc(e.empNo||e.id)+'</td><td style="font-weight:600">'+esc(shortName(e.nameAr))+'</td>'+
          '<td>'+esc(e.insuranceCo)+'</td><td>'+badge(e.insuranceClass||'—','b')+'</td><td class="rp-mono">'+esc(e.insuranceCard||'—')+'</td>'+
          '<td>'+fD81(e.insuranceExpiry)+'</td><td>'+statusOf(e.insuranceDaysLeft, 'غير محدد','عاجل','قريب','سارية', !!e.insuranceExpiry)+'</td></tr>';
      }).join('');
    return '<table class="rp-tb"><tr><th>الرقم</th><th>الموظف</th><th>الشركة</th><th>الفئة</th><th>رقم البطاقة</th><th>الانتهاء</th><th>الحالة</th></tr>'+
      (rows || '<tr><td colspan="7" style="text-align:center;color:#999">لا توجد بيانات</td></tr>')+'</table>';
  }
  function buildContractsTable(list){
    var rows = list.slice().sort(function(x,y){ return (x.contractDaysLeft||9999)-(y.contractDaysLeft||9999); })
      .map(function(e){
        var stCls = !e.contractEnd ? 'b' : (e.contractDaysLeft<=0 ? 'r' : (e.contractDaysLeft<=90 ? 'a' : 'g'));
        var stTxt = !e.contractEnd ? 'مفتوح' : (e.contractDaysLeft<=0 ? 'منتهي' : (e.contractDaysLeft<=90 ? 'قريب' : 'ساري'));
        return '<tr><td>'+esc(e.empNo||e.id)+'</td><td style="font-weight:600">'+esc(shortName(e.nameAr))+'</td>'+
          '<td>'+esc(e.employer)+'</td><td>'+esc(e.contractType||'—')+'</td><td>'+fD81(e.contractJoin)+'</td>'+
          '<td>'+fD81(e.contractEnd)+'</td><td>'+badge(stTxt, stCls)+'</td></tr>';
      }).join('');
    return '<table class="rp-tb"><tr><th>الرقم</th><th>الموظف</th><th>جهة العمل</th><th>النوع</th><th>المباشرة</th><th>الانتهاء</th><th>الحالة</th></tr>'+
      (rows || '<tr><td colspan="7" style="text-align:center;color:#999">لا توجد بيانات</td></tr>')+'</table>';
  }

  function wrapReport(titleAr, sectionsHtml){
    var now = new Date();
    return REPORT_CSS +
      '<div class="rp-hd"><div class="co">شركة حلول أريبا لخدمات الأعمال — '+esc(titleAr)+'</div><div class="dt">'+fD81(now)+'</div></div>'+
      sectionsHtml +
      '<div class="rp-ft">تقرير آلي من نظام الموارد البشرية — أريبا</div>';
  }

  window.printCurrentDocTab = function(){
    try{
      var list = (typeof window.aEmps === 'function') ? window.aEmps() : [];
      var map = [['dc1','الإقامات', buildIqamaTable],['dc2','الجوازات', buildPassportTable],['dc3','التأمين الطبي', buildInsuranceTable],['dc4','العقود', buildContractsTable]];
      for(var i=0;i<map.length;i++){
        var el = document.getElementById(map[i][0]);
        if(el && el.style.display !== 'none'){
          var html = wrapReport(map[i][1], '<h3 class="rp-sec">'+esc(map[i][1])+'</h3>' + map[i][2](list));
          if(typeof window.printHtml === 'function') window.printHtml(map[i][1], html);
          return;
        }
      }
    }catch(e){ console.warn('ARIBA V81 printCurrentDocTab', e); }
  };

  window.printDocPage = function(){
    try{
      var list = (typeof window.aEmps === 'function') ? window.aEmps() : [];
      var sections =
        '<h3 class="rp-sec">🪪 الإقامات</h3>' + buildIqamaTable(list) +
        '<h3 class="rp-sec">🛂 الجوازات</h3>' + buildPassportTable(list) +
        '<h3 class="rp-sec">🏥 التأمين الطبي</h3>' + buildInsuranceTable(list) +
        '<h3 class="rp-sec">📄 العقود</h3>' + buildContractsTable(list);
      var html = wrapReport('تقرير الوثائق الشامل', sections);
      if(typeof window.printHtml === 'function') window.printHtml('وثائق الموظفين', html);
    }catch(e){ console.warn('ARIBA V81 printDocPage', e); }
  };
})();
