

(function init(){
  try{rolloverLeaves();}catch(err){console.error('rolloverLeaves:',err);}
  try{buildNav();}catch(err){console.error('buildNav:',err);}
  try{ensureSidebar();}catch(err){console.error('ensureSidebar:',err);}
  try{applyLang();}catch(err){console.error('applyLang:',err);}
  try{var d=document.getElementById('DTS');if(d)d.textContent=new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{weekday:'long',year:'numeric',month:'long',day:'numeric'});}catch(err){console.error('date:',err);}
  try{popEF();}catch(err){console.error('popEF:',err);}
  try{showPg('dash',document.getElementById('ni-dash'));}catch(err){console.error('showPg:',err);}
  try{uBadges();}catch(err){console.error('uBadges:',err);}
  setInterval(function(){try{uBadges();}catch(e){}},60000);
  setTimeout(function(){try{ensureSidebar();if(!document.getElementById('NV')?.innerHTML.trim())buildNav();}catch(e){console.error('sidebar:',e);}},100);
  setInterval(function(){try{ensureSidebar();if(!document.getElementById('NV')?.innerHTML.trim())buildNav();}catch(e){}},2000);
})();
setTimeout(function(){syncLeavesFromSupa(true).then(function(){
  var pg=document.querySelector('.pg.on');
  if(pg&&pg.id==='pg-lv'){var active=document.querySelector('#pg-lv .tbar .tab.on');var id=active&&active.getAttribute('onclick')?.match(/'([^']+)'/)?.[1]||'lv1';if(id==='lv1'){rLvPend();}else if(id==='lv2'){rAllLv();}else if(id==='lv4'){loadLeaveBalanceEmployeeOptions();rLvBal();}else if(id==='lv5'){rHols();}}
  uBadges(); if(pg&&pg.id==='pg-dash')loadDash();
}).catch(function(){});},500);
/* AUTO LEAVE REFRESH DISABLED */
/* setInterval(function(){syncLeavesFromSupa(true).then(function(){
  var pg=document.querySelector('.pg.on');
  if(pg&&pg.id==='pg-lv'){var active=document.querySelector('#pg-lv .tbar .tab.on');var id=active&&active.getAttribute('onclick')?.match(/'([^']+)'/)?.[1]||'lv1';if(id==='lv1'){rLvPend();}else if(id==='lv2'){rAllLv();}else if(id==='lv4'){loadLeaveBalanceEmployeeOptions();rLvBal();}else if(id==='lv5'){rHols();}}
  uBadges(); if(pg&&pg.id==='pg-dash')loadDash();
}).catch(function(){});},30000); */

// Legacy hardcoded HR login removed. Production authentication uses ariba_login RPC only.


// ============================================================
// REAL-TIME SYNC - مزامنة فورية مع تطبيق الموظف
// ============================================================
window.addEventListener('storage', function(e) {
  if (!e.key || !e.key.startsWith('hr7_')) return;
  var key = e.key.replace('hr7_', '');
  // تحديث الصفحة الحالية لو متأثرة
  var cur = document.querySelector('.pg.on');
  if (!cur) return;
  var pgId = cur.id.replace('pg-', '');
  var affected = {
    'leaves': ['lv'],
    'perms':  ['lv'],
    'att':    ['att'],
    'emps':   ['emps','dash'],
    'locs':   ['loc'],
  };
  if (affected[key] && affected[key].includes(pgId)) {
    if (typeof loads !== 'undefined' && typeof loads[pgId] === 'function') {
      setTimeout(function(){loads[pgId]();}, 200);
    }
  }
  // تحديث الـ badge دايماً
  if (key === 'leaves' || key === 'perms') {
    if (typeof uBadges === 'function') uBadges();
  }
});

