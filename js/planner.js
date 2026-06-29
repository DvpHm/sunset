/* ════════ 데이터 ════════ */
var PKEY='ss_planner_v1', DKEY='ss_dash_v1';
var DONE_STAGE=7;
// state: { todos:[{id,client,text}], placements:[{id,todoId,date,done}], clients:[수동추가명] }
var state=load();
var viewY, viewM; // 캘린더가 보는 연·월
(function(){ var t=new Date(); viewY=t.getFullYear(); viewM=t.getMonth(); })();

function load(){
  try{
    var s=JSON.parse(localStorage.getItem(PKEY)||'{}');
    return {todos:s.todos||[], placements:s.placements||[], clients:s.clients||[], inventory:s.inventory||{}};
  }catch(e){ return {todos:[],placements:[],clients:[],inventory:{}}; }
}
function save(){ try{ localStorage.setItem(PKEY, JSON.stringify(state)); }catch(e){} }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }

/* 대시보드 의뢰 읽기 */
function dashCommissions(){
  try{
    var raw=JSON.parse(localStorage.getItem(DKEY)||'[]');
    return Array.isArray(raw)?raw:(raw.commissions||[]);
  }catch(e){ return []; }
}
function isActive(c){ return (typeof c.stage==='number'?c.stage<DONE_STAGE:c.stage!=='전달완료') && !c.hidden; }

/* 신청자의 의뢰 마감일 (ss_dash_v1) */
function clientDeadline(client){
  client=(client||'').trim(); if(!client) return '';
  var c=dashCommissions().filter(function(x){return (x.client||'').trim()===client;})[0];
  return c && c.deadline ? c.deadline : '';
}
/* 플래너 단계 태그 → 대시보드 STAGES 인덱스 (러프=2,선화=4,채색=5,완성=6 / 그 외 -1) */
function plannerStageIndex(text){
  if(/^러프/.test(text)) return 2;
  if(text==='선화') return 4;
  if(text==='채색') return 5;
  if(text==='완성') return 6;
  return -1;
}
/* 완료된 단계 태그 기준으로 대시보드 의뢰 진행단계 올림 (낮추진 않음) */
function syncDashStage(client){
  if(localStorage.getItem('ss_sync_stage')==='0') return;
  client=(client||'').trim(); if(!client || client==='__none__') return;
  var maxIdx=-1;
  state.placements.forEach(function(p){
    if(!p.done) return;
    var t=todoById(p.todoId); if(!t || (t.client||'').trim()!==client) return;
    var idx=plannerStageIndex(t.text); if(idx>maxIdx) maxIdx=idx;
  });
  if(maxIdx<0) return;
  var arr; try{ var raw=JSON.parse(localStorage.getItem(DKEY)||'[]'); arr=Array.isArray(raw)?raw:(raw.commissions||[]); }catch(e){ return; }
  var c=arr.filter(function(x){return (x.client||'').trim()===client;})[0];
  if(!c) return;
  var cur=typeof c.stage==='number'?c.stage:0;
  if(maxIdx>cur){ c.stage=maxIdx; localStorage.setItem(DKEY, JSON.stringify(arr)); return c.client+' → '+['접수','입금확인','러프','러프컨펌','선화','채색','완성','전달완료'][maxIdx]; }
  return '';
}

/* 신청자 목록 = 대시보드 의뢰인(중복제거) + 수동추가 */
function allClients(){
  var set={}, order=[];
  dashCommissions().forEach(function(c){
    var n=(c.client||'').trim();
    if(n && !set[n]){ set[n]=1; order.push(n); }
  });
  (state.clients||[]).forEach(function(n){
    n=(n||'').trim();
    if(n && !set[n]){ set[n]=1; order.push(n); }
  });
  return order;
}

/* ════════ 색상 (신청자별 고정) ════════ */
function hueOf(name){
  if(!name) return 215; // 기본 = 블루 톤
  var h=0; for(var i=0;i<name.length;i++) h=(h*31+name.charCodeAt(i))%360;
  return h;
}
function colorVars(name){
  var h=hueOf(name);
  return '--c-bg:hsla('+h+',48%,52%,.16);--c-bd:hsla('+h+',48%,58%,.42);'
    + '--c-dot:hsl('+h+',60%,62%);--c-tx:hsl('+h+',45%,76%)';
}

/* ════════ 날짜 유틸 ════════ */
function ymd(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function todayStr(){ return ymd(new Date()); }

/* ════════ 신청자 셀렉트 ════════ */
function renderSelect(){
  var sel=document.getElementById('selClient');
  var keep=sel.value;
  sel.innerHTML='<option value="">신청자 선택…</option>';
  allClients().forEach(function(n){
    var o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o);
  });
  // 신청자 없는 할일도 허용
  var o2=document.createElement('option'); o2.value='__none__'; o2.textContent='(신청자 없음)'; sel.appendChild(o2);
  if(keep && [].some.call(sel.options,function(o){return o.value===keep;})) sel.value=keep;
}

/* ════════ 좌측 태그 리스트 ════════ */
function renderTags(){
  var box=document.getElementById('taglist');
  box.innerHTML='';
  document.getElementById('tagCount').textContent=state.todos.length;
  if(!state.todos.length){
    box.innerHTML='<div class="empty">아래에서 할일을 만들고<br>달력 날짜로 드래그하세요.</div>';
    return;
  }
  state.todos.forEach(function(t){
    var el=document.createElement('div');
    el.className='chip'; el.draggable=true;
    el.style.cssText=colorVars(t.client);
    el.dataset.todoId=t.id;
    var who=t.client && t.client!=='__none__' ? '<span class="who" title="'+esc(t.client)+'">'+esc(t.client)+'</span>' : '';
    el.innerHTML='<span class="dot"></span>'+who+'<span class="txt">'+esc(t.text)+'</span><span class="del" title="태그 삭제">✕</span>';
    el.addEventListener('dragstart',function(e){
      e.dataTransfer.setData('text/plain', JSON.stringify({kind:'new', todoId:t.id}));
      e.dataTransfer.effectAllowed='copy';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend',function(){ el.classList.remove('dragging'); });
    el.querySelector('.del').addEventListener('click',function(ev){
      ev.stopPropagation();
      // 태그 + 해당 태그의 모든 배치 삭제
      state.todos=state.todos.filter(function(x){return x.id!==t.id;});
      state.placements=state.placements.filter(function(p){return p.todoId!==t.id;});
      save(); renderTags(); renderGrid();
    });
    box.appendChild(el);
  });
}

/* ════════ 캘린더 ════════ */
function renderGrid(){
  document.getElementById('ymLabel').innerHTML=
    (viewY)+' <small>'+['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][viewM]+'</small>';
  var grid=document.getElementById('grid');
  grid.innerHTML='';

  var first=new Date(viewY,viewM,1);
  var startDow=first.getDay();
  var gridStart=new Date(viewY,viewM,1-startDow);

  // 마감일 인덱스: date → [client...]
  var dlMap={};
  dashCommissions().forEach(function(c){
    if(c.deadline && isActive(c)){
      (dlMap[c.deadline]=dlMap[c.deadline]||[]).push(c.client||'의뢰');
    }
  });
  // 배치 인덱스: date → [placement...]
  var plMap={};
  state.placements.forEach(function(p){ (plMap[p.date]=plMap[p.date]||[]).push(p); });

  var tStr=todayStr();
  for(var i=0;i<42;i++){
    var d=new Date(gridStart.getFullYear(),gridStart.getMonth(),gridStart.getDate()+i);
    var ds=ymd(d);
    var inMonth=(d.getMonth()===viewM);
    var dow=d.getDay();

    var cell=document.createElement('div');
    cell.className='cell'+(inMonth?'':' dim')+(ds===tStr?' today':'');
    cell.dataset.date=ds;

    var dn=document.createElement('div');
    dn.className='dnum'+(dow===0?' sun':dow===6?' sat':'');
    dn.innerHTML='<span>'+d.getDate()+'</span>'+(ds===tStr?'<span class="todaytag">TODAY</span>':'');
    cell.appendChild(dn);

    var items=document.createElement('div'); items.className='items';

    // 마감일(옅게)
    (dlMap[ds]||[]).forEach(function(name){
      var dl=document.createElement('div'); dl.className='dl';
      dl.textContent='📌 '+name+' 마감';
      dl.title=name+' 의뢰 마감일';
      items.appendChild(dl);
    });

    // 배치된 할일
    (plMap[ds]||[]).forEach(function(p){
      var t=todoById(p.todoId);
      if(!t){ return; }
      var cc=document.createElement('div');
      cc.className='cchip'+(p.done?' done':''); cc.draggable=true;
      cc.style.cssText=colorVars(t.client);
      cc.dataset.placeId=p.id;
      var label=(t.client && t.client!=='__none__'?t.client+' · ':'')+t.text;
      cc.innerHTML='<span class="dot"></span><span class="ctxt" title="'+esc(label)+'">'+esc(t.text)+'</span><span class="cdel" title="삭제">✕</span>';
      cc.addEventListener('dragstart',function(e){
        e.dataTransfer.setData('text/plain', JSON.stringify({kind:'move', placeId:p.id}));
        e.dataTransfer.effectAllowed='copyMove'; // dropEffect('copy')와 호환 → 이동 drop이 막히지 않게
        cc.classList.add('dragging'); cc._dragged=true;
      });
      cc.addEventListener('dragend',function(){ cc.classList.remove('dragging'); });
      // 클릭 = 완료 토글 (드래그 직후의 잔여 클릭은 무시)
      cc.addEventListener('click',function(ev){
        if(ev.target.classList.contains('cdel')) return;
        if(cc._dragged){ cc._dragged=false; return; }
        p.done=!p.done; save();
        var msg=p.done?syncDashStage(t.client):'';
        renderGrid();
        if(msg) toast('📊 대시보드 단계 갱신: '+msg);
      });
      // ✕ = 배치 삭제
      cc.querySelector('.cdel').addEventListener('click',function(ev){
        ev.stopPropagation();
        state.placements=state.placements.filter(function(x){return x.id!==p.id;});
        save(); renderGrid();
      });
      items.appendChild(cc);
    });

    cell.appendChild(items);

    // 드롭 타깃
    cell.addEventListener('dragover',function(e){ e.preventDefault(); e.dataTransfer.dropEffect='copy'; this.classList.add('dropok'); });
    cell.addEventListener('dragleave',function(){ this.classList.remove('dropok'); });
    cell.addEventListener('drop',function(e){
      e.preventDefault(); this.classList.remove('dropok');
      var data; try{ data=JSON.parse(e.dataTransfer.getData('text/plain')); }catch(_){ return; }
      var date=this.dataset.date;
      if(data.kind==='new'){
        state.placements.push({id:uid(), todoId:data.todoId, date:date, done:false});
      }else if(data.kind==='move'){
        var p=state.placements.filter(function(x){return x.id===data.placeId;})[0];
        if(p) p.date=date;
      }
      save(); renderGrid();
    });

    grid.appendChild(cell);
  }
  updateFocusCount();
  if(document.getElementById('focusModal').classList.contains('open')) renderFocusBody();
}
function todoById(id){ return state.todos.filter(function(t){return t.id===id;})[0]; }

/* ════════ 할일 생성 ════════ */
function makeTodo(){
  var inp=document.getElementById('todoText');
  var text=inp.value.trim();
  if(!text){ inp.focus(); return; }
  var client=document.getElementById('selClient').value;
  state.todos.push({id:uid(), client:client||'', text:text});
  save(); renderTags();
  inp.value=''; inp.focus();
}

/* ════════ 이스케이프 ════════ */
function esc(s){ return String(s).replace(/[&<>"']/g,function(m){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m];}); }

/* ════════ 이벤트 ════════ */
document.getElementById('mkBtn').addEventListener('click', makeTodo);
document.getElementById('todoText').addEventListener('keydown', function(e){ if(e.key==='Enter'){ e.preventDefault(); makeTodo(); } });
document.getElementById('addCli').addEventListener('click', function(){
  var n=prompt('추가할 신청자 이름:');
  if(n===null) return;
  n=n.trim(); if(!n) return;
  if(allClients().indexOf(n)<0){ state.clients.push(n); save(); }
  renderSelect();
  document.getElementById('selClient').value=n;
  document.getElementById('todoText').focus();
});
document.getElementById('prevM').addEventListener('click', function(){ viewM--; if(viewM<0){viewM=11;viewY--;} renderGrid(); });
document.getElementById('nextM').addEventListener('click', function(){ viewM++; if(viewM>11){viewM=0;viewY++;} renderGrid(); });
document.getElementById('todayBtn').addEventListener('click', function(){ var t=new Date(); viewY=t.getFullYear(); viewM=t.getMonth(); renderGrid(); });

/* 전체 일정 ±1일 이동 (배치된 칩 전부, 마감일은 유지) */
function shiftAll(delta){
  if(!state.placements.length){ toast('옮길 일정이 없어요'); return; }
  if(!confirm('배치된 모든 일정 '+state.placements.length+'개를 '+(delta>0?'하루씩 미룰까요? (뒤로)':'하루씩 당길까요? (앞으로)'))) return;
  state.placements.forEach(function(p){
    var a=(p.date||'').split('-');
    if(a.length!==3) return;
    var d=new Date(+a[0], +a[1]-1, +a[2]);
    d.setDate(d.getDate()+delta);
    p.date=ymd(d);
  });
  save(); renderGrid();
  toast('🗓 전체 일정 '+(delta>0?'+1일 미룸':'−1일 당김'));
}
document.getElementById('shiftBack').addEventListener('click', function(){ shiftAll(-1); });
document.getElementById('shiftFwd').addEventListener('click', function(){ shiftAll(1); });

// 대시보드/다른 탭에서 변경 시 반영
window.addEventListener('storage', function(e){
  if(e.key===DKEY){ renderSelect(); renderGrid(); }
  if(e.key===PKEY){ state=load(); renderTags(); renderGrid(); }
});

/* ════════ 토스트 ════════ */
var _toastT=null;
function toast(msg){
  var el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_toastT); _toastT=setTimeout(function(){ el.classList.remove('show'); },2600);
}

/* ════════ 모달 공통 ════════ */
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }
['aiModal','syncModal','setModal','invModal','stageModal','focusModal','orderModal'].forEach(function(id){
  document.getElementById(id).addEventListener('click',function(e){ if(e.target===this) closeModal(id); });
});

/* ════════ 주문 확정기 (자동화 P2+P3) ════════ */
var _catalog=null, _ordSel={};
var CATLBL={part:'추가파츠',expr:'표정',fullopt:'풀옵션',chukjeon:'축전',samyeon:'삼면도',ignore:'무관'};
async function loadCatalog(){
  try{ var r=await fetch('data/commission.json?t='+Date.now()); if(!r.ok) throw 0; _catalog=await r.json(); }
  catch(e){ _catalog=null; }
  return _catalog;
}
function catOf(sec,it){ return sec.type==='expr'?'expr':(it.cat||''); }
/* AI 추출용: 카탈로그 옵션·분류·가격 참조 문자열 */
function buildCatalogRef(){
  if(!_catalog||!_catalog.sections) return '';
  var lines=[];
  _catalog.sections.forEach(function(sec){
    (sec.items||[]).forEach(function(it){
      if(!it.ko) return;
      var c=catOf(sec,it), lab=CATLBL[c]||'기본구성요소';
      var price=(sec.type!=='expr'&&it.p)?(' '+(it.p/10000)+'만원'):'';
      lines.push('· '+it.ko+' ['+lab+price+']');
    });
  });
  if(!lines.length) return '';
  return '\n[카탈로그 — 작가가 정의한 옵션·분류. 대화에 이 옵션이 나오면 이 분류를 그대로 따르세요(자유 추측보다 우선)]\n'
    +lines.join('\n')
    +'\n→ extra_parts는 위 분류가 "추가파츠"인 항목이 대화에서 최종 확정된 개수만 세서 2로 나눠 올림. "표정"은 expressions로, 그 외 파츠는 parts로 분류.';
}
function isItemOn(sec,it){ var s=_ordSel[sec.id]; return sec.type==='radio'?(s===it.id):!!(s&&s[it.id]); }
function isQtyType(sec){ return sec.type==='qty'||sec.type==='pill'; } // 수량 입력 가능 타입
function itemQty(sec,it){ var s=_ordSel[sec.id]; return (isQtyType(sec)&&s&&s[it.id])?s[it.id]:1; }
function toggleItem(sec,it){
  if(sec.type==='radio'){ _ordSel[sec.id]=(_ordSel[sec.id]===it.id)?'':it.id; }
  else { var s=_ordSel[sec.id]||(_ordSel[sec.id]={}); if(s[it.id]) delete s[it.id]; else s[it.id]=(isQtyType(sec)?1:true); }
  renderCatalog();
}
function deriveOrder(){
  var parts=[],exprs=[],partCount=0,full=false,chuk=false,sam=false,amount=0,type='';
  (_catalog&&_catalog.sections?_catalog.sections:[]).forEach(function(sec){
    (sec.items||[]).forEach(function(it){
      if(!isItemOn(sec,it)) return;
      var q=itemQty(sec,it);
      var nm=it.ko+(q>1?' ×'+q:'');
      if(sec.type!=='expr') amount+=(it.p||0)*(isQtyType(sec)?q:1);
      if(sec.type==='radio' && !type) type=it.ko; // 라디오 = 의뢰 종류 (분류와 무관하게 항상)
      var c=catOf(sec,it);
      if(c==='expr'){ exprs.push(nm); return; }
      if(c==='part'){ partCount+=(isQtyType(sec)?q:1); parts.push(nm); }
      else if(c==='fullopt') full=true;
      else if(c==='chukjeon') chuk=true;
      else if(c==='samyeon') sam=true;
      else if(c==='ignore'){}
      else if(sec.type!=='radio') parts.push(nm); // 기본 구성요소(라디오 외)만 인벤토리
    });
  });
  return {parts:parts,exprs:exprs,extra:Math.ceil(partCount/2),full:full,chuk:chuk,sam:sam,amount:amount,type:type};
}
function updateOrdTotal(){
  var d=deriveOrder();
  document.getElementById('ordTotal').textContent=d.amount.toLocaleString()+'원';
  var st=['러프1','러프2'].concat(d.full?['러프3']:[]).concat(d.chuk?['러프4(축전)']:[]).concat(['선화','채색','완성']);
  if(d.extra) for(var i=1;i<=d.extra;i++) st.push('추가파츠'+i);
  if(d.chuk) st.push('축전'); if(d.sam) st.push('삼면도');
  document.getElementById('ordDerive').innerHTML='→ <b style="color:var(--text2)">'+st.join(' · ')+'</b><br>인벤토리 🧩'+d.parts.length+'개 · 🎭'+d.exprs.length+'개';
}
function renderCatalog(){
  var box=document.getElementById('ordCatalog');
  if(!_catalog||!_catalog.sections){ box.innerHTML='<div class="mstatus show err" style="margin-top:12px">카탈로그(data/commission.json)를 못 불러왔어요. 커미션편집에서 한 번 저장했는지 확인해주세요.</div>'; document.getElementById('ordTotal').textContent='—'; document.getElementById('ordDerive').textContent=''; return; }
  var h='';
  _catalog.sections.forEach(function(sec){
    if(!sec.items||!sec.items.length) return;
    h+='<div class="ord-sec"><div class="sh">'+esc(sec.koLabel||sec.ko||'')+'</div><div class="ord-items">';
    sec.items.forEach(function(it){
      var on=isItemOn(sec,it), c=catOf(sec,it);
      h+='<span class="ord-it'+(on?' on':'')+'" data-sec="'+esc(sec.id)+'" data-it="'+esc(it.id)+'">'+esc(it.ko)
        +(sec.type!=='expr'&&it.p?'<span class="op">'+(it.p/10000)+'만</span>':'')
        +(c?'<span class="catb">'+(CATLBL[c]||c)+'</span>':'')
        +(on&&isQtyType(sec)?'<input class="qty" type="number" min="1" value="'+itemQty(sec,it)+'" data-sec="'+esc(sec.id)+'" data-it="'+esc(it.id)+'">':'')
        +'</span>';
    });
    h+='</div></div>';
  });
  box.innerHTML=h;
  box.querySelectorAll('.ord-it').forEach(function(el){
    el.addEventListener('click',function(e){
      if(e.target.classList.contains('qty')) return;
      var sec=_catalog.sections.filter(function(s){return s.id===el.dataset.sec;})[0];
      var it=sec&&(sec.items||[]).filter(function(x){return x.id===el.dataset.it;})[0];
      if(sec&&it) toggleItem(sec,it);
    });
  });
  box.querySelectorAll('.qty').forEach(function(inp){
    inp.addEventListener('click',function(e){e.stopPropagation();});
    inp.addEventListener('input',function(){ var v=Math.max(1,parseInt(inp.value,10)||1); (_ordSel[inp.dataset.sec]=_ordSel[inp.dataset.sec]||{})[inp.dataset.it]=v; updateOrdTotal(); });
  });
  updateOrdTotal();
}
// document.getElementById('btnOrder').addEventListener('click', async function(){
//   var sel=document.getElementById('ordClient');
//   sel.innerHTML='<option value="">(신청자 없음)</option>';
//   allClients().forEach(function(n){ var o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
//   var cur=document.getElementById('selClient').value; if(cur&&cur!=='__none__') sel.value=cur;
//   _ordSel={};
//   document.getElementById('ordAiStatus').className='mstatus';
//   document.getElementById('ordAiText').value='';
//   document.getElementById('ordCatalog').innerHTML='<div class="mstatus show load" style="margin-top:12px">카탈로그 불러오는 중…</div>';
//   openModal('orderModal');
//   await loadCatalog(); renderCatalog();
// });
document.getElementById('ordClose').addEventListener('click',function(){ closeModal('orderModal'); });
document.getElementById('ordAiBtn').addEventListener('click', async function(){
  var key=localStorage.getItem('ss_claude_key');
  if(!key){ toast('⚙️ 설정에서 Claude API 키 먼저'); document.getElementById('btnSettings').click(); return; }
  var st=document.getElementById('ordAiStatus');
  if(!_catalog){ st.className='mstatus show err'; st.textContent='카탈로그가 없어요'; return; }
  var text=document.getElementById('ordAiText').value.trim();
  if(!text){ st.className='mstatus show err'; st.textContent='대화를 붙여넣어주세요'; return; }
  var names=[]; _catalog.sections.forEach(function(sec){ (sec.items||[]).forEach(function(it){ names.push(it.ko); }); });
  var btn=this; btn.disabled=true; st.className='mstatus show load'; st.textContent='🤖 최종 확정 옵션 분석 중…';
  try{
    var res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:localStorage.getItem('ss_claude_model')||'claude-opus-4-8',max_tokens:1024,
        system:'커미션 작가의 비서. 작가와 신청자의 대화/주문서 전체를 읽고, 아래 옵션 목록 중 최종 확정된 것을 개수와 함께 고르세요. "× N개"처럼 수량 표기가 있으면 qty에 그 수를, 없으면 1. 협상으로 교체·취소·추가된 경우 최종 상태를 반영(예: 안경→헤드셋이면 헤드셋만, 게임기 빼기면 제외). 목록에 있는 정확한 이름만 고르세요.\n옵션 목록: '+names.join(', '),
        messages:[{role:'user',content:text}],
        output_config:{format:{type:'json_schema',schema:{type:'object',properties:{selected:{type:'array',items:{type:'object',properties:{name:{type:'string',description:'옵션 이름(목록의 정확한 이름)'},qty:{type:'integer',description:'개수. "× N개" 있으면 N, 없으면 1'}},required:['name','qty'],additionalProperties:false}}},required:['selected'],additionalProperties:false}}}})});
    if(!res.ok){ var e=await res.json().catch(function(){return{};}); var m=(e.error&&e.error.message)||('HTTP '+res.status); if(res.status===401)m='API 키가 올바르지 않아요'; throw new Error(m); }
    var data=await res.json(); var tb=(data.content||[]).filter(function(b){return b.type==='text';})[0];
    var picked=(JSON.parse(tb.text).selected||[]).map(function(s){return {name:(s.name||'').trim(), qty:Math.max(1,parseInt(s.qty,10)||1)};});
    _ordSel={}; var hit=0;
    _catalog.sections.forEach(function(sec){ (sec.items||[]).forEach(function(it){
      var m=picked.filter(function(p){return p.name===it.ko.trim();})[0];
      if(m){ if(sec.type==='radio') _ordSel[sec.id]=it.id; else (_ordSel[sec.id]=_ordSel[sec.id]||{})[it.id]=(isQtyType(sec)?m.qty:true); hit++; }
    }); });
    renderCatalog();
    st.className='mstatus show ok'; st.textContent='✅ '+hit+'개 선택됨 — 확인·수정 후 확정하세요';
  }catch(e){ st.className='mstatus show err'; st.textContent='❌ '+e.message; }
  btn.disabled=false;
});
document.getElementById('ordConfirm').addEventListener('click', function(){
  var client=document.getElementById('ordClient').value;
  if(!client||client==='__none__'){ toast('신청자를 선택해주세요'); return; }
  var d=deriveOrder();
  var r=genStageTags(client, {full:d.full,chuk:d.chuk,sam:d.sam,extra:d.extra});
  var invAdded=mergeInventory(client, d.exprs, d.parts);
  upsertDashboard(client, inventoryText(client), d.amount, d.type);
  save(); renderTags(); renderGrid();
  toast('🧾 확정! 단계태그 '+r.added+'개 · 인벤토리 '+invAdded+'개 · 금액 '+d.amount.toLocaleString()+'원 → 대시보드 반영');
  closeModal('orderModal');
});

/* ════════ 오늘·이번주 포커스 ════════ */
function plusDays(str,n){ var a=str.split('-'); var d=new Date(+a[0],+a[1]-1,+a[2]); d.setDate(d.getDate()+n); return ymd(d); }
function fmtKDate(str){ var a=str.split('-'); var d=new Date(+a[0],+a[1]-1,+a[2]); return (+a[1])+'/'+(+a[2])+' ('+['일','월','화','수','목','금','토'][d.getDay()]+')'; }
function updateFocusCount(){
  var tStr=todayStr();
  var n=state.placements.filter(function(p){return p.date===tStr;}).length;
  var el=document.getElementById('focusCount'); if(el) el.textContent=n;
}
function focusChip(p){
  var t=todoById(p.todoId); if(!t) return null;
  var el=document.createElement('div');
  el.className='cchip'+(p.done?' done':''); el.style.cssText=colorVars(t.client)+';cursor:pointer;';
  var label=(t.client && t.client!=='__none__'?t.client+' · ':'')+t.text;
  el.innerHTML='<span class="dot"></span><span class="ctxt">'+esc(label)+'</span>';
  el.addEventListener('click',function(){
    p.done=!p.done; save();
    var m=p.done?syncDashStage(t.client):'';
    renderGrid(); renderFocusBody();
    if(m) toast('📊 대시보드 단계 갱신: '+m);
  });
  return el;
}
function renderFocusBody(){
  var tStr=todayStr();
  var byDate={}; state.placements.forEach(function(p){ (byDate[p.date]=byDate[p.date]||[]).push(p); });
  var dlMap={}; dashCommissions().forEach(function(c){ if(c.deadline&&isActive(c)) (dlMap[c.deadline]=dlMap[c.deadline]||[]).push(c.client||'의뢰'); });
  var box=document.getElementById('focusBody'); box.innerHTML='';
  function section(title, ds, accent){
    var pls=byDate[ds]||[], dls=dlMap[ds]||[];
    var wrap=document.createElement('div'); wrap.style.cssText='margin-top:12px;';
    var h=document.createElement('div'); h.style.cssText='font-family:var(--cond);font-weight:700;font-size:14px;letter-spacing:.5px;margin-bottom:6px;color:'+(accent||'var(--text2)')+';';
    h.textContent=title; wrap.appendChild(h);
    if(dls.length){ var dd=document.createElement('div'); dd.style.cssText='font-size:12px;color:#e89;margin-bottom:6px;'; dd.textContent='📌 마감: '+dls.join(', '); wrap.appendChild(dd); }
    if(!pls.length && !dls.length){ var e=document.createElement('div'); e.style.cssText='font-size:12.5px;color:var(--text3);'; e.textContent='— 없음'; wrap.appendChild(e); }
    var list=document.createElement('div'); list.style.cssText='display:flex;flex-direction:column;gap:5px;';
    pls.forEach(function(p){ var c=focusChip(p); if(c) list.appendChild(c); });
    wrap.appendChild(list); return wrap;
  }
  box.appendChild(section('🔥 오늘 — '+fmtKDate(tStr), tStr, 'var(--Y)'));
  var wt=document.createElement('div'); wt.style.cssText='font-family:var(--cond);font-weight:700;font-size:12px;color:var(--text3);letter-spacing:.5px;margin-top:16px;border-top:1px solid var(--border);padding-top:10px;';
  wt.textContent='📅 다가오는 6일'; box.appendChild(wt);
  for(var i=1;i<=6;i++){ var ds=plusDays(tStr,i); box.appendChild(section(fmtKDate(ds), ds)); }
}
document.getElementById('focusBtn').addEventListener('click',function(){ renderFocusBody(); openModal('focusModal'); });
document.getElementById('focusClose').addEventListener('click',function(){ closeModal('focusModal'); });

/* ════════ 신청 내역(인벤토리) ════════ */
function invFor(client){
  if(!client) return {expressions:[],parts:[]};
  if(!state.inventory[client]) state.inventory[client]={expressions:[],parts:[]};
  var inv=state.inventory[client];
  inv.expressions=inv.expressions||[]; inv.parts=inv.parts||[];
  return inv;
}
function renderInv(){
  var client=document.getElementById('invClient').value;
  var inv=invFor(client);
  [['expressions','invExpList','invExpC'],['parts','invPartList','invPartC']].forEach(function(g){
    var arr=inv[g[0]], box=document.getElementById(g[1]);
    document.getElementById(g[2]).textContent=arr.length;
    box.innerHTML='';
    if(!arr.length){ box.innerHTML='<div class="empty2">아직 없어요. ＋추가 또는 🤖AI 추출로 채워보세요.</div>'; return; }
    arr.forEach(function(it){
      var row=document.createElement('div');
      row.className='inv-row'+(it.done?' idone':'');
      row.innerHTML='<input type="checkbox"'+(it.done?' checked':'')+'><span class="iname">'+esc(it.name)+'</span><span class="idel" title="삭제">✕</span>';
      row.addEventListener('click',function(e){
        if(e.target.classList.contains('idel')){
          inv[g[0]]=arr.filter(function(x){return x.id!==it.id;});
          save(); renderInv(); return;
        }
        it.done=!it.done; save(); renderInv();
      });
      box.appendChild(row);
    });
  });
}
function openInv(client){
  var sel=document.getElementById('invClient');
  sel.innerHTML='<option value="">(신청자 없음)</option>';
  allClients().forEach(function(n){ var o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
  if(client && client!=='__none__') sel.value=client;
  renderInv(); openModal('invModal');
}
document.getElementById('invBtn').addEventListener('click',function(){
  openInv(document.getElementById('selClient').value);
});
document.getElementById('invClient').addEventListener('change', function(){ document.getElementById('invDashStatus').className='mstatus'; renderInv(); });
document.getElementById('invClose').addEventListener('click',function(){ closeModal('invModal'); });
document.getElementById('invToDash').addEventListener('click',function(){
  var client=document.getElementById('invClient').value;
  var st=document.getElementById('invDashStatus');
  if(!client || client==='__none__'){ st.className='mstatus show err'; st.textContent='신청자를 선택해주세요'; return; }
  var txt=inventoryText(client);
  if(!txt){ st.className='mstatus show err'; st.textContent='반영할 표정·파츠가 없어요'; return; }
  var r=upsertDashboard(client, txt);
  st.className='mstatus show ok';
  st.textContent=r.created?('✅ 대시보드에 "'+client+'" 의뢰 카드 생성 (가격은 대시보드에서 입력)'):('✅ 대시보드 "'+client+'" 파츠 갱신');
});
document.querySelectorAll('#invModal .addinv').forEach(function(btn){
  btn.addEventListener('click',function(){
    var client=document.getElementById('invClient').value;
    var name=prompt(btn.dataset.cat==='expressions'?'추가할 표정 이름:':'추가할 파츠 이름:');
    if(name===null) return; name=name.trim(); if(!name) return;
    invFor(client)[btn.dataset.cat].push({id:uid(), name:name, done:false});
    save(); renderInv();
  });
});
/* 인벤토리 → 메모 텍스트 (대시보드용) */
function inventoryText(client){
  var inv=state.inventory[client]; if(!inv) return '';
  var lines=[];
  if(inv.parts&&inv.parts.length) lines.push('🧩 '+inv.parts.map(function(p){return p.name;}).join(', '));
  if(inv.expressions&&inv.expressions.length) lines.push('🎭 '+inv.expressions.map(function(e){return e.name;}).join(', '));
  return lines.join('\n');
}
/* 대시보드(ss_dash_v1)에 이름·파츠 반영 (가격·단계 등 기존값은 안 건드림, 신규는 가격 빈칸) */
var DASH_MARK='【신청 파츠】';
function upsertDashboard(client, memoText, amount, type){
  client=(client||'').trim();
  if(!client || client==='__none__') return {skipped:true};
  var arr;
  try{ var raw=JSON.parse(localStorage.getItem(DKEY)||'[]'); arr=Array.isArray(raw)?raw:(raw.commissions||[]); }
  catch(e){ arr=[]; }
  var block=DASH_MARK+(memoText?'\n'+memoText:'');
  var amt=(amount!=null && amount!=='' && +amount>0)?String(+amount):null;
  var found=null;
  for(var i=0;i<arr.length;i++){ if((arr[i].client||'').trim()===client){ found=arr[i]; break; } }
  if(found){
    // 기존 memo에서 파츠 블록만 교체, 나머지 텍스트·다른 필드 전부 보존
    var prev=found.memo||'';
    var cleaned=prev.replace(new RegExp(DASH_MARK.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'[\\s\\S]*$'),'').trim();
    found.memo=(cleaned?cleaned+'\n':'')+block;
    if(amt) found.amount=amt;             // 확정기 계산 총액(있을 때만)
    if(type) found.type=type;             // 확정기 의뢰 종류(있을 때만)
    localStorage.setItem(DKEY, JSON.stringify(arr));
    return {created:false, client:client};
  }
  arr.push({client:client, type:(type||''), amount:(amt||''), deadline:'', startDate:'', email:'', note:'',
    memo:block, tag:'', platform:'', contact:'', stage:0});
  localStorage.setItem(DKEY, JSON.stringify(arr));
  return {created:true, client:client};
}

/* AI/외부에서 인벤토리 병합 (중복 이름은 건너뜀) */
function mergeInventory(client, expressions, parts){
  var inv=invFor(client), added=0;
  [['expressions',expressions],['parts',parts]].forEach(function(g){
    (g[1]||[]).forEach(function(nm){
      nm=String(nm||'').trim(); if(!nm) return;
      if(inv[g[0]].some(function(x){return x.name===nm;})) return;
      inv[g[0]].push({id:uid(), name:nm, done:false}); added++;
    });
  });
  return added;
}

/* ════════ 설정 (Claude 키·모델 + GitHub) ════════ */
function ghCfg(){ return {user:localStorage.getItem('gh_user')||'',repo:localStorage.getItem('gh_repo')||'',token:localStorage.getItem('gh_token')||''}; }
// document.getElementById('btnSettings').addEventListener('click',function(){
//   document.getElementById('setClaudeKey').value=localStorage.getItem('ss_claude_key')||'';
//   document.getElementById('setClaudeModel').value=localStorage.getItem('ss_claude_model')||'claude-opus-4-8';
//   var g=ghCfg();
//   document.getElementById('setGhUser').value=g.user||'DvpHm';
//   document.getElementById('setGhRepo').value=g.repo||'ODE';
//   document.getElementById('setGhToken').value=g.token||'';
//   document.getElementById('setSyncStage').checked=localStorage.getItem('ss_sync_stage')!=='0';
//   openModal('setModal');
// });
document.getElementById('setClose').addEventListener('click',function(){ closeModal('setModal'); });
document.getElementById('setSave').addEventListener('click',function(){
  localStorage.setItem('ss_claude_key', document.getElementById('setClaudeKey').value.trim());
  localStorage.setItem('ss_claude_model', document.getElementById('setClaudeModel').value);
  localStorage.setItem('gh_user', document.getElementById('setGhUser').value.trim());
  localStorage.setItem('gh_repo', document.getElementById('setGhRepo').value.trim());
  localStorage.setItem('gh_token', document.getElementById('setGhToken').value.trim());
  localStorage.setItem('ss_sync_stage', document.getElementById('setSyncStage').checked?'1':'0');
  closeModal('setModal'); toast('✅ 설정 저장 완료');
});

/* ════════ C. 단계 태그 생성 (옵션 기반) ════════ */
function stageTags(o){
  var t=['러프1','러프2'];
  if(o.full) t.push('러프3');
  if(o.chuk) t.push('러프4(축전)');
  t.push('선화','채색','완성');
  for(var i=1;i<=o.extra;i++) t.push('추가파츠'+i);
  if(o.chuk) t.push('축전');
  if(o.sam) t.push('삼면도');
  return t;
}
function readStageOpts(){
  return {
    full:document.getElementById('stFull').checked,
    chuk:document.getElementById('stChuk').checked,
    sam:document.getElementById('stSam').checked,
    extra:Math.max(0,Math.min(20, parseInt(document.getElementById('stExtra').value,10)||0))
  };
}
function renderStagePrev(){
  document.getElementById('stagePrev').innerHTML='생성될 태그 → <b>'+stageTags(readStageOpts()).join(' · ')+'</b>';
}
/* 태그 생성(+선택적 마감 역산 배치). place={deadline,gap} 주면 미배치 태그를 마감에서 역산해 캘린더에 깖 */
function genStageTags(client, opts, place){
  var objs=[], added=0;
  stageTags(opts).forEach(function(tx){
    var ex=state.todos.filter(function(t){ return t.client===(client||'') && t.text===tx; })[0];
    if(!ex){ ex={id:uid(), client:client||'', text:tx}; state.todos.push(ex); added++; }
    objs.push(ex);
  });
  var placed=0;
  if(place && place.deadline && /^\d{4}-\d{2}-\d{2}$/.test(place.deadline)){
    var a=place.deadline.split('-'), base=new Date(+a[0],+a[1]-1,+a[2]);
    var gap=Math.max(1, place.gap||2), n=objs.length;
    objs.forEach(function(t,i){
      if(state.placements.some(function(p){return p.todoId===t.id;})) return; // 이미 배치된 건 보존
      var d=new Date(base); d.setDate(base.getDate()-(n-1-i)*gap);
      state.placements.push({id:uid(), todoId:t.id, date:ymd(d), done:false}); placed++;
    });
  }
  if(added||placed){ save(); renderTags(); renderGrid(); }
  return {added:added, placed:placed};
}
function updateStageDeadlineUI(){
  var client=document.getElementById('stageClient').value;
  var dl=clientDeadline(client);
  var cb=document.getElementById('stPlace'), lbl=document.getElementById('stDeadline');
  if(dl){ cb.disabled=false; lbl.textContent='(마감 '+dl+')'; lbl.style.color='var(--yellow)'; }
  else { cb.disabled=true; cb.checked=false; lbl.textContent='(마감일 없음 — 대시보드에서 설정)'; lbl.style.color='var(--text3)'; }
  document.getElementById('stGapRow').style.display=cb.checked?'flex':'none';
  renderStagePrev();
}
// document.getElementById('stageBtn').addEventListener('click',function(){
//   var sel=document.getElementById('stageClient');
//   sel.innerHTML='<option value="">(신청자 없음)</option>';
//   allClients().forEach(function(n){ var o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
//   var cur=document.getElementById('selClient').value;
//   if(cur && cur!=='__none__') sel.value=cur;
//   document.getElementById('stFull').checked=false;
//   document.getElementById('stChuk').checked=false;
//   document.getElementById('stSam').checked=false;
//   document.getElementById('stExtra').value='0';
//   document.getElementById('stPlace').checked=false;
//   document.getElementById('stGap').value='2';
//   updateStageDeadlineUI();
//   openModal('stageModal');
// });
['stFull','stChuk','stSam','stExtra','stGap'].forEach(function(id){
  document.getElementById(id).addEventListener('input', renderStagePrev);
});
document.getElementById('stageClient').addEventListener('change', updateStageDeadlineUI);
document.getElementById('stPlace').addEventListener('change', function(){
  document.getElementById('stGapRow').style.display=this.checked?'flex':'none';
});
document.getElementById('stageClose').addEventListener('click',function(){ closeModal('stageModal'); });
document.getElementById('stageGen').addEventListener('click',function(){
  var client=document.getElementById('stageClient').value;
  var place=null;
  if(document.getElementById('stPlace').checked){
    var dl=clientDeadline(client);
    if(dl) place={deadline:dl, gap:Math.max(1,Math.min(14, parseInt(document.getElementById('stGap').value,10)||2))};
  }
  var r=genStageTags(client, readStageOpts(), place);
  if(r.added || r.placed){
    toast('⚡ 단계 태그 '+r.added+'개 생성'+(r.placed?' · '+r.placed+'개 마감 역산 배치':'')+'!');
    closeModal('stageModal');
  } else toast('이미 모든 태그가 있어요');
});

/* ════════ F. GitHub 동기화 ════════ */
var SYNC_PATH='data/planner.json';
function syncStatus(cls,msg){ var el=document.getElementById('syncStatus'); el.className='mstatus show '+cls; el.textContent=msg; }
// document.getElementById('btnSync').addEventListener('click',function(){
//   document.getElementById('syncStatus').className='mstatus';
//   openModal('syncModal');
// });
document.getElementById('syncClose').addEventListener('click',function(){ closeModal('syncModal'); });

async function ghGetFile(g){
  var res=await fetch('https://api.github.com/repos/'+g.user+'/'+g.repo+'/contents/'+SYNC_PATH+'?t='+Date.now(),
    {headers:{'Authorization':'token '+g.token}});
  if(res.status===404) return null;
  if(!res.ok) throw new Error('GitHub 응답 '+res.status);
  return res.json();
}
document.getElementById('syncBackup').addEventListener('click',async function(){
  var g=ghCfg();
  if(!g.token){ toast('⚙️ 설정에서 GitHub 토큰을 먼저 입력해주세요'); closeModal('syncModal'); document.getElementById('btnSettings').click(); return; }
  syncStatus('load','⬆ 업로드 중...');
  try{
    var prev=await ghGetFile(g);
    var body={
      message:'🗓 플래너 백업 '+new Date().toLocaleString('ko-KR'),
      content:btoa(unescape(encodeURIComponent(JSON.stringify(state,null,2))))
    };
    if(prev && prev.sha) body.sha=prev.sha;
    var res=await fetch('https://api.github.com/repos/'+g.user+'/'+g.repo+'/contents/'+SYNC_PATH,{
      method:'PUT', headers:{'Authorization':'token '+g.token,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if(res.ok) syncStatus('ok','✅ 백업 완료! ('+SYNC_PATH+')');
    else { var e=await res.json(); throw new Error(e.message||res.status); }
  }catch(e){ syncStatus('err','❌ 실패: '+e.message); }
});
document.getElementById('syncRestore').addEventListener('click',async function(){
  var g=ghCfg();
  if(!g.token){ toast('⚙️ 설정에서 GitHub 토큰을 먼저 입력해주세요'); return; }
  if(!confirm('저장소의 백업으로 현재 플래너 데이터를 덮어씁니다. 계속할까요?')) return;
  syncStatus('load','⬇ 다운로드 중...');
  try{
    var f=await ghGetFile(g);
    if(!f){ syncStatus('err','❌ 백업 파일이 아직 없어요. 먼저 백업해주세요.'); return; }
    var json=decodeURIComponent(escape(atob(f.content.replace(/\n/g,''))));
    var s=JSON.parse(json);
    state={todos:s.todos||[], placements:s.placements||[], clients:s.clients||[], inventory:s.inventory||{}};
    save(); renderTags(); renderGrid(); renderSelect();
    syncStatus('ok','✅ 복원 완료! 할일 '+state.todos.length+'개 · 배치 '+state.placements.length+'개');
  }catch(e){ syncStatus('err','❌ 실패: '+e.message); }
});

/* ════════ AI 할일 추출 (Claude API) ════════ */
var _aiResult=[], _aiInventory={expressions:[],parts:[]}, _aiOrder=null;
function aiStatus(cls,msg){ var el=document.getElementById('aiStatus'); el.className='mstatus show '+cls; el.textContent=msg; }
// document.getElementById('btnAi').addEventListener('click',function(){
//   if(!localStorage.getItem('ss_claude_key')){
//     toast('⚙️ 설정에서 Claude API 키를 먼저 입력해주세요');
//     document.getElementById('btnSettings').click(); return;
//   }
//   // 신청자 셀렉트 동기화
//   var sel=document.getElementById('aiClient');
//   sel.innerHTML='<option value="">(신청자 없음)</option>';
//   allClients().forEach(function(n){ var o=document.createElement('option'); o.value=n; o.textContent=n; sel.appendChild(o); });
//   var cur=document.getElementById('selClient').value;
//   if(cur && cur!=='__none__') sel.value=cur;
//   document.getElementById('aiStatus').className='mstatus';
//   document.getElementById('aiPreview').className='ai-preview';
//   document.getElementById('aiAdd').style.display='none';
//   _aiResult=[];
//   openModal('aiModal');
// });
document.getElementById('aiClose').addEventListener('click',function(){ closeModal('aiModal'); });

document.getElementById('aiRun').addEventListener('click',async function(){
  var text=document.getElementById('aiText').value.trim();
  if(!text){ aiStatus('err','대화 내용을 붙여넣어주세요'); return; }
  var key=localStorage.getItem('ss_claude_key');
  var model=localStorage.getItem('ss_claude_model')||'claude-opus-4-8';
  var btn=this; btn.disabled=true;
  aiStatus('load','🤖 Claude가 대화를 읽는 중...');
  try{
    await loadCatalog();
    var catRef=buildCatalogRef();
    var res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key':key,
        'anthropic-version':'2023-06-01',
        'anthropic-dangerous-direct-browser-access':'true'
      },
      body:JSON.stringify({
        model:model,
        max_tokens:2048,
        system:'당신은 일러스트 커미션 작가의 비서입니다. 작가와 신청자(의뢰인)의 대화/신청양식에서 두 가지를 추출하세요: (1) 작가의 할일 (2) 신청 들어온 표정·파츠 인벤토리.\n'
          +'[todos = 작가가 할 일정성 작업]\n'
          +'- 작가의 작업·확인·연락 등 일정에 걸 만한 실행 항목만. 신청자가 할 일·잡담·가격계산은 제외.\n'
          +'- 8자 내외로 간결하게 (예: "러프 전달", "입금 확인").\n'
          +'- 날짜 언급 시 YYYY-MM-DD로 date에, 없으면 빈 문자열. 오늘은 '+todayStr()+'. "15일쯤 러프"→그날 할일, "25일까지 완성"→그날.\n'
          +'- 개별 표정 하나하나, 안경·소품 같은 자잘한 파츠는 todos에 넣지 마세요(아래 inventory로).\n'
          +'[inventory = 빠뜨리면 안 되는 체크리스트]\n'
          +'- expressions: 신청 들어온 표정 이름들 (예: 빠직, 정색, 하트눈, 눈물, 볼빵빵, 슬라임 표정). 기본 제공 표정도 포함.\n'
          +'- parts: 그려야 할 모든 파츠·소품·옵션 이름 (예: 베레모 on/off, 망토 on/off, 슬라임, 안경, 게임기, 인체 풀파츠, 헤어추가). 기본 구성요소든 선택 추가든 다 넣음.\n'
          +'- 색상·위치·재질 같은 디자인 디테일은 제외, 물리적 파츠/옵션 명칭만 짧게. 중복·유사는 합침.\n'
          +'[order_summary = ⚡단계 추천]\n'
          +'- full_option: 풀옵션 신청 여부.  chukjeon: 데뷔축전 포함 여부.  samyeon: 삼면도(3면도) 포함 여부.\n'
          +'- extra_parts: "기본 디자인 밖 선택 추가파츠"(게임기 파츠·인체 풀파츠·의상추가·헤어추가)의 개수를 2로 나눠 올림한 정수.\n'
          +'  → 모자·베레모·망토·슬라임·안경·동물귀·꼬리·표정 등 그 캐릭터에 그려지는 기본 구성요소는 on/off여도 세지 않음.'
          +catRef,
        messages:[{role:'user', content:text}],
        output_config:{format:{type:'json_schema', schema:{
              type:'object',
              properties:{
                todos:{type:'array', items:{
                    type:'object',
                    properties:{
                      text:{type:'string', description:'할일 내용 (간결하게)'},
                      date:{type:'string', description:'YYYY-MM-DD 형식 날짜. 날짜 언급이 없으면 빈 문자열'}
                    },
                    required:['text','date'], additionalProperties:false
                  }},
                inventory:{type:'object', properties:{
                    expressions:{type:'array', items:{type:'string'}, description:'신청 들어온 표정 이름 목록'},
                    parts:{type:'array', items:{type:'string'}, description:'그려야 할 파츠·소품·옵션 이름 목록'}
                  }, required:['expressions','parts'], additionalProperties:false},
                order_summary:{type:'object', properties:{
                    full_option:{type:'boolean', description:'풀옵션 신청 여부'},
                    chukjeon:{type:'boolean', description:'데뷔축전 포함 여부'},
                    samyeon:{type:'boolean', description:'삼면도(3면도) 포함 여부'},
                    extra_parts:{type:'integer', description:'추가파츠 태그 수 = 기본 디자인 밖 선택 추가파츠 개수 ÷ 2 올림'}
                  }, required:['full_option','chukjeon','samyeon','extra_parts'], additionalProperties:false}
              },
              required:['todos','inventory','order_summary'], additionalProperties:false
            }}}
      })
    });
    if(!res.ok){
      var err=await res.json().catch(function(){return {};});
      var msg=(err.error&&err.error.message)||('HTTP '+res.status);
      if(res.status===401) msg='API 키가 올바르지 않아요. 설정에서 확인해주세요.';
      if(res.status===429) msg='요청이 너무 많아요. 잠시 후 다시 시도해주세요.';
      throw new Error(msg);
    }
    var data=await res.json();
    var textBlock=(data.content||[]).filter(function(b){return b.type==='text';})[0];
    if(!textBlock) throw new Error('응답이 비어있어요');
    var parsed=JSON.parse(textBlock.text);
    _aiResult=(parsed.todos||[]).filter(function(t){return t.text&&t.text.trim();});
    _aiInventory=parsed.inventory||{expressions:[],parts:[]};
    _aiOrder=parsed.order_summary||null;
    var invN=(_aiInventory.expressions||[]).length+(_aiInventory.parts||[]).length;
    if(!_aiResult.length && !invN){ aiStatus('err','추출된 내용이 없어요. 대화/신청양식을 확인해주세요.'); btn.disabled=false; return; }
    // 미리보기 렌더
    var pv=document.getElementById('aiPreview');
    pv.innerHTML='';
    _aiResult.forEach(function(t,i){
      var row=document.createElement('label');
      row.className='ai-item';
      row.innerHTML='<input type="checkbox" checked data-i="'+i+'"><span>'+esc(t.text)+'</span>'
        +(t.date?'<span class="adate">📅 '+esc(t.date)+'</span>':'');
      pv.appendChild(row);
    });
    if(invN){
      var inv=document.createElement('div');
      inv.style.cssText='margin-top:6px;padding:9px 11px;border-radius:8px;border:1px dashed var(--border);background:var(--panel2);font-size:12.5px;color:var(--text2);line-height:1.6;';
      inv.innerHTML='<b style="color:var(--text);">📋 신청 내역도 추출됨</b> (추가 시 함께 저장)<br>'
        +'🎭 '+( (_aiInventory.expressions||[]).map(esc).join(', ')||'-' )+'<br>'
        +'🧩 '+( (_aiInventory.parts||[]).map(esc).join(', ')||'-' );
      pv.appendChild(inv);
    }
    if(_aiOrder){
      var o=_aiOrder, prevTags=stageTags({full:!!o.full_option,chuk:!!o.chukjeon,sam:!!o.samyeon,extra:Math.max(0,o.extra_parts|0)});
      var box=document.createElement('div');
      box.style.cssText='margin-top:6px;padding:9px 11px;border-radius:8px;border:1px dashed rgba(61,142,240,.4);background:rgba(61,142,240,.07);font-size:12.5px;color:var(--text2);line-height:1.7;';
      box.innerHTML='<b style="color:var(--Y);">⚡ 단계 추천</b> '
        +'풀옵션 '+(o.full_option?'✓':'✗')+' · 축전 '+(o.chukjeon?'✓':'✗')+' · 삼면도 '+(o.samyeon?'✓':'✗')+' · 추가파츠 '+(o.extra_parts|0)+'개<br>'
        +'<span style="color:var(--text3);">→ '+prevTags.join(' · ')+'</span>';
      var gbtn=document.createElement('button');
      gbtn.textContent='⚡ 이대로 단계 태그 생성';
      gbtn.style.cssText='margin-top:8px;width:100%;padding:8px;border-radius:8px;border:1px solid var(--Y);background:transparent;color:var(--Y);font-family:var(--cond);font-weight:700;font-size:13px;letter-spacing:.5px;cursor:pointer;';
      gbtn.addEventListener('click',function(){
        var client=document.getElementById('aiClient').value;
        var added=genStageTags(client,{full:!!o.full_option,chuk:!!o.chukjeon,sam:!!o.samyeon,extra:Math.max(0,o.extra_parts|0)});
        toast(added?('⚡ 단계 태그 '+added+'개 생성!'):'이미 모든 단계 태그가 있어요');
        gbtn.disabled=true; gbtn.style.opacity='.5'; gbtn.textContent='✓ 생성됨';
      });
      box.appendChild(gbtn);
      pv.appendChild(box);
    }
    pv.className='ai-preview show';
    document.getElementById('aiAdd').style.display='';
    aiStatus('ok','✅ 할일 '+_aiResult.length+'개'+(invN?' · 신청내역 '+invN+'개':'')+' 추출! 추가할 할일을 선택하세요.');
  }catch(e){
    aiStatus('err','❌ '+e.message);
  }
  btn.disabled=false;
});

document.getElementById('aiAdd').addEventListener('click',function(){
  var client=document.getElementById('aiClient').value;
  var checks=document.querySelectorAll('#aiPreview input:checked');
  var added=0, placed=0;
  checks.forEach(function(c){
    var t=_aiResult[+c.dataset.i];
    if(!t) return;
    var todo={id:uid(), client:client||'', text:t.text.trim()};
    state.todos.push(todo); added++;
    if(t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date)){
      state.placements.push({id:uid(), todoId:todo.id, date:t.date, done:false});
      placed++;
    }
  });
  // 인벤토리 병합 (표정·파츠)
  var invAdded=mergeInventory(client, _aiInventory.expressions, _aiInventory.parts);
  // 대시보드 등록 (체크 시, 신청자명 있을 때)
  var dashMsg='';
  if(document.getElementById('aiToDash').checked && client && client!=='__none__'){
    var r=upsertDashboard(client, inventoryText(client));
    if(r && !r.skipped) dashMsg=r.created?' · 대시보드 카드 생성':' · 대시보드 갱신';
  }
  if(added || invAdded || dashMsg){
    save(); renderTags(); renderGrid();
    var parts=[];
    if(added) parts.push('할일 '+added+'개'+(placed?'('+placed+' 배치)':''));
    if(invAdded) parts.push('신청내역 '+invAdded+'개');
    toast('🤖 '+(parts.join(' · ')||'추가')+dashMsg+'!');
    closeModal('aiModal');
  } else toast('추가할 항목이 없어요');
});

/* ════════ 초기 렌더 ════════ */
renderSelect();
renderTags();
renderGrid();
