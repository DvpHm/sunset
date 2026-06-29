var STAGES=['접수','입금확인','러프','러프컨펌','선화','채색','완성','전달완료'];
var lis=[{n:'기본',p:100000}];
function won(n){return Number(n||0).toLocaleString('en-US');}
function loadCommList(){
  var raw;try{raw=JSON.parse(localStorage.getItem('ss_dash_v1')||'[]');}catch(e){raw=[];}
  var C=Array.isArray(raw)?raw:(raw.commissions||[]);
  var sel=document.getElementById('commPick');
  C.forEach(function(c,i){var o=document.createElement('option');o.value=i;o.textContent=(c.client||'무명')+' · '+(c.type||'')+(c.amount?' ('+won(c.amount)+'원)':'');sel.appendChild(o);});
  window._C=C;
}
function loadComm(){
  var i=document.getElementById('commPick').value;
  if(i===''){return;}
  var c=window._C[parseInt(i)];if(!c)return;
  document.getElementById('qClient').value=c.client||'';
  document.getElementById('qType').value=c.type||'리깅 의뢰';
  // parse line items from note/memo if available, else single amount
  lis=[];
  var note=c.note||'';
  // note format from parser: "기본 일러스트: X / 추가: Y ..."
  if(note && note.indexOf('/')>=0){
    note.split('/').forEach(function(part){var t=part.trim();if(t)lis.push({n:t.replace(/^[^:]*:\s*/,'').slice(0,60),p:0});});
  }
  if(c.amount){ if(lis.length){lis[0].p=parseInt(c.amount);} else {lis.push({n:c.type||'일러스트',p:parseInt(c.amount)});} }
  if(!lis.length)lis=[{n:'일러스트',p:0}];
  document.getElementById('qNote').value=c.email&&c.email!=='디스코드'?('파일 수령: '+c.email):'';
  renderLi();render();
}
function renderLi(){
  var h='';
  lis.forEach(function(l,i){
    h+='<div class="li-row"><input value="'+(l.n||'').replace(/"/g,'&quot;')+'" oninput="lis['+i+'].n=this.value;render()" placeholder="항목명"><input type="number" value="'+(l.p||0)+'" oninput="lis['+i+'].p=parseInt(this.value)||0;render()" placeholder="0" style="text-align:right;font-family:var(--mono)"><button class="mini mini-del" onclick="lis.splice('+i+',1);renderLi();render()">×</button></div>';
  });
  document.getElementById('liBox').innerHTML=h;
}
function addLi(){lis.push({n:'',p:0});renderLi();render();}

function render(){
  var cv = document.getElementById('cv'), x = cv.getContext('2d');
  var W = 920, pad = 100;
  var H = 320 + lis.length * 60 + (document.getElementById('qNote').value ? 120 : 60) + 120;
  cv.width = W;
  cv.height = H;

  /* ==========================
     Color
  ========================== */
  var C = {
    black: "#111111",
    orange: "#E8650A",
    dark: "#222222",
    text: "#333333",
    gray: "#666666",
    light: "#999999",
    line: "#e8e8e8",
    bg: "#f5f5f5",
    white: "#ffffff",
    sub: "#C4A882",
  };

  /* ==========================
     Background
  ========================== */
  x.fillStyle = C.white;
  x.fillRect(0, 0, W, H);

  /* Top Bar */
  x.fillStyle = C.orange;
  x.fillRect(0, 10, W, 8);

  /* ==========================
     Header
  ========================== */
  x.fillStyle = C.orange;
  x.font = '900 46px "Bebas Neue",sans-serif';
  x.fillText("SUNSET", pad, 82);

  x.fillStyle = C.sub;
  x.font = '600 20px "Noto Sans KR",sans-serif';
  x.fillText("ESTIMATE", pad, 110);

  var today = new Date();
  var ds = today.getFullYear() + "." + ("0" + (today.getMonth() + 1)).slice(-2) + "." + ("0" + today.getDate()).slice(-2);

  x.textAlign = "right";
  x.fillStyle = C.light;
  x.font = '500 20px "DM Mono",monospace';
  x.fillText(ds, W - pad, 90);
  x.textAlign = "left";

  /* Divider */
  x.strokeStyle = C.line;
  x.lineWidth = 2;

  x.beginPath();
  x.moveTo(pad, 130);
  x.lineTo(W - pad, 130);
  x.stroke();

  /* ==========================
     Client
  ========================== */

  var y = 170;
  x.fillStyle = C.gray;
  x.font = '700 18px "Noto Sans KR",sans-serif';
  x.fillText("받는 분", pad + 10, y);

  x.fillStyle = C.black;
  x.font = '700 20px "Noto Sans KR",sans-serif';
  x.fillText(document.getElementById("qClient").value || "—", pad + 120, y);

  y += 34;

  x.fillStyle = C.gray;
  x.font = '700 18px "Noto Sans KR",sans-serif';
  x.fillText("의뢰 내용", pad + 10, y);

  x.fillStyle = C.black;
  x.font = '600 20px "Noto Sans KR",sans-serif';
  x.fillText(document.getElementById("qType").value || "—", pad + 120, y);

  y += 60;

  /* ==========================
     Table Header
  ========================== */

  x.fillStyle = C.bg;
  x.fillRect(pad, y - 22, W - pad * 2, 40);

  x.fillStyle = C.black;
  x.font = '700 18px "Noto Sans KR",sans-serif';
  x.fillText("항목", pad + 14, y+5);

  x.textAlign = "right";
  x.fillText("금액", W - pad - 14, y+5);
  x.textAlign = "left";

  y += 55;

  /* ==========================
     Items
  ========================== */

  var total = 0;

  lis.forEach(function (l) {
    x.fillStyle = C.text;
    x.font = '500 18px "Noto Sans KR",sans-serif';

    var name = l.n || "—";
    if (name.length > 34) {name = name.slice(0, 33) + "…";}
    x.fillText("• " + name, pad + 10, y);
    x.textAlign = "right";
    x.fillStyle = C.black;
    x.font = '700 18px "Noto Sans KR",sans-serif';
    x.fillText(won(l.p) + "원", W - pad - 12, y);
    x.textAlign = "left";
    total += Number(l.p || 0);
    y += 24;
    x.strokeStyle = C.line;
    x.beginPath();
    x.moveTo(pad, y);
    x.lineTo(W - pad, y);
    x.stroke();
    y += 30;
  });

  /* ==========================
     Total
  ========================== */
  y += 8;
  x.fillStyle = C.orange;
  x.fillRect(pad, y - 28, W - pad * 2, 50);
  x.fillStyle = C.white;
  x.font = '700 22px "Noto Sans KR",sans-serif';
  x.fillText("합계 금액", pad + 18, y + 3);
  x.textAlign = "right";
  x.font = '800 22px "Noto Sans KR",sans-serif';
  x.fillText(won(total) + "원", W - pad - 18, y + 5);
  x.textAlign = "left";
  y += 72;

  /* ==========================
     Note
  ========================== */
  var note = document.getElementById("qNote").value;
  if (note) {
    x.fillStyle = C.black;
    x.font = '700 18px "Noto Sans KR",sans-serif';
    x.fillText("비고", pad, y);
    y += 24;
    x.fillStyle = C.gray;
    x.font = '500 18px "Noto Sans KR",sans-serif';
    note.split("\n").forEach(function (line) {
      x.fillText(line.slice(0, 46), pad, y);
      y += 20;
    });
    y += 10;
  }

  /* ==========================
     Footer
  ========================== */
  x.strokeStyle = C.line;
  x.beginPath();
  x.moveTo(pad, H - 62);
  x.lineTo(W - pad, H - 62);
  x.stroke();

  x.fillStyle = C.light;
  x.font = '500 13px "Noto Sans KR",sans-serif';
  x.fillText("본 견적서는 참고용이며 옵션 협의에 따라 금액이 변경될 수 있습니다.", pad, H - 36);

  x.textAlign = "right";
  x.fillStyle = C.black;
  x.font = '700 13px "DM Mono",monospace';
  x.fillText("선셋", W - pad, H - 36);
  x.textAlign = "left";
}
function download(){
  render();
  var cv=document.getElementById('cv');
  var name='선셋_견적서_'+(document.getElementById('qClient').value||'견적');
  var fmt=(document.getElementById('qFmt')||{}).value||'png';
  if(fmt==='pdf'){
    if(!window.jspdf||!window.jspdf.jsPDF){ alert('PDF 모듈 로딩 중이에요. 잠시 후 다시 시도해주세요.'); return; }
    var img = cv.toDataURL("image/png", 1.0);
    var pdf = new window.jspdf.jsPDF({orientation:'portrait', unit:'mm', format:'a4'});

    // 이미지 크기 정보를 구함
    var image_prop = pdf.getImageProperties(img);
    // console.log("image width/height = " + image_prop.width + ", " + image_prop.height);

    // PDF 문서 페이지 크기 정보
    // console.log("pdf page width/height = " + pdf.internal.pageSize.getWidth() + ", " + pdf.internal.pageSize.getHeight());

    // 이미지 크기를 그대로 처리 예시 (1px = 0.2645833333 mm)
    // var pdf_image_width = image_prop.width * 0.2645833333;
    // var pdf_image_height = image_prop.height * 0.2645833333;

    // 이미지 너비를 페이지 크기에 맞춤 처리 예시
    var pdf_image_width = pdf.internal.pageSize.getWidth() - 10;
    var pdf_image_height = (image_prop.height * pdf_image_width) / image_prop.width;

    pdf.addImage(img, "PNG", 5, 0, pdf_image_width, pdf_image_height);
    pdf.save(name+'.pdf');
    return;
  }
  cv.toBlob(function(b){
    var a=document.createElement('a');a.href=URL.createObjectURL(b);
    a.download=name+'.png';
    a.click();setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
  });
}
loadCommList();renderLi();
// wait for fonts then render
if(document.fonts&&document.fonts.ready){document.fonts.ready.then(render);}
setTimeout(render,400);
