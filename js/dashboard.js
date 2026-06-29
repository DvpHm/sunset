/* ─── 설정 ─── */
/* 비밀번호는 SHA-256 해시로만 저장 — F12로 원문 확인 불가 */
var DASH_HASH = '0f492f732b927f8885359593c2ecc8f78fd2041fbafb4bb411bd37b1722e7f02';
var STORAGE_KEY = 'ss_dash_v1';
var STAGES = ['접수','입금확인','러프','러프컨펌','선화','채색','완성','전달완료'];
var PLATFORMS = {
  '':       {label:'없음',        color:'#7A7870', bg:'rgba(122,120,112,.15)'},
  'artmug': {label:'아트머그',    color:'#ff6b6b', bg:'rgba(255,107,107,.15)'},
  'tally':  {label:'Tally',       color:'#4ecdc4', bg:'rgba(78,205,196,.15)'},
  'x':      {label:'X (트위터)', color:'#1d9bf0', bg:'rgba(29,155,240,.15)'},
  'dm':     {label:'직접 DM',   color:'#a78bfa', bg:'rgba(167,139,250,.15)'},
};
var TAG_COLORS = {
  '': {label:'없음', bg:'transparent', border:'#2d3748', text:'#4a5568'},
  'sky':   {label:'전신', bg:'rgba(61,142,240,.18)', border:'#3D8EF0', text:'#3D8EF0'},
  'pink':  {label:'반신', bg:'rgba(244,114,182,.18)', border:'#f472b6', text:'#f472b6'},
  'green': {label:'데뷔축전', bg:'rgba(52,211,153,.18)', border:'#34d399', text:'#34d399'},
  'yellow':{label:'리깅세트', bg:'rgba(251,191,36,.18)', border:'#fbbf24', text:'#fbbf24'},
  'purple':{label:'기타', bg:'rgba(167,139,250,.18)', border:'#a78bfa', text:'#a78bfa'},
};

async function _hashPw(pw){
  var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
}

/* ─── 상태 ─── */
var commissions = [];
var _editIdx      = -1;
var _editStage    = 0;
var _editTag      = '';
var _editPlatform = '';
var _filter     = 'all';
var _confirmIdx = -1; /* 인라인 확인 대상 인덱스 */
var _dlvFiles   = [];

/* ─── 로그인 ─── */
function doLogin(){
  var v = document.getElementById('loginInput').value;
  _hashPw(v).then(function(h){
    if(h === DASH_HASH){
      sessionStorage.setItem('dash_auth','1');
      document.getElementById('loginScreen').style.display='none';
      document.getElementById('app').style.display='block';
      loadData();
      applyNotice(); renderAll();
    } else {
      document.getElementById('loginErr').textContent='비밀번호가 틀렸어요';
      document.getElementById('loginInput').value='';
    }
  });
}
function doLogout(){
  sessionStorage.removeItem('dash_auth');
  location.reload();
}
/* 자동 로그인 체크 */
if(sessionStorage.getItem('dash_auth')==='1'){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('app').style.display='block';
}

/* ─── 데이터 ─── */
function saveData(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(commissions)); }catch(e){}
  scheduleSync();
}
function loadData(){
  try{
    var raw=localStorage.getItem(STORAGE_KEY);
    if(raw) commissions=JSON.parse(raw);
    document.getElementById('zipName').value = '[선셋]완성본.zip';
  }catch(e){}
}

/* ─── 렌더 ─── */
function renderAll(){ renderStats(); renderCards(); }

function renderStats(){
  var today=new Date(); today.setHours(0,0,0,0);
  var active=commissions.filter(function(c){return c.stage<STAGES.length-1;}).length;
  var done=commissions.filter(function(c){return c.stage===STAGES.length-1;}).length;
  var now=new Date(); var ym=now.getFullYear()+'-'+(now.getMonth()+1+'').padStart(2,'0');
  /* 납품완료(전달완료) 단계인 것만 수익으로 집계 */
  var delivered=commissions.filter(function(c){return c.stage===STAGES.length-1;});
  var income=delivered
    .filter(function(c){return c.paidAt&&c.paidAt.startsWith(ym)&&c.amount;})
    .reduce(function(s,c){return s+parseInt(c.amount||0);},0);
  document.getElementById('stTotal').textContent=commissions.length;
  var allTime=delivered.filter(function(c){return c.amount;}).reduce(function(s,c){return s+parseInt(c.amount||0);},0);
  document.getElementById('stAllTime').textContent=allTime.toLocaleString()+'원';
  document.getElementById('stActive').textContent=active;
  document.getElementById('stDone').textContent=done;
  document.getElementById('stIncome').textContent=income.toLocaleString();
  document.getElementById('hStatActive').textContent=active;
  document.getElementById('hStatIncome').textContent=income.toLocaleString()+'원';
  /* 12. 다음 마감 카운트다운 */
  var upcoming=commissions.filter(function(c){return c.deadline&&c.stage<STAGES.length-1;})
    .sort(function(a,b){return new Date(a.deadline)-new Date(b.deadline)});
  var dpill=document.getElementById('hNextDeadline');
  if(upcoming.length){
    var nd=new Date(upcoming[0].deadline); var diff=Math.ceil((nd-today)/86400000);
    var name=upcoming[0].client;
    if(diff<0){ dpill.className='deadline-pill'; dpill.textContent='⚠️ '+name+' '+Math.abs(diff)+'일 초과'; }
    else if(diff===0){ dpill.className='deadline-pill'; dpill.textContent='🔥 '+name+' 오늘 마감!'; }
    else if(diff<=3){ dpill.className='deadline-pill warn'; dpill.textContent='⏰ '+name+' D-'+diff; }
    else { dpill.className='deadline-pill ok'; dpill.textContent='📅 '+name+' D-'+diff; }
  } else {
    dpill.className='deadline-pill ok'; dpill.textContent='📅 마감 없음';
  }
}

function renderCards(){
  var q=(document.getElementById('searchInput').value||'').toLowerCase();
  var sortVal=(document.getElementById('sortSelect')||{}).value||'reg';
  var today=new Date(); today.setHours(0,0,0,0);

  var filtered=commissions.filter(function(c,i){
    c._idx=i;
    if(q&&!(c.client.toLowerCase().includes(q)||(c.type||'').toLowerCase().includes(q)))return false;
    if(_filter==='active'&&c.stage===STAGES.length-1)return false;
    if(_filter==='done'&&c.stage!==STAGES.length-1)return false;
    if(_filter==='pending'&&!c.pending)return false;
    if(_filter==='overdue'){
      if(!c.deadline)return false;
      var d=new Date(c.deadline); if(d>=today||c.stage===STAGES.length-1)return false;
    }
    return true;
  });

  /* 5. 정렬 */
  if(sortVal==='deadline'){
    filtered.sort(function(a,b){
      if(!a.deadline&&!b.deadline)return 0;
      if(!a.deadline)return 1; if(!b.deadline)return -1;
      return new Date(a.deadline)-new Date(b.deadline);
    });
  } else if(sortVal==='amount'){
    filtered.sort(function(a,b){return parseInt(b.amount||0)-parseInt(a.amount||0);});
  } else if(sortVal==='stage'){
    filtered.sort(function(a,b){return b.stage-a.stage;});
  }

  if(!filtered.length){
    document.getElementById('commGrid').innerHTML=
      '<div class="empty-state"><div class="ei">📋</div><p>해당 조건의 의뢰가 없어요</p></div>';
    return;
  }

  document.getElementById('commGrid').innerHTML=filtered.map(function(c){
    var i=c._idx;
    var isDone=c.stage===STAGES.length-1;
    var dlClass=''; var dlText='';
    if(c.deadline){
      var d=new Date(c.deadline); var diff=Math.ceil((d-today)/86400000);
      if(isDone){ dlClass=''; dlText='✅ 완료'; }
      else if(diff<0){ dlClass='over'; dlText='⚠️ '+Math.abs(diff)+'일 초과'; }
      else if(diff===0){ dlClass='warn'; dlText='📅 오늘 마감'; }
      else if(diff<=3){ dlClass='warn'; dlText='⏰ '+diff+'일 남음'; }
      else { dlText=diff+'일 남음'; }
    }
    var pct=Math.round(c.stage/(STAGES.length-1)*100);
    var stages=STAGES.map(function(s,si){
      var cls=si<c.stage?'prev':si===c.stage?'cur':si===STAGES.length-1&&isDone?'done-s':'';
      return '<button class="cc-stage '+cls+'" onclick="event.stopPropagation();setStage('+i+','+si+')">'+s+'</button>';
    }).join('');

    /* 11. 색상 태그 */
    var tagKey=c.tag||'';
    var tagCfg=TAG_COLORS[tagKey]||TAG_COLORS[''];
    // var tagBorderStyle=tagKey?'border-left:3px solid '+tagCfg.border+';':'';
    var tagBorderStyle='border-left:3px solid #d97706;';
    var tagHtml=tagKey?'<span class="tag-pill" style="background:'+tagCfg.bg+';color:'+tagCfg.text+'">'+tagCfg.label+'</span>':'';
    /* 플랫폼 배지 */
    var platKey=c.platform||'';
    var platCfg=PLATFORMS[platKey]||null;
    var platHtml=platKey&&platCfg?'<span class="platform-badge" style="background:'+platCfg.bg+';color:'+platCfg.color+'">'+platCfg.label+'</span>':'';

    /* 1. 인라인 확인 UI — onclick에 숫자 인덱스만 사용해 따옴표 충돌 방지 */
    var confirmHtml=c.pending
      ?'<div class="inline-confirm" id="ic_pay_'+i+'"><span class="ic-msg">입금확인?</span>'
      +'<button class="ic-yes" onclick="event.stopPropagation();doConfirmPayment('+i+')">✅ 확정</button>'
      +'<button class="ic-no" onclick="event.stopPropagation();hidePayConfirm('+i+')">✕</button></div>'
      +'<button class="cc-act confirm" id="icbtn_pay_'+i+'" onclick="event.stopPropagation();showPayConfirm('+i+')">결제확정</button>'
      :'';
    var delHtml='<div class="inline-confirm" id="ic_del_'+i+'"><span class="ic-msg">삭제?</span>'
      +'<button class="ic-yes" style="border-color:var(--red);color:var(--red)" onclick="event.stopPropagation();doDelComm('+i+')">삭제</button>'
      +'<button class="ic-no" onclick="event.stopPropagation();hideDelConfirm('+i+')">✕</button></div>'
      +'<button class="cc-act del" id="icbtn_del_'+i+'" onclick="event.stopPropagation();showDelConfirm('+i+')">✕</button>';

    return '<div class="comm-card'+(isDone?' done':dlClass==='over'?' overdue':'')+(c.pending?' pending':'')+'" style="'+tagBorderStyle+'" onclick="openModal('+i+')">'
      +'<div class="cc-header"><div><div class="cc-client">'+c.client+(c.pending?'<span class="pending-badge">결제대기</span>':'')+platHtml+tagHtml+'</div><div class="cc-type">'+(c.type||'')+(c.contact?'<span style="margin-left:6px;color:var(--text3);font-size:10px">📱 '+c.contact+'</span>':'')+'</div></div>'
      +(c.amount?'<div class="cc-amount">'+parseInt(c.amount).toLocaleString()+'원</div>':'')+'</div>'
      +'<div class="cc-progress"><div class="cc-stages">'+stages+'</div>'
      +'<div class="cc-bar"><div class="cc-bar-fill'+(isDone?' done-bar':'')+'" style="width:'+pct+'%"></div></div></div>'
      +(c.note?'<div class="cc-note">📝 '+c.note+'</div>':'')+(c.memo?'<div class="cc-memo">🗒 '+c.memo+'</div>':'')
      +(function(){
        var dateRangeStr=c.startDate
          ?'<div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:2px">'+c.startDate.slice(5).replace('-','/')+' → '+c.deadline.slice(5).replace('-','/')+'</div>'
          :(c.deadline?'<div style="font-size:10px;color:var(--text3);font-family:var(--mono);margin-top:2px">'+c.deadline.slice(5).replace('-','/')+'</div>':'');
        return '<div class="cc-footer"><div><div class="cc-deadline '+dlClass+'">'+dlText+'</div>'+dateRangeStr+'</div>';
      })()
      +'<div class="cc-actions" onclick="event.stopPropagation()">'
      +confirmHtml
      // +'<button class="cc-act deliver" onclick="openDlvFor('+i+')">📦 납품</button>'
      +delHtml
      +'</div></div></div>';
  }).join('');
}

function setFilter(el){
  document.querySelectorAll('.tf-opt').forEach(function(b){b.classList.remove('sel');});
  el.classList.add('sel'); _filter=el.dataset.f; renderCards();
}

/* ─── 의뢰 CRUD ─── */
function setStage(i,s){
  commissions[i].stage=s;
  if(s===STAGES.length-1&&!commissions[i].paidAt){
    commissions[i].paidAt=new Date().toISOString().slice(0,7);
  }
  saveData(); renderAll();
}
/* 1. 인라인 확인 헬퍼 — 인덱스 기반으로 ID 충돌 없이 동작 */
function _showIC(confirmId, btnId){
  document.querySelectorAll('.inline-confirm.show').forEach(function(el){
    el.classList.remove('show');
    var b=document.getElementById(el.id.replace('ic_','icbtn_')); if(b) b.style.display='';
  });
  var el=document.getElementById(confirmId); if(el) el.classList.add('show');
  var btn=document.getElementById(btnId); if(btn) btn.style.display='none';
}
function _hideIC(confirmId){
  var el=document.getElementById(confirmId); if(!el)return;
  el.classList.remove('show');
  var btn=document.getElementById(confirmId.replace('ic_','icbtn_')); if(btn) btn.style.display='';
}
function showPayConfirm(i){ _showIC('ic_pay_'+i,'icbtn_pay_'+i); }
function hidePayConfirm(i){ _hideIC('ic_pay_'+i); }
function showDelConfirm(i){ _showIC('ic_del_'+i,'icbtn_del_'+i); }
function hideDelConfirm(i){ _hideIC('ic_del_'+i); }
/* 하위 호환 */
function showInlineConfirm(cid,bid){ _showIC(cid,bid); }
function hideInlineConfirm(cid){ _hideIC(cid); }
function doDelComm(i){
  commissions.splice(i,1); saveData(); renderAll();
  showToast('🗑 의뢰가 삭제됐어요');
}
function delComm(i){ showInlineConfirm('ic_del_'+i,'icbtn_del_'+i); }

/* ─── 편집 모달 ─── */
function openModal(idx){
  _editIdx=idx;
  var isNew=idx<0; var c=isNew?{}:commissions[idx];
  document.getElementById('editTitle').textContent=isNew?'새 의뢰 추가':'의뢰 수정';
  document.getElementById('fClient').value=c.client||'';
  document.getElementById('fType').value=c.type||'';
  document.getElementById('fAmount').value=c.amount||'';
  document.getElementById('fDeadline').value=c.deadline||'';
  document.getElementById('fStartDate').value=c.startDate||'';
  document.getElementById('fEmail').value=c.email||'';
  document.getElementById('fNote').value=c.note||'';
  document.getElementById('fContact').value=c.contact||'';
  if(document.getElementById('fMemo')) document.getElementById('fMemo').value=c.memo||'';
  _editStage=c.stage||0;
  _editTag=c.tag||'';
  _editPlatform=c.platform||'';
  renderStagePicker();
  renderTagSwatches();
  renderPlatformPicker('platformPicker', '_editPlatform');
  document.getElementById('editModal').classList.add('open');
}
function closeModal(){ document.getElementById('editModal').classList.remove('open'); }
function renderStagePicker(){
  document.getElementById('stagePicker').innerHTML=STAGES.map(function(s,i){
    return '<button class="sp-btn'+(i===_editStage?' sel':'')+'" onclick="pickStage('+i+')">'+s+'</button>';
  }).join('');
}
function pickStage(i){
  _editStage=i; renderStagePicker();
}
function renderTagSwatches(){
  var wrap=document.getElementById('tagSwatches'); if(!wrap)return;
  wrap.innerHTML=Object.keys(TAG_COLORS).map(function(k){
      var tc=TAG_COLORS[k];
      return '<div class="tag-swatch'+(k===_editTag?' sel':'')+'" '
        +'style="background:'+(k?tc.bg:'var(--card2)')+';border-color:'+(k?tc.border:'#FFF3D6')+'" '
        +'title="'+tc.label+'" data-tagkey="'+k+'"></div>';
    }).join('')
    +'<span style="font-size:11px;color:var(--text3);align-self:center;margin-left:4px" id="tagLabel">'
    +(TAG_COLORS[_editTag]?TAG_COLORS[_editTag].label:'없음')+'</span>';
  wrap.onclick=function(e){
    var el=e.target.closest('[data-tagkey]');
    if(!el)return;
    pickTag(el.getAttribute('data-tagkey'));
  };
}
function pickTag(k){
  _editTag=k; renderTagSwatches();
}

/* ─── 플랫폼 피커 ─── */
var _parsePlatform='';
function renderPlatformPicker(containerId, stateVar){
  var wrap=document.getElementById(containerId); if(!wrap)return;
  var cur=stateVar==='_editPlatform'?_editPlatform:_parsePlatform;
  wrap.innerHTML=Object.keys(PLATFORMS).map(function(k){
    var p=PLATFORMS[k];
    var isSel=k===cur;
    var selStyle=isSel?'border-color:'+p.color+';background:'+p.bg+';color:'+p.color+';':'' ;
    return '<button class="pp-btn'+(isSel?' sel':'')+'" style="'+selStyle+'" onclick="pickPlatform(\''+k+'\',\''+containerId+'\',\''+stateVar+'\')">'+p.label+'</button>';
  }).join('');
}
function pickPlatform(k, containerId, stateVar){
  if(stateVar==='_editPlatform') _editPlatform=k;
  else _parsePlatform=k;
  renderPlatformPicker(containerId, stateVar);
}
function saveModal(){
  var client=document.getElementById('fClient').value.trim();
  if(!client){alert('의뢰인 닉네임을 입력해주세요');return;}
  var obj={
    client:client, type:document.getElementById('fType').value.trim(),
    amount:document.getElementById('fAmount').value,
    deadline:document.getElementById('fDeadline').value,
    startDate:document.getElementById('fStartDate').value,
    email:document.getElementById('fEmail').value.trim(),
    note:document.getElementById('fNote').value.trim(),
    memo:document.getElementById('fMemo')?document.getElementById('fMemo').value.trim():(_editIdx>=0?(commissions[_editIdx].memo||''):''),
    tag:_editTag||'',
    platform:_editPlatform||'',
    contact:document.getElementById('fContact').value.trim(),
    stage:_editStage,
    paidAt:_editIdx>=0?commissions[_editIdx].paidAt:undefined
  };
  if(_editIdx<0) commissions.push(obj); else commissions[_editIdx]=obj;
  saveData(); renderAll(); closeModal();
}

/* ─── 납품 ─── */
function openDlvFor(i){
  var c=commissions[i];
  _dlvFiles=[];
  document.getElementById('dlvClient').value=c.client||'';
  document.getElementById('dlvEmail').value=c.email||'';
  document.getElementById('dlvSubject').value='[선셋] '+c.client+'님 완성본 전달';
  document.getElementById('dlvNote').value='완성된 작품 파일 전달드립니다.\n\n감사합니다!\n— 선셋 (@sunset)';
  // document.getElementById('dlvFileList').innerHTML='';
  // document.getElementById('dlvProg').style.display='none';
  document.getElementById('dlvModal').classList.add('open');
}
function closeDlvModal(){ document.getElementById('dlvModal').classList.remove('open'); }
function onDlvFileChange(input){
  _dlvFiles=Array.from(input.files);
  var list=document.getElementById('dlvFileList');
  list.innerHTML=_dlvFiles.map(function(f){
    return '<div class="file-item">📄 '+f.name+' ('+_fmtSize(f.size)+')</div>';
  }).join('');
}
function _fmtSize(b){if(b<1024)return b+'B';if(b<1048576)return (b/1024).toFixed(1)+'KB';return (b/1048576).toFixed(1)+'MB';}
async function dlvZip(){
  if(!_dlvFiles.length){alert('파일을 먼저 선택해주세요');return;}
  if(!window.JSZip){
    var s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    document.head.appendChild(s);
    await new Promise(function(r){s.onload=r;});
  }
  var pb=document.getElementById('dlvProg'),pf=document.getElementById('dlvProgFill');
  pb.style.display='block'; pf.style.width='0%';
  var zip=new JSZip();
  var client=document.getElementById('dlvClient').value.trim()||'납품';
  var folder=zip.folder(client+'_납품파일');
  for(var i=0;i<_dlvFiles.length;i++){
    folder.file(_dlvFiles[i].name, await _dlvFiles[i].arrayBuffer());
    pf.style.width=((i+1)/_dlvFiles.length*80)+'%';
  }
  var blob=await zip.generateAsync({type:'blob'});
  pf.style.width='100%';
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=client+'_납품파일.zip';
  document.body.appendChild(a); a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();pb.style.display='none';},1500);
  showToast('📥 ZIP 다운로드 완료!');
}
function dlvGmail(){
  var client=document.getElementById('dlvClient').value.trim();
  var email=document.getElementById('dlvEmail').value.trim();
  var note=document.getElementById('dlvNote').value.trim();
  var su=encodeURIComponent('[선셋] '+client+'님 완성본 전달');
  var bd=encodeURIComponent((client?client+'님, 안녕하세요! 선셋 입니다.\n\n':'안녕하세요! 선셋 입니다.\n\n')
    +'완성된 작품 파일 전달드립니다.\n\n'+(note?note+'\n\n':'')
    +'감사합니다!\n— 선셋 (@sunset)');
  window.open('https://mail.google.com/mail/?view=cm&fs=1'+(email?'&to='+encodeURIComponent(email):'')+
    '&su='+su+'&body='+bd,'_blank');
}

/* ─── 자동 데이터 동기화 ─── */
var _syncTimer=null;
var _syncSha=null;

function scheduleSync(){
  var ind=document.getElementById('syncIndicator');
  if(ind) ind.style.display='flex';
  var dot=document.getElementById('syncDot');
  var lbl=document.getElementById('syncLabel');
  if(dot) dot.style.background='var(--yellow)';
  if(lbl) lbl.textContent='동기화 중...';
  if(_syncTimer) clearTimeout(_syncTimer);
  _syncTimer=setTimeout(autoSyncData,2000);
}

async function autoSyncData(){
  var c=_ghCfg();
  if(!c.token||!c.user||!c.repo) return;
  var dot=document.getElementById('syncDot');
  var lbl=document.getElementById('syncLabel');
  try{
    var payload={updated:new Date().toISOString(),commissions:commissions};
    var content=btoa(unescape(encodeURIComponent(JSON.stringify(payload,null,2))));
    if(!_syncSha) _syncSha=await _ghGetSha(c.user,c.repo,c.token,'data/commissions.json');
    var body={message:'auto: sync commissions data',content:content};
    if(_syncSha) body.sha=_syncSha;
    var res=await fetch('https://api.github.com/repos/'+c.user+'/'+c.repo+'/contents/data/commissions.json',{
      method:'PUT',
      headers:{'Authorization':'token '+c.token,'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if(res.ok){
      var json=await res.json();
      _syncSha=json.content&&json.content.sha||json.commit&&json.commit.sha||_syncSha;
      if(dot) dot.style.background='var(--green)';
      if(lbl) lbl.textContent='동기화됨 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    } else {
      if(dot) dot.style.background='var(--red)';
      if(lbl) lbl.textContent='동기화 실패';
    }
  }catch(e){
    if(dot) dot.style.background='var(--red)';
    if(lbl) lbl.textContent='동기화 오류';
  }
}

/* ─── GitHub ─── */
function _ghCfg(){ return {user:localStorage.getItem('gh_user')||'',repo:localStorage.getItem('gh_repo')||'',token:localStorage.getItem('gh_token')||''}; }
function openGhModal(){
  var c=_ghCfg();
  document.getElementById('ghUser').value=c.user||'DvpHm';
  document.getElementById('ghRepo').value=c.repo||'sunset';
  document.getElementById('ghToken').value=c.token||'';
  document.getElementById('ghStatus').className='gh-status';
  document.getElementById('ghModal').classList.add('open');
  var u=document.getElementById('ghUser').value||'DvpHm';
  var r=document.getElementById('ghRepo').value||'sunset';
  var urlEl=document.getElementById('ghDataUrl');
  if(urlEl){
    urlEl.style.display='block';
    urlEl.textContent='데이터 URL: https://raw.githubusercontent.com/'+u+'/'+r+'/main/data/commissions.json';
  }
}
function closeGhModal(){ document.getElementById('ghModal').classList.remove('open'); }
function saveGhSettings(){
  localStorage.setItem('gh_user', document.getElementById('ghUser').value.trim());
  localStorage.setItem('gh_repo', document.getElementById('ghRepo').value.trim());
  localStorage.setItem('gh_token', document.getElementById('ghToken').value.trim());
  closeGhModal(); showToast('✅ GitHub 설정 저장 완료!');
}
async function testGhToken(){
  var st=document.getElementById('ghStatus');
  st.className='gh-status load'; st.textContent='연결 확인 중...';
  var c=_ghCfg();
  var u=document.getElementById('ghUser').value.trim();
  var r=document.getElementById('ghRepo').value.trim();
  var t=document.getElementById('ghToken').value.trim();
  try{
    var res=await fetch('https://api.github.com/repos/'+u+'/'+r,{headers:{'Authorization':'token '+t}});
    if(res.ok){ st.className='gh-status ok'; st.textContent='✅ 연결 성공! 저장을 눌러주세요.'; }
    else { st.className='gh-status err'; st.textContent='❌ 실패 ('+res.status+'): 토큰과 저장소 이름을 확인해주세요'; }
  }catch(e){ st.className='gh-status err'; st.textContent='❌ 오류: '+e.message; }
}
async function _ghGetSha(u,r,t,path){
  try{var res=await fetch('https://api.github.com/repos/'+u+'/'+r+'/contents/'+path,{headers:{'Authorization':'token '+t}});
    if(!res.ok)return null; return (await res.json()).sha||null;
  }catch(e){return null;}}
async function deployToGitHub(){
  var c=_ghCfg();
  if(!c.token){ openGhModal(); showToast('⚙️ GitHub 설정 먼저 입력해주세요'); return; }
  showToast('🚀 배포 중...');
  /* 현재 HTML에 데이터 굽기 */
  var baked={commissions:commissions};
  var html='<!DOCTYPE html>\n'+document.documentElement.outerHTML;
  var inject='<script>if(window.__DASH_BAKED__)Object.assign(window,window.__DASH_BAKED__);window.__DASH_BAKED__='+JSON.stringify(baked)+';<\/script>';
  html=html.replace(/<script>if\(window\.__DASH_BAKED__[\s\S]*?<\/script>\n?/g,'');
  html=html.replace(/(<head[^>]*>)/i,'$1\n'+inject);
  var content64=btoa(unescape(encodeURIComponent(html)));
  try{
    var sha=await _ghGetSha(c.user,c.repo,c.token,'dashboard.html');
    var res=await fetch('https://api.github.com/repos/'+c.user+'/'+c.repo+'/contents/dashboard.html',{
      method:'PUT',
      headers:{'Authorization':'token '+c.token,'Content-Type':'application/json'},
      body:JSON.stringify({message:'📊 대시보드 업데이트 '+new Date().toLocaleString('ko-KR'),content:content64,sha:sha||undefined})
    });
    if(res.ok) showToast('🚀 배포 완료! dashboard.html로 저장됐어요');
    else { var e=await res.json(); showToast('❌ 실패: '+(e.message||res.status)); }
  }catch(e){ showToast('❌ 오류: '+e.message); }
}


/* ─── 결제 확정 ─── */
function doConfirmPayment(i){
  commissions[i].pending=false;
  if(!commissions[i].paidAt) commissions[i].paidAt=new Date().toISOString().slice(0,7);
  saveData(); renderAll();
  showToast('✅ '+commissions[i].client+'님 결제 확정!');
}
function confirmPayment(i){ showInlineConfirm('ic_pay_'+i,'icbtn_pay_'+i); }

/* ─── 신청서 파싱 ─── */
var _parsed={};
function openParseModal(){
  document.getElementById('parseTa').value='';
  document.getElementById('parsePreviewWrap').style.display='none';
  document.getElementById('parseRegBtn').style.display='none';
  document.getElementById('parseContact').value='';
  _parsed={};
  _parsePlatform='';
  document.getElementById('parseModal').classList.add('open');
}
function closeParseModal(){ document.getElementById('parseModal').classList.remove('open'); }

function parseLive(){
  var txt=document.getElementById('parseTa').value;
  if(!txt.trim()){ document.getElementById('parsePreviewWrap').style.display='none'; document.getElementById('parseRegBtn').style.display='none'; return; }

  _parsed={};
  var lines=txt.split('\n').map(function(l){return l.trim();});

  /* 합계 금액 */
  var amtLine=lines.find(function(l){return l.includes('합계 금액');});
  if(amtLine){ var m=amtLine.match(/([\d,]+)원/); if(m) _parsed.amount=m[1].replace(/,/g,''); }
  document.getElementById('parseAmount').value=_parsed.amount||'';

  /* 이메일 */
  var emailIdx=lines.findIndex(function(l){return l.includes('파일 수령 이메일');});
  if(emailIdx>=0 && lines[emailIdx+1]) _parsed.email=lines[emailIdx+1].trim();

  /* 레퍼런스 링크 */
  var refIdx=lines.findIndex(function(l){return l.includes('레퍼런스 링크');});
  if(refIdx>=0 && lines[refIdx+1]) _parsed.ref=lines[refIdx+1].trim();

  /* 작가님께 전할 말 (첫 번째 ▸ 섹션) */
  var msgIdx=lines.findIndex(function(l){return l.includes('작가님께 전할 말');});
  if(msgIdx>=0 && lines[msgIdx+1]) _parsed.msg=lines[msgIdx+1].trim();

  /* 선택 옵션 파싱 (▸ 로 시작하는 섹션들) */
  var opts=[];
  lines.forEach(function(l,i){
    if(l.startsWith('▸')&&!l.includes('합계')&&!l.includes('전할 말')&&!l.includes('레퍼런스')&&!l.includes('이메일')){
      var sec=l.replace('▸','').trim();
      var items=[];
      for(var j=i+1;j<lines.length&&!lines[j].startsWith('▸')&&!lines[j].startsWith('─')&&!lines[j].startsWith('━')&&!lines[j].startsWith('[');j++){
        var il=lines[j];
        if(il.startsWith('·')) items.push(il.replace(/^·\s*/,''));
      }
      if(items.length) opts.push(sec+': '+items.join(', '));
    }
  });
  _parsed.opts=opts;

  /* 미리보기 렌더 */
  var html='';
  if(_parsed.amount) html+='<span class="pk">금액</span> <span class="pv">'+parseInt(_parsed.amount).toLocaleString()+'원</span><br>';
  if(_parsed.email)  html+='<span class="pk">이메일</span> <span class="pv">'+_parsed.email+'</span><br>';
  if(_parsed.ref)    html+='<span class="pk">레퍼런스</span> <span class="pv">'+_parsed.ref+'</span><br>';
  if(_parsed.opts&&_parsed.opts.length){ html+='<span class="pk">선택 옵션</span><br>'; _parsed.opts.forEach(function(o){html+='<span class="pv" style="font-size:11px;padding-left:8px">· '+o+'</span><br>';}); }
  if(_parsed.msg)    html+='<span class="pk">전달 메모</span> <span class="pv">'+_parsed.msg+'</span><br>';

  if(!html){ html='<span style="color:var(--text3)">파싱된 정보가 없어요. 양식 형식이 맞는지 확인해주세요.</span>'; document.getElementById('parseRegBtn').style.display='none'; }
  else document.getElementById('parseRegBtn').style.display='';

  document.getElementById('parseResult').innerHTML=html;
  document.getElementById('parsePreviewWrap').style.display='block';
  renderPlatformPicker('parsePlatformPicker','_parsePlatform');
}

function confirmParse(){
  var amount=document.getElementById('parseAmount').value||_parsed.amount||'';
  var deadline=document.getElementById('parseDeadline').value||'';
  var txt=document.getElementById('parseTa').value.trim();

  /* 의뢰인 닉네임: 첫 번째 비어있지 않은 헤더 라인에서 추론 */
  var clientInput=document.getElementById('parseClient');
  var client=(clientInput&&clientInput.value.trim())||'(신청자)';

  // 작품 종류
  var typeInput=document.getElementById('parseType');

  var note=_parsed.opts?_parsed.opts.join(' / '):'';
  if(note.length>120) note=note.substring(0,120)+'…';

  var obj={
    client:client,
    type:(typeInput&&typeInput.value.trim())||'신청서 파싱',
    amount:amount,
    deadline:deadline,
    startDate:document.getElementById('parseStartDate').value||'',
    email:_parsed.email||'',
    note:note,
    memo:'레퍼런스: '+(_parsed.ref||'없음')+'\n원문:\n'+txt,
    platform:_parsePlatform||'',
    contact:document.getElementById('parseContact').value.trim(),
    stage:0,
    pending:true,
    paidAt:undefined
  };
  commissions.push(obj);
  saveData(); renderAll();
  closeParseModal();
  showToast('📋 결제 대기 상태로 등록됐어요! 클라이언트명을 수정해주세요.');
}


/* ─── 10. CSV 내보내기 ─── */
function exportCSV(){
  if(!commissions.length){showToast('📋 내보낼 의뢰가 없어요');return;}
  var headers=['이름','작품종류','플랫폼','연락처','금액','마감일','이메일','단계','상태','등록월','메모','태그'];
  var rows=commissions.map(function(c){
    return [
      c.client||'',
      c.type||'',
      (PLATFORMS[c.platform||'']||{label:''}).label,
      c.contact||'',
      c.amount||'',
      c.deadline||'',
      c.email||'',
      STAGES[c.stage]||'',
      c.pending?'결제대기':(c.stage===STAGES.length-1?'완료':'진행중'),
      c.paidAt||'',
      (c.note||'').replace(/,/g,' '),
      (TAG_COLORS[c.tag||'']||{label:''}).label
    ].map(function(v){return '"'+String(v).replace(/"/g,'""')+'"';}).join(',');
  });
  var csv='\uFEFF'+headers.join(',')+'\n'+rows.join('\n');
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  a.download='ss_commissions_'+new Date().toISOString().slice(0,10)+'.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1000);
  showToast('📊 CSV 다운로드 완료!');
}

/* ─── 공지 배너 ─── */
function openNoticeEdit(){
  var saved=JSON.parse(localStorage.getItem('ss_notice')||'{}');
  document.getElementById('noticeText').value=saved.text||'';
  document.getElementById('noticeOn').checked=!!saved.on;
  document.getElementById('noticeModal').classList.add('open');
}
function closeNoticeModal(){ document.getElementById('noticeModal').classList.remove('open'); }
function saveNotice(){
  var text=document.getElementById('noticeText').value.trim();
  var on=document.getElementById('noticeOn').checked;
  localStorage.setItem('ss_notice',JSON.stringify({text:text,on:on}));
  applyNotice();
  closeNoticeModal();
  showToast('📢 공지 저장 완료!');
}
function applyNotice(){
  var saved=JSON.parse(localStorage.getItem('ss_notice')||'{}');
  var banner=document.getElementById('noticeBanner');
  if(saved.on&&saved.text){ banner.textContent='📢 '+saved.text; banner.classList.add('show'); }
  else { banner.classList.remove('show'); }
}

/* mail */
const fileInput   = document.getElementById('fileInput');
const fileDrop    = document.getElementById('fileDrop');
const fileList    = document.getElementById('fileList');
const zipSetting  = document.getElementById('zipSetting');
const zipBadge    = document.getElementById('zipBadge');
let selectedFiles = [];

fileDrop.addEventListener('click', () => fileInput.click());

fileDrop.addEventListener('dragover', e => {
  e.preventDefault();
  fileDrop.classList.add('drag-over');
});

fileDrop.addEventListener('dragleave', () => fileDrop.classList.remove('drag-over'));

fileDrop.addEventListener('drop', e => {
  e.preventDefault();
  fileDrop.classList.remove('drag-over');
  addFiles([...e.dataTransfer.files]);
});

fileInput.addEventListener('change', () => {
  addFiles([...fileInput.files]);
  fileInput.value = '';
});

function addFiles(files) {
  files.forEach(f => {
    if (!selectedFiles.find(x => x.name === f.name && x.size === f.size)) {
      selectedFiles.push(f);
    }
  });
  renderFileList();
}

function removeFile(idx) {
  selectedFiles.splice(idx, 1);
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = selectedFiles.map((f, i) => `
      <div class="file-item">
        <span>${f.name} <span style="color:#b4b2a9">(${(f.size/1024).toFixed(1)} KB)</span></span>
        <button onclick="removeFile(${i})" title="제거">×</button>
      </div>
    `).join('');

  const hasFiles = selectedFiles.length > 0;
  zipSetting.classList.toggle('visible', hasFiles);
  updateZipBadge();
}

function toggleZipOptions() {
  const useZip = document.getElementById('useZip').checked;
  document.getElementById('zipNameRow').style.display = useZip ? 'flex' : 'none';
  updateZipBadge();
}

function updateZipBadge() {
  const useZip  = document.getElementById('useZip').checked;
  const hasFiles = selectedFiles.length > 0;
  zipBadge.style.display = (hasFiles && useZip) ? 'inline-flex' : 'none';
}

function setProgress(msg, pct) {
  document.getElementById('progress').classList.add('visible');
  document.getElementById('progressMsg').textContent = msg;
  document.getElementById('progressFill').style.width = pct + '%';
}

function hideProgress() {
  document.getElementById('progress').classList.remove('visible');
  document.getElementById('progressFill').style.width = '0%';
}

async function buildZip() {
  const zip = new JSZip();
  const zipName = document.getElementById('zipName').value.trim() || 'attachments.zip';
  selectedFiles.forEach((f, i) => {
    setProgress(`압축 중... (${i+1}/${selectedFiles.length})`, Math.round((i+1)/selectedFiles.length * 50));
    zip.file(f.name, f);
  });
  setProgress('ZIP 생성 중...', 60);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return new File([blob], zipName, { type: 'application/zip' });
}

function uploadXHR(url, formData) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) {
        const pct = Math.round(e.loaded / e.total * 100);
        setProgress(`서버로 전송 중... ${pct}%`, pct);
      }
    });
    xhr.addEventListener('load', () => {
      try { resolve({ status: xhr.status, data: JSON.parse(xhr.responseText) }); }
      catch { reject(new Error('응답 파싱 오류')); }
    });
    xhr.addEventListener('error', () => reject(new Error('네트워크 오류')));
    xhr.open('POST', url);
    xhr.send(formData);
  });
}

async function sendMail() {
  const apiUrl   = 'http://213.35.116.17:8000/ode/send-mail';

  var email=document.getElementById('dlvEmail').value.trim();
  if(!email){ showToast('❌ 이메일 주소를 입력해주세요'); return; }
  var client=document.getElementById('dlvClient').value.trim();
  var subject=document.getElementById('dlvSubject').value.trim();
  var note=document.getElementById('dlvNote').value.trim();
  const useZip = document.getElementById('useZip').checked;
  const body = note||'완성된 작품 파일 전달드립니다. 파일은 별도로 공유드릴게요!\n\n감사합니다!\n— ODE (@ODE)';

  if (!email || !subject || !body) {
    showToast('받는 사람, 제목, 내용은 필수입니다.', 'error');
    return;
  }

  const btn = document.getElementById('sendBtn');
  btn.disabled = true;
  btn.textContent = '발송 중...';
  document.getElementById('toast').className = 'toast';

  try {
    const formData = new FormData();
    formData.append('name', 'ODE');
    formData.append('to', email);
    formData.append('subject', subject||'[ODE] '+client+'님 완성본 전달');
    formData.append('body', body);
    formData.append('is_html', 'false');

    if (selectedFiles.length > 0) {
      if (useZip) {
        const zipFile = await buildZip();
        formData.append('files', zipFile);
      } else {
        setProgress('업로드 준비 중...', 0);
        selectedFiles.forEach(f => formData.append('files', f));
      }
    }

    const { status, data } = await uploadXHR(apiUrl, formData);
    hideProgress();

    if (status >= 200 && status < 300) {
      showToast(`✓ ${data.message}`, 'success');
      selectedFiles = [];
      renderFileList();
    } else {
      showToast(`오류: ${data.detail || '발송 실패'}`, 'error');
    }
  } catch (e) {
    hideProgress();
    showToast('서버 연결 실패 — API 주소를 확인하세요', 'error');
    console.log(e);
  } finally {
    btn.disabled = false;
    btn.textContent = '발송';
  }
}

/* ─── 토스트 ─── */
var _toastTimer;
function showToast(msg){
  var el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer=setTimeout(function(){el.classList.remove('show');},3000);
}

/* ─── 초기화 ─── */
loadData();
/* baked data 적용 */
if(window.__DASH_BAKED__&&window.__DASH_BAKED__.commissions){
  commissions=window.__DASH_BAKED__.commissions;
  saveData();
}
if(sessionStorage.getItem('dash_auth')==='1'){ applyNotice(); renderAll(); }

/* 다른 탭/플래너에서 ss_dash_v1 변경 시 자동 반영 (storage 이벤트는 변경한 문서엔 안 옴 → 루프 없음) */
window.addEventListener('storage', function(e){
  if(e.key===STORAGE_KEY && sessionStorage.getItem('dash_auth')==='1'){
    loadData(); renderAll();
  }
});
