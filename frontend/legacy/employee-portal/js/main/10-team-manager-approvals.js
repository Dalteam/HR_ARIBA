// ====== TEAM ======
function renderTeam(){
  var el=document.getElementById('appContent');if(!el)return;
  syncFromHR();
  var all=gLSJ(HR+'emps')||[];
  if(all.length===0) all=EMP_D;

  var myId=ME.id;
  var team=[],mgr=null,peers=[];
  for(var i=0;i<all.length;i++){
    var e=all[i];
    var eMgr=String(e.managerId||e.manager_id||'');
    var eTerm=e.isTerminated||e.term||false;
    if(eMgr===myId&&!eTerm) team.push(e);
    if(String(e.id)===ME.mgr_id) mgr=e;
    if(ME.mgr_id&&eMgr===ME.mgr_id&&String(e.id)!==myId&&!eTerm) peers.push(e);
  }

  function card(e,role,clr){
    var n=e.nameAr||e.na||'';var j=e.jobTitle||e.jt||e.job||'';
    return'<div style="display:flex;align-items:center;gap:10px;padding:11px;background:var(--c2);border-radius:10px;margin-bottom:8px;border-right:3px solid '+clr+'">'+
      av(n,ec(n),38)+
      '<div style="flex:1"><div style="font-weight:700;font-size:13px">'+n.split(' ').slice(0,3).join(' ')+'</div><div style="font-size:11px;color:var(--mu)">'+j+'</div></div>'+
      '<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:'+clr+'22;color:'+clr+'">'+role+'</span></div>';
  }

  var html='';
  if(team.length>0){
    html+='<div style="font-size:13px;font-weight:700;color:var(--gr);margin-bottom:10px;padding:8px;background:rgba(16,185,129,.1);border-radius:8px">👥 فريقك ('+team.length+' موظف)</div>';
    for(var t=0;t<team.length;t++) html+=card(team[t],'مرؤوس','var(--gr)');

    // طلبات معلقة
    var lvs=gLSJ(HR+'leaves')||[];var perms=gLSJ(HR+'perms')||[];
    var tIds=[];for(var ti=0;ti<team.length;ti++) tIds.push(String(team[ti].id));
    var pend=[];
    for(var li=0;li<lvs.length;li++){if(tIds.indexOf(String(lvs[li].empId||lvs[li].emp_id))>=0&&lvs[li].status==='pending')pend.push(lvs[li]);}
    for(var pi=0;pi<perms.length;pi++){if(tIds.indexOf(String(perms[pi].emp_id||perms[pi].empId))>=0&&perms[pi].status==='pending')pend.push(perms[pi]);}

    if(pend.length>0){
      html+='<div style="font-size:12px;font-weight:700;color:var(--am);margin:10px 0 8px">⏳ طلبات تحتاج موافقتك ('+pend.length+')</div>';
      for(var qi=0;qi<pend.length;qi++){
        var req=pend[qi];
        var te=null;for(var ei=0;ei<all.length;ei++){if(String(all[ei].id)===String(req.empId||req.emp_id)){te=all[ei];break;}}
        var nm=te?((te.nameAr||te.na||'').split(' ').slice(0,2).join(' ')):'—';
        var tp=(LVL[req.type]&&LVL[req.type].ar)||req.type||'';
        var det=req.from_date?(fD(req.from_date)+' ← '+fD(req.to_date)):(req.date||'')+(req.time?' '+req.time:'')+(req.dur?' ('+req.dur+'س)':'');
        html+='<div style="background:var(--c2);border-radius:10px;padding:10px;margin-bottom:8px;border-right:3px solid var(--am)">'+
          '<div style="font-weight:600;font-size:12px;margin-bottom:4px">'+nm+' — '+tp+'</div>'+
          '<div style="font-size:11px;color:var(--mu);margin-bottom:8px">'+det+'</div>'+
          '<div style="display:flex;gap:8px">'+
            '<button onclick="mgrActBtn(this)" style="flex:1;background:var(--gr);color:#fff;border:none;border-radius:8px;padding:7px;cursor:pointer;font-family:inherit">✓ موافقة</button>'+
            '<button onclick="mgrActBtn(this)" style="flex:1;background:var(--rd);color:#fff;border:none;border-radius:8px;padding:7px;cursor:pointer;font-family:inherit">✗ رفض</button>'+
          '</div></div>';
      }
    }else html+='<div style="font-size:12px;color:var(--mu);padding:8px;text-align:center">✅ لا توجد طلبات معلقة</div>';
  }

  if(mgr){html+='<div style="font-size:12px;font-weight:700;color:var(--mu);margin:12px 0 8px">👤 مديرك المباشر</div>';html+=card(mgr,'مدير','var(--am)');}
  if(peers.length>0){html+='<div style="font-size:12px;font-weight:700;color:var(--mu);margin:12px 0 8px">🤝 زملاؤك ('+peers.length+')</div>';for(var pe=0;pe<peers.length;pe++)html+=card(peers[pe],'زميل','var(--bl)');}
  if(team.length===0&&!mgr&&peers.length===0)html='<div style="text-align:center;padding:40px;color:var(--mu)">لم يتم تحديد الفريق بعد<br><small>يتم التحديد من البرنامج الرئيسي</small></div>';
  el.innerHTML=html;
}

function mgrActBtn(btn){mgrAct(btn.getAttribute('data-id'),btn.getAttribute('data-act'));}
function mgrAct(id,status){
  var done=false;
  var lvs=gLSJ(HR+'leaves')||[];
  for(var i=0;i<lvs.length;i++){if(lvs[i].id===id){lvs[i].status=status;lvs[i].mgr_status=status;done=true;break;}}
  if(done){sLS(HR+'leaves',lvs);}else{
    var perms=gLSJ(HR+'perms')||[];
    for(var j=0;j<perms.length;j++){if(perms[j].id===id){perms[j].status=status;perms[j].mgr_status=status;done=true;break;}}
    if(done)sLS(HR+'perms',perms);
  }
  if(done){toast(status==='approved'?'✅ تمت الموافقة':'تم الرفض');renderTeam();}
}

