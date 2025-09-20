const $ = (s)=>document.querySelector(s);
let CONFIG=null, GRID=[], FOUND=new Set(), START_TS=null, TIMER_INT=null;

function pad(n,w=2){return String(n).padStart(w,'0');}
function fmt(ms){
  const m=Math.floor(ms/60000), s=Math.floor((ms%60000)/1000), ms2=ms%1000;
  return `${pad(m)}:${pad(s)}.${String(ms2).padStart(3,'0')}`;
}

async function backend(path, options){
  const base = (window.__CONFIG__ && window.__CONFIG__.BACKEND_URL) || "";
  return fetch(base + path, options||{});
}

async function loadConfig(){
  const eventId = $("#eventId").value.trim();
  if(!eventId){ alert("Etkinlik ID girin"); return; }
  const res = await backend(`/api/config/${eventId}`);
  if(!res.ok){ alert("Etkinlik bulunamadı"); return; }
  CONFIG = await res.json();
  $("#configBox").innerHTML = `<b>${CONFIG.name}</b> | Kelimeler: ${CONFIG.words.join(", ")} | Grid: ${CONFIG.gridSize} | İlk ${CONFIG.winnerCap} kişi.`;
  $("#targetWords").textContent = CONFIG.words.join(", ");
  initGame();
}

function initGame(){
  const N = CONFIG.gridSize || 12;
  const letters = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZ";
  GRID = Array.from({length:N}, ()=> Array.from({length:N}, ()=> letters[Math.floor(Math.random()*letters.length)]));
  // Kelimeleri yatay/dikey yerleştir
  CONFIG.words.forEach(word=>{
    const W = word.toUpperCase();
    const horiz = Math.random()<0.5;
    if(horiz){
      const row = Math.floor(Math.random()*N);
      const col = Math.floor(Math.random()*(N - W.length));
      for(let i=0;i<W.length;i++) GRID[row][col+i]=W[i];
    }else{
      const row = Math.floor(Math.random()*(N - W.length));
      const col = Math.floor(Math.random()*N);
      for(let i=0;i<W.length;i++) GRID[row+i][col]=W[i];
    }
  });

  renderGrid();
  $("#game").classList.remove("hidden");
  FOUND = new Set();
  $("#submitBtn").disabled = true;
  $("#result").textContent = "";
  START_TS = performance.now();
  clearInterval(TIMER_INT);
  TIMER_INT = setInterval(()=> $("#timer").textContent = fmt(Math.floor(performance.now()-START_TS)), 37);
}

function renderGrid(){
  const N=GRID.length, grid=$("#grid");
  grid.style.gridTemplateColumns=`repeat(${N},32px)`;
  grid.innerHTML="";
  for(let r=0;r<N;r++){
    for(let c=0;c<N;c++){
      const el=document.createElement("div");
      el.className="cell"; el.textContent=GRID[r][c];
      el.dataset.r=r; el.dataset.c=c;
      el.addEventListener("click", onCellClick);
      grid.appendChild(el);
    }
  }
}

let selStart=null;
function onCellClick(e){
  const cell=e.currentTarget, r=+cell.dataset.r, c=+cell.dataset.c;
  if(!selStart){ selStart=[r,c]; cell.classList.add("sel"); return; }
  const [r0,c0]=selStart;
  document.querySelectorAll(".cell.sel").forEach(el=>el.classList.remove("sel"));
  selStart=null;

  if(r0===r){ // yatay seçim
    const cs=c0<=c?[c0,c]:[c,c0];
    let s=""; for(let j=cs[0];j<=cs[1];j++) s+=GRID[r][j];
    checkWord(s,r,cs[0],cs[1],"H");
  } else if(c0===c){ // dikey seçim
    const rs=r0<=r?[r0,r]:[r,r0];
    let s=""; for(let i=rs[0];i<=rs[1];i++) s+=GRID[i][c];
    checkWord(s,rs[0],c,rs[1],"V");
  }
}

function checkWord(s,a,b,c,dir){
  const target=CONFIG.words.map(w=>w.toUpperCase());
  const idx=target.indexOf(s);
  if(idx>=0 && !FOUND.has(s)){
    FOUND.add(s);
    if(dir==="H"){
      for(let j=b;j<=c;j++){
        const k=a*GRID.length+j; $("#grid").children[k].classList.add("word");
      }
    }else{
      for(let i=a;i<=c;i++){
        const k=i*GRID.length+b; $("#grid").children[k].classList.add("word");
      }
    }
  }
  if(FOUND.size===CONFIG.words.length) $("#submitBtn").disabled=false;
}

async function submit(){
  const userId=$("#userId").value.trim();
  if(!userId){ alert("Kullanıcı ID zorunlu"); return; }
  const payload={
    userId,
    userName: $("#name").value.trim()||null,
    contact: $("#contact").value.trim()||null,
    durationMs: Math.floor(performance.now()-START_TS),
    wordsFound: Array.from(FOUND.values())
  };
  const eventId=$("#eventId").value.trim();
  const res = await backend(`/api/submit/${eventId}`,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(!res.ok){
    $("#result").textContent = "Gönderim hatası: " + (data.error||res.status);
    return;
  }
  $("#result").textContent = data.isWinner
    ? `Tebrikler! Kota içinde görünüyorsun. Sıra: ${data.rank}`
    : "Doğru çözdün, fakat kota dolmuş olabilir.";
  clearInterval(TIMER_INT);
}

document.addEventListener("DOMContentLoaded", ()=>{
  $("#loadBtn").addEventListener("click", loadConfig);
  $("#submitBtn").addEventListener("click", submit);
});
