
/* V117: نسخ إنجليزية (من اليسار لليمين) لكل النماذج + إرسالها مع النموذج (إضافة فقط) */
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


  /* ================= النماذج بالإنجليزي (اتجاه من اليسار لليمين) — بتتفعّل لما لغة البرنامج إنجليزي ================= */
  function emp1(){ return (typeof window.tfRequireEmp71==='function')?window.tfRequireEmp71():null; }
  var XX=function(s){ return (window.tfEsc71||esc)(s); };
  var DE=function(v){ return v?window.tfDEn71(v):'\u2014'; };
  var DICTV=window.ARIBA_TR;
  function en(s){ return (s&&DICTV)?DICTV(s):(s||''); }
  function nmEn(e){ return e.nameEn||en(e.nameAr)||''; }
  function infoEn(e){
    var c=function(l,v){ return '<td class="tf-lbl">'+l+'</td><td class="tf-val">'+XX(v||'\u2014')+'</td>'; };
    return '<div class="tf-info-title">Employee details</div><table class="tf-info"><tr>'+c('Name',nmEn(e))+c('Nationality',en(e.nationality||e.nat))+'</tr><tr>'+c('ID / Iqama no.',e.iqamaNo||e.iqama)+c('Employee no.',e.empNo)+'</tr><tr>'+c('Department',en(e.department||e.dept))+c('Job title',en(e.jobTitle||e.job))+'</tr></table>';
  }
  var pE=function(t,x){ return '<p class="tf-p" dir="ltr" style="text-align:left;margin:1.5mm 0"'+(x||'')+'>'+t+'</p>'; };
  var bx=function(t){ return '<div class="tf-box" dir="ltr" style="text-align:left">'+t+'</div>'; };
  var sgn=function(l,r,mt){ return '<div class="tf-sign" dir="ltr" style="margin-top:'+(mt||5)+'mm"><div>'+l+'</div><div>'+r+'</div></div>'; };
  var HRS=function(mt){ return window.ARIBA_HRSIG?window.ARIBA_HRSIG.html('en',{date:true,h:28,mt:(typeof mt==='number'?mt:2)}):sgn('<b>Human Resources</b><br>Signature: ________________','Date: '+DE(new Date())); };
  var ACK=function(e,txt){ return bx('I, '+XX(nmEn(e))+', '+txt)+sgn('Employee: '+XX(nmEn(e))+'<br>Signature: ________________','Date: ________________',2); };
  var wrapEn=function(title,sub,body){ return window.tfWrap71(title,sub||'',body.replace(/^/,'<div dir="ltr" style="text-align:left">')+'</div>'); };
  var gv=function(id){ var el=document.getElementById(id); return el?el.value:''; };
  var EN={
    onboarding:function(e){
      var mgr=gv('TF1_MGR')||e.manager||'\u2014', join=gv('TF1_JOIN')||e.contractJoin||e.join||'', first=document.getElementById('TF1_FIRST')?document.getElementById('TF1_FIRST').checked:true, lt=gv('TF1_LVTYPE');
      return {title:'Onboarding Notice',html:wrapEn('Onboarding Notice','',infoEn(e)+bx('<b>Joining date:</b> '+DE(join))+
        pE('Dear Sir/Madam, further to the employment notice, we inform you that the employee named above has commenced work at Ariba Business Solutions Company \u2014 '+XX(en(e.department||e.dept||''))+' department.')+
        pE('The employee commenced work on: <b>'+DE(join)+'</b>.')+sgn('Direct manager: '+XX(mgr)+'<br>Signature: ________________','Date: '+DE(new Date()))+
        bx('<span class="tf-chk'+(first?' on':'')+'"></span> First-time joining &nbsp;&nbsp;&nbsp; <span class="tf-chk'+(!first?' on':'')+'"></span> Joining after returning from leave'+(lt?(' ('+XX(en(lt))+')'):''))+
        HRS(4)+sgn('CEO approval<br>Signature: ________________','Date: ________________',10))};
    },
    custody:function(e){
      var rows=[]; document.querySelectorAll('#TF2_ROWS [data-tf2row]').forEach(function(r){ var n=r.querySelector('[data-tf2-name]').value.trim(); if(n) rows.push([n,r.querySelector('[data-tf2-serial]').value.trim(),r.querySelector('[data-tf2-cond]').value.trim()]); });
      if(!rows.length){ notify('Add at least one custody item',true); return null; }
      return {title:'IT Custody Receipt',html:wrapEn('IT Custody Receipt','',infoEn(e)+'<table class="tf-bi"><tr><th style="width:8%">#</th><th>Item</th><th>Model / serial no.</th><th>Condition</th></tr>'+rows.map(function(r,i){ return '<tr><td>'+(i+1)+'</td><td>'+XX(r[0])+'</td><td>'+XX(r[1]||'\u2014')+'</td><td>'+XX(r[2]||'\u2014')+'</td></tr>'; }).join('')+'</table>'+
        pE('I, the employee named above, acknowledge receiving the IT custody listed above from Ariba Business Solutions Company. I undertake to take care of it, use it for company work only and return it upon request or at the end of my service.')+
        sgn('Employee: '+XX(nmEn(e))+'<br>Signature: ________________','Date: ________________')+sgn('On behalf of IT Department<br>Signature: ________________','Date: ________________',8))};
    },
    extension:function(e){
      var join=gv('TF3_JOIN')||e.contractJoin||e.join||'', end=gv('TF3_END'); if(!end){ notify('Set the new extension end date',true); return null; }
      return {title:'Probation Extension Notice',html:wrapEn('Probation Extension Notice','',infoEn(e)+bx('<div><b>Contract start date:</b> '+DE(join)+'</div><div><b>Probation end date after extension:</b> '+DE(end)+'</div>')+
        pE('Dear '+XX(nmEn(e))+', greetings,')+pE('Referring to the employment contract concluded with you on '+DE(join)+', please be informed that your probation period has been extended to a further period ending on <b>'+DE(end)+'</b>.')+
        pE('Accordingly, kindly acknowledge receipt of this notice and return a signed copy to us.')+pE('With our best wishes for your success,')+HRS()+ACK(e,'agree to the extension of the probation period as stated above.'))};
    },
    termination:function(e){
      var join=gv('TF4_JOIN')||e.contractJoin||e.join||'', last=gv('TF4_LAST'); if(!last){ notify('Set the last working day',true); return null; }
      return {title:'Probation Termination Notice',html:wrapEn('Probation Termination Notice','',infoEn(e)+bx('<div><b>Contract start date:</b> '+DE(join)+'</div><div><b>Last working day:</b> '+DE(last)+'</div>')+
        pE('Dear '+XX(nmEn(e))+', greetings,')+pE('Referring to the employment contract concluded with you on '+DE(join)+', please be informed that your probation period is terminated, and your last working day under probation will be <b>'+DE(last)+'</b>.')+
        pE('Accordingly, kindly acknowledge receipt of this notice and return a signed copy to us.')+pE('With our best wishes for your success,')+HRS()+ACK(e,'acknowledge receipt of the probation termination notice.'))};
    },
    clearance:function(e){
      var join=gv('TF5_JOIN')||e.contractJoin||e.join||'', last=gv('TF5_LAST'), reason=gv('TF5_REASON')||'resign', other=gv('TF5_OTHER'); if(!last){ notify('Set the last working day',true); return null; }
      return {title:'Final Clearance',html:wrapEn('Final Clearance','',infoEn(e)+bx('<div><b>Joining date:</b> '+DE(join)+'</div><div><b>Last working day:</b> '+DE(last)+'</div>')+
        bx('Clearance reason: <span class="tf-chk'+(reason==='resign'?' on':'')+'"></span> Resignation &nbsp;&nbsp; <span class="tf-chk'+(reason==='end'?' on':'')+'"></span> Contract end &nbsp;&nbsp; <span class="tf-chk'+(reason==='other'?' on':'')+'"></span> Other'+(reason==='other'&&other?(': '+XX(other)):''))+
        pE('We, Ariba Business Solutions Company, confirm that the employee named above has completed his/her work at the Company and handed over all custody in his/her possession, and has no dues or claims outstanding towards the Company.')+pE('Accordingly, the employee is hereby cleared.')+
        HRS(6))};
    },
    experience:function(e){
      var start=gv('TF6_START')||e.contractJoin||e.join||'', still=document.getElementById('TF6_STILL')?document.getElementById('TF6_STILL').checked:true, end=gv('TF6_END'), nature=gv('TF6_NATURE')||'Full time', no=gv('TF6_NO')||('AR-'+(e.empNo||'')+'-'+new Date().getFullYear());
      nature=({'دوام كامل':'Full time','دوام جزئي':'Part time','عقد مؤقت':'Temporary contract'})[nature]||nature;
      return {title:'Experience Certificate',html:wrapEn('Experience Certificate','',
        '<div class="meta-row"><div>Ref: '+XX(no)+'</div><div>Date: '+DE(new Date())+'</div></div>'+
        pE('Ariba Business Solutions Company certifies that Mr./Ms. <b>'+XX(nmEn(e))+'</b>, '+XX(en(e.nationality||e.nat))+' national, ID no. ('+XX(e.iqamaNo||e.iqama||'')+'), worked with us as (<b>'+XX(en(e.job||e.jobTitle))+'</b>) in the '+XX(en(e.department||e.dept||''))+' department.')+
        '<table class="tf-info"><tr><td class="tf-lbl">Contract type</td><td class="tf-val" colspan="3">Employment contract</td></tr><tr><td class="tf-lbl">Nature of contract</td><td class="tf-val" colspan="3">'+XX(en(nature))+'</td></tr><tr><td class="tf-lbl">Start date</td><td class="tf-val">'+DE(start)+'</td><td class="tf-lbl">End date</td><td class="tf-val">'+(still?'Still employed to date':DE(end))+'</td></tr></table>'+
        pE('During the period of employment he/she carried out the tasks assigned and was of good conduct.')+pE('We thank him/her for the efforts during that period and wish him/her every success.')+pE('This certificate was issued at his/her request without any liability on the Company.')+pE('Best regards,')+(window.ARIBA_HRSIG?window.ARIBA_HRSIG.html('en',{mt:5,h:30}):'<div style="margin-top:10mm"><b>Human Resources Manager</b></div>'))};
    },
    evaluation:function(e){
      var join=gv('TF7_JOIN')||e.contractJoin||e.join||'', end=gv('TF7_END'), rec=gv('TF7_REC'), dec=(document.querySelector('input[name="tf7dec"]:checked')||{}).value||'';
      var crit=['Technical knowledge in his/her field','Compliance with company rules and regulations','Quality of work output','Relationship with management and colleagues','Ability to learn, develop and take initiative'], lab={0:'Unsatisfactory',50:'Below expectations',70:'Meets expectations',90:'Exceeds expectations',100:'Outstanding'};
      var sc=[]; document.querySelectorAll('#TF7_ROWS [data-tf7-score]').forEach(function(s){ sc.push(Number(s.value)||0); }); if(!sc.length) sc=[70,70,70,70,70];
      var tot=Math.round(sc.reduce(function(a,b){return a+b;},0)/sc.length);
      return {title:'Probation Evaluation',html:wrapEn('Probationary Period Evaluation','',infoEn(e)+bx('<b>Contract start date:</b> '+DE(join)+' &nbsp;&nbsp; <b>Probation end date:</b> '+DE(end))+
        pE('The employee above is about to complete the probation period. Please complete this form and return it to Human Resources before it ends.','')+
        '<table class="tf-eval"><tr><th>#</th><th>Criterion</th><th>Score</th><th>Rating</th></tr>'+crit.map(function(c,i){ var s=sc[i]||0; return '<tr><td>'+(i+1)+'</td><td style="text-align:left;padding-left:8px">'+c+'</td><td>'+s+'%</td><td>'+(lab[s]||'')+'</td></tr>'; }).join('')+'<tr style="font-weight:800;background:#f0f6f4"><td colspan="2">Total</td><td colspan="2">'+tot+'%</td></tr></table>'+
        bx('<b>Direct manager recommendations:</b> '+XX(rec||'')+'<div style="min-height:4mm"></div>')+
        bx('<b>Final decision:</b> &nbsp; <span class="tf-chk'+(dec==='appoint'?' on':'')+'"></span> Confirm employment &nbsp;&nbsp; <span class="tf-chk'+(dec==='terminate'?' on':'')+'"></span> Terminate &nbsp;&nbsp; <span class="tf-chk'+(dec==='extend'?' on':'')+'"></span> Extend probation')+
        (window.ARIBA_HRSIG?window.ARIBA_HRSIG.html('en',{mt:2,h:27,extra:'<div style="text-align:center;font-weight:700;font-size:11.5px">Direct manager<br>Signature: ________________</div>'}):sgn('Direct manager<br>Signature: ________________','<b>Human Resources</b><br>Signature: ________________')))};
    },
    contract_end:function(e){
      var LW={m84:['84','Termination by the Company'],m74:['74','Mutual agreement'],m85:['85','Resignation'],m75:['75','Constructive resignation'],m77:['77','Termination without valid reason'],m80:['80','Disciplinary dismissal'],m74r:['74(4)','Retirement']};
      var key=gv('TF_CE_LAW'), other=gv('TF_CE_OTHER').trim(), last=gv('TF_CE_LAST'), join=gv('TF_CE_JOIN')||e.contractJoin||e.join||'', ref=gv('TF_CE_REF'), notes=gv('TF_CE_NOTES').trim();
      if(!last){ notify('Set the last working day',true); return null; } if(!key){ notify('Choose the legal basis',true); return null; } if(key==='other'&&!other){ notify('Enter the legal basis',true); return null; }
      var basis=key==='other'?other:('Article ('+LW[key][0]+') of the Labor Law \u2014 '+LW[key][1]), r='';
      if(ref){ if(key==='m85'||key==='m75') r=', based on your resignation submitted on '+DE(ref); else if(key==='m74') r=', based on the mutual agreement dated '+DE(ref); }
      return {title:'Employment Contract Termination Notice',html:wrapEn('Employment Contract Termination Notice','',infoEn(e)+bx('<div><b>Contract start date:</b> '+DE(join)+'</div><div><b>Last working day:</b> '+DE(last)+'</div><div><b>Legal basis:</b> '+XX(basis)+'</div>')+
        pE('Dear '+XX(nmEn(e))+', greetings,')+pE('Referring to the employment contract concluded with you on '+DE(join)+', please be informed that your employment contract will be terminated with your last working day on <b>'+DE(last)+'</b>'+r+', pursuant to <b>'+XX(basis)+'</b>.')+(notes?pE('<b>Notes:</b> '+XX(notes)):'')+
        pE('Your statutory entitlements will be settled in accordance with the Labor Law. Accordingly, kindly acknowledge receipt of this notice and return a signed copy to us.')+pE('With our best wishes for your success,')+HRS()+ACK(e,'acknowledge receipt of the employment contract termination notice.'))};
    }
  };
  window.ARIBA_INFO_EN=infoEn;
  window.ARIBA_FORM_EN_BUILD=function(type,e){ var f=EN[type]; if(!f) return null; try{ return f(e); }catch(x){ return null; } };
  /* لو لغة البرنامج إنجليزي: الطباعة بتطلع النسخة الإنجليزية */
  ['onboarding:tfPrintOnboarding','custody:tfPrintCustody','extension:tfPrintExtension','termination:tfPrintTermination','clearance:tfPrintClearance','experience:tfPrintExperience','evaluation:tfPrintEvaluation','contract_end:tfPrintContractEnd'].forEach(function(p){
    var a=p.split(':'), orig=window[a[1]]; if(typeof orig!=='function'||orig.__v117en) return;
    var g=function(){ if(!isEN()) return orig.apply(this,arguments); var e=emp1(); if(!e) return; var b=EN[a[0]](e); if(b&&typeof window.printHtml==='function') window.printHtml(b.title+' \u2014 '+nmEn(e),b.html); };
    g.__v117en=1; window[a[1]]=g;
  });
})();
