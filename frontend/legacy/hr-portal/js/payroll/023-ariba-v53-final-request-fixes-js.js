
(function(){
  'use strict';

  /* ترتيب موحد للموظفين: الرقم الوظيفي رقمياً ثم الاسم */
  function empSort(a,b){
    var an=Number(String(a.empNo||a.id||'').replace(/\D/g,'')), bn=Number(String(b.empNo||b.id||'').replace(/\D/g,''));
    if(Number.isFinite(an)&&Number.isFinite(bn)&&an!==bn)return an-bn;
    return String(a.empNo||a.id||'').localeCompare(String(b.empNo||b.id||''),'ar');
  }
  window.ARIBA_EMP_SORT=empSort;

  var oldGetEmps=window.getEmps;
  if(typeof oldGetEmps==='function'){
    window.getEmps=function(){
      var a=oldGetEmps.apply(this,arguments)||[];
      return a.slice().sort(empSort);
    };
  }

  /* الموظفون في شاشة البيانات الرئيسية */
  var oldREmps=window.rEmps;
  if(typeof oldREmps==='function'){
    window.rEmps=function(){
      var r=oldREmps.apply(this,arguments);
      try{
        var rows=[].slice.call(document.querySelectorAll('#ET tr'));
        var body=document.querySelector('#ET tbody')||document.getElementById('ET');
        if(body && rows.length>2){
          var head=rows.shift();
          rows.sort(function(a,b){
            var x=a.cells&&a.cells[0]?Number(a.cells[0].textContent):0;
            var y=b.cells&&b.cells[0]?Number(b.cells[0].textContent):0;
            return (isFinite(x)?x:999999)-(isFinite(y)?y:999999);
          });
          rows.forEach(function(x){body.appendChild(x);});
        }
      }catch(e){}
      return r;
    };
  }

  /* قائمة جهات العمل نفسها مرتبة */
  try{
    var oldPopulate=window.populatePayEmps;
    if(typeof oldPopulate==='function'){
      window.populatePayEmps=function(){
        var r=oldPopulate.apply(this,arguments);
        var sel=document.getElementById('payEmp');
        if(sel){
          var opts=[].slice.call(sel.options,1).sort(function(a,b){return a.text.localeCompare(b.text,'ar');});
          opts.forEach(function(o){sel.appendChild(o);});
        }
        return r;
      };
    }
  }catch(e){}

  /* التأمينات: أيام التأمينات = أيام الشهر افتراضياً، ويمكن تعديلها مثل أيام الحضور */
  window.recalcPayrollRowWithInsuranceDays=function(r){
    var days=Number(r.days)||31;
    var insDays=Number(r.insDays);
    if(!isFinite(insDays)||insDays<0)insDays=days;
    if(insDays>days)insDays=days;
    r.insDays=insDays;

    r.salByDays=Math.round(((Number(r.tot)||0)/days*(Number(r.workDays)||0))*100)/100;
    r.totalDue=Math.round((r.salByDays+(Number(r.overtime)||0)+(Number(r.leaveComp)||0)+(Number(r.otherAllow)||0))*100)/100;

    var base=Math.min(((Number(window.getInsSettings?.().wageCap)||45000)/days)*insDays,(Number(r.sal)||0)+(Number(r.hou)||0));
    var er=Number(r.insEmpRate)||0, cr=Number(r.insErRate)||0;
    r.insBase=Math.round(base*100)/100;
    r.insEmp=Math.round(base*er*100)/100;
    r.insEr=Math.round(base*cr*100)/100;
    r.totalDeduct=Math.round((r.insEmp+(Number(r.loanDeduct)||0)+(Number(r.otherDeduct)||0))*100)/100;
    r.net=Math.round((r.totalDue-r.totalDeduct)*100)/100;
    r.netSAR=Math.round(r.net*(Number(r.exchRate)||1)*100)/100;
    return r;
  };

  /* نعيد بناء المسير مع الاحتفاظ بالمعادلات الأصلية، لكن التأمينات تستخدم insDays */
  var oldBuild=window.buildPayrollRows;
  if(typeof oldBuild==='function'){
    window.buildPayrollRows=function(){
      var rows=oldBuild.apply(this,arguments)||[];
      var emps=(typeof aEmps==='function'?aEmps().concat(typeof tEmps==='function'?tEmps():[]):[]);
      var by=new Map(emps.map(function(e){return[String(e.id),e];}));
      var prevRows=window.currentRows||[];
      var prevById=new Map(prevRows.map(function(pr){return[String(pr.id),pr];}));
      rows.forEach(function(r){
        var e=by.get(String(r.id))||{};
        var d=Number(r.days)||31;
        var asOf=(typeof payrollAsOf==='function'?payrollAsOf():new Date());
        var ic=(typeof calcIns==='function')?calcIns(e,d,d,asOf):{empAmt:0,erAmt:0,base:0,empRate:0,erRate:0,status:'—'};
        var prev=prevById.get(String(r.id));
        if(prev&&prev.manualEdits&&prev.manualEdits.insDays&&prev.insDays!==undefined&&prev.insDays!==null&&prev.insDays!==''){
          /* الموظف عدّل الرقم يدويًا قبل كده — نحافظ عليه ومنعملوش أوفرايد بعدد أيام الشهر */
          r.insDays=prev.insDays;
          r.manualEdits=r.manualEdits||{};
          r.manualEdits.insDays=true;
        }else{
          r.insDays=d;
        }
        r.insEmpRate=Number(ic.empRate)||0;
        r.insErRate=Number(ic.erRate)||0;
        r.insBase=Number(ic.base)||0;
        r.insEmp=Number(ic.empAmt)||0;
        r.insEr=Number(ic.erAmt)||0;
        r.insStatus=ic.status||r.insStatus||'—';
        recalcPayrollRowWithInsuranceDays(r);
      });
      rows.sort(function(a,b){
        var x=Number(String(a.empNo||a.id||'').replace(/\D/g,'')),y=Number(String(b.empNo||b.id||'').replace(/\D/g,''));
        return (isFinite(x)?x:999999)-(isFinite(y)?y:999999);
      });
      rows.forEach(function(r,i){r.idx=i+1;});
      return rows;
    };
  }

  /* إعادة الحساب بعد تعديل أي خانة */
  window.recalcRow=function(r){
    recalcPayrollRowWithInsuranceDays(r);
    return r;
  };

  /* تحديث صف: أيام التأمينات تدخل في نفس دورة الحساب */
  var oldUpdate=window.updatePayRow;
  if(typeof oldUpdate==='function'){
    window.updatePayRow=function(empId,field,val){
      if(field==='insDays'){
        var row=(window.currentRows||[]).find(function(r){return String(r.id)===String(empId);});
        if(row){
          var n=Number(val);
          row.insDays=isFinite(n)?Math.max(0,Math.min(Number(row.days)||31,n)):Number(row.days)||31;
          row.edited=true;
          row.manualEdits=row.manualEdits||{};
          row.manualEdits.insDays=true;
          recalcPayrollRowWithInsuranceDays(row);
          if(typeof savePayroll==='function')savePayroll(window.currentRows,window.currentApproved,window.currentApprovedAt);
          if(typeof renderPayroll==='function')renderPayroll(window.currentRows,window.currentApproved,window.currentApprovedAt);
          return;
        }
      }
      oldUpdate.apply(this,arguments);
    };
  }

  /* استبدال عرض المسير: إضافة عمود أيام التأمينات وترتيب الموظفين */
  var oldRender=window.renderPayroll;
  if(typeof oldRender==='function'){
    window.renderPayroll=function(rows,approved,approvedAt){
      rows=(rows||[]).slice().sort(function(a,b){
        var x=Number(String(a.empNo||a.id||'').replace(/\D/g,'')),y=Number(String(b.empNo||b.id||'').replace(/\D/g,''));
        return (isFinite(x)?x:999999)-(isFinite(y)?y:999999);
      });
      rows.forEach(function(r,i){
        r.idx=i+1;
        if(r.insDays===undefined||r.insDays===null||r.insDays==='')r.insDays=Number(r.days)||31;
        if(!approved)recalcPayrollRowWithInsuranceDays(r);
      });

      var result=oldRender.call(this,rows,approved,approvedAt);

      try{
        var head=document.querySelector('#payHead tr');
        if(head && ![].some.call(head.cells,function(c){return c.textContent.trim()==='أيام التأمينات';})){
          var th=document.createElement('th');
          th.textContent='أيام التأمينات';
          th.setAttribute('style','background:var(--c2);padding:6px 7px;text-align:right;font-size:10px;font-weight:700;border-bottom:2px solid var(--bl);white-space:nowrap;position:sticky;top:0;z-index:2;border-left:1px solid rgba(36,48,68,.3)');
          var cells=head.cells;
          var workIndex=[].indexOf.call(cells,Array.from(cells).find(function(c){return c.textContent.trim()==='أيام الحضور';}));
          if(workIndex<0)workIndex=15;
          head.insertBefore(th,cells[workIndex+1]||null);

          var body=document.getElementById('payBody');
          if(body){
            [].forEach.call(body.rows,function(tr){
              var emp=String(tr.cells[1]?.textContent||'').trim();
              var row=rows.find(function(x){return String(x.empNo)===emp;});
              var td=document.createElement('td');
              td.setAttribute('style','padding:5px 7px;border-bottom:1px solid rgba(36,48,68,.25);text-align:right;white-space:nowrap;font-size:11px;border-left:1px solid rgba(36,48,68,.15)');
              if(row && !approved){
                td.innerHTML='<input type="number" min="0" max="'+(Number(row.days)||31)+'" step="1" value="'+(Number(row.insDays)||Number(row.days)||31)+'" style="background:transparent;border:none;color:var(--tx);font-size:11px;width:70px;text-align:right;padding:2px" onchange="updatePayRow(\''+row.id+'\',\'insDays\',this.value)">';
              }else td.textContent=row?String(Number(row.insDays)||Number(row.days)||31):'';
              tr.insertBefore(td,tr.cells[16]||null);
            });
          }
        }
      }catch(e){console.warn('insurance days column',e);}
      return result;
    };
  }

  /* عند تغيير عدد أيام الشهر، أيام التأمينات الافتراضية تتبع الشهر إذا لم يعدّلها المستخدم */
  var oldAuto=window.autoSetDays;
  if(typeof oldAuto==='function'){
    window.autoSetDays=function(){
      var r=oldAuto.apply(this,arguments);
      var days=Number(document.getElementById('payDays')?.value)||31;
      (window.currentRows||[]).forEach(function(x){
        if(!x.manualEdits||!x.manualEdits.insDays)x.insDays=days;
      });
      return r;
    };
  }

  /* الطباعة: تقرير نظيف بالحقول التي طلبتها فقط */
  window.printPayroll=function(){
    var rows=(window.currentRows||[]).slice().sort(function(a,b){
      var x=Number(String(a.empNo||a.id||'').replace(/\D/g,'')),y=Number(String(b.empNo||b.id||'').replace(/\D/g,''));
      return (isFinite(x)?x:999999)-(isFinite(y)?y:999999);
    });
    var m=document.getElementById('payMonth')?.value||'';
    var y=document.getElementById('payYear')?.value||'';
    var months=['','يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    var h=LANG==='en';
    var win=window.open('','_blank','width=1500,height=900');
    if(!win){toast('اسمح بالنوافذ المنبثقة للطباعة','ter');return;}
    function n(v){return Number(v||0).toLocaleString('en-US',{maximumFractionDigits:2});}
    function esc(v){return String(v??'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
    var head='<tr>'+
      ['الرقم','الاسم','الوظيفة','أيام العمل','أيام التأمينات','الراتب الأساسي','بدل السكن','بدل النقل','بدل المشروع','بدلات أخرى','الإجمالي المستحق','الاستقطاعات (خصومات/غيابات/سلف/أخرى)','تأمينات اجتماعية — حصة الموظف','الإجمالي (العملات)','الإجمالي الصافي (الريال)','تأمينات — حصة الشركة'].map(function(x){return '<th>'+x+'</th>';}).join('')+
      '</tr>';
    var body=rows.map(function(r){
      var ded=(Number(r.loanDeduct)||0)+(Number(r.otherDeduct)||0);
      var currencyTotal=(Number(r.net)||0)+(Number(r.eosLawAmt)||0);
      var sar=(Number(r.netSAR)||0)+(Number(r.eosLawAmt)||0);
      return '<tr>'+
        '<td>'+esc(r.empNo)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.job)+'</td>'+
        '<td>'+n(r.workDays)+'</td><td>'+n(r.insDays??r.days)+'</td>'+
        '<td>'+n(r.sal)+'</td><td>'+n(r.hou)+'</td><td>'+n(r.tra)+'</td><td>'+n(r.prj)+'</td><td>'+n(r.oth)+'</td>'+
        '<td>'+n(r.totalDue)+'</td><td>'+n(ded)+'</td><td>'+n(r.insEmp)+'</td>'+
        '<td>'+n(currencyTotal)+(r.currency&&r.currency!=='ريال سعودي'?' '+esc(r.currency):' ر.س')+'</td>'+
        '<td>'+n(sar)+' ر.س</td><td>'+n(r.insEr)+' ر.س</td>'+
      '</tr>';
    }).join('');
    win.document.write('<!doctype html><html dir="rtl"><head><meta charset="utf-8"><title>مسير رواتب '+months[Number(m)]+' '+y+'</title><style>'+
      '@page{size:A3 landscape;margin:5mm}body{font-family:"Segoe UI",Arial,sans-serif;margin:0;color:#111;font-size:8px}'+
      '.head{text-align:center;border-bottom:2px solid #014D3D;padding-bottom:6px;margin-bottom:8px}.brand{color:#014D3D;font-size:14px;font-weight:800}.title{font-size:16px;font-weight:800;margin:3px}.meta{color:#555}'+
      'table{width:100%;border-collapse:collapse;table-layout:fixed}th{background:#014D3D;color:#fff;padding:4px 3px;border:1px solid #bfc8d4;font-size:7px}td{padding:3px;border:1px solid #cfd6df;font-size:7px;text-align:right;word-break:break-word}tr:nth-child(even){background:#f5f7f6}'+
      '</style></head><body><div class="head"><div class="brand">شركة اريبا لخدمات الأعمال</div><div class="title">مسير الرواتب الشهري</div><div class="meta">'+months[Number(m)]+' '+y+' — '+(window.currentApproved?'معتمد':'غير معتمد')+'</div></div><table>'+head+body+'</table><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>');
    win.document.close();
  };

  /* ألوان الرسوم البيانية: الأخضر الغامق ثم الفاتح، والفروق الباقية رمادي فاتح */
  try{
    var DARK='#014D3D', LIGHT='#29B35E', PALE='#E8ECEA', PALE2='#F1F3F2';
    window.mkBar=function(id,labels,data,colors){
      if(window.charts&&window.charts[id])window.charts[id].destroy();
      var ctx=document.getElementById(id);if(!ctx)return;
      var cols=colors||labels.map(function(_,i){return i===0?DARK:(i===1?LIGHT:(i%2===0?PALE:PALE2));});
      window.charts=window.charts||{};
      window.charts[id]=new Chart(ctx,{type:'bar',data:{labels:labels,datasets:[{data:data,backgroundColor:cols,borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return ' '+c.parsed.y.toLocaleString();}}}},scales:{x:{ticks:{color:'#6B7280',font:{size:10}},grid:{color:'rgba(36,48,68,.18)'}},y:{ticks:{color:'#6B7280',font:{size:10}},grid:{color:'rgba(36,48,68,.18)'}}}}});
    };
    window.mkDonut=function(id,labels,data,colors){
      if(window.charts&&window.charts[id])window.charts[id].destroy();
      var ctx=document.getElementById(id);if(!ctx)return;
      var cols=colors||labels.map(function(_,i){return i===0?DARK:(i===1?LIGHT:(i%2===0?PALE:PALE2));});
      window.charts=window.charts||{};
      window.charts[id]=new Chart(ctx,{type:'doughnut',data:{labels:labels,datasets:[{data:data,backgroundColor:cols,borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'62%',plugins:{tooltip:{callbacks:{label:function(c){return ' '+c.label+': '+c.parsed;}}},legend:{position:'bottom',labels:{color:'#8A928F',font:{size:10},boxWidth:10,padding:6}}}}});
    };
  }catch(e){}

  /* الموظفات 9 باللون الأخضر الغامق */
  try{
    var femaleKpi=[].slice.call(document.querySelectorAll('.kpi')).find(function(x){return /الموظفات|Female Employees/i.test(x.textContent||'');});
    if(femaleKpi){
      femaleKpi.style.setProperty('--ac','#014D3D');
      var kv=femaleKpi.querySelector('.kv');if(kv)kv.style.color='#014D3D';
    }
  }catch(e){}

  /* مسؤول HR وزر الخروج */
  try{
    var hr=document.getElementById('HRL');
    if(hr)hr.style.color='#014D3D';
    var logout=hr&&hr.nextElementSibling;
    if(logout){logout.style.color='#014D3D';logout.style.marginInlineStart='5px';logout.style.paddingInline='8px';}
  }catch(e){}

  /* ليلى/ليليى إن وجدت في الواجهة */
  try{
    document.querySelectorAll('*').forEach(function(el){
      if(el.children.length===0 && /ليليى|ليلى/.test(el.textContent||''))el.style.color='#014D3D';
    });
  }catch(e){}

  /* الطلبات: HR يستطيع اعتماد الطلب في أي مرحلة معلقة، وليس المدير فقط */
  try{
    var oldQueue=window.loadWorkflowQueue;
    window.loadWorkflowQueue=async function(){
      var q=await oldQueue.apply(this,arguments);
      (q||[]).forEach(function(x){x.hr_override=String(x?.request?.status||'')==='pending' && ['manager','hr','ceo'].includes(String(x?.request?.current_stage||''));x.can_act=true;});
      window.ARIBA_WORKFLOW_QUEUE=q||[];
      return q||[];
    };
    window.hrOverrideRequest=async function(id){
      var reason=prompt('سبب اعتماد الموارد البشرية نيابة عن المسؤول في هذه المرحلة:');
      if(reason===null)return;
      try{
        await hrRPC('ariba_hr_override_workflow',{p_token:window.ARIBA_HR_TOKEN,p_request_id:id,p_reason:reason||'اعتماد الموارد البشرية نيابة عن المسؤول في هذه المرحلة'});
        toast('✓ تمت الموافقة وانتقل الطلب للمرحلة التالية','tin');
        await loadWorkflowQueue();
        try{rLvPend();}catch(e){}
        try{rAllLv();}catch(e){}
        try{uBadges();}catch(e){}
        try{rWorkflowQueue();}catch(e){}
      }catch(e){toast(e.message||'تعذر اعتماد الطلب','ter');}
    };
  }catch(e){}

  /* عند فتح البرنامج: مزامنة البيانات وترتيبها */
  setTimeout(function(){
    try{if(typeof rEmps==='function')rEmps();}catch(e){}
    try{if(typeof populatePayEmps==='function')populatePayEmps();}catch(e){}
    try{if(typeof loadPayroll==='function')loadPayroll();}catch(e){}
  },1200);

})();
