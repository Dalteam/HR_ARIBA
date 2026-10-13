
/* ============================================================
   ARIBA V68 — إضافة فقط، بدون لمس أي معادلة أو كود حسابي موجود
   زرار جديد "طباعة مخالصة رسمية" في صفحة المخالصة، بيبني مستند
   طباعة منسق يعتمد بالكامل على نفس الأرقام المحسوبة أصلاً من
   sRun() الموجودة (بيقرأها من الشاشة، مايعيدش حسابها بمعادلة
   جديدة)، ويضيف نص الإقرار والتفقيط والتوقيع.
   ============================================================ */
(function(){
  'use strict';

  /* ---------- تفقيط الأرقام بالعربي ---------- */
  var ones=['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة'];
  var tens=['','عشرة','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
  var teens=['عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
  var hundreds=['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];

  function threeDigits(n){
    n = Math.floor(n);
    var h = Math.floor(n/100), r = n%100, out = [];
    if(h) out.push(hundreds[h]);
    if(r >= 10 && r < 20) out.push(teens[r-10]);
    else{
      var t = Math.floor(r/10), o = r%10;
      var parts=[];
      if(o) parts.push(ones[o]);
      if(t) parts.push(tens[t]);
      if(parts.length) out.push(parts.join(' و'));
    }
    return out.join(' و');
  }

  function tafqeetInt(n){
    n = Math.floor(n);
    if(n === 0) return 'صفر';
    var groups = [
      {v: Math.floor(n/1000000)%1000, single:'مليون', dual:'مليونان', plural:'ملايين'},
      {v: Math.floor(n/1000)%1000, single:'ألف', dual:'ألفان', plural:'آلاف'},
      {v: n%1000, single:'', dual:'', plural:''}
    ];
    var parts = [];
    groups.forEach(function(g){
      if(!g.v) return;
      var txt = threeDigits(g.v);
      if(g.single){
        if(g.v === 1) txt = g.single;
        else if(g.v === 2) txt = g.dual;
        else if(g.v >= 3 && g.v <= 10) txt = txt + ' ' + g.plural;
        else txt = txt + ' ' + g.single;
      }
      parts.push(txt);
    });
    return parts.join(' و');
  }

  window.aribaTafqeet = function(amount){
    amount = Number(amount) || 0;
    var riyals = Math.floor(amount);
    var halalas = Math.round((amount - riyals) * 100);
    if(halalas === 100){ riyals += 1; halalas = 0; }
    var txt = tafqeetInt(riyals) + ' ريال سعودي';
    if(halalas > 0) txt += ' و' + tafqeetInt(halalas) + ' هللة';
    else txt += ' لا غير';
    return txt;
  };

  /* ---------- أدوات مساعدة ---------- */
  function fD68(v){ if(!v) return '—'; try{ return new Date(v).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn'); }catch(e){ return v; } }
  function num68(n){ return Number(n||0).toLocaleString('en-US',{maximumFractionDigits:2}); }
  function lastMonthPeriod(startISO, endISO){
    if(!endISO) return null;
    var end = new Date(endISO);
    var periodStart = new Date(end.getFullYear(), end.getMonth(), 1);
    if(startISO){ var start = new Date(startISO); if(periodStart < start) periodStart = start; }
    var days = Math.round((end - periodStart) / 86400000) + 1;
    return {from: periodStart, to: end, days: days};
  }

  function buildSettlementDoc(){
    try{
      var empId = document.getElementById('sEmpSel') ? document.getElementById('sEmpSel').value : '';
      if(!empId){ if(typeof toast==='function') toast('اختر الموظف أولاً', 'ter'); return; }
      var e = (typeof aEmps==='function' ? aEmps() : []).concat(typeof tEmps==='function' ? tEmps() : []).find(function(x){ return String(x.id)===String(empId); });
      if(!e){ if(typeof toast==='function') toast('تعذر إيجاد بيانات الموظف', 'ter'); return; }

      var sStart = document.getElementById('sStart') ? document.getElementById('sStart').value : '';
      var sEndDate = document.getElementById('sEndDate') ? document.getElementById('sEndDate').value : '';
      var sSal = parseFloat(document.getElementById('sSal') ? document.getElementById('sSal').value : 0) || 0;
      var wd = parseInt(document.getElementById('sWD') ? document.getElementById('sWD').value : 0) || 30;

      // قراءة الأرقام المحسوبة بالفعل من الشاشة (بدون إعادة حساب أي معادلة)
      var totalEl = document.getElementById('sTotal');
      var netTotalText = totalEl ? totalEl.textContent.trim() : '0';
      var netTotalNum = parseFloat(netTotalText.replace(/,/g,'')) || 0;

      var leaveRemDays = 0, leaveAllowance = 0, periodSalary = 0;
      var bxDivs = document.querySelectorAll('#sBoxes > div');
      bxDivs.forEach(function(dv){
        var label = (dv.children[0] && dv.children[0].textContent) || '';
        var valEl = dv.children[1];
        var val = valEl ? parseFloat(valEl.textContent.replace(/,/g,'')) || 0 : 0;
        if(label.indexOf('بدل الإجازة') === 0 || label.indexOf('بدل الإجازة') > -1){
          leaveAllowance = val;
          var m = label.match(/\(([\d.]+)\)/);
          if(m) leaveRemDays = parseFloat(m[1]) || 0;
        }
        if(label.indexOf('راتب الفترة') > -1) periodSalary = val;
      });

      // تفاصيل الاستقطاعات (نفس المعادلة المستخدمة أصلاً في sRun، فقط قراءة بدون تغيير)
      var dedRows = [];
      document.querySelectorAll('#sDedList [data-sdrow]').forEach(function(row){
        var labelInp = row.querySelector('[data-sdn]');
        var typeSel = row.querySelector('[data-sdt]');
        var valInp = row.querySelector('[data-sdv]');
        var label = labelInp ? (labelInp.value || 'استقطاع') : 'استقطاع';
        var type = typeSel ? typeSel.value : 'amount';
        var raw = valInp ? (parseFloat(valInp.value) || 0) : 0;
        if(!raw) return;
        var amount = type === 'days' ? Math.round((sSal/(wd||30))*raw*100)/100 : raw;
        dedRows.push({label: label, type: type, raw: raw, amount: amount, isInsurance: /تأمين/.test(label)});
      });

      var extraRows = [];
      document.querySelectorAll('#sExtraList [data-serow]').forEach(function(row){
        var labelInp = row.querySelector('[data-sen]');
        var valInp = row.querySelector('[data-sev]');
        var label = labelInp ? (labelInp.value || 'استحقاق') : 'استحقاق';
        var raw = valInp ? (parseFloat(valInp.value) || 0) : 0;
        if(raw) extraRows.push({label: label, amount: raw});
      });

      var period = lastMonthPeriod(sStart, sEndDate);
      var periodText = period ? (fD68(period.from) + ' إلى ' + fD68(period.to) + ' (' + period.days + ' يوم)') : '—';

      var isAriba = /اريبا|أريبا/.test(e.employer || '');
      var custodyClause = isAriba
        ? '<li>أقرّ بأنني سلّمت جميع العهد والأجهزة والمستندات التابعة للشركة والتي كانت لدي أثناء فترة عملي، ولا أحتفظ بأي منها أو بنسخ عنها.</li>'
        : '<li>أقر بتسليم جميع العهد التي استلمتها من ' + (e.employer || '') + '، والتي استخدمتها في أعمال المشروع والتي تعهدت بالمحافظة عليها.</li>';

      var dedHtml = '';
      if(dedRows.length){
        dedHtml = dedRows.map(function(d){
          if(d.isInsurance){
            return '<tr><td>التأمينات الاجتماعية (GOSI)</td><td>عن الفترة: ' + periodText + '</td><td style="text-align:left;color:#c0392b">-' + num68(d.amount) + ' ر.س</td></tr>';
          }
          return '<tr><td>' + d.label + '</td><td>' + (d.type==='days' ? (d.raw + ' يوم') : 'استقطاع مالي') + '</td><td style="text-align:left;color:#c0392b">-' + num68(d.amount) + ' ر.س</td></tr>';
        }).join('');
      } else {
        dedHtml = '<tr><td colspan="3" style="text-align:center;color:#888">لا توجد استقطاعات</td></tr>';
      }

      var extraHtml = extraRows.length ? extraRows.map(function(x){
        return '<tr><td>' + x.label + '</td><td style="text-align:left;color:#0a7a3f">+' + num68(x.amount) + ' ر.س</td></tr>';
      }).join('') : '';

      var tafqeetText = window.aribaTafqeet(netTotalNum);

      var html = ''+
      '<style>'+
      'body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#1a1a1a;line-height:1.9}'+
      '.doc{max-width:820px;margin:0 auto}'+
      '.hd{text-align:center;border-bottom:3px solid #014D3D;padding-bottom:16px;margin-bottom:24px}'+
      '.hd .co{font-size:22px;font-weight:900;color:#014D3D}'+
      '.hd .ti{font-size:14px;color:#555;margin-top:4px}'+
      '.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:#f7f9f8;border:1px solid #e0e4e2;border-radius:10px;padding:16px;margin-bottom:20px}'+
      '.info-grid div{font-size:13px}'+
      '.info-grid b{color:#014D3D}'+
      'h3.sec{color:#014D3D;border-bottom:2px solid #014D3D;padding-bottom:6px;margin-top:26px;font-size:15px}'+
      'table.doc-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:13px}'+
      'table.doc-table th{background:#014D3D;color:#fff;padding:8px 10px;text-align:right}'+
      'table.doc-table td{padding:7px 10px;border-bottom:1px solid #e0e4e2}'+
      '.net-box{background:linear-gradient(135deg,#014D3D,#017a5f);color:#fff;border-radius:12px;padding:18px;text-align:center;margin:22px 0}'+
      '.net-box .lbl{font-size:12px;opacity:.85}'+
      '.net-box .val{font-size:30px;font-weight:900;margin-top:4px}'+
      '.net-box .tafqeet{font-size:12.5px;margin-top:8px;opacity:.95}'+
      '.legal{font-size:13px;text-align:justify;margin-top:16px}'+
      '.legal ul{padding-right:20px}'+
      '.legal li{margin-bottom:10px}'+
      '.sign{display:flex;justify-content:space-between;margin-top:50px;font-size:13px}'+
      '.sign div{width:45%;border-top:1px solid #333;padding-top:6px;text-align:center}'+
      '@media print{.doc{max-width:100%}}'+
      '</style>'+
      '<div class="doc">'+
        '<div class="hd"><div class="co">شركة حلول أريبا لخدمات الأعمال</div><div class="ti">مخالصة نهاية خدمة — إقرار واستلام مستحقات</div></div>'+
        '<div class="info-grid">'+
          '<div><b>الاسم:</b> ' + (e.nameAr || '—') + '</div>'+
          '<div><b>الجنسية:</b> ' + (e.nationality || e.nat || '—') + '</div>'+
          '<div><b>رقم الهوية/الإقامة:</b> ' + (e.iqamaNo || e.iq || '—') + '</div>'+
          '<div><b>الرقم الوظيفي:</b> ' + (e.empNo || '—') + '</div>'+
          '<div><b>الوظيفة:</b> ' + (e.jobTitle || '—') + '</div>'+
          '<div><b>جهة العمل:</b> ' + (e.employer || '—') + '</div>'+
          '<div><b>تاريخ المباشرة:</b> ' + fD68(sStart) + '</div>'+
          '<div><b>تاريخ انتهاء الخدمة:</b> ' + fD68(sEndDate) + '</div>'+
        '</div>'+

        '<h3 class="sec">📅 مدة الخدمة والإجازات</h3>'+
        '<table class="doc-table"><tr><th>البيان</th><th>التفاصيل</th></tr>'+
          '<tr><td>مدة الخدمة</td><td>' + fD68(sStart) + ' إلى ' + fD68(sEndDate) + '</td></tr>'+
          '<tr><td>رصيد الإجازة المتبقي</td><td>' + leaveRemDays + ' يوم — بدل نقدي: ' + num68(leaveAllowance) + ' ر.س</td></tr>'+
        '</table>'+

        '<h3 class="sec">💰 راتب آخر فترة عمل</h3>'+
        '<table class="doc-table"><tr><th>الفترة</th><th>عدد الأيام</th><th>المبلغ</th></tr>'+
          '<tr><td>' + (period ? fD68(period.from) + ' إلى ' + fD68(period.to) : '—') + '</td><td>' + (period ? period.days : '—') + ' يوم</td><td style="text-align:left;color:#0a7a3f">' + num68(periodSalary) + ' ر.س</td></tr>'+
        '</table>'+

        (extraHtml ? '<h3 class="sec">➕ استحقاقات إضافية</h3><table class="doc-table"><tr><th>البيان</th><th>المبلغ</th></tr>' + extraHtml + '</table>' : '')+

        '<h3 class="sec">➖ الاستقطاعات</h3>'+
        '<table class="doc-table"><tr><th>البيان</th><th>التفاصيل</th><th>المبلغ</th></tr>' + dedHtml + '</table>'+

        '<div class="net-box">'+
          '<div class="lbl">صافي مبلغ المخالصة المستحق</div>'+
          '<div class="val">' + num68(netTotalNum) + ' ريال سعودي</div>'+
          '<div class="tafqeet">فقط: ' + tafqeetText + '</div>'+
        '</div>'+

        '<h3 class="sec">📜 إقرار وتعهد</h3>'+
        '<div class="legal">'+
          'أنا الموقع أدناه / ' + (e.nameAr || '') + '، ' + (e.nationality || e.nat || '') + ' الجنسيــة – هــوية وطنيــة رقم (' + (e.iqamaNo || e.iq || '') + ')، أقر بموجب هذا بالآتي:'+
          '<ul>'+
            '<li>أقر باستلامي كامل حقوقي ومستحقاتي القانونية بموجب عقد العمل الخاص بي وذلك عن مدة خدمتي مع شركة حلول أريبا لخدمات الأعمال، كما هو منصوص عليه في نظام العمل السعودي والتي انتهت مع الشركة بتاريخ (' + fD68(sEndDate) + ')م.</li>'+
            '<li>أوافق على تحويــل مســتحقاتي المتبقية لدي شركة حلول أريبـا لخدمات الأعمال بمبلغ إجمالي قدرة (' + tafqeetText + ') إلى حســابي الشخصـي فـي (' + (e.bank || '—') + ') رقم (' + (e.iban || '—') + ').</li>'+
            '<li>أقر بأنني بموجب هذا ابرئ، بصفة نهائية وغير قابلة للنقض والرجوع عنها، شركة حلول أريبا لخدمات الأعمال، ويشمل مالكيها ومديريها وموظفيها وعملائها من أي مستحقات أو مطالبات أو التزامات مالية او إجراءات أو حقوق أو دعاوي أو التزامات أو مسؤوليات قانونية سواء كانت حالية او مستقبلية من أي نوع كانت والتي يمكن ان تنشأ من أو تكون مرتبطة أو متعلقة بتوظيفي بأي طريقة سواء مباشرة أو غير مباشرة.</li>'+
            custodyClause +
            '<li>اقر بان جميع المعلومات والمستندات التي نمت إلى علمي أو في حوزتي بسبب أو أثناء توظيفي وعملي هي سرية تماما وأوافق على عدم إفشاء محتوياتها لأي طرف من الغير الا إذا كان ذلك لازماً بمقتضى القوانين في المملكة العربية السعودية، كما اتعهد بعدم استخدامها لحسابي أو لصالحي الخاص أو لحساب أي جهة عمل لديها في المستقبل.</li>'+
          '</ul>'+
          'وهذا تعهد ومخالصة نهائية وغير قابلة للنقض.'+
        '</div>'+

        '<div class="sign"><div>الاسم: ' + (e.nameAr || '') + '</div><div>التوقيع: ________________</div></div>'+
      '</div>';

      if(typeof window.printHtml === 'function'){
        window.printHtml('مخالصة نهاية خدمة — ' + (e.nameAr || ''), html);
      }
    }catch(err){ console.warn('ARIBA V68 settlement doc', err); if(typeof toast==='function') toast('تعذر إنشاء المخالصة', 'ter'); }
  }

  window.aribaPrintOfficialSettlement = buildSettlementDoc;

  /* ---------- إضافة الزرار جنب زراري الطباعة/التصفير الموجودين ---------- */
  function addButton(){
    try{
      var resetBtn = document.querySelector('#pg-eoscalc button[onclick="sReset()"]');
      if(resetBtn && !document.getElementById('v68SettleBtn')){
        var btn = document.createElement('button');
        btn.id = 'v68SettleBtn';
        btn.className = 'btn bsm';
        btn.style.cssText = 'background:#014D3D;color:#fff';
        btn.innerHTML = '<i class="ti ti-file-certificate"></i> طباعة مخالصة رسمية';
        btn.onclick = function(){ if(typeof window.aribaPrintOfficialSettlement === 'function') window.aribaPrintOfficialSettlement(); };
        resetBtn.parentNode.insertBefore(btn, resetBtn.nextSibling);
      }
    }catch(e){}
  }
  addButton();
  setInterval(addButton, 1500);
})();
