
/* V114: نماذج عربية بشكل مباشرة العمل + توقيع الموارد البشرية + إرسال للموظف (إضافة فقط) */
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


  /* ---------- النماذج بالعربي بشكل مباشرة العمل + توقيع الموارد البشرية + إرسال للموظف لكل النماذج ---------- */
  var LAWS={
    m84:{art:'84',ar:'إنهاء من الشركة'}, m74:{art:'74',ar:'اتفاق الطرفين'}, m85:{art:'85',ar:'استقالة'},
    m75:{art:'75',ar:'استقالة قسرية'}, m77:{art:'77',ar:'فصل تعسفي'}, m80:{art:'80',ar:'فصل تأديبي'}, m74r:{art:'74(4)',ar:'تقاعد'}
  };
  var STY='padding:6px;border:1px solid var(--bd);border-radius:6px;background:var(--c2);color:var(--tx);font-size:12px;width:100%';
  function fld(l,inner){ return '<div style="margin-bottom:6px"><label style="font-size:10px;color:var(--mu);font-weight:600;display:block;margin-bottom:2px">'+l+'</label>'+inner+'</div>'; }
  function val(id){ var el=document.getElementById(id); return el?el.value:''; }
  function emp(){ return (typeof window.tfRequireEmp71==='function')?window.tfRequireEmp71():null; }
  function X(s){ return (window.tfEsc71||esc)(s); }
  function D(v){ return window.tfD71(v); }
  function today(){ return new Date(); }
  var CO='شركة حلول أريبا لخدمات الأعمال';
  function box(inner){ return '<div class="tf-box">'+inner+'</div>'; }
  function hrSign(){ return window.ARIBA_HRSIG?window.ARIBA_HRSIG.html('ar',{date:true,mt:2,h:28}):'<div class="tf-sign" style="margin-top:6mm"><div><b>الموارد البشرية</b><br>التوقيع: ________________</div><div>التاريخ: '+D(today())+'</div></div>'; }
  function empAck(e,txt){
    return box('أقر أنا ( '+X(e.nameAr||e.nameEn||'')+' ) '+txt)+
      '<div class="tf-sign"><div>الموظف: '+X(e.nameAr||'')+'<br>التوقيع: ________________</div><div>التاريخ: ________________</div></div>';
  }
  function wrap(t,en,body){ return window.tfWrap71(t,en,body); }

  /* ---- تمديد فترة التجربة ---- */
  function buildExtension(){
    var e=emp(); if(!e) return null;
    var joinISO=val('TF3_JOIN')||e.contractJoin||e.join||'', endISO=val('TF3_END');
    if(!endISO){ notify('حدد تاريخ نهاية التمديد الجديد',true); return null; }
    var body=window.tfInfoTable71(e)+
      box('<div style="margin-bottom:4px"><b>تاريخ بداية العقد:</b> '+D(joinISO)+'</div><div><b>نهاية فترة التجربة بعد التمديد:</b> '+D(endISO)+'</div>')+
      '<p class="tf-p" dir="rtl">المكرم/ '+X(e.nameAr||e.nameEn||'')+'، تحية طيبة وبعد,,</p>'+
      '<p class="tf-p" dir="rtl">إشارة إلى عقد العمل المبرم معكم بتاريخ '+D(joinISO)+'، نرجو العلم بأنه قد تقرر تمديد فترة التجربة الخاصة بكم إلى فترة أخرى تنتهي بتاريخ <b>'+D(endISO)+'</b>.</p>'+
      '<p class="tf-p" dir="rtl">وعليه، يرجى منكم التكرم بإستلام هذا الإشعار وموافاتنا بنسخة موقعة منه.</p>'+
      '<p class="tf-p" dir="rtl">مع وافر أمنياتنا لكم بالتوفيق والنجاح,,</p>'+
      hrSign()+empAck(e,'بموافقتي على تمديد فترة التجربة وفقاً لما ورد أعلاه.');
    return {e:e,title:'إشعار تمديد فترة التجربة',html:wrap('إشعار تمديد فترة التجربة','Probationary Period Extension',body)};
  }
  /* ---- إنهاء فترة التجربة ---- */
  function buildTermination(){
    var e=emp(); if(!e) return null;
    var joinISO=val('TF4_JOIN')||e.contractJoin||e.join||'', lastISO=val('TF4_LAST');
    if(!lastISO){ notify('حدد تاريخ آخر يوم عمل',true); return null; }
    var body=window.tfInfoTable71(e)+
      box('<div style="margin-bottom:4px"><b>تاريخ بداية العقد:</b> '+D(joinISO)+'</div><div><b>تاريخ آخر يوم عمل:</b> '+D(lastISO)+'</div>')+
      '<p class="tf-p" dir="rtl">المكرم/ '+X(e.nameAr||e.nameEn||'')+'، تحية طيبة وبعد,,</p>'+
      '<p class="tf-p" dir="rtl">إشارة إلى عقد العمل المبرم معكم بتاريخ '+D(joinISO)+'، نرجو العلم بأنه قد تقرر إنهاء فترة التجربة الخاصة بكم على أن يكون آخر يوم عمل لكم تحت التجربة بتاريخ <b>'+D(lastISO)+'</b>.</p>'+
      '<p class="tf-p" dir="rtl">وعليه، يرجى منكم التكرم بإستلام هذا الإشعار وموافاتنا بنسخة موقعة منه.</p>'+
      '<p class="tf-p" dir="rtl">مع وافر أمنياتنا لكم بالتوفيق والنجاح,,</p>'+
      hrSign()+empAck(e,'بإستلام إشعار إنهاء فترة التجربة.');
    return {e:e,title:'إشعار إنهاء فترة التجربة',html:wrap('إشعار إنهاء فترة التجربة','Probationary Period Termination',body)};
  }
  /* ---- تقييم فترة التجربة ---- */
  var CRIT=['المعرفة الفنية في مجال عمله','الإلتزام بقوانين وأنظمة الشركة','جودة مخرجات العمل','علاقة الموظف مع إدارته وزملائه','القدرة على التعلم والتطور والمبادرة'];
  var LBL={0:'غير مرضٍ',50:'أقل من التوقعات',70:'يحقق التوقعات',90:'يفوق التوقعات',100:'متميز'};
  function buildEvaluation(){
    var e=emp(); if(!e) return null;
    var joinISO=val('TF7_JOIN')||e.contractJoin||e.join||'', endISO=val('TF7_END'), rec=val('TF7_REC');
    var dec=(document.querySelector('input[name="tf7dec"]:checked')||{}).value||'';
    var scores=[]; document.querySelectorAll('#TF7_ROWS [data-tf7-score]').forEach(function(s){ scores.push(Number(s.value)||0); });
    if(!scores.length) scores=[70,70,70,70,70];
    var total=Math.round(scores.reduce(function(a,b){return a+b;},0)/scores.length);
    var rows=CRIT.map(function(c,i){ var sc=scores[i]||0; return '<tr><td>'+(i+1)+'</td><td style="text-align:right;padding-right:8px">'+X(c)+'</td><td>'+sc+'%</td><td>'+(LBL[sc]||'')+'</td></tr>'; }).join('');
    var body=window.tfInfoTable71(e)+
      box('<b>تاريخ بداية العقد:</b> '+D(joinISO)+' &nbsp;&nbsp;&nbsp; <b>تاريخ نهاية فترة التجربة:</b> '+D(endISO))+
      '<p class="tf-p" dir="rtl" style="margin:2mm 0">حيث أن الموظف الموضحة بياناته أعلاه قد أوشك على إكمال فترة التجربة، نأمل تعبئة هذا النموذج وإعادته إلى الموارد البشرية قبل تاريخ انتهائها.</p>'+
      '<table class="tf-eval"><tr><th>#</th><th>معيار التقييم</th><th>الدرجة</th><th>التقييم</th></tr>'+rows+
      '<tr style="font-weight:800;background:#f0f6f4"><td colspan="2">المجموع</td><td colspan="2">'+total+'%</td></tr></table>'+
      box('<b>توصيات واعتماد المدير المباشر:</b> '+X(rec||'')+'<div style="min-height:4mm"></div>')+
      box('<b>القرار النهائي:</b> &nbsp; <span class="tf-chk'+(dec==='appoint'?' on':'')+'"></span> تثبيت الموظف &nbsp;&nbsp; <span class="tf-chk'+(dec==='terminate'?' on':'')+'"></span> إنهاء خدمته &nbsp;&nbsp; <span class="tf-chk'+(dec==='extend'?' on':'')+'"></span> تمديد فترة التجربة')+
      (window.ARIBA_HRSIG?window.ARIBA_HRSIG.html('ar',{mt:2,h:27,extra:'<div style="text-align:center;font-weight:700;font-size:11.5px">المدير المباشر<br>التوقيع: ________________</div>'}):'<div class="tf-sign" style="margin-top:5mm"><div>المدير المباشر<br>التوقيع: ________________</div><div><b>الموارد البشرية</b><br>التوقيع: ________________</div></div>');
    return {e:e,title:'تقييم فترة التجربة',html:wrap('نموذج تقييم فترة التجربة','Probationary Period Evaluation',body)};
  }
  /* ---- إشعار انتهاء عقد العمل ---- */
  function buildContractEnd(){
    var e=emp(); if(!e) return null;
    var key=val('TF_CE_LAW'), other=val('TF_CE_OTHER').trim(), lastISO=val('TF_CE_LAST'), joinISO=val('TF_CE_JOIN')||e.contractJoin||e.join||e.joinDate||'', refISO=val('TF_CE_REF'), notes=val('TF_CE_NOTES').trim();
    if(!lastISO){ notify('حدد تاريخ آخر يوم عمل',true); return null; }
    if(!key){ notify('اختر السند النظامي',true); return null; }
    if(key==='other'&&!other){ notify('اكتب المادة/السند النظامي',true); return null; }
    var basis=(key==='other')?other:('المادة ('+LAWS[key].art+') من نظام العمل — '+LAWS[key].ar);
    var ref='';
    if(refISO){ if(key==='m85'||key==='m75') ref='، وذلك بناءً على استقالتكم المقدمة بتاريخ '+D(refISO); else if(key==='m74') ref='، وذلك بناءً على الاتفاق بين الطرفين بتاريخ '+D(refISO); }
    var body=window.tfInfoTable71(e)+
      box('<div style="margin-bottom:4px"><b>تاريخ بداية العقد:</b> '+D(joinISO)+'</div><div style="margin-bottom:4px"><b>تاريخ آخر يوم عمل:</b> '+D(lastISO)+'</div><div><b>السند النظامي:</b> '+X(basis)+'</div>')+
      '<p class="tf-p" dir="rtl">المكرم/ '+X(e.nameAr||e.nameEn||'')+'، تحية طيبة وبعد,,</p>'+
      '<p class="tf-p" dir="rtl">إشارة إلى عقد العمل المبرم معكم بتاريخ '+D(joinISO)+'، نرجو العلم بأنه سيتم إنهاء عقد العمل الخاص بكم على أن يكون آخر يوم عمل لكم بتاريخ <b>'+D(lastISO)+'</b>'+ref+'، وذلك استناداً إلى <b>'+X(basis)+'</b>.</p>'+
      (notes?'<p class="tf-p" dir="rtl"><b>ملاحظات:</b> '+X(notes)+'</p>':'')+
      '<p class="tf-p" dir="rtl">وسيتم تسوية مستحقاتكم النظامية وفق أحكام نظام العمل. وعليه، يرجى منكم التكرم بإستلام هذا الإشعار وموافاتنا بنسخة موقعة منه.</p>'+
      '<p class="tf-p" dir="rtl">مع وافر أمنياتنا لكم بالتوفيق والنجاح,,</p>'+
      hrSign()+empAck(e,'بإستلام إشعار انتهاء عقد العمل.');
    return {e:e,title:'إشعار انتهاء عقد العمل',html:wrap('إشعار انتهاء عقد العمل','Employment Contract Termination Notice',body)};
  }

  function doPrint(b){ if(b && typeof window.printHtml==='function') window.printHtml(b.title+' \u2014 '+(b.e.nameAr||''), b.html); }
  window.tfPrintExtension=function(){ doPrint(buildExtension()); };
  window.tfPrintTermination=function(){ doPrint(buildTermination()); };
  window.tfPrintEvaluation=function(){ doPrint(buildEvaluation()); };
  window.tfPrintContractEnd=function(){ doPrint(buildContractEnd()); };

  /* ---- إرسال للموظف (نفس دالة الإرسال والموافقة/الاعتراض الموجودة) ---- */
  async function send(type,b,btn){
    if(!b) return;
    var t=window.ARIBA_HR_TOKEN||'';
    if(!UUID.test(t)){ notify('محتاج تسجيل دخول سحابي حقيقي عشان الإرسال للموظف يشتغل',true); return; }
    if(!confirm('هيتبعت "'+b.title+'" لـ '+(b.e.nameAr||'')+' في تطبيقه عشان يوافق أو يعترض. متأكد؟')) return;
    var old=btn?btn.innerHTML:''; if(btn){ btn.disabled=true; btn.textContent='جاري الإرسال…'; }
    try{
      var html=b.html; try{ var enb=(typeof window.ARIBA_FORM_EN_BUILD==='function')?window.ARIBA_FORM_EN_BUILD(type,b.e):null; if(enb&&enb.html) html=html+'<!--ARIBA_EN-->'+enb.html; }catch(x){}
      var b64; try{ b64=btoa(unescape(encodeURIComponent(html))); }catch(x){ b64=btoa(html); }
      await rpc('ariba_hr_send_template',{p_token:t,p_employee_id:String(b.e.id),p_emp_no:String(b.e.empNo||b.e.id),p_template_type:type,p_title:b.title,p_file_name:type+'_'+(b.e.id||'')+'.html',p_mime_type:'text/html',p_base64:b64});
      notify('✅ اتبعت للموظف وبيقدر يوافق أو يعترض من تطبيقه',false);
      try{ if(typeof window.tfRefreshStatus==='function') window.tfRefreshStatus(); }catch(x){}
    }catch(err){ notify('⚠️ '+(err.message||'تعذر الإرسال'),true); }
    if(btn){ btn.disabled=false; btn.innerHTML=old; }
  }
  /* التقاط ناتج دالة الطباعة الأصلية (إخلاء الطرف / شهادة الخبرة) بدون طباعة */
  function capture(fnName,title){
    var e=emp(); if(!e) return null;
    var cap=null, orig=window.printHtml;
    window.printHtml=function(t,h){ cap={e:e,title:title,html:h}; };
    try{ if(typeof window[fnName]==='function') window[fnName](); }catch(x){} finally{ window.printHtml=orig; }
    return cap;
  }
  window.tfSendExtension=function(ev){ send('extension',buildExtension(),ev&&ev.currentTarget); };
  window.tfSendTermination=function(ev){ send('termination',buildTermination(),ev&&ev.currentTarget); };
  window.tfSendEvaluation=function(ev){ send('evaluation',buildEvaluation(),ev&&ev.currentTarget); };
  window.tfSendContractEnd=function(ev){ send('contract_end',buildContractEnd(),ev&&ev.currentTarget); };
  window.tfSendClearance=function(ev){ send('clearance',capture('tfPrintClearance','إخلاء طرف'),ev&&ev.currentTarget); };
  window.tfSendExperience=function(ev){ send('experience',capture('tfPrintExperience','شهادة خبرة'),ev&&ev.currentTarget); };

  var TYPE_AR={contract_end:'إشعار انتهاء عقد العمل',clearance:'إخلاء طرف',experience:'شهادة خبرة',evaluation:'تقييم فترة التجربة'};
  function addSend(printFn,sendFn){
    var pb=document.querySelector('button[onclick^="'+printFn+'"]'); if(!pb) return;
    var ex=pb.parentNode.querySelector('[data-tf71="'+sendFn+'"]');
    if(!ex){
      var b=document.createElement('button'); b.className='btn bsm'; b.setAttribute('data-tf71',sendFn);
      b.style.cssText='background:#0a5c9e;color:#fff;margin-top:6px;width:100%';
      b.innerHTML='<i class="ti ti-send"></i> إرسال للموظف للتوقيع';
      pb.parentNode.appendChild(b); ex=b;
    }
    if(ex.getAttribute('data-v114')!=='1'){ ex.setAttribute('data-v114','1'); ex.onclick=function(ev){ return window[sendFn](ev); }; }
  }
  function ensure(){
    try{
      var grid=document.querySelector('#pg-forms > div[style*="grid-template-columns"]');
      if(grid && !document.getElementById('TF_CE_CARD')){
        var c=document.createElement('div'); c.className='card'; c.id='TF_CE_CARD'; c.style.padding='12px';
        var opts='<option value="">— اختر —</option>'+Object.keys(LAWS).map(function(k){ return '<option value="'+k+'">م.'+LAWS[k].art+' — '+LAWS[k].ar+'</option>'; }).join('')+'<option value="other">أخرى (اكتب المادة)</option>';
        c.innerHTML='<div class="ct" style="margin-bottom:8px"><i class="ti ti-file-off"></i> إشعار انتهاء عقد العمل</div>'
          +fld('تاريخ بداية العقد (لو فاضي ياخده من ملف الموظف)','<input type="date" id="TF_CE_JOIN" style="'+STY+'">')
          +fld('تاريخ آخر يوم عمل','<input type="date" id="TF_CE_LAST" style="'+STY+'">')
          +fld('السند النظامي (من مواد نظام العمل)','<select id="TF_CE_LAW" style="'+STY+'">'+opts+'</select>')
          +'<div id="TF_CE_OTHERBOX" style="display:none">'+fld('المادة / السند (نص حر)','<input id="TF_CE_OTHER" style="'+STY+'">')+'</div>'
          +fld('تاريخ الاستقالة / الاتفاق (اختياري)','<input type="date" id="TF_CE_REF" style="'+STY+'">')
          +fld('ملاحظات (اختياري)','<textarea id="TF_CE_NOTES" rows="2" style="'+STY+'"></textarea>')
          +'<button class="btn bgr bsm" style="margin-top:8px" onclick="tfPrintContractEnd()"><i class="ti ti-printer"></i> طباعة إشعار انتهاء العقد</button>';
        grid.appendChild(c);
        c.querySelector('#TF_CE_LAW').onchange=function(){ document.getElementById('TF_CE_OTHERBOX').style.display=this.value==='other'?'block':'none'; };
      }
      [['tfPrintContractEnd','tfSendContractEnd'],['tfPrintExtension','tfSendExtension'],['tfPrintTermination','tfSendTermination'],
       ['tfPrintEvaluation','tfSendEvaluation'],['tfPrintClearance','tfSendClearance'],['tfPrintExperience','tfSendExperience']].forEach(function(p){ addSend(p[0],p[1]); });
      var sb=document.getElementById('TF_STATUS_BOX');
      if(sb) sb.querySelectorAll('td').forEach(function(td){ var k=td.textContent.trim(); if(TYPE_AR[k]) td.textContent=TYPE_AR[k]; });
    }catch(e){}
  }
  setInterval(ensure,1000); setTimeout(ensure,300);
})();
