import express from "express";
import Database from "better-sqlite3";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { v4 as uuidv4 } from "uuid";

const app = express();
const PORT = process.env.PORT || 4000;
const db = new Database(process.env.SQLITE_FILE || "./wordhunt.db");

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

db.exec(`
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  words_json TEXT NOT NULL,
  grid_size INTEGER NOT NULL DEFAULT 12,
  winner_cap INTEGER NOT NULL DEFAULT 100,
  start_at INTEGER,
  end_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions(
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT,
  contact TEXT,
  ip TEXT,
  ua TEXT,
  duration_ms INTEGER NOT NULL,
  words_found_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  is_valid INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(event_id) REFERENCES events(id)
);
CREATE INDEX IF NOT EXISTS idx_submissions_event ON submissions(event_id);
`);

const now = () => Date.now();
const readEvent = (id) => {
  const row = db.prepare("SELECT * FROM events WHERE id=?").get(id);
  return row ? { ...row, words: JSON.parse(row.words_json) } : null;
};
const winnersCount = (eventId) =>
  db.prepare("SELECT COUNT(*) c FROM submissions WHERE event_id=? AND is_valid=1").get(eventId).c;

app.get("/api/health", (req,res)=> res.json({ ok:true }));

app.get("/api/config/:eventId", (req,res)=>{
  const ev = readEvent(req.params.eventId);
  if(!ev || !ev.is_active) return res.status(404).json({error:"event_not_found"});
  res.json({ id:ev.id, name:ev.name, words:ev.words, gridSize:ev.grid_size, winnerCap:ev.winner_cap, startAt:ev.start_at, endAt:ev.end_at });
});

app.post("/api/submit/:eventId", (req,res)=>{
  const ev = readEvent(req.params.eventId);
  if(!ev || !ev.is_active) return res.status(404).json({error:"event_not_found"});
  const { userId, userName, contact, durationMs, wordsFound } = req.body || {};
  if(!userId || !durationMs || !Array.isArray(wordsFound)) return res.status(400).json({error:"bad_request"});

  const t = now();
  if(ev.start_at && t < ev.start_at) return res.status(403).json({error:"event_not_started"});
  if(ev.end_at && t > ev.end_at) return res.status(403).json({error:"event_ended"});

  const norm = a => [...new Set((a||[]).map(w=>String(w||"").trim().toLowerCase()))].sort();
  const isMatch = JSON.stringify(norm(ev.words)) === JSON.stringify(norm(wordsFound));
  const currentWinners = winnersCount(ev.id);
  const withinCap = currentWinners < ev.winner_cap;

  db.prepare(`INSERT INTO submissions(id,event_id,user_id,user_name,contact,ip,ua,duration_ms,words_found_json,created_at,is_valid)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
    .run(uuidv4(), ev.id, String(userId), userName||null, contact||null, req.headers["x-forwarded-for"]||req.ip,
         req.get("user-agent"), Number(durationMs), JSON.stringify(wordsFound), t, (isMatch && withinCap) ? 1 : 0);

  res.json({ ok:true, isWinner: isMatch && withinCap, rank: currentWinners + (isMatch?1:0) });
});

// basit admin (header token)
function assertAdmin(req,res,next){
  const token = process.env.ADMIN_TOKEN || "changeme";
  if(req.get("x-admin-token") !== token) return res.status(401).json({error:"unauthorized"});
  next();
}
app.post("/admin/event", assertAdmin, (req,res)=>{
  const { id, name, words, gridSize=12, winnerCap=100, startAt=null, endAt=null, isActive=1 } = req.body || {};
  if(!name || !Array.isArray(words) || words.length<1) return res.status(400).json({error:"bad_request"});
  const ts = now();
  if(id){
    const ex = readEvent(id); if(!ex) return res.status(404).json({error:"event_not_found"});
    db.prepare("UPDATE events SET name=?, words_json=?, grid_size=?, winner_cap=?, start_at=?, end_at=?, is_active=?, updated_at=? WHERE id=?")
      .run(name, JSON.stringify(words), Number(gridSize), Number(winnerCap), startAt, endAt, Number(isActive), ts, id);
    return res.json({ ok:true, id });
  }else{
    const newId = uuidv4();
    db.prepare("INSERT INTO events(id,name,words_json,grid_size,winner_cap,start_at,end_at,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
      .run(newId, name, JSON.stringify(words), Number(gridSize), Number(winnerCap), startAt, endAt, Number(isActive), ts, ts);
    return res.json({ ok:true, id:newId });
  }
});
app.get("/admin/event/:id", assertAdmin, (req,res)=>{ const ev=readEvent(req.params.id); if(!ev) return res.status(404).json({error:"event_not_found"}); res.json(ev); });
app.get("/admin/event/:id/submissions", assertAdmin, (req,res)=>{ res.json(db.prepare("SELECT * FROM submissions WHERE event_id=? ORDER BY created_at ASC").all(req.params.id)); });

app.listen(PORT, ()=> console.log("Backend listening on", PORT));
