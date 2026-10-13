
/* V106: مسح النسخ القديمة المكررة من بيانات كل موظف (sal/net/tot/…) — كانت بتتخزن مرتين
   وأحيانًا النسخة القديمة بتتقري بدل الجديدة (زي مشكلة الصافي). القيمة الأساسية بتفضل زي ما هي،
   ولو الأساسية فاضية بناخد قيمتها من القديمة قبل المسح، فمفيش أي معلومة بتضيع. */
(function(){
  var MAP={sal:'salary',hou:'housingAllowance',tra:'transportAllowance',prj:'projectAllowance',oth:'otherAllowance',
    tot:'salaryTotal',net:'netSalary',ins:'insuranceSub',inc:'insuranceComp',ce:'contractEnd',cj:'contractJoin',
    iq:'iqamaNo',iqe:'iqamaExpiry',nat:'nationality',dep:'dept',em:'employer',jt:'jobTitle',na:'nameAr',ne:'nameEn',
    saudi:'isSaudi',nsar:'netSalarySAR'};
  function clean(list){
    var n=0;
    (list||[]).forEach(function(e){
      if(!e||typeof e!=='object') return;
      Object.keys(MAP).forEach(function(s){
        if(!(s in e)) return;
        var l=MAP[s];
        if(e[l]===undefined||e[l]===null||e[l]==='') e[l]=e[s];
        delete e[s]; n++;
      });
    });
    return n;
  }
  window.ARIBA_CLEAN_DUPLICATES=clean;
  try{
    ['hr7_emps','hr7_term_emps'].forEach(function(k){
      var raw=localStorage.getItem(k); if(!raw) return;
      var a=JSON.parse(raw); if(!Array.isArray(a)) return;
      if(clean(a)) localStorage.setItem(k,JSON.stringify(a));
    });
    /* النسخة المشفرة القديمة من قائمة الموظفين (من قبل التصليحات) — مبقتش مستخدمة */
    var main=JSON.parse(localStorage.getItem('hr7_emps')||'[]');
    if(Array.isArray(main)&&main.length){ try{ localStorage.removeItem('_ar_'+btoa('hr7_emps')); }catch(e){} }
    try{ localStorage.removeItem('hr7_employee_app_users'); }catch(e){}
  }catch(e){ console.warn('V106 cleanup',e); }
})();
