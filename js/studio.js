function switchTab(id) {
  var ids = ['dashboard', 'planner', 'quote'];
  document.querySelectorAll('.tab-btn').forEach(function(b, i) {
    b.classList.toggle('active', ids[i] === id);
  });
  document.querySelectorAll('.panel').forEach(function(p) {
    p.classList.remove('active');
  });
  document.getElementById('panel-' + id).classList.add('active');
}

// 헤더 통계: localStorage 폴링 (같은 origin이므로 직접 읽기 가능)
function updateStats() {
  // 진행 건수 & 이번주 마감
  try {
    // ss_dash_v1 = 의뢰 배열(직접 저장). stage=숫자(0~7), 7=전달완료, 마감=deadline
    var raw = JSON.parse(localStorage.getItem('ss_dash_v1') || '[]');
    var comms = Array.isArray(raw) ? raw : (raw.commissions || []);
    var DONE = 7;
    function isActive(c){ return (typeof c.stage === 'number' ? c.stage < DONE : c.stage !== '전달완료') && !c.hidden; }
    document.getElementById('stat-wip').textContent = comms.filter(isActive).length;

    var now = new Date();
    var weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // 월요일 시작
    weekStart.setHours(0,0,0,0);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23,59,59,999);
    var weekCount = comms.filter(function(c) {
      var dd = c.deadline || c.due; if (!dd || !isActive(c)) return false;
      var d = new Date(dd);
      return d >= weekStart && d <= weekEnd;
    }).length;
    document.getElementById('stat-week').textContent = weekCount;
  } catch(e) {}

  // 연습 스트릭
  try {
    var pr = JSON.parse(localStorage.getItem('ss_practice_v2') || '{}');
    var sessions = pr.sessions || [];
    var streak = 0;
    var check = new Date();
    check.setHours(0,0,0,0);
    function _ld(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
    for (var i = 0; i < 365; i++) {
      var ds = _ld(check); // 연습트래커와 동일한 로컬 날짜 형식 (KST 어긋남 방지)
      if (!sessions.some(function(s) { return s.date === ds; })) break;
      streak++;
      check.setDate(check.getDate() - 1);
    }
    document.getElementById('stat-streak').textContent = streak;
  } catch(e) {}
}

updateStats();
setInterval(updateStats, 5000);

// 서비스워커 등록 (PWA 설치 지원)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/ODE/sw.js');
}
