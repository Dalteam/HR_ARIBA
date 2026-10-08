// ====== ATTENDANCE ======
function renderAtt(){
  var el=document.getElementById('appContent');if(!el)return;
  var today=tod();
  var rec=null;
  var att=gLSJ(HR+'att')||[];
  for(var i=0;i<att.length;i++){if(att[i].emp_id===ME.id&&att[i].date===today){rec=att[i];break;}}

  var now=new Date();
  var html=
    '<div class="att-big">'+
      '<div class="att-time" id="liveClock">'+now.toLocaleTimeString('ar-SA-u-nu-latn',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+'</div>'+
      '<div class="att-date">'+now.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{weekday:'long',year:'numeric',month:'long',day:'numeric'})+'</div>'+
    '</div>'+
    '<div class="loc-badge" id="locBadge"><div class="loc-dot" id="locDot"></div><span id="locTxt" style="color:var(--mu)">جاري تحديد الموقع...</span></div>'+
    '<div id="remCtrl" style="text-align:center;font-size:11px;color:var(--mu);margin-bottom:8px"></div>'+
    '<div class="card">'+
      '<div class="card-title"><i class="ti ti-calendar-check"></i> حالة الحضور اليوم</div>';

  if(rec){
    html+='<div class="att-status att-in">✅ سجلت حضورك — '+(rec.time_in||rec.timeIn||'')+'</div>';
    if(rec.location_name)html+='<div style="font-size:12px;color:var(--mu);text-align:center;margin:4px 0">📍 '+rec.location_name+'</div>';
    if(!rec.time_out&&!rec.timeOut){
      html+='<div id="workTimer" style="font-size:22px;font-weight:800;color:var(--cy);text-align:center;padding:10px">⏱ 0 ساعة 0 دقيقة</div>';
      html+='<button class="btn btn-danger" onclick="doOut()"><i class="ti ti-door-exit"></i> تسجيل الانصراف</button>';
      html+='<button onclick="showForgot()" style="width:100%;margin-top:8px;background:transparent;border:1px solid var(--bd);color:var(--mu);border-radius:8px;padding:8px;cursor:pointer;font-size:12px;font-family:inherit">⚠️ نسيت البصمة / مهمة خارجية</button>';
    }else{
      html+='<div class="att-status" style="background:rgba(239,68,68,.08);color:var(--rd)">🚪 انصرفت — '+(rec.time_out||rec.timeOut||'')+'</div>';
      if(rec.hours)html+='<div style="text-align:center;color:var(--gr);margin-top:6px">⏱ '+rec.hours+' ساعة</div>';
    }
  }else{
    html+='<div class="att-status att-none">لم تسجل حضورك بعد</div>';
    html+='<button class="btn btn-success" id="btnIn" onclick="doIn()"><i class="ti ti-map-pin"></i> تسجيل الحضور</button>';
    html+='<button onclick="showForgot()" style="width:100%;margin-top:8px;background:transparent;border:1px solid var(--bd);color:var(--mu);border-radius:8px;padding:8px;cursor:pointer;font-size:12px;font-family:inherit">⚠️ نسيت البصمة / مهمة خارجية</button>';
  }
  html+='</div>';

  // سجل الشهر
  var monthAtt=[];
  for(var mi=0;mi<att.length;mi++){if(att[mi].emp_id===ME.id&&att[mi].date&&att[mi].date.slice(0,7)===today.slice(0,7))monthAtt.push(att[mi]);}
  monthAtt.sort(function(a,b){return b.date.localeCompare(a.date);});
  var mhtml='';
  for(var mj=0;mj<monthAtt.length;mj++){
    var a=monthAtt[mj];
    var sc=a.status==='late'?'var(--am)':a.status==='present'?'var(--gr)':a.status==='remote'?'var(--bl)':'var(--mu)';
    mhtml+='<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--bd);font-size:12px">'+
      '<span>'+a.date+'</span>'+
      '<span>'+(a.time_in||a.timeIn||'—')+' → '+(a.time_out||a.timeOut||'...')+'</span>'+
      '<span style="color:'+sc+'">'+a.status+'</span></div>';
  }
  html+='<div class="card"><div class="card-title"><i class="ti ti-calendar-stats"></i> سجل هذا الشهر</div>'+(mhtml||'<div style="color:var(--mu);font-size:12px;text-align:center;padding:10px">لا يوجد سجل</div>')+'</div>';

  el.innerHTML=html;
  startClock();
  detectLoc();
  updateRemCtrl();
}

function startClock(){
  var tick=function(){
    var lc=document.getElementById('liveClock');if(!lc)return;
    var n=new Date();
    lc.textContent=n.toLocaleTimeString('ar-SA-u-nu-latn',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
    var wt=document.getElementById('workTimer');
    if(wt){
      var att=gLSJ(HR+'att')||[];
      var today=tod();
      var rec=null;for(var i=0;i<att.length;i++){if(att[i].emp_id===ME.id&&att[i].date===today){rec=att[i];break;}}
      if(rec&&rec.time_in&&!rec.time_out){
        var tp=rec.time_in.split(':');
        var diffMin=(n.getHours()*60+n.getMinutes())-(parseInt(tp[0])*60+parseInt(tp[1]));
        if(diffMin<0)diffMin=0;
        wt.textContent='⏱ '+Math.floor(diffMin/60)+' ساعة '+diffMin%60+' دقيقة';
      }
    }
    setTimeout(tick,1000);
  };
  tick();
}

function updateRemCtrl(){
  var el=document.getElementById('remCtrl');if(!el)return;
  var rem=ME.remote_limit-ME.remote_used;
  el.innerHTML='عن بعد: <strong style="color:var(--cy)">'+rem+'</strong> يوم متبقي من '+ME.remote_limit;
}

function detectLoc(){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(function(pos){
    userLoc={lat:pos.coords.latitude,lng:pos.coords.longitude};
    var locs=gLSJ(HR+'locs')||[];
    nearLoc=null;
    var minD=Infinity;
    for(var i=0;i<locs.length;i++){
      var l=locs[i];
      if(l.type==='remote'||!l.lat||!l.lng)continue;
      var d=Math.sqrt(Math.pow((pos.coords.latitude-l.lat)*111000,2)+Math.pow((pos.coords.longitude-l.lng)*111000*Math.cos(l.lat*Math.PI/180),2));
      if(d<(l.radius||200)&&d<minD){minD=d;nearLoc=l;}
    }
    var dot=document.getElementById('locDot');
    var txt=document.getElementById('locTxt');
    if(nearLoc){
      if(dot)dot.style.background='var(--gr)';
      if(txt){txt.textContent='📍 '+nearLoc.name;txt.style.color='var(--gr)';}
    }else if(locs.length>0){
      if(dot)dot.style.background='var(--rd)';
      if(txt){txt.textContent='❌ خارج نطاق مواقع العمل';txt.style.color='var(--rd)';}
    }else{
      // مفيش مواقع محددة - اعرض الإحداثيات فقط بدون nearLoc
      if(dot)dot.style.background='var(--am)';
      if(txt){txt.textContent='📍 '+pos.coords.latitude.toFixed(4)+', '+pos.coords.longitude.toFixed(4);txt.style.color='var(--am)';}
      nearLoc={name:pos.coords.latitude.toFixed(4)+','+pos.coords.longitude.toFixed(4),type:'office',id:'gps'};
    }
  },function(){
    var dot2=document.getElementById('locDot');
    var txt2=document.getElementById('locTxt');
    if(dot2)dot2.style.background='var(--rd)';
    if(txt2){txt2.textContent='❌ تعذر تحديد الموقع';txt2.style.color='var(--rd)';}
    nearLoc=null;
  });
}

function doIn(){
  var locs=gLSJ(HR+'locs')||[];
  if(locs.length>0&&(!nearLoc||nearLoc.id==='gps')){
    toast('❌ أنت خارج النطاق الجغرافي المسموح به\nلا يمكن تسجيل الحضور','ter');return;
  }
  if(!nearLoc)nearLoc={name:'موقع العمل',type:'office',id:'default'};
  if(nearLoc.type==='remote'&&ME.remote_used>=ME.remote_limit){toast('❌ تجاوزت حد العمل عن بعد','ter');return;}
  var now=new Date();
  var sets=gLSJ(HR+'settings')||{};
  var wst=sets.wst||'08:00',tol=parseInt(sets.tol)||15;
  var wh=parseInt(wst.split(':')[0]),wm=parseInt(wst.split(':')[1]);
  var nowMin=now.getHours()*60+now.getMinutes();
  var allowMin=wh*60+wm+tol;
  var lateMin=Math.max(0,nowMin-allowMin);
  var rec={id:String(Date.now()),emp_id:ME.id,date:tod(),
    time_in:now.toTimeString().slice(0,5),
    status:nearLoc.type==='remote'?'remote':lateMin>0?'late':'present',
    late_minutes:lateMin,location_name:nearLoc.name,
    lat:userLoc?userLoc.lat:null,lng:userLoc?userLoc.lng:null};
  var att=gLSJ(HR+'att')||[];
  var idx=-1;for(var i=0;i<att.length;i++){if(att[i].emp_id===rec.emp_id&&att[i].date===rec.date){idx=i;break;}}
  if(idx>=0)att[idx]=Object.assign(att[idx],rec);else att.push(rec);
  sLS(HR+'att',att);
  if(nearLoc.type==='remote')ME.remote_used++;
  toast('✅ تم تسجيل حضورك'+(lateMin>0?' — تأخير '+lateMin+' دقيقة':''));
  renderAtt();
}

function doOut(){
  var locs2=gLSJ(HR+'locs')||[];
  if(locs2.length>0&&(!nearLoc||nearLoc.id==='gps')){
    toast('❌ أنت خارج النطاق الجغرافي المسموح به\nلا يمكن تسجيل الانصراف','ter');return;
  }
  var today=tod();var now=new Date();var timeOut=now.toTimeString().slice(0,5);
  var att=gLSJ(HR+'att')||[];var idx=-1;
  for(var i=0;i<att.length;i++){if(att[i].emp_id===ME.id&&att[i].date===today){idx=i;break;}}
  if(idx<0){toast('لا يوجد سجل حضور اليوم','ter');return;}
  att[idx].time_out=timeOut;
  var tin=att[idx].time_in.split(':'),tout=timeOut.split(':');
  att[idx].hours=Math.round(((parseInt(tout[0])*60+parseInt(tout[1]))-(parseInt(tin[0])*60+parseInt(tin[1])))/60*100)/100;
  att[idx].early_minutes=Math.max(0,(16*60-15)-(parseInt(tout[0])*60+parseInt(tout[1])));
  sLS(HR+'att',att);
  toast('🚪 تم تسجيل انصرافك — '+att[idx].hours+' ساعة');
  renderAtt();
}

function closeForgot(){var d=document.getElementById('forgotD');if(d&&d.parentNode)d.parentNode.removeChild(d);}
function showForgot(){
  var d=document.createElement('div');
  d.id='forgotD';d.style.cssText='position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:999;display:flex;align-items:center;justify-content:center;padding:20px';
  d.innerHTML='<div style="background:var(--c);border-radius:16px;padding:20px;width:100%;max-width:380px">'+
    '<div style="font-weight:700;margin-bottom:12px">⚠️ إشعار غياب البصمة</div>'+
    '<label>السبب</label><select id="fReason" style="width:100%;padding:9px;border:1px solid var(--bd);border-radius:8px;background:var(--c2);color:var(--tx);font-family:inherit">'+
    '<option value="forgot">نسيان البصمة</option><option value="mission">مهمة خارجية</option><option value="other">أخرى</option></select>'+
    '<label>وقت الخروج</label><input type="time" id="fTime" style="width:100%;padding:9px;border:1px solid var(--bd);border-radius:8px;background:var(--c2);color:var(--tx)">'+
    '<label>ملاحظات</label><textarea id="fNotes" rows="2" style="width:100%"></textarea>'+
    '<div style="display:flex;gap:8px;margin-top:12px">'+
    '<button onclick="submitForgot()" style="flex:1;background:var(--am);color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer;font-family:inherit">إرسال</button>'+
    '<button onclick="closeForgot()" style="flex:1;background:var(--c2);color:var(--tx);border:1px solid var(--bd);border-radius:8px;padding:10px;cursor:pointer;font-family:inherit">إلغاء</button>'+
    '</div></div>';
  document.body.appendChild(d);
  var ft=document.getElementById('fTime');if(ft)ft.value=new Date().toTimeString().slice(0,5);
}

function submitForgot(){
  var r=document.getElementById('fReason');var t=document.getElementById('fTime');var n=document.getElementById('fNotes');
  if(!t||!t.value){toast('حدد وقت الخروج','ter');return;}
  var today=tod();var att=gLSJ(HR+'att')||[];var idx=-1;
  for(var i=0;i<att.length;i++){if(att[i].emp_id===ME.id&&att[i].date===today){idx=i;break;}}
  var note='['+(r&&r.value==='forgot'?'نسيان البصمة':r&&r.value==='mission'?'مهمة خارجية':'أخرى')+'] '+(n?n.value:'');
  if(idx>=0){att[idx].time_out=t.value;att[idx].notes=note;}
  else att.push({id:String(Date.now()),emp_id:ME.id,date:today,time_in:'--:--',time_out:t.value,status:'forgot',notes:note});
  sLS(HR+'att',att);
  var d=document.getElementById('forgotD');if(d&&d.parentNode)d.parentNode.removeChild(d);
  toast('✅ تم إرسال الإشعار');renderAtt();
}

