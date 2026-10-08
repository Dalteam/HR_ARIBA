
/* ============================================================
   ARIBA V84 — إضافة فقط: أي مكان في البرنامج بيعرض نوع الطلب
   الخام (زي "template:onboarding") بيتحول تلقائيًا لاسم عربي
   واضح ("مباشرة عمل" وهكذا) — بدون تعديل أي دالة عرض موجودة،
   بس بنراجع النص المعروض في الصفحة ونصلح الكود الخام لو ظهر.
   ============================================================ */
(function(){
  'use strict';
  var LABELS = {
    'template:onboarding':'📝 مباشرة عمل (بانتظار توقيع الموظف)',
    'template:custody':'📝 استلام عهدة تقنية (بانتظار توقيع الموظف)',
    'template:extension':'📝 تمديد فترة التجربة (بانتظار توقيع الموظف)',
    'template:termination':'📝 إشعار إنهاء فترة التجربة (بانتظار توقيع الموظف)'
  };
  var PATTERN = /template:(onboarding|custody|extension|termination)/g;

  function cleanTextNodes(root){
    try{
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      var node, toFix = [];
      while((node = walker.nextNode())){
        if(node.nodeValue && PATTERN.test(node.nodeValue)){
          toFix.push(node);
        }
        PATTERN.lastIndex = 0;
      }
      toFix.forEach(function(n){
        n.nodeValue = n.nodeValue.replace(PATTERN, function(m){ return LABELS[m] || m; });
      });
    }catch(e){}
  }

  setInterval(function(){ cleanTextNodes(document.body); }, 1500);
})();
