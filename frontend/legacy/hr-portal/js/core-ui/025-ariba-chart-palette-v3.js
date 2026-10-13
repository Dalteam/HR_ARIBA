
(function(){
  const DARK='#014D3D', GREEN='#29B35E', BEIGE='#E4E4BC', GRAY='#D6D3C7', GRAY_DARK='#6B7280', BEIGE_DARK='#C9C3AE';

  function applyPalette(){
    try{
      if(!window.charts) return;

      function setDonut(id, map, fallback){
        const ch=window.charts[id];
        if(!ch || !ch.data || !ch.data.labels) return;
        const labels=ch.data.labels;
        const colors=labels.map(function(label){
          const k=String(label||'').trim();
          return map[k] || fallback;
        });
        if(ch.data.datasets && ch.data.datasets[0]){
          ch.data.datasets[0].backgroundColor=colors;
          ch.update('none');
        }
      }

      setDonut('cNat',{
        'أردني':BEIGE,'أردنية':BEIGE,
        'سوداني':GRAY,'سودانية':GRAY,
        'سوري':GRAY_DARK,'سورية':GRAY_DARK,
        'مصري':GREEN,'مصرية':GREEN,
        'سعودي':DARK,'سعودية':DARK
      }, '#E8ECEA');

      setDonut('cDept',{
        'الموارد البشرية':GREEN,
        'التشغيل':DARK,
        'المالية':BEIGE,
        'الخدمات اللوجستية':GREEN,
        'التسويق':BEIGE_DARK
      }, '#E8ECEA');

      const emp=window.charts.cEmp;
      if(emp && emp.data && emp.data.labels){
        emp.data.datasets[0].backgroundColor=emp.data.labels.map(function(label){
          var n=String(label||'').trim().toLowerCase().replace(/[أإآ]/g,'ا').replace(/ة/g,'ه');
          if(n==='اريبا'||n==='ariba') return DARK;
          if(n.includes('جيوميكان')||n.includes('geomech')) return GREEN;
          if(n.includes('اوبتيموم')||n.includes('أوبتيموم')||n.includes('optimum')) return BEIGE;
          return '#D6D3C7';
        });
        emp.update('none');
      }
    }catch(e){}
  }

  setTimeout(applyPalette,300);
  setTimeout(applyPalette,1000);
  setTimeout(applyPalette,2000);
  /* disabled: no recurring chart repaint */
})();
