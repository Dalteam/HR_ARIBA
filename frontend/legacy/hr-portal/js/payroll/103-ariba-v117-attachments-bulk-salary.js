
/* V117: معاينة المرفقات + أرشيفها + إرسال النماذج لمجموعة + خطاب تعريف الراتب على قالب الشركة (إضافة فقط) */
(function(){
  'use strict';
  var SUPA='https://iwviydmapqpqihcdazpe.supabase.co', KEY='sb_publishable_5PsFLEVv6w3Cxo1-WqWwdg_cYlNfLfB';
  var UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function isEN(){
    try{ if(typeof window.ARIBA_UI_LANG==='function') return window.ARIBA_UI_LANG()==='en'; }catch(e){}
    try{ return (typeof LANG!=='undefined' && LANG==='en'); }catch(e){}
    return false;
  }
  function T(ar,en){ return isEN()?en:ar; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function token(){ return window.ARIBA_HR_TOKEN || window.ARIBA_SESSION || ''; }
  function notify(msg,isErr){
    try{ if(typeof window.toast==='function'){ window.toast(msg, isErr?'ter':'tin'); return; } }catch(e){}
    alert(msg);
  }
  function rpc(fn,args){
    return new Promise(function(res,rej){
      var x=new XMLHttpRequest(); x.open('POST',SUPA+'/rest/v1/rpc/'+fn);
      x.setRequestHeader('apikey',KEY); x.setRequestHeader('Authorization','Bearer '+KEY); x.setRequestHeader('Content-Type','application/json');
      x.onload=function(){ var d=null; try{ d=JSON.parse(x.responseText||'null'); }catch(e){}
        if(x.status>=200&&x.status<300) res(d); else rej(new Error((d&&(d.message||d.hint))||('HTTP '+x.status))); };
      x.onerror=function(){ rej(new Error(T('تعذر الاتصال بالإنترنت','Cannot connect to the internet'))); };
      x.send(JSON.stringify(args||{}));
    });
  }
  var INP='width:100%;box-sizing:border-box;padding:10px;margin-bottom:8px;border:1px solid #ccc;border-radius:8px;font-size:14px;background:#fff;color:#111';
  function overlay(id){
    var w=document.createElement('div'); w.id=id;
    w.style.cssText='position:fixed;inset:0;z-index:2147483646;background:rgba(15,23,42,.72);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Tahoma,Arial,sans-serif';
    w.dir=isEN()?'ltr':'rtl';
    return w;
  }
  function closeOn(w){
    function esc_(e){ if(e.key==='Escape'){ kill(); } }
    function kill(){ document.removeEventListener('keydown',esc_); if(w.parentNode) w.parentNode.removeChild(w); }
    document.addEventListener('keydown',esc_);
    w.addEventListener('mousedown',function(e){ if(e.target===w) kill(); });
    return kill;
  }


  /* ================= 1) مرفقات الطلبات: معاينة داخل البرنامج + أرشيف دائم ================= */
  var docCache={};
  function fmtSize(n){ n=Number(n)||0; return n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'; }
  async function getDoc(id){
    if(docCache[id]) return docCache[id];
    var t=window.ARIBA_HR_TOKEN||'';
    if(!UUID.test(t)) throw new Error(T('محتاج تسجيل دخول سحابي','A cloud sign-in is required'));
    var d=await rpc('ariba_get_document',{p_token:t,p_document_id:id});
    var bin=atob(d.base64||''), u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) u[i]=bin.charCodeAt(i);
    var blob=new Blob([u],{type:d.mime_type||'application/octet-stream'});
    docCache[id]={name:d.file_name||'document',mime:d.mime_type||'',size:d.file_size||u.length,blob:blob,url:URL.createObjectURL(blob),bytes:u};
    return docCache[id];
  }
  /* ملفات HTML (النماذج): نحمّلها صفحة كاملة بترميز UTF-8 وبنسخة لغة واحدة (قبل كده كانت بتطلع حروف غريبة ونسختين ورا بعض) */
  function htmlFile(text,en,title){
    var parts=String(text).split('<!--ARIBA_EN-->'), useEn=!!(en&&parts[1]), body=useEn?parts[1]:parts[0];
    if(!/<html[\s>]/i.test(body)) return '<!doctype html><html dir="'+(useEn?'ltr':'rtl')+'" lang="'+(useEn?'en':'ar')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+esc(title||'')+'</title></head><body style="margin:0">'+body+'</body></html>';
    return /charset/i.test(body)?body:body.replace(/<head[^>]*>/i,function(m){ return m+'<meta charset="utf-8">'; });
  }
  function download(d){
    var url=d.url, isHtml=/\.html?$/i.test(d.name||'')||/text\/html/i.test(d.mime||'');
    if(isHtml&&d.bytes){ try{ url=URL.createObjectURL(new Blob([htmlFile(new TextDecoder('utf-8').decode(d.bytes),isEN(),d.name)],{type:'text/html;charset=utf-8'})); }catch(e){ url=d.url; } }
    var a=document.createElement('a'); a.href=url; a.download=d.name; document.body.appendChild(a); a.click(); a.remove(); if(url!==d.url) setTimeout(function(){ URL.revokeObjectURL(url); },3000);
  }
  /* زر "تحميل" الأصلي في أي مكان في البرنامج بيعدّي على نفس الدالة */
  (function(){ var orig=window.aribaDownloadDoc; if(typeof orig==='function'&&orig.__v124) return;
    var g=async function(id){ try{ var d=await getDoc(id); download(d); }catch(e){ if(orig) return orig.apply(this,arguments); notify(T('تعذر تحميل الملف','Could not download the file'),true); } }; g.__v124=1; window.aribaDownloadDoc=g; })();
  /* ===== معاينة كل أنواع الملفات داخل البرنامج (HTML كصفحة حقيقية، Word، Excel، CSV، صور، PDF، فيديو، صوت…) ===== */
  async function inflateRaw(u8){ var ds=new DecompressionStream('deflate-raw'); return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer()); }
  async function unzip(u8){
    var dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength), e=-1, i;
    for(i=u8.length-22;i>=Math.max(0,u8.length-70000);i--){ if(dv.getUint32(i,true)===0x06054b50){ e=i; break; } }
    if(e<0) throw new Error('not a zip');
    var cnt=dv.getUint16(e+10,true), off=dv.getUint32(e+16,true), files={};
    for(var k=0;k<cnt;k++){
      if(dv.getUint32(off,true)!==0x02014b50) break;
      var method=dv.getUint16(off+10,true), csz=dv.getUint32(off+20,true), nl=dv.getUint16(off+28,true), xl=dv.getUint16(off+30,true), cl=dv.getUint16(off+32,true), lo=dv.getUint32(off+42,true);
      var name=new TextDecoder('utf-8').decode(u8.subarray(off+46,off+46+nl));
      var lnl=dv.getUint16(lo+26,true), lxl=dv.getUint16(lo+28,true), start=lo+30+lnl+lxl;
      files[name]={method:method,data:u8.subarray(start,start+csz)};
      off+=46+nl+xl+cl;
    }
    return files;
  }
  async function zipText(files,name){ var f=files[name]; if(!f) return null; var b=f.method===0?f.data:await inflateRaw(f.data); return new TextDecoder('utf-8').decode(b); }
  var NS_W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  function docxHtml(xml){
    var doc=new DOMParser().parseFromString(xml,'application/xml'), body=doc.getElementsByTagNameNS(NS_W,'body')[0]; if(!body) return '';
    function para(p){
      var out='', rtl=false;
      var bd=p.getElementsByTagNameNS(NS_W,'bidi')[0]; if(bd) rtl=true;
      var walk=function(n){ for(var c=n.firstChild;c;c=c.nextSibling){ if(c.nodeType!==1) continue; var ln=c.localName;
        if(ln==='t') out+=esc(c.textContent); else if(ln==='tab') out+='&emsp;'; else if(ln==='br'||ln==='cr') out+='<br>';
        else if(ln==='r'||ln==='hyperlink'||ln==='smartTag'||ln==='sdt'||ln==='sdtContent'||ln==='ins'){ var b=(ln==='r')&&c.getElementsByTagNameNS(NS_W,'b')[0]; if(b) out+='<b>'; walk(c); if(b) out+='</b>'; } } };
      walk(p); if(!out.trim()) return '<p style="margin:4px 0">&nbsp;</p>';
      var h=p.getElementsByTagNameNS(NS_W,'pStyle')[0], sty=h?h.getAttribute('w:val')||'':'';
      var tag=/^Heading|^Title/i.test(sty)?'h3':'p';
      return '<'+tag+' dir="'+(rtl?'rtl':'auto')+'" style="margin:6px 0">'+out+'</'+tag+'>';
    }
    function tbl(t){
      var h='<table style="border-collapse:collapse;width:100%;margin:8px 0">';
      for(var r=t.firstChild;r;r=r.nextSibling){ if(r.nodeType!==1||r.localName!=='tr') continue; h+='<tr>';
        for(var c=r.firstChild;c;c=c.nextSibling){ if(c.nodeType!==1||c.localName!=='tc') continue; var inner=''; for(var q=c.firstChild;q;q=q.nextSibling){ if(q.nodeType===1&&q.localName==='p') inner+=para(q); } h+='<td style="border:1px solid #bbb;padding:4px 6px;vertical-align:top">'+inner+'</td>'; }
        h+='</tr>'; }
      return h+'</table>';
    }
    var html=''; for(var n=body.firstChild;n;n=n.nextSibling){ if(n.nodeType!==1) continue; if(n.localName==='p') html+=para(n); else if(n.localName==='tbl') html+=tbl(n); }
    return html;
  }
  function colIdx(ref){ var m=/^([A-Z]+)/.exec(ref||''), n=0; if(!m) return 0; for(var i=0;i<m[1].length;i++) n=n*26+(m[1].charCodeAt(i)-64); return n-1; }
  async function xlsxHtml(files){
    var NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main', P=function(x){ return new DOMParser().parseFromString(x,'application/xml'); };
    var ss=[], sx=await zipText(files,'xl/sharedStrings.xml');
    if(sx){ var sd=P(sx).getElementsByTagNameNS(NS,'si'); for(var i=0;i<sd.length;i++){ var ts=sd[i].getElementsByTagNameNS(NS,'t'), s=''; for(var j=0;j<ts.length;j++) s+=ts[j].textContent; ss.push(s); } }
    var wb=P(await zipText(files,'xl/workbook.xml')), sheets=wb.getElementsByTagNameNS(NS,'sheet'), rels={}, rx=await zipText(files,'xl/_rels/workbook.xml.rels');
    if(rx){ var rd=P(rx).getElementsByTagName('Relationship'); for(var r=0;r<rd.length;r++) rels[rd[r].getAttribute('Id')]=rd[r].getAttribute('Target'); }
    var html='';
    for(var si=0;si<Math.min(sheets.length,5);si++){
      var sh=sheets[si], rid=sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sh.getAttribute('r:id'), tgt=rels[rid]||('worksheets/sheet'+(si+1)+'.xml'); tgt=tgt.replace(/^\//,'').replace(/^xl\//,'');
      var sxml=await zipText(files,'xl/'+tgt); if(!sxml) continue;
      var rows=P(sxml).getElementsByTagNameNS(NS,'row'), grid=[], maxc=0;
      for(var ri=0;ri<Math.min(rows.length,500);ri++){
        var cells=rows[ri].getElementsByTagNameNS(NS,'c'), line=[];
        for(var ci=0;ci<cells.length;ci++){ var c=cells[ci], t=c.getAttribute('t'), v=c.getElementsByTagNameNS(NS,'v')[0], val='';
          if(t==='s'&&v) val=ss[parseInt(v.textContent)]||''; else if(t==='inlineStr'){ var it=c.getElementsByTagNameNS(NS,'t'); for(var q=0;q<it.length;q++) val+=it[q].textContent; } else if(v) val=v.textContent;
          var idx=colIdx(c.getAttribute('r')); line[idx]=val; if(idx+1>maxc) maxc=idx+1; }
        grid.push(line); }
      html+='<h4 style="margin:10px 0 4px">'+esc(sh.getAttribute('name')||('Sheet'+(si+1)))+'</h4><table style="border-collapse:collapse;font-size:12px">'+grid.map(function(line,ri){ var tds=''; for(var k=0;k<Math.min(maxc,40);k++){ tds+='<'+(ri===0?'th':'td')+' style="border:1px solid #ccc;padding:3px 7px;'+(ri===0?'background:#eef5f2':'')+'">'+esc(line[k]==null?'':line[k])+'</'+(ri===0?'th':'td')+'>'; } return '<tr>'+tds+'</tr>'; }).join('')+'</table>';
    }
    return html;
  }
  function csvTable(txt){
    var rows=[],row=[],cur='',q=false;
    for(var i=0;i<txt.length&&rows.length<1000;i++){ var ch=txt.charAt(i);
      if(q){ if(ch==='"'&&txt.charAt(i+1)==='"'){ cur+='"'; i++; } else if(ch==='"') q=false; else cur+=ch; }
      else if(ch==='"') q=true; else if(ch===','||ch===';'||ch==='\t'){ row.push(cur); cur=''; } else if(ch==='\n'||ch==='\r'){ if(ch==='\r'&&txt.charAt(i+1)==='\n') i++; row.push(cur); rows.push(row); row=[]; cur=''; } else cur+=ch; }
    if(cur!==''||row.length){ row.push(cur); rows.push(row); }
    return '<table style="border-collapse:collapse;font-size:12px">'+rows.map(function(r,ri){ return '<tr>'+r.map(function(c){ return '<'+(ri===0?'th':'td')+' style="border:1px solid #ccc;padding:3px 7px;'+(ri===0?'background:#eef5f2':'')+'">'+esc(c)+'</'+(ri===0?'th':'td')+'>'; }).join('')+'</tr>'; }).join('')+'</table>';
  }
  /* نسخة النموذج حسب لغة البرنامج (النماذج المرسلة بنسختين: عربي + إنجليزي) */
  function pickDocLang(html){ var parts=String(html).split('<!--ARIBA_EN-->'); return (isEN()&&parts[1])?{html:parts[1],en:true}:{html:parts[0],en:false}; }
  async function renderPreview(d,body,w){
    var m=(d.mime||'').toLowerCase(), n=d.name.toLowerCase(), ext=(n.match(/\.([a-z0-9]+)$/)||[])[1]||'';
    var wrap=function(h){ body.style.alignItems='flex-start'; body.style.justifyContent='flex-start'; body.style.background='#fff'; body.innerHTML='<div style="width:100%;color:#111;line-height:1.7;padding:8px 14px;direction:auto">'+h+'</div>'; };
    if(m.indexOf('image/')===0 || /^(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(ext)){ body.innerHTML='<img src="'+d.url+'" style="max-width:100%;max-height:100%;object-fit:contain">'; return; }
    if(m==='application/pdf' || ext==='pdf'){ body.style.padding='0'; body.innerHTML='<iframe src="'+d.url+'" style="width:100%;height:100%;border:0;background:#fff"></iframe>'; return; }
    if(m.indexOf('video/')===0 || /^(mp4|webm|mov|m4v)$/.test(ext)){ body.innerHTML='<video src="'+d.url+'" controls style="max-width:100%;max-height:100%"></video>'; return; }
    if(m.indexOf('audio/')===0 || /^(mp3|wav|m4a|ogg|aac)$/.test(ext)){ body.innerHTML='<audio src="'+d.url+'" controls style="width:90%"></audio>'; return; }
    if(m==='text/html' || m==='application/xhtml+xml' || /^(html?|xhtml)$/.test(ext)){
      var pk=pickDocLang(new TextDecoder('utf-8').decode(d.bytes));
      body.style.padding='0'; body.style.background='#e5e7eb'; body.innerHTML='';
      var fr=document.createElement('iframe'); fr.setAttribute('sandbox','allow-same-origin'); fr.style.cssText='width:100%;height:100%;border:0;background:#fff';
      fr.srcdoc='<!doctype html><html dir="'+(pk.en?'ltr':'rtl')+'"><head><meta charset="utf-8"><style>@media screen{.lh-foot{position:static!important}.body,.doc{padding-bottom:0!important}}</style></head><body style="margin:0">'+pk.html+'</body></html>'; body.appendChild(fr);
      var bar=w.querySelector('#aribaDocBar'); if(bar&&!w.querySelector('#aribaDocPr')){ var pb=document.createElement('button'); pb.id='aribaDocPr'; pb.type='button'; pb.textContent=T('طباعة','Print'); pb.style.cssText='padding:6px 12px;border:1px solid #0a5c9e;background:#0a5c9e;color:#fff;border-radius:7px;cursor:pointer'; pb.onclick=function(){ try{ fr.contentWindow.focus(); fr.contentWindow.print(); }catch(e){ notify(T('تعذرت الطباعة','Print failed'),true); } }; bar.insertBefore(pb,bar.querySelector('#aribaDocDl')); }
      return;
    }
    if(ext==='docx' || ext==='docm' || ext==='dotx'){ var fz=await unzip(d.bytes), dx=await zipText(fz,'word/document.xml'); if(!dx) throw new Error('docx'); wrap(docxHtml(dx)||'<i>'+T('المستند فاضي','Empty document')+'</i>'); return; }
    if(ext==='xlsx' || ext==='xlsm'){ var fx=await unzip(d.bytes); wrap(await xlsxHtml(fx)); return; }
    if(ext==='csv' || ext==='tsv' || m==='text/csv'){ wrap(csvTable(new TextDecoder('utf-8').decode(d.bytes))); return; }
    if(ext==='json' || m==='application/json'){ var jt=new TextDecoder('utf-8').decode(d.bytes); try{ jt=JSON.stringify(JSON.parse(jt),null,2); }catch(e){} wrap('<pre style="white-space:pre-wrap;word-break:break-word;margin:0">'+esc(jt.slice(0,300000))+'</pre>'); return; }
    if(m.indexOf('text/')===0 || /^(txt|xml|md|log|ini|yaml|yml|rtf)$/.test(ext)){ wrap('<pre style="white-space:pre-wrap;word-break:break-word;margin:0;font-family:inherit">'+esc(new TextDecoder('utf-8').decode(d.bytes).slice(0,300000))+'</pre>'); return; }
    body.innerHTML='<div style="text-align:center;line-height:2">'+T('الصيغة دي ('+(ext||m||'?')+') ما تتفتحش داخل البرنامج (ملفات Word/Excel القديمة .doc/.xls، PowerPoint، الأرشيف…).','This format ('+(ext||m||'?')+') cannot be previewed here (legacy .doc/.xls, PowerPoint, archives…).')+'<br>'+T('استخدم زر التحميل لفتحه.','Use Download to open it.')+'</div>';
  }
  window.aribaPreviewDoc=async function(id){
    if(document.getElementById('aribaDocView')) return;
    var w=overlay('aribaDocView'); w.style.padding='10px';
    w.innerHTML='<div style="background:#fff;color:#111;width:min(960px,97vw);height:92vh;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.4)"><div id="aribaDocBar" style="display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #ddd"><b id="aribaDocT" style="flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">…</b><button id="aribaDocDl" type="button" style="padding:6px 12px;border:1px solid #0f766e;background:#0f766e;color:#fff;border-radius:7px;cursor:pointer;display:none">'+T('تحميل','Download')+'</button><button id="aribaDocX" type="button" style="padding:6px 12px;border:1px solid #ccc;background:#f3f4f6;border-radius:7px;cursor:pointer">'+T('إغلاق','Close')+'</button></div><div id="aribaDocB" style="flex:1;overflow:auto;display:flex;align-items:center;justify-content:center;background:#f3f4f6;padding:8px;font-size:13px;color:#555">'+T('جاري التحميل…','Loading…')+'</div></div>';
    document.body.appendChild(w); var kill=closeOn(w); w.querySelector('#aribaDocX').onclick=kill;
    var body=w.querySelector('#aribaDocB');
    try{
      var d=await getDoc(id); w.querySelector('#aribaDocT').textContent=d.name+'  ('+fmtSize(d.size)+')';
      var dl=w.querySelector('#aribaDocDl'); dl.style.display='inline-block'; dl.onclick=function(){ download(d); };
      await renderPreview(d,body,w);
    }catch(e){ body.innerHTML='<div style="color:#b91c1c">'+esc(e.message||e)+'</div>'; }
  };
  /* زر "عرض" جنب أي زر تحميل مرفق موجود في البرنامج */
  function addPreviewButtons(){
    document.querySelectorAll('button[onclick*="aribaDownloadDoc"]').forEach(function(b){
      if(b.getAttribute('data-v117p')==='1') return; b.setAttribute('data-v117p','1');
      var m=(b.getAttribute('onclick')||'').match(/aribaDownloadDoc\(\s*['"]?([0-9a-f-]{36})/i); if(!m) return;
      var p=document.createElement('button'); p.type='button'; p.className=b.className; p.setAttribute('style',(b.getAttribute('style')||'')+';font-weight:700');
      p.textContent=T('عرض','View'); p.onclick=function(ev){ ev.stopPropagation(); window.aribaPreviewDoc(m[1]); };
      b.parentNode.insertBefore(p,b);
    });
  }
  /* أرشيف كل المرفقات (أي حالة: معلق/موافق/مرفوض) — يفضل متاح دايمًا */
  var TYPE_X={forgot_punch:'نسيان بصمة',overtime:'عمل إضافي'}, lastAtt=null;
  function typeLbl(t){ try{ if(typeof LVL==='object'&&LVL[t]) return isEN()?(LVL[t].en||LVL[t].ar):LVL[t].ar; }catch(e){} return isEN()?({forgot_punch:'Forgot punch',overtime:'Overtime'}[t]||t):(TYPE_X[t]||t); }
  function statusLbl(s){ s=String(s||'pending').toLowerCase(); return isEN()?({pending:'Pending',approved:'Approved',rejected:'Rejected'}[s]||s):({pending:'معلق',approved:'موافق',rejected:'مرفوض'}[s]||s); }
  function attArchive(){
    try{
      var lat=document.getElementById('LAT'); if(!lat) return;
      var host=lat.closest('.card'); if(!host||!host.parentNode) return;
      var all=(window.ARIBA_ALL_CLOUD_REQUESTS&&window.ARIBA_ALL_CLOUD_REQUESTS.length)?window.ARIBA_ALL_CLOUD_REQUESTS:(window.ARIBA_WORKFLOW_QUEUE||[]);
      var items=[]; all.forEach(function(x){ (x.attachments||[]).forEach(function(a){ items.push({x:x,a:a}); }); });
      var sig=JSON.stringify(items.map(function(i){ return [i.a.id,i.x.request&&i.x.request.status]; })), mine=document.getElementById('ariba117Atts');
      if(mine && sig===lastAtt) return; if(mine) mine.remove(); lastAtt=sig; if(!items.length) return;
      items.sort(function(p,q){ return String(q.a.created_at||'').localeCompare(String(p.a.created_at||'')); });
      var rows=items.map(function(i){ var r=i.x.request||{}, e=i.x.employee||{}, nm=isEN()?(e.nameEn||e.nameAr||r.employee_id):(e.nameAr||e.nameEn||r.employee_id);
        return '<tr><td>'+esc(String(nm||'').split(' ').slice(0,3).join(' '))+'</td><td>'+esc(typeLbl(r.request_type))+'</td><td>'+esc(statusLbl(r.status))+'</td><td>'+esc(i.a.file_name||'')+'</td><td>'+fmtSize(i.a.file_size)+'</td><td>'+esc(String(i.a.created_at||'').slice(0,10))+'</td><td style="white-space:nowrap"><button type="button" class="btn bpl bsm" data-view="'+esc(i.a.id)+'">'+T('عرض','View')+'</button> <button type="button" class="btn bgr bsm" data-dl="'+esc(i.a.id)+'">'+T('تحميل','Download')+'</button></td></tr>'; }).join('');
      var c=document.createElement('div'); c.className='card'; c.id='ariba117Atts'; c.style.marginTop='12px';
      c.innerHTML='<div class="ct" style="padding:10px 12px"><i class="ti ti-paperclip"></i> '+T('أرشيف مرفقات الطلبات (كل الحالات)','Request attachments archive (all statuses)')+'</div><div class="tw"><table><tr><th>'+T('الموظف','Employee')+'</th><th>'+T('نوع الطلب','Request')+'</th><th>'+T('حالة الطلب','Status')+'</th><th>'+T('الملف','File')+'</th><th>'+T('الحجم','Size')+'</th><th>'+T('التاريخ','Date')+'</th><th></th></tr>'+rows+'</table></div>';
      host.parentNode.insertBefore(c, document.getElementById('ariba116AllCloud')?document.getElementById('ariba116AllCloud').nextSibling:host.nextSibling);
      c.querySelectorAll('[data-view]').forEach(function(b){ b.onclick=function(){ window.aribaPreviewDoc(b.getAttribute('data-view')); }; });
      c.querySelectorAll('[data-dl]').forEach(function(b){ b.onclick=async function(){ try{ download(await getDoc(b.getAttribute('data-dl'))); }catch(e){ notify(e.message||e,true); } }; });
    }catch(e){}
  }
  setInterval(function(){ addPreviewButtons(); attArchive(); },1000);

  /* ================= 2) خطاب تعريف راتب (على نموذج الشركة: تاريخ هجري/ميلادي + رقم صادر بتاريخ اليوم + جدول البيانات + توقيع وختم) ================= */
  function emp(){ return (typeof window.tfRequireEmp71==='function')?window.tfRequireEmp71():null; }
  function X(s){ return (window.tfEsc71||esc)(s); }
  function num(v){ var n=Number(String(v==null?'':v).replace(/,/g,'')); return isFinite(n)?n:0; }
  function money(n){ return n.toLocaleString('en-US',{minimumFractionDigits:(Math.round(n*100)%100?2:0),maximumFractionDigits:2}); }
  function val(id){ var el=document.getElementById(id); return el?el.value:''; }
  function salaryOf(e){
    var b=num(e.salary), h=num(e.housingAllowance), t=num(e.transportAllowance), o=num(e.otherAllowance);
    if(!b&&!h&&!t&&!o&&num(e.salaryTotal)) b=num(e.salaryTotal);
    return {basic:b,housing:h,transport:t,other:o};
  }
  function acctFromIban(iban){ var s=String(iban||'').replace(/\s+/g,''); return /^SA\d{22}$/i.test(s)?s.slice(6):''; }
  function p2(n){ return (n<10?'0':'')+n; }
  /* تاريخ اليوم بتوقيت الرياض: ميلادي + هجري (أم القرى) */
  function todayInfo(){
    var now=new Date(), g={}, h={};
    new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).forEach(function(p){ g[p.type]=p.value; });
    new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn',{timeZone:'Asia/Riyadh',day:'numeric',month:'numeric',year:'numeric'}).formatToParts(now).forEach(function(p){ h[p.type]=p.value; });
    return {gd:g.day,gm:g.month,gy:g.year,hd:p2(+h.day),hm:p2(+h.month),hy:h.year,ymd:g.year+g.month+g.day,iso:g.year+'-'+g.month+'-'+g.day};
  }
  function dmy(iso){ var s=String(iso||'').slice(0,10).split('-'); return s.length===3&&s[0]?(s[2]+'/'+s[1]+'/'+s[0]):''; }
  /* رقم الصادر: AR-تاريخ اليوم-تسلسل اليوم (بيزيد مع كل خطاب يتطبع أو يتبعت) */
  function seqKey(){ return 'ariba_sc_seq_'+todayInfo().ymd; }
  function nextRef(offset){ var n=0; try{ n=parseInt(localStorage.getItem(seqKey()))||0; }catch(e){} return 'AR-'+todayInfo().ymd+'-'+(n+1+(offset||0)); }
  function consumeRef(){ try{ localStorage.setItem(seqKey(),String((parseInt(localStorage.getItem(seqKey()))||0)+1)); }catch(e){} var r=document.getElementById('SC_REF'); if(r) r.value=nextRef(); }
  var PLC='ariba_sc_place_';
  function placeOf(e){ try{ return e.idIssuePlace||e.iqamaPlace||e.issuePlace||localStorage.getItem(PLC+e.id)||''; }catch(x){ return ''; } }
  function tEn(x){ if(!x) return ''; var r=(window.ARIBA_TR?window.ARIBA_TR(x):x); return /[\u0600-\u06FF]/.test(r)?'':r; }

  /* بيانات الخطاب: من الكارت (اختيار موظف واحد) أو من ملف كل موظف (إرسال لمجموعة) */
  function scData(useEmp){
    var e=emp(); if(!e) return null;
    var d={e:e}, g=function(id){ return String(val(id)||'').trim(); };
    if(useEmp){
      var s=salaryOf(e);
      d.nameAr=e.nameAr||'';  d.nameEn=e.nameEn||tEn(e.nameAr); d.empNo=String(e.empNo||''); d.join=e.contractJoin||e.join||e.joinDate||'';
      d.natAr=e.nationality||e.nat||''; d.natEn=tEn(d.natAr); d.jobAr=e.jobTitle||e.job||''; d.jobEn=tEn(d.jobAr); d.id=String(e.iqamaNo||e.iqama||'');
      d.placeAr=placeOf(e); d.placeEn=tEn(d.placeAr); d.basic=s.basic; d.housing=s.housing; d.transport=s.transport; d.other=s.other;
      d.iban=e.iban||''; d.bank=e.bank||''; d.acct=acctFromIban(e.iban); d.ref=nextRef(useEmp.offset||0);
      d.bankOn=document.getElementById('SC_BANK_ON')?!!document.getElementById('SC_BANK_ON').checked:false;
      d.toAr=g('SC_TO'); d.toEn=g('SC_TO_EN')||d.toAr;
    } else {
      d.nameAr=g('SC_NAME'); d.nameEn=g('SC_NAME_EN'); d.empNo=g('SC_EMPNO'); d.join=g('SC_JOIN');
      d.natAr=g('SC_NAT'); d.natEn=g('SC_NAT_EN')||tEn(d.natAr); d.jobAr=g('SC_JOB'); d.jobEn=g('SC_JOB_EN')||tEn(d.jobAr); d.id=g('SC_ID');
      d.placeAr=g('SC_PLACE'); d.placeEn=g('SC_PLACE_EN')||tEn(d.placeAr);
      d.basic=num(val('SC_BASIC')); d.housing=num(val('SC_HOUS')); d.transport=num(val('SC_TRAN')); d.other=num(val('SC_OTH'));
      d.iban=g('SC_IBAN'); d.bank=g('SC_BANK'); d.acct=g('SC_ACCT'); d.ref=g('SC_REF')||nextRef(); d.bankOn=!!(document.getElementById('SC_BANK_ON')||{}).checked;
      d.toAr=g('SC_TO'); d.toEn=g('SC_TO_EN')||d.toAr;
    }
    d.seal=document.getElementById('SC_SEAL')?!!document.getElementById('SC_SEAL').checked:true;
    d.total=d.basic+d.housing+d.transport+d.other;
    if(!d.nameEn&&d.nameAr) d.nameEn=tEn(d.nameAr);
    return d;
  }
  /* الحقول الناقصة (لغة الخطاب) */
  function missing(lang,d,useEmp){
    var en=lang==='en', m=[];
    var chk=function(ok,ar,eng,id){ if(!ok) m.push({id:id,label:en?eng:ar}); };
    chk(d.toAr,'الجهة الموجه إليها الخطاب','Addressed to','SC_TO');
    chk(en?d.nameEn:d.nameAr,en?'اسم الموظف بالإنجليزي':'اسم الموظف','Employee name (English)','SC_'+(en?'NAME_EN':'NAME'));
    chk(d.empNo,'الرقم الوظيفي','Employee no.','SC_EMPNO'); chk(d.join,'تاريخ التعيين','Hire date','SC_JOIN');
    chk(en?d.natEn:d.natAr,'الجنسية','Nationality','SC_'+(en?'NAT_EN':'NAT')); chk(en?d.jobEn:d.jobAr,'المسمى الوظيفي','Job title','SC_'+(en?'JOB_EN':'JOB'));
    chk(d.id,'رقم الهوية / الإقامة','ID / Iqama no.','SC_ID'); chk(en?d.placeEn:d.placeAr,'مكان الإصدار','Place of issue','SC_'+(en?'PLACE_EN':'PLACE'));
    chk(d.total>0,'الراتب (الأساسي على الأقل)','Salary (basic at least)','SC_BASIC');
    if(d.bankOn){ chk(d.iban,'IBAN','IBAN','SC_IBAN'); }
    return m;
  }
  var SC_CSS='<style>.sc-ref{font-size:12.5px;line-height:1.9;margin:0 0 4mm}.sc-t{width:100%;border-collapse:collapse;border:2px solid #111;margin:3.5mm 0;table-layout:fixed}.sc-t td{border:1px solid #222;padding:5px 6px;font-size:12px;text-align:center;vertical-align:middle;height:9mm;word-break:break-word}.sc-l{background:#014D3D;color:#fff;font-weight:800}.sc-s{background:#29B35E;color:#fff;font-weight:800}.sc-v{font-weight:700;color:#111}.sc-sig{position:relative;height:46mm;margin-top:3mm;text-align:center}.sc-sig .t{font-weight:800;font-size:13px}.sc-sig .n{position:absolute;bottom:0;left:0;right:0;font-weight:800;font-size:13px}.sc-sig img.st{position:absolute;width:34mm;left:50%;margin-left:-6mm;top:6mm;opacity:.95}.sc-sig img.sg{position:absolute;width:38mm;left:50%;margin-left:-38mm;top:16mm;mix-blend-mode:multiply}</style>';
  function scHtml(lang,d){
    var en=lang==='en', dir=en?'ltr':'rtl', al=en?'left':'right', t=todayInfo(), cur=en?'SAR':'ر.س';
    var X1=function(s){ return X(s==null||s===''?'\u2014':s); };
    var P=function(h,ex){ return '<p class="tf-p" dir="'+dir+'" style="text-align:'+(ex||'justify')+';margin:0 0 3mm">'+h+'</p>'; };
    var nm=en?d.nameEn:d.nameAr, nat=en?d.natEn:d.natAr, job=en?d.jobEn:d.jobAr, place=en?d.placeEn:d.placeAr, to=en?d.toEn:d.toAr, signer=en?d.signerEn:d.signerAr;
    var amt=function(n){ return money(n)+' '+cur; };
    var L=en?{name:'Name',no:'Employee No.',hire:'Hire date',job:'Job title',nat:'Nationality',id:'ID / Iqama No.',place:'Place of issue',sal:'Salary',basic:'Basic',hous:'Housing',tran:'Transport',oth:'Other allowances',tot:'Total'}
            :{name:'الاســـــم',no:'الرقم الوظيفــي',hire:'تاريخ التعييـــن',job:'المسمى الوظيفي',nat:'الجنسيــــــة',id:'الهويـــــــــة',place:'مكـــان الإصـــدار',sal:'الراتب',basic:'الأساسي',hous:'السكن',tran:'المواصلات',oth:'بدلات أخرى',tot:'الإجمالي'};
    var cg='<colgroup><col style="width:19.1%"><col style="width:25%"><col style="width:22.1%"><col style="width:15%"><col style="width:18.8%"></colgroup>';
    var lab=function(x,cls,extra){ return '<td class="'+(cls||'sc-l')+'"'+(extra||'')+'>'+x+'</td>'; };
    var vv=function(x,extra){ return '<td class="sc-v"'+(extra||'')+'>'+X1(x)+'</td>'; };
    var table='<table class="sc-t" dir="'+dir+'">'+cg+
      '<tr>'+lab(L.name)+vv(nm,' colspan="4"')+'</tr>'+
      '<tr>'+lab(L.no)+vv(d.empNo)+lab(L.hire)+vv(dmy(d.join),' colspan="2"')+'</tr>'+
      '<tr>'+lab(L.nat)+vv(nat)+lab(L.job)+vv(job,' colspan="2"')+'</tr>'+
      '<tr>'+lab(L.id,'sc-l',' rowspan="2"')+vv(d.id,' rowspan="2"')+lab(L.sal,'sc-l',' rowspan="5"')+lab(L.basic,'sc-s')+vv(amt(d.basic))+'</tr>'+
      '<tr>'+lab(L.hous,'sc-s')+vv(amt(d.housing))+'</tr>'+
      '<tr>'+lab(L.place,'sc-l',' rowspan="3"')+vv(place,' rowspan="3"')+lab(L.tran,'sc-s')+vv(amt(d.transport))+'</tr>'+
      '<tr>'+lab(L.oth,'sc-s')+vv(amt(d.other))+'</tr>'+
      '<tr>'+lab(L.tot,'sc-s')+'<td class="sc-v" style="font-weight:900">'+X(amt(d.total))+'</td></tr></table>';
    var bank='';
    if(d.bankOn&&(d.iban||d.bank||d.acct)){ bank='<div class="tf-box" dir="'+dir+'" style="text-align:'+al+'">'+(d.bank?'<div><b>'+(en?'Bank name':'اسم البنك')+':</b> '+X(en?(tEn(d.bank)||d.bank):d.bank)+'</div>':'')+(d.acct?'<div><b>'+(en?'Account number':'رقم الحساب')+':</b> <span dir="ltr">'+X(d.acct)+'</span></div>':'')+(d.iban?'<div><b>IBAN:</b> <span dir="ltr">'+X(d.iban)+'</span></div>':'')+'</div>'; }
    var ref=en
      ? '<div class="sc-ref" dir="ltr" style="text-align:left"><div><b>Date:</b> '+t.hd+' / '+t.hm+' / '+t.hy+' AH &nbsp;&nbsp; <b>Corresponding to:</b> '+t.gd+' / '+t.gm+' / '+t.gy+'</div><div><b>Ref:</b> '+X(d.ref)+'</div></div>'
      : '<div class="sc-ref" dir="rtl" style="text-align:right"><div><b>التاريــخ :</b> '+t.hd+' / '+t.hm+' / '+t.hy+'هـ</div><div><b>الموافق:</b> '+t.gd+' / '+t.gm+' / '+t.gy+'م</div><div><b>الصـــادر:</b> <span dir="ltr">'+X(d.ref)+'</span></div></div>';
    var sig=window.ARIBA_HRSIG?window.ARIBA_HRSIG.html(lang,{mt:3,h:36,noImg:!d.seal}):'';
    var body=SC_CSS+ref+
      P('<b>'+(en?'Messrs. ':'السادة/ ')+X(to)+(en?'':' &nbsp;المحترمين')+'</b>','start')+
      P(en?'Greetings and peace be upon you...':'السلام عليكم ورحمة الله وبركاته...','start')+
      P(en?'We, Ariba Business Solutions Company, hereby confirm that the employee whose details are below is employed with us up to the date of this letter:'
          :'نفيدكم نحن شركة حلول أريبا لخدمات الأعمال بأن الموظف الآتي بياناته يعمل لدينا حتى تاريخه:')+
      table+bank+
      P(en?'This certificate was issued at his/her request without any liability on the Company.':'وقد أعطي هذا التعريف بناءً على طلبه دون أدنى مسؤولية على الشركة.')+
      P(en?'With our best regards...':'وتفضلوا بقبول فائق الشكر والتقدير...','center')+sig;
    var html=window.tfWrap71('','',body).replace('<div class="doc-title"></div>','');
    return {e:d.e,type:'salary_cert',title:en?'Salary Certificate':'تعريف بالراتب',html:html,ref:d.ref};
  }
  var SC_LABEL_FIELDS=['SC_TO','SC_NAME','SC_NAME_EN','SC_EMPNO','SC_JOIN','SC_NAT','SC_NAT_EN','SC_JOB','SC_JOB_EN','SC_ID','SC_PLACE','SC_PLACE_EN','SC_BASIC','SC_IBAN'];
  function flag(list){ SC_LABEL_FIELDS.forEach(function(id){ var el=document.getElementById(id); if(el) el.style.borderColor=''; }); (list||[]).forEach(function(x){ var el=document.getElementById(x.id); if(el){ el.style.borderColor='#dc2626'; if(/_EN$/.test(x.id)){ var dt=el.closest('details'); if(dt) dt.open=true; } } }); }
  function pickLang(){ var s=val('SC_LANG'); return s==='ar'?'ar':s==='en'?'en':(isEN()?'en':'ar'); }
  /* useEmp=false → من الكارت (الاختيار الفردي)، useEmp=true → من ملف الموظف (إرسال جماعي) */
  function sc_build(lang,useEmp,silent){
    var d=scData(useEmp); if(!d) return null;
    var m=missing(lang,d,useEmp);
    if(!useEmp) flag(m);
    sc_build.last=m.map(function(x){ return x.label; }).join('، ');
    if(m.length){ if(!silent) notify((lang==='en'?'Missing / incomplete: ':'بيانات ناقصة: ')+m.map(function(x){ return x.label; }).join('، '),true); return null; }
    var r=scHtml(lang,d); r.useEmp=!!useEmp; return r;
  }
  window.tfPrintSalaryCert=function(){ var b=sc_build(pickLang(),false); if(!b) return; if(typeof window.printHtml==='function'){ window.printHtml(b.title+' \u2014 '+(b.e.nameAr||''),b.html); consumeRef(); } };

  /* ================= 3) إرسال النماذج لمجموعة موظفين ================= */
  var FORMS={
    onboarding:{fn:'tfPrintOnboarding',ar:'مباشرة عمل',en:'Onboarding notice'},
    custody:{fn:'tfPrintCustody',ar:'استلام عهدة تقنية',en:'IT custody receipt'},
    extension:{fn:'tfPrintExtension',ar:'إشعار تمديد فترة التجربة',en:'Probation extension'},
    termination:{fn:'tfPrintTermination',ar:'إشعار إنهاء فترة التجربة',en:'Probation termination'},
    clearance:{fn:'tfPrintClearance',ar:'إخلاء طرف',en:'Final clearance'},
    experience:{fn:'tfPrintExperience',ar:'شهادة خبرة',en:'Experience certificate'},
    contract_end:{fn:'tfPrintContractEnd',ar:'إشعار انتهاء عقد العمل',en:'Contract termination notice'},
    salary_cert:{fn:'tfPrintSalaryCert',ar:'تعريف بالراتب',en:'Salary certificate'}
  };
  function captureFor(key){
    var F=FORMS[key]; if(key==='salary_cert'){ var sb2=sc_build('ar',true,true); if(!sb2) throw new Error(T('بيانات ناقصة: ','Incomplete: ')+(sc_build.last||'')); return sb2; }
    var e=emp(); if(!e) return null; var cap=null, orig=window.printHtml;
    window.printHtml=function(t,h){ cap={e:e,type:key,title:F.ar,html:h}; };
    try{ if(typeof window[F.fn]==='function') window[F.fn](); }catch(x){} finally{ window.printHtml=orig; }
    return cap;
  }
  async function sendDoc(b){
    var t=window.ARIBA_HR_TOKEN||''; var html=b.html;
    try{
      var enb=(b.type==='salary_cert')?sc_build('en',!!b.useEmp,true):(typeof window.ARIBA_FORM_EN_BUILD==='function'?window.ARIBA_FORM_EN_BUILD(b.type,b.e):null);
      if(enb&&enb.html) html=html+'<!--ARIBA_EN-->'+enb.html; else if(b.type==='salary_cert') notify(T('النسخة الإنجليزية ما اتبعتتش لأن بيانات إنجليزية ناقصة (افتح "النسخة الإنجليزية" واملأها)','English copy not attached: English data is incomplete'),true);
    }catch(x){}
    var b64; try{ b64=btoa(unescape(encodeURIComponent(html))); }catch(x){ b64=btoa(html); }
    await rpc('ariba_hr_send_template',{p_token:t,p_employee_id:String(b.e.id),p_emp_no:String(b.e.empNo||b.e.id),p_template_type:b.type,p_title:b.title,p_file_name:b.type+'_'+(b.e.id||'')+'.html',p_mime_type:'text/html',p_base64:b64});
    if(b.type==='salary_cert') consumeRef();
  }
  window.tfSendSalaryCert=async function(ev){
    var btn=ev&&ev.currentTarget; var b=sc_build('ar',false); if(!b) return;
    if(!UUID.test(window.ARIBA_HR_TOKEN||'')){ notify(T('محتاج تسجيل دخول سحابي','A cloud sign-in is required'),true); return; }
    if(!confirm(T('هيتبعت "'+b.title+'" (رقم '+b.ref+') لـ '+(b.e.nameAr||'')+' في تطبيقه. متأكد؟','Send "'+b.title+'" (ref '+b.ref+') to '+(b.e.nameEn||b.e.nameAr||'')+'?'))) return;
    var old=btn?btn.innerHTML:''; if(btn){ btn.disabled=true; btn.textContent='…'; }
    try{ await sendDoc(b); notify('✅ '+T('اتبعت للموظف','Sent to the employee'),false); try{ if(typeof window.tfRefreshStatus==='function') window.tfRefreshStatus(); }catch(x){} }catch(err){ notify('⚠️ '+(err.message||err),true); }
    if(btn){ btn.disabled=false; btn.innerHTML=old; }
  };
  var BULK={sel:{}};
  function bulkEmps(){ return (typeof window.aEmps==='function'?window.aEmps():[]); }
  function ename(e){ return isEN()?(e.nameEn||e.nameAr||e.id):(e.nameAr||e.nameEn||e.id); }
  function bulkList(){
    var box=document.getElementById('A117BList'); if(!box) return;
    var q=(val('A117BQ')||'').trim().toLowerCase(), dep=val('A117BDep'), emps=bulkEmps();
    var dsel=document.getElementById('A117BDep'); if(dsel&&dsel.options.length<=1){ var seen={}; emps.forEach(function(e){ var d=e.dept||e.department; if(d&&!seen[d]){ seen[d]=1; dsel.insertAdjacentHTML('beforeend','<option>'+esc(d)+'</option>'); } }); }
    var list=emps.filter(function(e){ return (!dep||(e.dept||e.department)===dep)&&(!q||(String(e.nameAr||'')+' '+String(e.nameEn||'')+' '+String(e.empNo||'')).toLowerCase().indexOf(q)>=0); });
    box.innerHTML=list.map(function(e){ return '<label style="display:flex;gap:5px;align-items:center;font-size:12px"><input type="checkbox" data-id="'+esc(e.id)+'"'+(BULK.sel[e.id]?' checked':'')+'> '+esc(ename(e))+'</label>'; }).join('');
    box.querySelectorAll('input').forEach(function(cb){ cb.onchange=function(){ BULK.sel[cb.getAttribute('data-id')]=cb.checked; bcount(); }; });
    bcount();
  }
  function bcount(){ var n=Object.keys(BULK.sel).filter(function(k){return BULK.sel[k];}).length, el=document.getElementById('A117BCnt'); if(el) el.textContent=n+' '+T('موظف محدد','selected'); }
  async function bulkSend(){
    var key=val('A117BForm'), ids=Object.keys(BULK.sel).filter(function(k){return BULK.sel[k];});
    if(!ids.length){ notify(T('اختر موظفًا واحدًا على الأقل','Select at least one employee'),true); return; }
    if(!UUID.test(window.ARIBA_HR_TOKEN||'')){ notify(T('محتاج تسجيل دخول سحابي','A cloud sign-in is required'),true); return; }
    var F=FORMS[key]; if(!confirm(T('هيتبعت "'+F.ar+'" لـ '+ids.length+' موظف دفعة واحدة. متأكد؟','Send "'+F.en+'" to '+ids.length+' employees at once?'))) return;
    var sel=document.getElementById('TFE'); if(!sel){ notify(T('اختيار الموظف غير متاح','Employee selector unavailable'),true); return; }
    var keepEmp=sel.value, perEmp=['TF1_JOIN','TF3_JOIN','TF4_JOIN','TF7_JOIN','TF_CE_JOIN'], keepVals={}, st=document.getElementById('A117BStat'), btn=document.getElementById('A117BGo');
    perEmp.forEach(function(id){ var el=document.getElementById(id); if(el){ keepVals[id]=el.value; el.value=''; } });
    btn.disabled=true; var ok=0, fail=[];
    for(var i=0;i<ids.length;i++){
      var e=bulkEmps().find(function(x){ return String(x.id)===String(ids[i]); }); if(!e) continue;
      st.textContent=(i+1)+' / '+ids.length+' — '+ename(e);
      try{
        sel.value=String(e.id); var b=captureFor(key);
        if(!b) throw new Error(T('بيانات النموذج ناقصة','Form data incomplete'));
        b.e=e; await sendDoc(b); ok++;
      }catch(err){ fail.push(ename(e)+': '+(err.message||err)); if(key!=='salary_cert' && /inputs|incomplete|ناقصة|اكتب|حدد|اختر|أضف|enter|set/i.test(String(err.message||''))) break; }
    }
    sel.value=keepEmp; perEmp.forEach(function(id){ var el=document.getElementById(id); if(el&&keepVals[id]!==undefined) el.value=keepVals[id]; });
    btn.disabled=false;
    st.innerHTML='<b style="color:var(--gr)">'+T('تم الإرسال: ','Sent: ')+ok+'</b>'+(fail.length?' — <b style="color:var(--rd)">'+T('فشل: ','Failed: ')+fail.length+'</b><br><span style="font-size:11px">'+esc(fail.join(' | '))+'</span>':'');
    try{ if(typeof window.tfRefreshStatus==='function') window.tfRefreshStatus(); }catch(x){}
  }
  var TYPE_AR2={salary_cert:'تعريف بالراتب',contract_end:'إشعار انتهاء عقد العمل',clearance:'إخلاء طرف',experience:'شهادة خبرة',evaluation:'تقييم فترة التجربة'};
  function ensureForms(){
    try{
      var grid=document.querySelector('#pg-forms > div[style*="grid-template-columns"]'); var pgf=document.getElementById('pg-forms');
      if(pgf && !document.getElementById('A117Bulk')){
        var c=document.createElement('div'); c.className='card'; c.id='A117Bulk'; c.style.cssText='padding:12px;margin-bottom:12px';
        c.innerHTML='<div class="ct" style="margin-bottom:8px"><i class="ti ti-users-group"></i> '+T('إرسال نموذج لعدة موظفين دفعة واحدة','Send a form to several employees at once')+'</div>'
          +'<div style="font-size:11px;color:var(--mu);margin-bottom:8px">'+T('املأ بيانات النموذج المطلوب في كارته بالأسفل (التواريخ مثلًا)، ثم اختر الموظفين هنا. بيانات كل موظف (الاسم، الراتب، تاريخ المباشرة…) بتتاخد من ملفه تلقائيًا.','Fill the form fields in its card below (e.g. dates), then pick employees here. Each employee\'s own data (name, salary, join date…) is taken from his record.')+'</div>'
          +'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"><select id="A117BForm" style="min-width:220px">'+Object.keys(FORMS).map(function(k){ return '<option value="'+k+'">'+FORMS[k][isEN()?'en':'ar']+'</option>'; }).join('')+'</select><input id="A117BQ" placeholder="'+T('بحث','Search')+'"><select id="A117BDep"><option value="">'+T('كل الأقسام','All departments')+'</option></select><button type="button" class="btn bgr bsm" id="A117BAll">'+T('تحديد الظاهر','Select shown')+'</button><button type="button" class="btn bgr bsm" id="A117BNone">'+T('إلغاء الكل','Clear')+'</button><span id="A117BCnt" style="align-self:center;font-weight:700"></span></div>'
          +'<div id="A117BList" style="max-height:170px;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:2px 10px;border:1px solid var(--bd);border-radius:8px;padding:6px"></div>'
          +'<div style="display:flex;gap:8px;align-items:center;margin-top:8px"><button type="button" class="btn bpl bsm" id="A117BGo"><i class="ti ti-send"></i> '+T('إرسال للمحدّدين','Send to selected')+'</button><span id="A117BStat" style="font-size:12px"></span></div>';
        pgf.insertBefore(c,pgf.firstChild);
        document.getElementById('A117BQ').oninput=bulkList; document.getElementById('A117BDep').onchange=bulkList;
        document.getElementById('A117BAll').onclick=function(){ document.querySelectorAll('#A117BList input').forEach(function(cb){ cb.checked=true; BULK.sel[cb.getAttribute('data-id')]=true; }); bcount(); };
        document.getElementById('A117BNone').onclick=function(){ BULK.sel={}; bulkList(); };
        document.getElementById('A117BGo').onclick=bulkSend; bulkList();
      }
      if(grid && !document.getElementById('TF_SC_CARD')){
        var s=document.createElement('div'); s.className='card'; s.id='TF_SC_CARD'; s.style.padding='12px';
        var S='padding:6px;border:1px solid var(--bd);border-radius:6px;background:var(--c2);color:var(--tx);font-size:12px;width:100%;box-sizing:border-box';
        var f=function(l,i,star){ return '<div style="margin-bottom:5px"><label style="font-size:10px;color:var(--mu);font-weight:600;display:block;margin-bottom:2px">'+l+(star?' <span style="color:#dc2626">*</span>':'')+'</label>'+i+'</div>'; };
        var inp=function(id,ex,type){ return '<input id="'+id+'" type="'+(type||'text')+'" style="'+S+(ex||'')+'">'; };
        var g2='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">';
        s.innerHTML='<div class="ct" style="margin-bottom:8px"><i class="ti ti-cash"></i> '+T('خطاب تعريف راتب','Salary certificate letter')+'</div>'
          +'<div id="SC_DATE_LINE" style="font-size:11px;color:var(--mu);margin-bottom:6px"></div>'
          +f(T('السادة / الجهة الموجّه إليها الخطاب','Addressed to (bank / company)'),inp('SC_TO'),true)
          +g2+f(T('رقم الصادر (تلقائي بتاريخ اليوم)','Reference no. (auto, today)'),inp('SC_REF',';direction:ltr'))+f(T('لغة الخطاب','Letter language'),'<select id="SC_LANG" style="'+S+'"><option value="auto">'+T('حسب لغة البرنامج','Same as program language')+'</option><option value="ar">العربية</option><option value="en">English</option></select>')+'</div>'
          +'<div style="font-size:11px;font-weight:700;margin:6px 0 4px;color:var(--mu)">'+T('بيانات الموظف (بتتعبّى من ملفه — الناقص بيتلوّن أحمر وتكتبه)','Employee data (auto-filled — missing items turn red)')+'</div>'
          +g2+f(T('الاسم','Name'),inp('SC_NAME'),true)+f(T('الرقم الوظيفي','Employee no.'),inp('SC_EMPNO'),true)
          +f(T('تاريخ التعيين','Hire date'),inp('SC_JOIN','','date'),true)+f(T('الجنسية','Nationality'),inp('SC_NAT'),true)
          +f(T('المسمى الوظيفي','Job title'),inp('SC_JOB'),true)+f(T('رقم الهوية / الإقامة','ID / Iqama no.'),inp('SC_ID',';direction:ltr'),true)
          +f(T('مكان الإصدار','Place of issue'),inp('SC_PLACE'),true)+f(T('الإجمالي (محسوب)','Total (calculated)'),inp('SC_TOTAL',';font-weight:800;background:#eef5f2'))+'</div>'
          +'<div style="font-size:11px;font-weight:700;margin:6px 0 4px;color:var(--mu)">'+T('الراتب (ر.س)','Salary (SAR)')+'</div>'
          +g2+f(T('الأساسي','Basic'),inp('SC_BASIC','','number'),true)+f(T('السكن','Housing'),inp('SC_HOUS','','number'))+f(T('المواصلات','Transportation'),inp('SC_TRAN','','number'))+f(T('بدلات أخرى','Other allowances'),inp('SC_OTH','','number'))+'</div>'
          +'<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin:6px 0"><input type="checkbox" id="SC_BANK_ON"> '+T('إدراج بيانات الحساب البنكي (IBAN) في الخطاب','Include bank account details (IBAN) in the letter')+'</label>'
          +'<div id="SC_BANK_BOX" style="display:none">'+f(T('اسم البنك','Bank name'),inp('SC_BANK'))+g2+f('IBAN',inp('SC_IBAN',';direction:ltr'))+f(T('رقم الحساب','Account number'),inp('SC_ACCT',';direction:ltr'))+'</div></div>'
          +'<label style="display:flex;gap:6px;align-items:center;font-size:12px;margin:2px 0 6px"><input type="checkbox" id="SC_SEAL" checked> '+T('إدراج التوقيع وختم الشركة (من الإعدادات)','Include signature and company stamp (from Settings)')+'</label>'
          +'<details style="margin-bottom:6px"><summary style="cursor:pointer;font-size:11.5px;font-weight:700">'+T('النسخة الإنجليزية (تلقائي — عدّل لو محتاج)','English version (auto — edit if needed)')+'</summary>'
          +f('Addressed to',inp('SC_TO_EN',';direction:ltr'))+g2+f('Name',inp('SC_NAME_EN',';direction:ltr'))+f('Nationality',inp('SC_NAT_EN',';direction:ltr'))+f('Job title',inp('SC_JOB_EN',';direction:ltr'))+f('Place of issue',inp('SC_PLACE_EN',';direction:ltr'))+'</div>'+'</details>'
          +'<button class="btn bgr bsm" onclick="tfPrintSalaryCert()"><i class="ti ti-printer"></i> '+T('طباعة خطاب تعريف الراتب','Print salary certificate')+'</button>'
          +'<button class="btn bsm" style="background:#0a5c9e;color:#fff;margin-top:6px;width:100%" id="TF_SC_SEND"><i class="ti ti-send"></i> '+T('إرسال للموظف','Send to employee')+'</button>';
        grid.appendChild(s); s.querySelector('#TF_SC_SEND').onclick=window.tfSendSalaryCert;
        var $=function(id){ return document.getElementById(id); };
        function emp0(){ var id=($('TFE')||{}).value; return bulkEmps().find(function(x){ return String(x.id)===String(id); }); }
        function total(){ var t=num($('SC_BASIC').value)+num($('SC_HOUS').value)+num($('SC_TRAN').value)+num($('SC_OTH').value); $('SC_TOTAL').value=t?money(t):''; $('SC_TOTAL').readOnly=true; }
        function fill(){
          var e=emp0(); $('SC_REF').value=nextRef();
          if(!e){ ['SC_NAME','SC_NAME_EN','SC_EMPNO','SC_JOIN','SC_NAT','SC_NAT_EN','SC_JOB','SC_JOB_EN','SC_ID','SC_PLACE','SC_PLACE_EN','SC_BASIC','SC_HOUS','SC_TRAN','SC_OTH','SC_BANK','SC_IBAN','SC_ACCT'].forEach(function(i){ if($(i)) $(i).value=''; }); total(); flag([]); return; }
          var sal=salaryOf(e), put=function(id,v){ $(id).value=(v==null?'':v); };
          put('SC_NAME',e.nameAr||''); put('SC_NAME_EN',e.nameEn||tEn(e.nameAr)); put('SC_EMPNO',e.empNo||''); put('SC_JOIN',String(e.contractJoin||e.join||e.joinDate||'').slice(0,10));
          put('SC_NAT',e.nationality||e.nat||''); put('SC_NAT_EN',tEn(e.nationality||e.nat||'')); put('SC_JOB',e.jobTitle||e.job||''); put('SC_JOB_EN',tEn(e.jobTitle||e.job||''));
          put('SC_ID',e.iqamaNo||e.iqama||''); put('SC_PLACE',placeOf(e)); put('SC_PLACE_EN',tEn(placeOf(e)));
          put('SC_BASIC',sal.basic||''); put('SC_HOUS',sal.housing||''); put('SC_TRAN',sal.transport||''); put('SC_OTH',sal.other||'');
          put('SC_BANK',e.bank||''); put('SC_IBAN',e.iban||''); put('SC_ACCT',acctFromIban(e.iban));
          total(); var d=scData(false); if(d) flag(missing(pickLang(),d,false));
        }
        ['SC_BASIC','SC_HOUS','SC_TRAN','SC_OTH'].forEach(function(i){ $(i).addEventListener('input',total); });
        $('SC_IBAN').addEventListener('input',function(){ var a=acctFromIban(this.value); if(a) $('SC_ACCT').value=a; });
        $('SC_BANK_ON').addEventListener('change',function(){ $('SC_BANK_BOX').style.display=this.checked?'block':'none'; });
        $('SC_PLACE').addEventListener('change',function(){ var e=emp0(); if(e){ try{ localStorage.setItem(PLC+e.id,this.value.trim()); }catch(x){} } if(!$('SC_PLACE_EN').value||/[\u0600-\u06FF]/.test($('SC_PLACE_EN').value)) $('SC_PLACE_EN').value=tEn(this.value); });
        $('SC_NAME').addEventListener('change',function(){ if(!$('SC_NAME_EN').value) $('SC_NAME_EN').value=tEn(this.value); });
        $('SC_LANG').addEventListener('change',function(){ var d=scData(false); if(d) flag(missing(pickLang(),d,false)); });
        var tfe=$('TFE'); if(tfe) tfe.addEventListener('change',fill); if(tfe&&tfe.value) fill(); else { $('SC_REF').value=nextRef(); total(); }
      }
      var dl=document.getElementById('SC_DATE_LINE'); if(dl){ var ti=todayInfo(); dl.textContent=T('تاريخ الإصدار (اليوم): ','Issue date (today): ')+ti.gd+'/'+ti.gm+'/'+ti.gy+' — '+ti.hd+'/'+ti.hm+'/'+ti.hy+T('هـ',' AH'); }
      var sb=document.getElementById('TF_STATUS_BOX');
      if(sb) sb.querySelectorAll('td').forEach(function(td){ var k=td.textContent.trim(); if(TYPE_AR2[k]) td.textContent=TYPE_AR2[k]; });
    }catch(e){}
  }
  setInterval(ensureForms,1000); setTimeout(ensureForms,300);
})();
