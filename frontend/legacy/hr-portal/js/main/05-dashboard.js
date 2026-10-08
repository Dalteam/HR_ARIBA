function getAlerts(emps){
  var al=[];
  var today=new Date();
  emps.forEach(function(e){
    // احسب الأيام المتبقية من التواريخ
    function daysLeft(dateStr){
      if(!dateStr) return null;
      var d=new Date(dateStr);
      if(isNaN(d)) return null;
      return Math.round((d-today)/86400000);
    }
    var iqDays=daysLeft(e.iqamaExpiry||e.iqe||'');
    var ppDays=daysLeft(e.passportExpiry||e.ppe||'');
    var ceDays=daysLeft(e.contractEnd||e.ce||'');
    var insDays=daysLeft(e.insuranceExpiry||e.ie||'');
    if(iqDays!=null&&iqDays<=90) al.push({name:e.nameAr||e.na||'',type:'الهوية / الإقامة',days:iqDays,date:e.iqamaExpiry||e.iqe||''});
    if(ppDays!=null&&ppDays<=90) al.push({name:e.nameAr||e.na||'',type:'جواز السفر',days:ppDays,date:e.passportExpiry||e.ppe||''});
    if(ceDays!=null&&ceDays<=90&&(e.contractNature||'')!=='indefinite') al.push({name:e.nameAr||e.na||'',type:'العقد',days:ceDays,date:e.contractEnd||e.ce||''});
    if(insDays!=null&&insDays<=90) al.push({name:e.nameAr||e.na||'',type:'التأمين الطبي',days:insDays,date:e.insuranceExpiry||e.ie||''});
  });
  return al.sort(function(a,b){return a.days-b.days;});
}

function getDeptColor(d){
  var m={'التشغيل':'#014D3D','التسويق':'#29B35E','التطوير':'#E4E4BC','المالية':'#607D8B',
    'الموارد البشرية':'#90A4AE','اللوجستية':'#455A64','الإدارة':'#9E9E9E'};
  return m[d]||'#9E9E9E';
}
function loadDash(){
  var a=[];
  if(typeof CLEAN_EMPS!=='undefined'&&CLEAN_EMPS.length&&!localStorage.getItem('hr7_emps')){
    a=CLEAN_EMPS.filter(function(e){return !e.isTerminated&&!e.term;});
  }
  if(!a.length){try{var _s=localStorage.getItem('hr7_emps');if(_s)a=JSON.parse(_s).filter(function(e){return !e.isTerminated;});}catch(ex){}}
  if(!a.length)a=aEmps();
  var t=tEmps();
  var h=LANG==='en';
  var isDark=document.body.classList.contains('dark')||document.documentElement.classList.contains('dark');

  // حسابات
  var saudis=a.filter(function(e){return e.isSaudi||e.saudi||['سعودي','سعودية'].includes((e.nationality||e.nat||'').trim());});
  var expats=a.filter(function(e){return !saudis.includes(e);});
  var females=a.filter(function(e){
    var g=(e.gender||e.gen||'').trim();
    var name=e.nameAr||e.name_ar||'';
    return g==='أنثى'||g==='f'||g==='female'||
      ['منى','زينب','ريم','بدريه','ساره','نوره','كادي','منيرة','دعاء','غدي','لينا','نهى','سجى','روان','أثير','هيا','نورة','فاطمة','عائشة','أفنان'].some(function(fn){return name.startsWith(fn);});
  });
  var males=a.filter(function(e){return !females.includes(e);});
  var tamheer=a.filter(function(e){return (e.jobTitle||e.jt||'').includes('تمهير');});
  var saudi_pct=a.length?Math.round(saudis.length/a.length*100):0;
  var female_pct=a.length?Math.round(females.length/a.length*100):0;
  var male_pct=100-female_pct;
  var totSal=a.reduce(function(s,e){
    return s+(Number(e.salary||e.sal||0)+Number(e.housingAllowance||e.hou||0)+Number(e.transportAllowance||e.tra||0));
  },0);
  var pendLvs=(getLvs().filter(function(l){return l.status==='pending';}).length+getPerms().filter(function(l){return l.status==='pending';}).length);
  var deptMap={};
  a.forEach(function(e){var d=(e.dept||e.dep||'غير محدد').trim();deptMap[d]=(deptMap[d]||0)+1;});
  var deptKeys=Object.keys(deptMap).sort(function(a,b){return deptMap[b]-deptMap[a];});
  var empMap={};
  a.forEach(function(e){var em=(e.employer||e.em||'غير محدد').trim();empMap[em]=(empMap[em]||0)+1;});
  var natMap={};
  a.forEach(function(e){
    var n=(e.nationality||e.nat||'—').replace('سعودية','سعودي').replace('مصرية','مصري').replace('أردنية','أردني');
    natMap[n]=(natMap[n]||0)+1;
  });
  var byEmp={};
  a.forEach(function(e){
    var sal=Number(e.salary||e.sal||0)+Number(e.housingAllowance||e.hou||0)+Number(e.transportAllowance||e.tra||0);
    var em=(e.employer||e.em||'غير محدد').trim();
    if(sal>0)byEmp[em]=(byEmp[em]||0)+sal;
  });

  // ألوان حسب الوضع
  var maleColor    = isDark ? '#E4E4BC' : '#014D3D';
  var femaleColor  = isDark ? '#E4E4BC' : '#29B35E';
  var pendColor    = isDark ? '#E4E4BC' : '#014D3D';
  var saudiColor   = isDark ? '#E4E4BC' : '#014D3D';
  var salColor     = isDark ? '#9CA3AF' : '#4B5563';
  var salBorder    = isDark ? '#9CA3AF' : '#4B5563';
  var termColor    = isDark ? '#ffffff' : '#231F20';
  var tamheerColor = isDark ? '#E4E4BC' : '#4B5563';
  var deptNumColor = isDark ? '#E4E4BC' : '#014D3D';
  var hrUserColor  = isDark ? '#E4E4BC' : '#ffffff';

  // ===== KPI: 6 cards في صف واحد =====
  document.getElementById('KR').innerHTML=
  '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1.5fr 1.5fr 0.8fr;gap:14px;margin-bottom:20px;align-items:stretch;width:100%;box-sizing:border-box">'+

  // 1. عدد الموظفين
  '<div style="background:#014D3D;border-radius:18px;padding:24px 20px;text-align:center;color:#fff;display:flex;flex-direction:column;justify-content:center;min-height:140px">'+
    '<div style="font-size:12px;opacity:.8;letter-spacing:.5px;margin-bottom:8px">'+(h?'EMPLOYEES':'الموظفون الحاليون')+'</div>'+
    '<div style="font-size:56px;font-weight:900;line-height:1;margin-bottom:8px">'+a.length+'</div>'+
    '<div style="font-size:11px;opacity:.7;border-top:1px solid rgba(255,255,255,.25);padding-top:8px">'+
      saudis.length+' سعودي &nbsp;•&nbsp; '+expats.length+' وافد'+
    '</div>'+
  '</div>'+

  // 2. السعودة
  '<div style="background:var(--c2);border-radius:18px;padding:24px 20px;text-align:center;border:2px solid #014D3D;display:flex;flex-direction:column;justify-content:center;min-height:140px">'+
    '<div style="font-size:12px;color:var(--mu);margin-bottom:8px">'+(h?'SAUDIZATION':'نسبة السعودة')+'</div>'+
    '<div style="font-size:52px;font-weight:900;color:#014D3D;line-height:1;margin-bottom:10px">'+saudi_pct+'<span style="font-size:22px">%</span></div>'+
    '<div style="height:8px;background:var(--bd);border-radius:4px">'+
      '<div style="height:8px;border-radius:4px;background:#014D3D;width:'+saudi_pct+'%"></div>'+
    '</div>'+
  '</div>'+

  // 3. إجمالي الرواتب
  '<div style="background:var(--c2);border-radius:18px;padding:24px 20px;text-align:center;border:2px solid #8b5cf6;display:flex;flex-direction:column;justify-content:center;min-height:140px">'+
    '<div style="font-size:12px;color:var(--mu);margin-bottom:8px">'+(h?'MONTHLY PAYROLL':'إجمالي الرواتب')+'</div>'+
    '<div style="font-size:26px;font-weight:900;color:#8b5cf6;line-height:1.2;margin-bottom:6px">'+Math.round(totSal).toLocaleString('ar-SA')+'</div>'+
    '<div style="font-size:12px;color:var(--mu)">ريال سعودي / شهرياً</div>'+
  '</div>'+

  // 4. توزيع الجنس
  '<div style="background:var(--c2);border-radius:18px;padding:24px 20px;border:2px solid #e5e7eb;min-height:140px">'+
    '<div style="font-size:12px;color:var(--mu);margin-bottom:14px;font-weight:600">'+(h?'GENDER DISTRIBUTION':'توزيع الجنس')+'</div>'+
    '<div style="display:flex;justify-content:space-around;align-items:center;height:calc(100% - 36px)">'+
      '<div style="text-align:center">'+
        '<div style="font-size:36px;margin-bottom:6px">👨</div>'+
        '<div style="font-size:28px;font-weight:900;color:'+maleColor+';line-height:1">'+males.length+'</div>'+
        '<div style="font-size:12px;color:var(--mu);margin-top:4px">'+male_pct+'% ذكور</div>'+
      '</div>'+
      '<div style="width:1px;height:60px;background:var(--bd)"></div>'+
      '<div style="text-align:center">'+
        '<div style="font-size:36px;margin-bottom:6px">👩</div>'+
        '<div style="font-size:28px;font-weight:900;color:'+femaleColor+';line-height:1">'+females.length+'</div>'+
        '<div style="font-size:12px;color:var(--mu);margin-top:4px">'+female_pct+'% إناث</div>'+
      '</div>'+
    '</div>'+
  '</div>'+

  // 5. الأقسام
  '<div style="background:var(--c2);border-radius:18px;padding:24px 20px;border:2px solid #e5e7eb;min-height:140px">'+
    '<div style="font-size:12px;color:var(--mu);margin-bottom:12px;font-weight:600">'+(h?'DEPARTMENTS':'توزيع الأقسام')+'</div>'+
    deptKeys.map(function(d){
      var pct=Math.round(deptMap[d]/a.length*100);
      return '<div style="margin-bottom:10px">'+
        '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">'+
          '<span style="color:var(--tx)">'+d+'</span>'+
          '<span style="font-weight:700;color:#014D3D">'+deptMap[d]+' <span style="color:var(--mu);font-weight:400">('+pct+'%)</span></span>'+
        '</div>'+
        '<div style="height:7px;background:var(--bd);border-radius:4px">'+
          '<div style="height:7px;border-radius:4px;background:#014D3D;width:'+pct+'%;transition:width .5s"></div>'+
        '</div>'+
      '</div>';
    }).join('')+
  '</div>'+

  // 6. طلبات + منتهية + تمهير
  '<div style="background:var(--c2);border-radius:18px;padding:20px 16px;border:2px solid #e5e7eb;min-height:140px;display:flex;flex-direction:column;gap:10px;justify-content:center">'+
    '<div style="background:var(--c1);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center">'+
      '<span style="font-size:12px;color:var(--mu)">🔔 طلبات معلقة</span>'+
      '<span style="font-size:26px;font-weight:900;color:'+pendColor+'">'+pendLvs+'</span>'+
    '</div>'+
    '<div style="background:var(--c1);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center">'+
      '<span style="font-size:12px;color:var(--mu)">🔴 منتهية الخدمة</span>'+
      '<span style="font-size:26px;font-weight:900;color:#ef4444">'+t.length+'</span>'+
    '</div>'+
    '<div style="background:var(--c1);border-radius:12px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center">'+
      '<span style="font-size:12px;color:var(--mu)">🎓 تمهير</span>'+
      '<span style="font-size:26px;font-weight:900;color:#856a00">'+tamheer.length+'</span>'+
    '</div>'+
  '</div>'+

  '</div>';

  // التنبيهات
  var alerts=getAlerts(a);
  var AC=document.getElementById('AC');if(AC)AC.textContent=alerts.length;
  var AL=document.getElementById('AL');
  if(AL){
    AL.innerHTML=alerts.length?alerts.slice(0,20).map(function(al){
      var color=al.days<0?'var(--rd)':al.days<14?'var(--rd)':al.days<30?'var(--am)':'#f59e0b';
      return '<div style="padding:8px 10px;border-right:3px solid '+color+';margin-bottom:4px;background:'+color+'11;border-radius:4px;font-size:12px;color:'+color+'">'+
        '⚠ '+al.name+' — '+(al.type||al.label||'')+': '+(al.date||'')+
        (al.days!=null?' ('+al.days+' يوم)':'')+
      '</div>';
    }).join(''):'<div style="padding:20px;text-align:center;color:var(--mu);font-size:13px">لا توجد تنبيهات عاجلة</div>';
  }
  var DD=document.getElementById('DD');
  if(DD){
    DD.innerHTML=deptKeys.map(function(d){
      var pct=Math.round(deptMap[d]/a.length*100);
      return '<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px"><span>'+d+'</span><span style="font-weight:700">'+deptMap[d]+'</span></div><div style="height:6px;background:var(--bd);border-radius:3px"><div style="height:6px;border-radius:3px;background:var(--gr);width:'+pct+'%"></div></div></div>';
    }).join('');
  }

  // رسوم بيانية
  var NAT_COLORS={'سعودي':'#014D3D','مصري':'#29B35E','أردني':'#E4E4BC','سوداني':'#231F20','سوري':'#4B5563','تونسي':'#9CA3AF'};
  var EMP_COLORS={'أريبا':'#014D3D','الجيوميكانية':'#29B35E','أوبتيموم':'#E4E4BC'};
  var DEPT_COLORS=['#014D3D','#29B35E','#E4E4BC','#4B5563','#9CA3AF','#231F20'];
  setTimeout(function(){
    if(Object.keys(byEmp).length)mkBar('cSal',Object.keys(byEmp),Object.values(byEmp).map(function(v){return Math.round(v);}),Object.keys(byEmp).map(function(x){return EMP_COLORS[x.trim()]||'#014D3D';}));
    if(Object.keys(natMap).length)mkDonut('cNat',Object.keys(natMap),Object.values(natMap),Object.keys(natMap).map(function(x){return NAT_COLORS[x.trim()]||'#9CA3AF';}));
    if(Object.keys(empMap).length)mkDonut('cEmp',Object.keys(empMap),Object.values(empMap),Object.keys(empMap).map(function(x){return EMP_COLORS[x.trim()]||'#014D3D';}));
    if(Object.keys(deptMap).length)mkDonut('cDept',Object.keys(deptMap),Object.values(deptMap),Object.keys(deptMap).map(function(x,i){return DEPT_COLORS[i%DEPT_COLORS.length];}));
  },500);
}
