
(function(){
  function isEN(){return typeof window.ARIBA_UI_LANG==='function' && window.ARIBA_UI_LANG()==='en';}
  function T(ar,en){return isEN()?en:ar;}
  window.ARIBA_T=T;

  // Replace the leave type dictionary with bilingual labels while retaining
  // the same keys/API used by the workflow.
  if(window.LVL){
    Object.keys(window.LVL).forEach(function(k){
      var m={
        annual:['سنوية','Annual Leave'],sick:['مرضية','Sick Leave'],emergency:['اضطرارية','Emergency Leave'],
        death:['وفاة','Bereavement Leave'],marriage:['زواج','Marriage Leave'],maternity:['أمومة','Maternity Leave'],
        paternity:['أبوة','Paternity Leave'],umrah:['عمرة','Umrah Leave'],hajj:['حج','Hajj Leave'],
        remote:['عن بعد','Remote Work'],perm:['استئذان','Permission'],perm_mat:['استئذان أمومة','Maternity Permission'],
        early_leave:['خروج مبكر','Early Exit'],advance:['سلفة','Advance'],mission:['مهمة خارجية','External Assignment']
      };
      if(m[k]){window.LVL[k].ar=m[k][0];window.LVL[k].en=m[k][1];}
    });
  }

  // Override the request form renderer with bilingual labels and no forced
  // navigation/rebuild to another request type.
  var oldRenderLv=window.renderLv;
  window.renderLv=function(){
    oldRenderLv();
    try{
      var root=document.getElementById('appContent'); if(!root)return;
      var en=isEN();
      root.querySelectorAll('.lv-type').forEach(function(el){
        var k=el.getAttribute('data-k'), v=window.LVL&&window.LVL[k];
        if(v) el.childNodes.forEach(function(n){
          if(n.nodeType===3 && n.nodeValue.trim()) n.nodeValue=en?v.en:v.ar;
        });
      });
      var map={
        'رصيد الإجازة':T('رصيد الإجازة','Leave Balance'),
        'إجازات رسمية قادمة':T('إجازات رسمية قادمة','Upcoming Public Holidays'),
        'من تاريخ':T('من تاريخ','From Date'),
        'إلى تاريخ':T('إلى تاريخ','To Date'),
        'ملاحظات':T('ملاحظات','Notes'),
        'اختياري':T('اختياري','Optional'),
        'إرسال الطلب':T('إرسال الطلب','Submit Request'),
        'طلباتي':T('طلباتي','My Requests'),
        'لا توجد طلبات':T('لا توجد طلبات','No requests'),
        'أيام العمل:':T('أيام العمل:','Working days:'),
        'سيتبقى:':T('سيتبقى:','Remaining:'),
        'يوم':T('يوم','days')
      };
      var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT), nodes=[];
      while(walker.nextNode())nodes.push(walker.currentNode);
      nodes.forEach(function(n){
        var s=n.nodeValue;
        Object.keys(map).forEach(function(k){s=s.split(k).join(map[k]);});
        n.nodeValue=s;
      });
      root.querySelectorAll('input,textarea').forEach(function(el){
        if(el.placeholder==='اختياري')el.placeholder=T('اختياري','Optional');
      });
      if(en){
        document.documentElement.dir='ltr'; document.body.dir='ltr';
      }
    }catch(_){}
  };

  // Keep current selection after a refresh.
  var oldChange=window.selLvType;
  if(oldChange){
    window.selLvType=function(k,el){
      window.selType=k; window.__ARIBA_LAST_LEAVE_TYPE=k;
      return oldChange.apply(this,arguments);
    };
  }
})();
