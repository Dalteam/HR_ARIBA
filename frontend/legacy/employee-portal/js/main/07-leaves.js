// ====== LEAVES ======
function getMyLeaves(){
  var all=gLSJ(HR+'leaves')||[];
  var out=[];
  for(var i=0;i<all.length;i++){if(String(all[i].empId||all[i].emp_id)===ME.id)out.push(all[i]);}
  return out;
}

var selType='annual'; window.selType=selType;
function renderLv(){
  var el=document.getElementById('appContent');if(!el)return;
  syncFromHR();
  var reqs=getMyLeaves();
  var hols=gLSJ(HR+'hols')||[];
  var today=tod();
  var upcoming=[];
  for(var hi=0;hi<hols.length;hi++){if((hols[hi].date||'')>=today)upcoming.push(hols[hi]);}
  upcoming.sort(function(a,b){return(a.date||'').localeCompare(b.date||'');});

  var holHtml='';
  if(upcoming.length>0){
    holHtml='<div style="margin-bottom:10px;padding:10px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);border-radius:10px"><div style="font-size:12px;font-weight:700;color:var(--bl);margin-bottom:6px">🗓️ إجازات رسمية قادمة</div>';
    for(var ui=0;ui<Math.min(upcoming.length,4);ui++){
      var hl=upcoming[ui];
      holHtml+='<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid rgba(36,48,68,.3)"><span>'+hl.name+'</span><span style="color:var(--mu)">'+fD(hl.date)+(hl.days?' ('+hl.days+' يوم)':'')+'</span></div>';
    }
    holHtml+='</div>';
  }

  var typesHtml='';
  var keys=Object.keys(LVL);
  for(var ki=0;ki<keys.length;ki++){
    var k=keys[ki],v=LVL[k];
    typesHtml+='<div data-k="'+k+'" class="lv-type" id="lt_'+k+'"><i class="ti '+v.icon+'" style="font-size:18px;display:block;margin-bottom:3px;color:'+v.color+'"></i>'+v.ar+'</div>';
  }

  var reqHtml='';
  if(reqs.length===0){
    reqHtml='<div style="color:var(--mu);font-size:12px;text-align:center;padding:10px">لا توجد طلبات</div>';
  }else{
    for(var ri=reqs.length-1;ri>=0;ri--){
      var r=reqs[ri];
      var lbl=(LVL[r.type]&&LVL[r.type].ar)||r.type;
      var det=r.from_date?(fD(r.from_date)+' ← '+fD(r.to_date)+(r.days?' ('+r.days+' يوم)':'')):(r.date||'')+(r.time?' '+r.time:'')+(r.dur?' ('+r.dur+'س)':'');
      var sc=r.status==='approved'?'bg':r.status==='rejected'?'br':'ba';
      var st=r.status==='approved'?'موافق':r.status==='rejected'?'مرفوض':'معلق';
      reqHtml+='<div class="req-item"><div style="flex:1"><div style="font-size:12px;font-weight:600">'+lbl+'</div><div style="font-size:11px;color:var(--mu)">'+det+'</div>'+(r.rejected_reason?'<div style="font-size:11px;color:var(--rd)">❌ '+r.rejected_reason+'</div>':'')+'</div><span class="b '+sc+'">'+st+'</span></div>';
    }
  }

  el.innerHTML=
    '<div class="card">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
        '<span style="font-weight:700">رصيد الإجازة</span>'+
        '<div style="text-align:left"><div style="font-size:22px;font-weight:800;color:var(--gr)">'+ME.leave_bal+'<span style="font-size:11px;color:var(--mu)"> يوم</span></div>'+(ME.leave_carry>0?'<div style="font-size:10px;color:var(--pu)">'+ME.leave_carry+' محجوز</div>':'')+'</div>'+
      '</div>'+
      holHtml+
      '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px" id="lvTypes" onclick="lvTypeClick(event)">'+typesHtml+'</div>'+
      '<div id="lvDateForm">'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
          '<div><label>من تاريخ</label><input type="date" id="lvFrom" onchange="calcDays()"></div>'+
          '<div><label>إلى تاريخ</label><input type="date" id="lvTo" onchange="calcDays()"></div>'+
        '</div>'+
        '<div id="lvCalcDiv" style="margin-top:6px;font-size:12px;color:var(--mu)"></div>'+
      '</div>'+
      '<div id="lvPermForm" style="display:none">'+
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">'+
          '<div><label>التاريخ</label><input type="date" id="permDate"></div>'+
          '<div><label>الوقت</label><input type="time" id="permTime"></div>'+
          '<div><label>المدة(س)</label><input type="number" id="permDur" value="1" min="0.5" step="0.5"></div>'+
        '</div>'+
      '</div>'+
      '<label>ملاحظات</label><textarea id="lvNotes" rows="2" placeholder="اختياري"></textarea>'+
      '<button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:8px" onclick="submitLv()"><i class="ti ti-send"></i> إرسال الطلب</button>'+
    '</div>'+
    '<div class="card">'+
      '<div class="card-title"><i class="ti ti-history"></i> طلباتي</div>'+
      reqHtml+
    '</div>';

  // تفعيل النوع الأول
  var first=document.getElementById('lt_annual');
  if(first) selLvType('annual',first);
}

function lvTypeClick(ev){
  var t=ev.target;
  while(t&&!t.getAttribute('data-k'))t=t.parentNode;
  if(t)selLvType(t.getAttribute('data-k'),t);
}
function selLvType(k,el){
  selType=k;
  var all=document.querySelectorAll('.lv-type');
  for(var i=0;i<all.length;i++){all[i].classList.remove('on');all[i].style.borderColor='';all[i].style.background='';}
  if(el){el.classList.add('on');el.style.borderColor=LVL[k].color;el.style.background=LVL[k].color+'22';}
  var isPerm=k==='perm'||k==='perm_mat'||k==='early_leave';
  var df=document.getElementById('lvDateForm');var pf=document.getElementById('lvPermForm');
  if(df)df.style.display=isPerm?'none':'block';
  if(pf)pf.style.display=isPerm?'block':'none';
  if(isPerm){var pd=document.getElementById('permDate');if(pd)pd.value=tod();}
  else calcDays();
}

function calcDays(){
  var f=document.getElementById('lvFrom');var t=document.getElementById('lvTo');var el=document.getElementById('lvCalcDiv');
  if(!f||!t||!el)return;
  var from=f.value,to=t.value;
  if(!from||!to){el.textContent='';return;}
  var days=0;
  if(selType==='annual'){
    var hols=gLSJ(HR+'hols')||[];
    var hs={};for(var hi=0;hi<hols.length;hi++)hs[hols[hi].date||'']=true;
    var d=new Date(from),en=new Date(to);
    while(d<=en){var dw=d.getDay(),ds=d.toISOString().slice(0,10);if(dw>=0&&dw<=4&&!hs[ds])days++;d.setDate(d.getDate()+1);}
  }else{days=Math.round((new Date(to)-new Date(from))/86400000)+1;}
  var rem=ME.leave_bal-days;
  el.textContent='أيام العمل: '+days+(selType==='annual'?' | سيتبقى: '+rem+' يوم':'');
  el.style.color=rem<0?'var(--rd)':'var(--mu)';
}

function submitLv(){
  var notes=document.getElementById('lvNotes');
  var isPerm=selType==='perm'||selType==='perm_mat'||selType==='early_leave';
  var rec={id:String(Date.now()),emp_id:ME.id,empId:ME.id,type:selType,
    notes:notes?notes.value:'',status:'pending',
    mgr_status:ME.mgr_id?'pending':'not_required',
    created_at:new Date().toISOString()};
  if(isPerm){
    var pd=document.getElementById('permDate'),pt=document.getElementById('permTime'),pdur=document.getElementById('permDur');
    if(!pd||!pd.value||!pt||!pt.value){toast('حدد التاريخ والوقت','ter');return;}
    rec.date=pd.value;rec.time=pt.value;rec.dur=pdur?parseFloat(pdur.value)||1:1;
    var perms=gLSJ(HR+'perms')||[];perms.push(rec);sLS(HR+'perms',perms);
    toast('✅ تم إرسال الاستئذان');
  }else{
    var from=document.getElementById('lvFrom'),to=document.getElementById('lvTo');
    if(!from||!from.value||!to||!to.value){toast('حدد التاريخ','ter');return;}
    var days=0;
    if(selType==='annual'){
      var hols2=gLSJ(HR+'hols')||[];var hs2={};for(var h2=0;h2<hols2.length;h2++)hs2[hols2[h2].date||'']=true;
      var d2=new Date(from.value),en2=new Date(to.value);
      while(d2<=en2){var dw2=d2.getDay(),ds2=d2.toISOString().slice(0,10);if(dw2>=0&&dw2<=4&&!hs2[ds2])days++;d2.setDate(d2.getDate()+1);}
      if(days>ME.leave_bal){toast('يتجاوز الرصيد المتاح','ter');return;}
    }else{days=Math.round((new Date(to.value)-new Date(from.value))/86400000)+1;}
    rec.from_date=from.value;rec.to_date=to.value;rec.days=days;
    var lvs=gLSJ(HR+'leaves')||[];lvs.push(rec);sLS(HR+'leaves',lvs);
    toast('✅ تم إرسال الطلب');
  }
  renderLv();
}

