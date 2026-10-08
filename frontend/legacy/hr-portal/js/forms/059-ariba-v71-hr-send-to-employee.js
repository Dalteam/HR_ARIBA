
/* ============================================================
   ARIBA V71 — إضافة فقط: زرار "إرسال للموظف للتوقيع" على 4
   نماذج (مباشرة عمل، عهدة تقنية، تمديد التجربة، إشعار الإنهاء)
   + شاشة متابعة حالة النماذج المُرسلة (معلّق/موافَق/معترَض+السبب).
   يعتمد على 4 دوال قاعدة بيانات جديدة تمت إضافتها بشكل منفصل
   (ariba_hr_send_template / ariba_hr_template_status)، بدون أي
   تعديل على دوال أو جداول موجودة من قبل.
   ============================================================ */
(function(){
  'use strict';
  var CLOUD_URL = 'https://iwviydmapqpqihcdazpe.supabase.co';
  var CLOUD_KEY = 'sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';

  async function tfCloudRpc(fn, args){
    if(!window.ARIBA_HR_TOKEN || window.ARIBA_HR_TOKEN === 'local_admin_token'){
      throw new Error('محتاج تسجيل دخول سحابي حقيقي (مش الدخول المحلي) عشان الإرسال للموظف يشتغل');
    }
    var r = await fetch(CLOUD_URL+'/rest/v1/rpc/'+fn, {
      method:'POST',
      headers:{apikey:CLOUD_KEY, Authorization:'Bearer '+CLOUD_KEY, 'Content-Type':'application/json', 'Prefer':'return=representation'},
      body: JSON.stringify(Object.assign({p_token: window.ARIBA_HR_TOKEN}, args||{}))
    });
    var t = await r.text(), d = null;
    try{ d = t ? JSON.parse(t) : null; }catch(ex){}
    if(!r.ok) throw new Error((d && (d.message||d.hint||d.error)) || 'تعذر الاتصال بالخادم');
    return d;
  }

  function tfB64(str){
    try{ return btoa(unescape(encodeURIComponent(str))); }
    catch(ex){ return btoa(str); }
  }

  async function tfSendToEmployee(e, templateType, title, fullHtml, btn){
    var origHtml = btn ? btn.innerHTML : '';
    try{
      if(btn){ btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> جاري الإرسال...'; }
      var fileName = templateType + '_' + (e.id||'') + '.html';
      await tfCloudRpc('ariba_hr_send_template', {
        p_employee_id: String(e.id),
        p_emp_no: String(e.empNo || e.id),
        p_template_type: templateType,
        p_title: title,
        p_file_name: fileName,
        p_mime_type: 'text/html',
        p_base64: tfB64(fullHtml)
      });
      if(typeof toast==='function') toast('✅ اتبعت للموظف وبيقدر يوافق أو يعترض من تطبيقه', 'tin');
      tfRefreshStatus();
    }catch(err){
      console.warn('ARIBA V71 send', err);
      if(typeof toast==='function') toast('⚠️ '+(err.message||'تعذر الإرسال للموظف'), 'ter');
    }finally{
      if(btn){ btn.disabled = false; btn.innerHTML = origHtml; }
    }
  }

  /* ---------- نفس منطق بناء كل نموذج (من v70) بدون لمس دوال الطباعة الأصلية ---------- */
  window.tfSendOnboarding = function(ev){
    var e = window.tfRequireEmp71 ? window.tfRequireEmp71() : null; if(!e){ if(typeof toast==='function') toast('اختر الموظف أولاً من القائمة فوق', 'ter'); return; }
    var manager = (document.getElementById('TF1_MGR')||{}).value || e.manager || '\u2014';
    var joinISO = (document.getElementById('TF1_JOIN')||{}).value || e.contractJoin || e.join || e.joinDate || '';
    var firstTime = document.getElementById('TF1_FIRST') ? document.getElementById('TF1_FIRST').checked : true;
    var leaveType = (document.getElementById('TF1_LVTYPE')||{}).value || '';
    var esc = window.tfEsc71;
    var body =
      window.tfInfoTable71(e) +
      '<div class="tf-box"><b>تاريخ المباشرة:</b> '+window.tfD71(joinISO)+'</div>'+
      '<p class="tf-p">المكرم/ بناءً على إشعار التوظيف، نحيطكم علماً بأن الموظف الموضح بياناته أعلاه قد باشر العمل لدينا في شركة حلول أريبا لخدمات الأعمال — قسم '+esc(e.department||e.dept||'')+'.</p>'+
      '<p class="tf-p">الموظف باشر العمل في التاريخ المحدد وذلك يوم: <b>'+window.tfD71(joinISO)+'</b>.</p>'+
      '<div class="tf-sign"><div>المدير المباشر: '+esc(manager)+'<br>التوقيع: ________________</div><div>التاريخ: '+window.tfD71(new Date())+'</div></div>'+
      '<div class="tf-box" style="margin-top:8mm">'+
        '<span class="tf-chk'+(firstTime?' on':'')+'"></span> مباشرة عمل لأول مرة &nbsp;&nbsp;&nbsp; '+
        '<span class="tf-chk'+(!firstTime?' on':'')+'"></span> مباشرة عمل بعد العودة من إجازة'+(leaveType?(' ('+esc(leaveType)+')'):'')+
      '</div>'+
      '<div class="tf-sign"><div>شؤون الموظفين<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>'+
      '<div class="tf-sign" style="margin-top:14mm"><div>اعتماد الرئيس التنفيذي<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>';
    var fullHtml = window.tfWrap71('مباشرة عمل','Onboarding Notice', body);
    tfSendToEmployee(e, 'onboarding', 'مباشرة عمل', fullHtml, ev && ev.target && ev.target.closest('button'));
  };

  window.tfSendCustody = function(ev){
    var e = window.tfRequireEmp71 ? window.tfRequireEmp71() : null; if(!e){ if(typeof toast==='function') toast('اختر الموظف أولاً من القائمة فوق', 'ter'); return; }
    var esc = window.tfEsc71;
    var rows = [];
    document.querySelectorAll('#TF2_ROWS [data-tf2row]').forEach(function(r){
      var n = r.querySelector('[data-tf2-name]').value.trim();
      var s = r.querySelector('[data-tf2-serial]').value.trim();
      var c = r.querySelector('[data-tf2-cond]').value.trim();
      if(n) rows.push({n:n, s:s, c:c});
    });
    if(!rows.length){ if(typeof toast==='function') toast('أضف بند عهدة واحد على الأقل', 'ter'); return; }
    var itemsHtml = rows.map(function(r,i){
      return '<tr><td>'+(i+1)+'</td><td>'+esc(r.n)+'</td><td>'+esc(r.s||'\u2014')+'</td><td>'+esc(r.c||'\u2014')+'</td></tr>';
    }).join('');
    var body =
      window.tfInfoTable71(e) +
      '<table class="tf-bi"><tr><th style="width:8%">م</th><th>اسم العهدة</th><th>الموديل / الرقم التسلسلي</th><th>الحالة</th></tr>'+itemsHtml+'</table>'+
      '<p class="tf-p">أقر أنا الموظف الموضح بياناته أعلاه باستلامي العهدة التقنية المذكورة أعلاه من شركة حلول أريبا لخدمات الأعمال، وأتعهد بالمحافظة عليها واستخدامها في أعمال الشركة فقط، وإعادتها بحالة جيدة عند طلبها أو عند انتهاء علاقتي التعاقدية مع الشركة لأي سبب كان.</p>'+
      '<div class="tf-sign"><div>الموظف: '+esc(e.nameAr||'')+'<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>'+
      '<div class="tf-sign" style="margin-top:10mm"><div>عن قسم تقنية المعلومات<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>';
    var fullHtml = window.tfWrap71('نموذج استلام عهدة تقنية','IT Custody Receipt', body);
    tfSendToEmployee(e, 'custody', 'استلام عهدة تقنية', fullHtml, ev && ev.target && ev.target.closest('button'));
  };

  window.tfSendExtension = function(ev){
    var e = window.tfRequireEmp71 ? window.tfRequireEmp71() : null; if(!e){ if(typeof toast==='function') toast('اختر الموظف أولاً من القائمة فوق', 'ter'); return; }
    var esc = window.tfEsc71;
    var joinISO = (document.getElementById('TF3_JOIN')||{}).value || e.contractJoin || e.join || '';
    var newEndISO = (document.getElementById('TF3_END')||{}).value || '';
    if(!newEndISO){ if(typeof toast==='function') toast('حدد تاريخ نهاية التمديد الجديد', 'ter'); return; }
    var body =
      window.tfBiInfoTable71(e, joinISO) +
      '<p class="tf-p tf-en">Greetings ,,</p><p class="tf-p tf-ar">تحية طيبة وبعد,,</p>'+
      '<p class="tf-p tf-en">Referring to the employment contract concluded with you on '+window.tfDEn71(joinISO)+', please be informed that it has been decided to extend your probationary period to another period ending on '+window.tfDEn71(newEndISO)+'.</p>'+
      '<p class="tf-p tf-ar">إشارة إلى عقد العمل المبرم معكم بتاريخ '+window.tfD71(joinISO)+'، نرجو العلم بأنه قد تقرر تمديد فترة التجربة الخاصة بكم إلى فترة أخرى تنتهي بتاريخ '+window.tfD71(newEndISO)+'.</p>'+
      '<p class="tf-p tf-en">Accordingly, you are kindly requested to receive this notice and provide us with a signed copy of it.</p>'+
      '<p class="tf-p tf-ar">وعليه، يرجى منكم التكرم بإستلام هذا الإشعار وموافاتنا بنسخة موقعة منه.</p>'+
      '<p class="tf-p tf-en">With our best wishes for your success,,</p><p class="tf-p tf-ar">مع وافر أمنياتنا لكم بالتوفيق والنجاح,,</p>'+
      '<div style="text-align:center;margin:8mm 0 10mm"><b>مدير الموارد البشرية<br>Human Resources Manager</b></div>'+
      '<div class="tf-box">'+
        '<p class="tf-p tf-en" style="margin-bottom:2mm">I ( '+esc(e.nameAr||e.nameEn||'')+' ) acknowledge my agreement to extend the trial period in accordance with the above.</p>'+
        '<p class="tf-p tf-ar">أقر أنا ( '+esc(e.nameAr||'')+' ) بموافقتي على تمديد فترة التجربة وفقاً لما ورد أعلاه.</p>'+
      '</div>'+
      '<div class="tf-sign"><div>Signature: ________________<br>التوقيع: ________________</div><div>Date: ________________<br>التاريخ: ________________</div></div>';
    var fullHtml = window.tfWrap71('إشعار تمديد فترة التجربة','Probationary Period Extension', body);
    tfSendToEmployee(e, 'extension', 'تمديد فترة التجربة', fullHtml, ev && ev.target && ev.target.closest('button'));
  };

  window.tfSendTermination = function(ev){
    var e = window.tfRequireEmp71 ? window.tfRequireEmp71() : null; if(!e){ if(typeof toast==='function') toast('اختر الموظف أولاً من القائمة فوق', 'ter'); return; }
    var esc = window.tfEsc71;
    var joinISO = (document.getElementById('TF4_JOIN')||{}).value || e.contractJoin || e.join || '';
    var lastISO = (document.getElementById('TF4_LAST')||{}).value || '';
    if(!lastISO){ if(typeof toast==='function') toast('حدد تاريخ آخر يوم عمل', 'ter'); return; }
    var body =
      window.tfBiInfoTable71(e, joinISO) +
      '<p class="tf-p tf-en">Greetings ,,</p><p class="tf-p tf-ar">تحية طيبة وبعد,,</p>'+
      '<p class="tf-p tf-en">Referring to the employment contract concluded with you on '+window.tfDEn71(joinISO)+', please be informed that it has been decided to terminate your probationary period and your last working date will be '+window.tfDEn71(lastISO)+'.</p>'+
      '<p class="tf-p tf-ar">إشارة إلى عقد العمل المبرم معكم بتاريخ '+window.tfD71(joinISO)+'، نرجو العلم بأنه قد تقرر إنهاء فترة التجربة الخاصة بكم على أن يكون آخر يوم عمل لكم تحت التجربة بتاريخ '+window.tfD71(lastISO)+'.</p>'+
      '<p class="tf-p tf-en">Accordingly, you are kindly requested to receive this notice and provide us with a signed copy of it.</p>'+
      '<p class="tf-p tf-ar">وعليه، يرجى منكم التكرم بإستلام هذا الإشعار وموافاتنا بنسخة موقعة منه.</p>'+
      '<p class="tf-p tf-en">With our best wishes for your success,,</p><p class="tf-p tf-ar">مع وافر أمنياتنا لكم بالتوفيق والنجاح,,</p>'+
      '<div style="text-align:center;margin:8mm 0 10mm"><b>مدير الموارد البشرية<br>Human Resources Manager</b></div>'+
      '<div class="tf-box">'+
        '<p class="tf-p tf-en" style="margin-bottom:2mm">I ( '+esc(e.nameAr||e.nameEn||'')+' ) acknowledge receipt of the termination notice.</p>'+
        '<p class="tf-p tf-ar">أقر أنا ( '+esc(e.nameAr||'')+' ) بإستلام إشعار الإنهاء.</p>'+
      '</div>'+
      '<div class="tf-sign"><div>Signature: ________________<br>التوقيع: ________________</div><div>Date: ________________<br>التاريخ: ________________</div></div>';
    var fullHtml = window.tfWrap71('إشعار إنهاء فترة التجربة','Probationary Period Termination', body);
    tfSendToEmployee(e, 'termination', 'إشعار إنهاء فترة التجربة', fullHtml, ev && ev.target && ev.target.closest('button'));
  };

  /* ---------- شاشة متابعة حالة النماذج المُرسلة ---------- */
  var STATUS_LABELS = {pending:'⏳ بانتظار الموظف', approved:'✅ تمت الموافقة', rejected:'⚠️ معترَض عليه'};
  var TYPE_LABELS = {onboarding:'مباشرة عمل', custody:'استلام عهدة', extension:'تمديد التجربة', termination:'إشعار الإنهاء'};

  window.tfRefreshStatus = async function(){
    var box = document.getElementById('TF_STATUS_BOX');
    if(!box) return;
    try{
      var list = await tfCloudRpc('ariba_hr_template_status', {});
      var emps = (typeof window.tfEmps71 === 'function') ? window.tfEmps71() : [];
      function empName(id){ var f = emps.find(function(x){ return String(x.id)===String(id); }); return f ? (f.nameAr||f.nameEn||id) : id; }
      if(!list || !list.length){
        box.innerHTML = '<div style="padding:14px;text-align:center;color:var(--mu);font-size:12px">لا توجد نماذج مُرسلة بعد</div>';
        return;
      }
      box.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11.5px">'+
        '<tr style="text-align:right;color:var(--mu)"><th style="padding:6px">الموظف</th><th style="padding:6px">النموذج</th><th style="padding:6px">الحالة</th><th style="padding:6px">السبب</th><th style="padding:6px">التاريخ</th></tr>'+
        list.map(function(x){
          return '<tr style="border-top:1px solid var(--bd)">'+
            '<td style="padding:6px">'+empName(x.employee_id)+'</td>'+
            '<td style="padding:6px">'+(TYPE_LABELS[x.template_type]||x.template_type||'')+'</td>'+
            '<td style="padding:6px">'+(STATUS_LABELS[x.status]||x.status)+'</td>'+
            '<td style="padding:6px;color:var(--rd)">'+(x.rejection_reason||'—')+'</td>'+
            '<td style="padding:6px;color:var(--mu)">'+(x.updated_at ? new Date(x.updated_at).toLocaleString('ar-SA') : '')+'</td>'+
          '</tr>';
        }).join('')+
      '</table>';
    }catch(err){
      box.innerHTML = '<div style="padding:14px;text-align:center;color:var(--rd);font-size:12px">'+(err.message||'تعذر التحميل')+'</div>';
    }
  };

  /* ---------- إضافة الأزرار وصندوق الحالة في صفحة النماذج (v70) ---------- */
  function tfAddSendButtons(){
    try{
      var map = [
        {btnAfter:'tfPrintOnboarding', fn:'tfSendOnboarding', label:'إرسال للموظف للتوقيع'},
        {btnAfter:'tfPrintCustody', fn:'tfSendCustody', label:'إرسال للموظف للتوقيع'},
        {btnAfter:'tfPrintExtension', fn:'tfSendExtension', label:'إرسال للموظف للتوقيع'},
        {btnAfter:'tfPrintTermination', fn:'tfSendTermination', label:'إرسال للموظف للتوقيع'}
      ];
      map.forEach(function(m){
        var printBtn = document.querySelector('button[onclick^="'+m.btnAfter+'"]');
        if(printBtn && !printBtn.parentNode.querySelector('[data-tf71="'+m.fn+'"]')){
          var b = document.createElement('button');
          b.className = 'btn bsm';
          b.setAttribute('data-tf71', m.fn);
          b.style.cssText = 'background:#0a5c9e;color:#fff;margin-top:6px;width:100%';
          b.innerHTML = '<i class="ti ti-send"></i> '+m.label;
          b.onclick = window[m.fn];
          printBtn.parentNode.appendChild(b);
        }
      });

      var page = document.getElementById('pg-forms');
      if(page && !document.getElementById('TF_STATUS_CARD')){
        var card = document.createElement('div');
        card.className = 'card';
        card.id = 'TF_STATUS_CARD';
        card.style.cssText = 'padding:12px;margin-top:12px';
        card.innerHTML =
          '<div class="ct" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center">'+
            '<span><i class="ti ti-list-check"></i> حالة النماذج المُرسلة للموظفين</span>'+
            '<button class="btn bsm" onclick="tfRefreshStatus()"><i class="ti ti-refresh"></i> تحديث</button>'+
          '</div>'+
          '<div id="TF_STATUS_BOX"><div style="padding:14px;text-align:center;color:var(--mu);font-size:12px">اضغط تحديث لعرض الحالة</div></div>';
        page.appendChild(card);
      }
    }catch(e){}
  }
  setInterval(tfAddSendButtons, 1500);
})();
