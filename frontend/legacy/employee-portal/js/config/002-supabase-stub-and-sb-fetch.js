
var supa={from:function(){var c={select:function(){return c;},eq:function(){return c;},order:function(){return c;},limit:function(){return c;},single:function(){return c;},insert:function(){return c;},update:function(){return c;},delete:function(){return c;},in:function(){return c;},then:function(r){r({data:[],error:null});return Promise.resolve();},catch:function(){return c;}};return c;}}; /* V128: مشروع Supabase قديم اتشال — مفيش ميزة بتستخدمه */

function sbFetch(table,filters){
  if(!supa)return Promise.resolve([]);
  var q=supa.from(table).select('*');
  if(filters)Object.keys(filters).forEach(function(k){q=q.eq(k,filters[k]);});
  return q.then(function(res){return res.data||[];}).catch(function(){return [];});
}
function sbInsert(table,row){
  if(!supa)return Promise.resolve(null);
  return supa.from(table).insert(row).select().single()
    .then(function(res){return res.data;}).catch(function(){return null;});
}
function sbUpdate(table,id,updates){
  if(!supa)return Promise.resolve(null);
  return supa.from(table).update(updates).eq('id',id).select().single()
    .then(function(res){return res.data;}).catch(function(){return null;});
}
function submitLeaveToSupabase(req){
  return sbInsert('leave_requests',{
    emp_id:req.empId||req.emp_id,type:req.type,
    from_date:req.from_date,to_date:req.to_date,
    days_count:req.days,reason:req.reason||'',status:'pending'
  });
}
function submitAttendanceToSupabase(empId,type,location){
  var now=new Date();
  var today=now.toISOString().slice(0,10);
  var time=now.toTimeString().slice(0,8);
  return sbFetch('attendance',{emp_id:empId,date:today}).then(function(existing){
    if(type==='in'){
      if(existing.length)return existing[0];
      return sbInsert('attendance',{emp_id:empId,date:today,check_in:time,location_in:location||''});
    }else{
      if(existing.length)return sbUpdate('attendance',existing[0].id,{check_out:time,location_out:location||''});
    }
  });
}
