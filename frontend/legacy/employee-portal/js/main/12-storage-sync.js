// ====== STORAGE SYNC ======
window.addEventListener('storage',function(ev){
  if(!ev.key||ev.key.indexOf('hr7_')<0||!ME) return;
  syncFromHR();
  var tb=document.querySelector('.bni.on');
  if(tb){var tab=tb.id.replace('tb-','');var fns={home:renderHome,att:renderAtt,lv:renderLv,pay:renderPay,team:renderTeam,prof:renderProf};if(fns[tab])setTimeout(fns[tab],200);}
});
