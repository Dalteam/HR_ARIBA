

function printLvTable(){
  // شوف أي جدول نشط
  var tableId = null;
  var titleText = '';
  if(document.getElementById('lv2').style.display!=='none'){
    tableId='LAT'; titleText='كشف الإجازات';
  } else if(document.getElementById('lv4').style.display!=='none'){
    tableId='LBT'; titleText='أرصدة الإجازات';
  } else if(document.getElementById('lv1').style.display!=='none'){
    tableId=null; // معلقة - مختلفة
    printSection('LVP','طلبات الإجازة المعلقة');
    return;
  }
  if(!tableId) return;
  var tbl = document.getElementById(tableId);
  if(!tbl) return;
  var win = window.open('','_blank');
  win.document.write('<html><head><title>'+titleText+'</title><style>');
  win.document.write('body{font-family:"ARIBA Two",Segoe UI,Tahoma,Arial,sans-serif;direction:rtl;background:#fff;color:#000;margin:20px}');
  win.document.write('h2{color:#014D3D;border-bottom:2px solid #014D3D;padding-bottom:8px;margin-bottom:16px}');
  win.document.write('.print-meta{font-size:12px;color:#666;margin-bottom:16px}');
  win.document.write('table{width:100%;border-collapse:collapse;font-size:12px}');
  win.document.write('thead tr{background:#014D3D;color:#fff}');
  win.document.write('th,td{padding:7px 10px;border:1px solid #ddd;text-align:right}');
  win.document.write('tbody tr:nth-child(even){background:#F4F0E4}');
  win.document.write('tbody tr:hover{background:#dbeafe}');
  win.document.write('.b{display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px}');
  win.document.write('.bg{background:#d1fae5;color:#065f46}.br{background:#fee2e2;color:#991b1b}.ba{background:#fef3c7;color:#92400e}.bb{background:#dbeafe;color:#014D3D}');
  win.document.write('@media print{body{margin:10px}.no-print{display:none}}');
  win.document.write('</style></head><body>');
  win.document.write('<div class="no-print" style="margin-bottom:12px"><button onclick="window.print()" style="background:#014D3D;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;font-size:14px">🖨️ طباعة</button></div>');
  win.document.write('<h2>'+titleText+' — شركة اريبا لخدمات الأعمال</h2>');
  win.document.write('<div class="print-meta">تاريخ الطباعة: '+new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn',{weekday:'long',year:'numeric',month:'long',day:'numeric'})+'</div>');
  win.document.write(tbl.outerHTML);
  // AI panel is part of the main document; do not inject it into the print window.
  win.document.close();
  setTimeout(function(){win.focus();},300);
}

