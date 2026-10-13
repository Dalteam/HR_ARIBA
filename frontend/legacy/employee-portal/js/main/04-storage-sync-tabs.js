// ====== STORAGE SYNC ======
window.addEventListener('storage',function(ev){
  if(!ev.key||ev.key.indexOf('hr7_')<0) return;
  syncFromHR();
  var tb=document.querySelector('.bni.on');
  if(tb) goTab(tb.id.replace('tb-',''),tb);
});

// ====== TABS ======
function goTab(tab,el){
  var btns=document.querySelectorAll('.bni');
  for(var i=0;i<btns.length;i++) btns[i].classList.remove('on');
  if(el) el.classList.add('on');
  var titles={home:'الرئيسية',att:'الحضور',lv:'الإجازات',pay:'الراتب',team:'فريقي',prof:'ملفي'};
  document.getElementById('pageTitle').textContent=titles[tab]||tab;
  var fns={home:renderHome,att:renderAtt,lv:renderLv,pay:renderPay,team:renderTeam,prof:renderProf};
  if(fns[tab]) fns[tab]();
}

