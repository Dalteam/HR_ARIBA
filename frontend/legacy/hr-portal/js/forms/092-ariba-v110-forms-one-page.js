
/* V110: رأس الورقة الجديد الكامل أطول بحوالي 2 سم. عشان النماذج اللي كانت صفحة واحدة تفضل صفحة واحدة:
   لو النموذج زاد عن الصفحة بحاجة بسيطة، بيتصغّر شوية لحد ما يكفي. لو المستند طويل فعلًا
   (زي تقرير حضور شهر كامل) بيفضل على أكتر من صفحة زي ما هو. المخالصة ليها ضبط خاص بيها. */
(function(){
  var prev = window.printHtml;
  if(typeof prev !== 'function' || prev.__v110) return;
  var FIT = '<scr'+'ipt>(function(){'+
    'var MM=96/25.4;'+
    'function fit(){'+
      'var doc=document.querySelector(".doc"),body=document.querySelector(".doc-body");if(!doc||!body)return;'+
      'body.style.zoom="";'+
      'var foot=document.querySelector(".lh-foot");var ratio=(foot&&foot.naturalWidth)?foot.naturalHeight/foot.naturalWidth:0.21;'+
      'var limit=297*MM-210*MM*ratio-3*MM;'+
      'function bottom(){var last=body.lastElementChild;var top=doc.getBoundingClientRect().top;return (last?last.getBoundingClientRect().bottom:body.getBoundingClientRect().bottom)-top;}'+
      'if(bottom()<=limit)return;'+
      'var hb=body.getBoundingClientRect().top-doc.getBoundingClientRect().top;'+
      'if((limit-hb)/(bottom()-hb)<0.78)return;'+   /* مستند طويل فعلًا — يفضل متعدد الصفحات */
      'var z=1;while(bottom()>limit&&z>0.78){z=Math.round((z-0.02)*100)/100;body.style.zoom=z;}'+
      'if(bottom()>limit)body.style.zoom="";'+
    '}'+
    'fit();window.addEventListener("load",fit);window.addEventListener("beforeprint",fit);'+
    'if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);'+
  '})();</scr'+'ipt>';
  window.printHtml = function(title, html){
    try{
      if(typeof html === 'string' && html.indexOf('lh-head') >= 0 && html.indexOf('id="fit109"') < 0) html += FIT;
    }catch(e){}
    return prev.call(this, title, html);
  };
  window.printHtml.__v110 = true;
})();
