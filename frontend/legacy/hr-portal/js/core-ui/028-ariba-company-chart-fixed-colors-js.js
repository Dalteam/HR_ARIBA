
(function(){
  const COLORS = {
    ariba: '#014D3D',
    geomechanics: '#29B35E',
    optimum: '#E4E4BC'
  };
  function norm(v){
    return String(v||'').trim().toLowerCase()
      .replace(/[أإآ]/g,'ا')
      .replace(/ة/g,'ه')
      .replace(/\s+/g,' ');
  }
  function companyColor(name, fallback){
    const n=norm(name);
    if(n.includes('اريبا') || n.includes('ariba')) return COLORS.ariba;
    if(n.includes('جيوميكان') || n.includes('geomechan')) return COLORS.geomechanics;
    if(n.includes('اوبتيموم') || n.includes('أوبتيموم') || n.includes('optimum')) return COLORS.optimum;
    return fallback || '#D9D9D9';
  }
  window.ARIBA_EMPLOYER_CHART_COLOR = companyColor;

  /* Patch common Chart.js dataset construction paths. */
  function apply(){
    try{
      if(window.Chart && Chart.instances){
        Object.values(Chart.instances).forEach(function(ch){
          const title = norm(ch?.options?.plugins?.title?.text || ch?.canvas?.closest('.card,.panel')?.innerText || '');
          if(!title.includes('جهات العمل') && !title.includes('جهة العمل') && !title.includes('employer')) return;
          const labels = ch.data?.labels || [];
          const ds = ch.data?.datasets?.[0];
          if(!ds) return;
          ds.backgroundColor = labels.map(function(label,i){
            return companyColor(label, Array.isArray(ds.backgroundColor)?ds.backgroundColor[i]:'#D9D9D9');
          });
          ch.update('none');
        });
      }
    }catch(e){}
  }
  window.addEventListener('load',function(){
  // مزامنة مع Supabase عند الفتح
  setTimeout(async function(){
    if(typeof loadFromSupabase==='function') await loadFromSupabase();
    if(typeof CLEAN_EMPS!=='undefined'&&CLEAN_EMPS.length&&!localStorage.getItem('hr7_emps')){
      await syncEmployeesToSupabase(CLEAN_EMPS);
    }
    if(typeof loadDash==='function') loadDash();
    if(typeof uBadges==='function') uBadges();
  }, 1000);
  setTimeout(function(){
    if(typeof sync==='function') sync();
    if(typeof loadDash==='function') loadDash();
    if(typeof uBadges==='function') uBadges();
    if(typeof syncToEmployeeApp==='function') syncToEmployeeApp();
  },800);
  setTimeout(function(){
    if(typeof loadDash==='function') loadDash();
  },2000);
  setInterval(function(){if(typeof uBadges==='function') uBadges();},5000);});
  /* disabled: no recurring chart repaint */
})();
