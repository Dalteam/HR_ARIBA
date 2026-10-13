
(function(){
'use strict';
function N(v){return String(v||'').trim().replace(/\s+/g,' ').replace(/أ/g,'ا').replace(/إ/g,'ا').replace(/آ/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').toLowerCase();}
var C={dark:'#014D3D',light:'#29B35E',beige:'#E4E4BC',black:'#111111',gray:'#B8BFBC',grayDark:'#4B5563'};
function apply(){
 try{
  if(!window.charts)return;
  Object.keys(window.charts).forEach(function(id){
   var ch=window.charts[id], ds=ch.data&&ch.data.datasets&&ch.data.datasets[0]; if(!ds)return;
   var labs=ch.data.labels||[];
   ds.backgroundColor=labs.map(function(l){
    var k=N(l);
    if(id==='cNat'){
      if(k==='اردني'||k==='اردنيه')return C.beige;
      if(k==='سوداني'||k==='سودانيه')return C.dark;
      if(k==='تونسي'||k==='تونسيه')return C.black;
      if(k==='سوري'||k==='سوريه')return C.gray;
      if(k==='مصري'||k==='مصرية')return C.light;
      if(k==='سعودي'||k==='سعوديه')return C.dark;
    }
    if(id==='cDept'){
      if(k==='التطوير')return C.black;
      if(k==='المالية')return C.beige;
      if(k==='التسويق')return C.light;
      if(k==='التشغيل')return C.dark;
    }
    if(k==='اريبا'||k==='ariba'||k.indexOf('قريبه')>=0||k.indexOf('قريبة')>=0)return C.dark;
    if(k.indexOf('جيوميك')>=0||k.indexOf('geomech')>=0)return C.light;
    if(k==='اوبتيموم'||k==='optimum')return C.beige;
    return C.gray;
   });
   ch.options.animation=false;ch.update('none');
  });
 }catch(e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(apply,1200);},{once:true});else setTimeout(apply,1200);
window.ARIBA_APPLY_CHART_COLORS=apply;
})();

window.addEventListener('storage',function(ev){
  if(!ev.key||ev.key.indexOf('hr7_')<0) return;
  var key=ev.key.replace('hr7_','');
  if(key==='leaves'||key==='perms'){
    if(typeof uBadges==='function') uBadges();
    setTimeout(function(){if(typeof rLvPend==='function') rLvPend();},150);
  }
});
setInterval(function(){
  if(typeof rLvPend==='function'){var b=document.getElementById('LVB');if(b)rLvPend();}
},10000);


// ================================================================
// ===== التابعون - DEPENDENTS MODULE =====
// ================================================================

var _currentDepsEmpId = null;
var _currentDeps = [];
var _depFiles = {}; // {idx: [{name,type,data}]}

function getDeps(empId){
  var manual=_sGet('deps_manual_'+empId)||[];
  return Array.isArray(manual)?manual:[];
}
function _oldGetDeps_unused(empId){
  var stored=_sGet('deps_'+empId, []);
  var excel=typeof window._getDepsData==='function'?[]:[];
  return stored.length>0?stored:excel;
}
function saveDeps(empId, deps){
  _sSet('deps_'+empId, deps);
}

function loadDependents(){
  var eid=document.getElementById('EID')?document.getElementById('EID').value:'';
  if(!eid) eid=_currentDepsEmpId;
  if(!eid) return;
  _currentDepsEmpId=eid;
  _currentDeps=getDeps(eid);
  renderDepsList();
}

function renderDepsList(){
  var el = document.getElementById('DEP_LIST');
  if(!el) return;
  if(!_currentDeps.length){
    el.innerHTML = '<div style="color:var(--mu);text-align:center;padding:20px;font-size:13px">لا يوجد تابعون — اضغط إضافة تابع</div>';
    return;
  }
  var today = new Date();
  function dL(d){if(!d)return 9999;try{return Math.round((new Date(d)-today)/86400000);}catch(e){return 9999;}}
  function badge(days){
    if(days===9999)return '';
    var c=days<0?'var(--rd)':days<=30?'var(--rd)':days<=90?'var(--am)':'var(--gr)';
    var t=days<0?'منتهي':days+' يوم';
    return '<span style="color:'+c+';font-weight:700;margin-right:4px">('+t+')</span>';
  }
  var relEmoji={زوجة:'👩',زوج:'👨',ابن:'👦',ابنة:'👧',بنت:'👧',إبن:'👦',والد:'👴',والدة:'👵',أب:'👴',أم:'👵',إبنه:'👧',ابنه:'👧'};
  var excelCount=typeof window._getDepsData==='function'?window._getDepsData(_currentDepsEmpId).length:0;
  el.innerHTML=_currentDeps.map(function(d,i){
    var isExcel=i<excelCount;
    var iqDays=dL(d.idExp||d.iqamaExpiry), ppDays=dL(d.ppExp), insDays=dL(d.insExp);
    var iqNo=d.idNo||d.iqamaNo||'';
    return '<div style="background:var(--c2);border-radius:12px;padding:12px;margin-bottom:8px;border-right:3px solid '+(isExcel?'var(--bl)':'var(--gr)')+'">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<span style="font-size:20px">'+(relEmoji[d.rel]||'👤')+'</span>'+
          '<div><div style="font-weight:700;font-size:13px">'+d.nameAr+'</div>'+
          '<div style="font-size:11px;color:var(--mu)">'+d.rel+(isExcel?' <span style="color:var(--bl);font-size:10px">• من الإكسل</span>':'')+'</div></div>'+
        '</div>'+
        '<div style="display:flex;gap:4px">'+
          (!isExcel?'<button type="button" onclick="editDep('+i+')" class="btn bsm" title="تعديل"><i class="ti ti-edit"></i></button>':'') +
          (!isExcel?'<button type="button" onclick="deleteManualDep('+i+','+excelCount+')" class="btn bsm" style="color:var(--rd)" title="حذف"><i class="ti ti-trash"></i></button>':'') +
        '</div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;font-size:11px">'+
        (iqNo?'<div>🪪 <span style="color:var(--mu)">الهوية/الإقامة:</span> <strong>'+iqNo+'</strong>'+badge(iqDays)+'</div>':'')+
        (d.ppNo?'<div>📘 <span style="color:var(--mu)">الجواز:</span> <strong>'+d.ppNo+'</strong>'+badge(ppDays)+'</div>':'')+
        (d.mobile?'<div>📱 '+d.mobile+'</div>':'')+
        (d.dob?'<div>🎂 '+d.dob+'</div>':'')+
        (d.insClass?'<div>💊 تأمين: <strong>'+d.insClass+'</strong>'+badge(insDays)+'</div>':'')+
        (d.ppExp?'<div>📘 انتهاء الجواز: '+d.ppExp+'</div>':'')+
      '</div>'+
      ((d.files&&d.files.length)?'<div style="margin-top:6px;font-size:11px;color:var(--bl)">📎 '+d.files.length+' ملف — <span style="cursor:pointer;text-decoration:underline" onclick="viewDepFile('+i+',0)">عرض</span></div>':'')+
    '</div>';
  }).join('');
}
function addDependent(){
  clearDepForm();
  document.getElementById('DEP_FORM').style.display='block';
}

function editDep(idx){
  var d = _currentDeps[idx];
  if(!d) return;
  document.getElementById('dep_nameAr').value = d.nameAr||'';
  document.getElementById('dep_nameEn').value = d.nameEn||'';
  document.getElementById('dep_rel').value = d.rel||'زوجة';
  document.getElementById('dep_dob').value = d.dob||'';
  document.getElementById('dep_idNo').value = d.idNo||'';
  document.getElementById('dep_idExp').value = d.idExp||'';
  document.getElementById('dep_ppNo').value = d.ppNo||'';
  document.getElementById('dep_ppExp').value = d.ppExp||'';
  document.getElementById('dep_insCo').value = d.insCo||'';
  document.getElementById('dep_insCard').value = d.insCard||'';
  document.getElementById('dep_insExp').value = d.insExp||'';
  document.getElementById('dep_mobile').value = d.mobile||'';
  document.getElementById('dep_idx').value = idx;
  document.getElementById('DEP_FORM').style.display='block';
  renderDepFilesPreview(idx);
}

function deleteDep(idx){
  if(!confirm('حذف هذا التابع؟')) return;
  _currentDeps.splice(idx,1);
  delete _depFiles[idx];
  saveDeps(_currentDepsEmpId, _currentDeps);
  renderDepsList();
}

function clearDepForm(){
  ['dep_nameAr','dep_nameEn','dep_dob','dep_idNo','dep_idExp','dep_ppNo','dep_ppExp','dep_insCo','dep_insCard','dep_insExp','dep_mobile'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  document.getElementById('dep_rel').value='زوجة';
  document.getElementById('dep_idx').value='-1';
  var fp=document.getElementById('dep_files_preview');
  if(fp)fp.innerHTML='';
}

function saveDependent(){
  var nameAr=document.getElementById('dep_nameAr').value.trim();
  if(!nameAr){alert('يرجى إدخال الاسم');return;}
  if(!_currentDepsEmpId){alert('خطأ: لا يوجد موظف محدد');return;}

  var dep={
    nameAr:nameAr,
    nameEn:(document.getElementById('dep_nameEn').value||'').trim(),
    rel:document.getElementById('dep_rel').value,
    dob:(document.getElementById('dep_dob').value||''),
    idNo:(document.getElementById('dep_idNo').value||'').trim(),
    idExp:(document.getElementById('dep_idExp').value||''),
    ppNo:(document.getElementById('dep_ppNo').value||'').trim(),
    ppExp:(document.getElementById('dep_ppExp').value||''),
    insCo:(document.getElementById('dep_insCo').value||'').trim(),
    insCard:(document.getElementById('dep_insCard').value||'').trim(),
    insExp:(document.getElementById('dep_insExp').value||''),
    mobile:(document.getElementById('dep_mobile').value||'').trim(),
    files:[],
    addedAt:new Date().toISOString()
  };

  // احفظ في manual deps
  var manual=_sGet('deps_manual_'+_currentDepsEmpId)||[];
  if(!Array.isArray(manual)) manual=[];
  var idx=parseInt(document.getElementById('dep_idx').value||'-1');
  var excelCount=typeof window._getDepsData==='function'?window._getDepsData(_currentDepsEmpId).length:0;
  var manualIdx=idx-excelCount;

  // قراءة الملفات
  var fileInput=document.getElementById('dep_files');
  if(fileInput&&fileInput.files&&fileInput.files.length>0){
    var files=Array.from(fileInput.files);
    var pending=files.length;
    var results=[];
    files.forEach(function(file){
      var r=new FileReader();
      r.onload=function(ev){
        results.push({name:file.name,type:file.type,data:ev.target.result});
        if(--pending===0){
          dep.files=results;
          _commitManualDep(_currentDepsEmpId,dep,manualIdx,manual);
        }
      };
      r.readAsDataURL(file);
    });
  } else {
    if(manualIdx>=0&&manualIdx<manual.length){
      dep.files=manual[manualIdx].files||[];
    }
    _commitManualDep(_currentDepsEmpId,dep,manualIdx,manual);
  }
}

function _commitManualDep(empId,dep,manualIdx,manual){
  if(manualIdx>=0&&manualIdx<manual.length){manual[manualIdx]=dep;}
  else{manual.push(dep);}
  _sSet('deps_manual_'+empId,manual);
  var df=document.getElementById('DEP_FORM');
  if(df)df.style.display='none';
  clearDepForm();
  loadDependents();
}

function previewDepFiles(input){
  var fp=document.getElementById('dep_files_preview');
  if(!fp)return;
  var files=Array.from(input.files);
  fp.innerHTML=files.map(function(f){
    return '<div style="background:var(--c2);padding:4px 8px;border-radius:6px;font-size:11px;display:inline-block;margin:2px">'+(f.type.includes('pdf')?'📄':'🖼️')+' '+f.name+'</div>';
  }).join('');
}

function deleteManualDep(totalIdx, excelCount){
  var manualIdx = totalIdx - excelCount;
  if(manualIdx < 0){ alert('لا يمكن حذف بيانات الإكسل'); return; }
  if(!confirm('حذف هذا التابع؟')) return;
  var manual = _sGet('deps_manual_'+_currentDepsEmpId, []);
  manual.splice(manualIdx, 1);
  _sSet('deps_manual_'+_currentDepsEmpId, manual);
  loadDependents();
}




// ===== تهيئة hr7_emps - دائماً اكتب البيانات الجديدة الكاملة =====
(function(){
  var __existingRaw90 = localStorage.getItem('hr7_emps');
  var MASTER_FIELDS_90 = []; /* ARIBA v96: تم إيقاف هذه القائمة عمدًا لأن إعادة الدمج التلقائي كانت
    بتشتغل في كل مرة تفتح فيها الصفحة وترجع أي تعديل (الراتب، الوظيفة، تاريخ العقد، الإجازة...)
    لنفس القيمة اللي كانت وقت إنشاء الملف، حتى لو الموظف اتعدل وتحفظ بنجاح فعليًا. */
  var __seedFresh90 = false;
  var D=[]; /* V104 */
  try{
    if(!__existingRaw90){
      localStorage.setItem('hr7_emps',JSON.stringify(D));
      __seedFresh90 = true;
    } else {
      var existing90 = JSON.parse(__existingRaw90);
      var existingTermRaw90pre = localStorage.getItem('hr7_term_emps');
      var existingTerm90pre = existingTermRaw90pre ? JSON.parse(existingTermRaw90pre) : [];
      var byId90 = {}; existing90.forEach(function(e){ if(e && e.id) byId90[e.id]=e; });
      var byName90 = {}; existing90.forEach(function(e){ if(e && e.nameAr) byName90[e.nameAr]=e; });
      var termById90 = {}; existingTerm90pre.forEach(function(e){ if(e && e.id) termById90[e.id]=e; });
      var termByName90 = {}; existingTerm90pre.forEach(function(e){ if(e && e.nameAr) termByName90[e.nameAr]=e; });
      D.forEach(function(fresh){
        var local = byId90[fresh.id] || byName90[fresh.nameAr];
        var localTerm = termById90[fresh.id] || termByName90[fresh.nameAr];
        if(local){
          MASTER_FIELDS_90.forEach(function(f){
            if(fresh[f] !== undefined) local[f] = fresh[f];
          });
        } else if(localTerm){
          /* الموظف ده تم إنهاء خدمته محليًا بالفعل — منضيفوش نسخة نشطة منه تاني، بس نحدّث بياناته الأساسية في مكانه الصحيح */
          MASTER_FIELDS_90.forEach(function(f){
            if(fresh[f] !== undefined) localTerm[f] = fresh[f];
          });
        } else {
          existing90.push(fresh); byId90[fresh.id]=fresh; if(fresh.nameAr) byName90[fresh.nameAr]=fresh;
        }
      });
      localStorage.setItem('hr7_emps', JSON.stringify(existing90));
      if(existingTermRaw90pre) localStorage.setItem('hr7_term_emps', JSON.stringify(existingTerm90pre));
    }
  }catch(ex){}
  var T=[]; /* V104 */
  try{
    var __existingTermRaw90 = localStorage.getItem('hr7_term_emps');
    if(!__existingTermRaw90){
      localStorage.setItem('hr7_term_emps',JSON.stringify(T));
    } else {
      var existingT90 = JSON.parse(__existingTermRaw90);
      var existingActiveRaw90post = localStorage.getItem('hr7_emps');
      var existingActive90post = existingActiveRaw90post ? JSON.parse(existingActiveRaw90post) : [];
      var byIdT90 = {}; existingT90.forEach(function(e){ if(e && e.id) byIdT90[e.id]=e; });
      var byNameT90 = {}; existingT90.forEach(function(e){ if(e && e.nameAr) byNameT90[e.nameAr]=e; });
      var activeByIdT90 = {}; existingActive90post.forEach(function(e){ if(e && e.id) activeByIdT90[e.id]=e; });
      var activeByNameT90 = {}; existingActive90post.forEach(function(e){ if(e && e.nameAr) activeByNameT90[e.nameAr]=e; });
      T.forEach(function(fresh){
        var local = byIdT90[fresh.id] || byNameT90[fresh.nameAr];
        var localActive = activeByIdT90[fresh.id] || activeByNameT90[fresh.nameAr];
        if(local){
          MASTER_FIELDS_90.forEach(function(f){
            if(fresh[f] !== undefined) local[f] = fresh[f];
          });
        } else if(localActive){
          /* الموظف ده اترجّع نشط محليًا بالفعل — منضيفوش نسخة منتهية منه تاني */
          MASTER_FIELDS_90.forEach(function(f){
            if(fresh[f] !== undefined) localActive[f] = fresh[f];
          });
        } else {
          existingT90.push(fresh);
        }
      });
      localStorage.setItem('hr7_term_emps', JSON.stringify(existingT90));
      if(existingActiveRaw90post) localStorage.setItem('hr7_emps', JSON.stringify(existingActive90post));
    }
  }catch(ex){}
})();



// onload merged above
