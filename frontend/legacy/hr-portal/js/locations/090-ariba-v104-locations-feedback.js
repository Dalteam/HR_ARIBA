
/* V104: إضافة/حذف المواقع بتقولك بوضوح وصلت لتطبيق الموظف ولا لأ */
(function(){
  'use strict';
  var SUPA='https://iwviydmapqpqihcdazpe.supabase.co', KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  try{ localStorage.removeItem('hr7_employee_app_users'); }catch(e){}   /* نسخة قديمة فيها كلمات مرور افتراضية */
  function say(m,t){ try{ window.toast(m,t||'tok'); }catch(e){} }
  function rpc(fn,args){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); x.open('POST',SUPA+'/rest/v1/rpc/'+fn);
      x.setRequestHeader('apikey',KEY); x.setRequestHeader('Authorization','Bearer '+KEY); x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){ var d=null; try{ d=JSON.parse(x.responseText||'null'); }catch(e){}
        if(x.status>=200&&x.status<300) res(d); else rej(new Error((d&&(d.message||d.hint))||('HTTP '+x.status))); };
      x.onerror=function(){ rej(new Error('network')); }; x.send(JSON.stringify(args||{}));
    });
  }
  function ready(){ if(UUID.test(window.ARIBA_HR_TOKEN||'')) return true;
    say('⚠ الموقع اتحفظ على الجهاز بس — سجّل دخول بحسابك السحابي عشان يوصل للموظفين','ter'); return false; }
  async function cloudLocs(){ var d=await rpc('ariba_staff_locations',{p_token:window.ARIBA_HR_TOKEN}); return Array.isArray(d)?d:[]; }

  var prevS=window.sLoc;
  if(typeof prevS==='function'){
    window.sLoc=function(){
      var name=((document.getElementById('LN')||{}).value||'').trim();
      var r=prevS.apply(this,arguments);
      if(name && ready()){
        setTimeout(async function(){
          try{ var l=await cloudLocs();
            var ok=l.some(function(x){ return String(x.name||'').trim()===name && x.active!==false; });
            say(ok?'✓ الموقع "'+name+'" اتحفظ ووصل لتطبيق الموظفين':'❌ الموقع "'+name+'" مااتحفظش في السحابة — جرّب تاني', ok?'tin':'ter');
          }catch(e){ say('❌ تعذر التأكد من حفظ الموقع: '+e.message,'ter'); }
        },1800);
      }
      return r;
    };
  }
  window.delLoc=async function(id){
    if(!confirm(window.LANG==='en'?'Delete this location?':'هل تريد حذف هذا الموقع؟')) return;
    var all=(typeof getLocs==='function'?getLocs():[])||[];
    if(!ready()) return;
    try{
      await rpc('ariba_delete_location',{p_token:window.ARIBA_HR_TOKEN,p_id:String(id)});
      dbS('locs',all.filter(function(l){ return String(l.id)!==String(id); }));
      try{ rLocs(); }catch(e){}
      say('✓ الموقع اتحذف ومبقاش ظاهر في تطبيق الموظفين','tin');
    }catch(e){ say('❌ الموقع مااتحذفش: '+e.message,'ter'); }
  };
})();
