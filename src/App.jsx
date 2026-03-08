import { useState, useRef, useCallback, useEffect } from "react";

/* ── Anthropic API helpers ─────────────────── */
async function aiEnrich(hebrewWord) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `Given the Hebrew word: "${hebrewWord}"
Return a JSON object with exactly these fields:
- "nikud": the word with full Hebrew vowel marks (niqqud)
- "arabic": Arabic translation (short, 1-4 words)
- "emoji": one relevant emoji that visually represents this word

Return ONLY the JSON object, no explanation, no markdown.
Example: {"nikud":"שָׁלוֹם","arabic":"سلام / مرحباً","emoji":"👋"}`
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text?.trim() || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch { return {}; }
}

/* ── SRS (Spaced Repetition) ───────────────── */
const SRS_KEY   = "heb_srs_v3";
const DECKS_KEY = "heb_decks_v3";
const DAY_MS    = 86400000;
const INTERVALS = [1, 3, 7, 14, 30, 90];

function loadSRS()   { try { return JSON.parse(localStorage.getItem(SRS_KEY)   || "{}"); } catch { return {}; } }
function loadDecks() { try { return JSON.parse(localStorage.getItem(DECKS_KEY) || "[]"); } catch { return []; } }
function saveSRS(d)  { try { localStorage.setItem(SRS_KEY,   JSON.stringify(d)); } catch {} }
function saveDecks(d){ try { localStorage.setItem(DECKS_KEY, JSON.stringify(d)); } catch {} }

function getCard(srs, id) { return srs[id] || { interval:0, ease:2.5, nextReview:0, streak:0 }; }
function isDue(srs, id)   { return Date.now() >= getCard(srs,id).nextReview; }
function daysLeft(srs, id){ const c=getCard(srs,id); return c.nextReview<=Date.now()?0:Math.ceil((c.nextReview-Date.now())/DAY_MS); }

function updateSRS(srs, id, correct) {
  const c = getCard(srs, id);
  let { streak, ease } = c;
  let interval;
  if (correct) {
    streak += 1;
    interval = INTERVALS[Math.min(streak, INTERVALS.length-1)];
    ease = Math.min(ease + 0.1, 3.0);
  } else {
    streak = 0; interval = 1;
    ease = Math.max(ease - 0.3, 1.3);
  }
  return { ...srs, [id]: { interval, ease, nextReview: Date.now() + interval*DAY_MS, streak } };
}

/* ── speak ─────────────────────────────────── */
function speak(text) {
  const plain = text.replace(/[\u0591-\u05C7]/g,"").trim();
  const q = encodeURIComponent(plain||text);
  const a = new Audio();
  a.src = `https://translate.google.com/translate_tts?ie=UTF-8&tl=he&client=tw-ob&q=${q}`;
  a.onerror = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(plain||text);
    u.lang = "he-IL"; u.rate = 0.8;
    const hv = window.speechSynthesis.getVoices().find(v=>v.lang.startsWith("he"));
    if (hv) u.voice = hv;
    window.speechSynthesis.speak(u);
  };
  a.play().catch(()=>a.onerror());
}

/* ── Swipe Card ─────────────────────────────── */
const SWIPE_THRESH = 90;

function SwipeCard({ word, mode, onKnow, onDontKnow, stackPos, isTop, srsInfo }) {
  const [dx, setDx]         = useState(0);
  const [fling, setFling]   = useState(null);
  const dragging = useRef(false);
  const startX   = useRef(0);
  const didMove  = useRef(false);

  const getX = e => e.touches ? e.touches[0].clientX : e.clientX;

  const onStart = useCallback(e => {
    if (!isTop || e.target.closest("button")) return;
    dragging.current = true; didMove.current = false;
    startX.current = getX(e);
  }, [isTop]);

  const onMove = useCallback(e => {
    if (!dragging.current) return;
    const d = getX(e) - startX.current;
    if (Math.abs(d) > 4) didMove.current = true;
    setDx(d);
  }, []);

  const onEnd = useCallback(() => {
    if (!dragging.current) return;
    dragging.current = false;
    if (!didMove.current) { setDx(0); return; }
    if      (dx >  SWIPE_THRESH) { setFling("right"); setTimeout(()=>{setDx(0);setFling(null);onKnow();},    280); }
    else if (dx < -SWIPE_THRESH) { setFling("left");  setTimeout(()=>{setDx(0);setFling(null);onDontKnow();},280); }
    else setDx(0);
  }, [dx, onKnow, onDontKnow]);

  useEffect(() => {
    if (!isTop) return;
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onEnd);
    return () => { document.removeEventListener("mousemove",onMove); document.removeEventListener("mouseup",onEnd); };
  }, [isTop, onMove, onEnd]);

  const rot  = dx * 0.07;
  const prog = Math.min(Math.abs(dx) / SWIPE_THRESH, 1);
  let tf, tr;
  if      (fling==="right") { tf=`translateX(140%) rotate(22deg)`;  tr="transform .28s ease"; }
  else if (fling==="left")  { tf=`translateX(-140%) rotate(-22deg)`;tr="transform .28s ease"; }
  else if (isTop) {
    tf=`translateX(${dx}px) rotate(${rot}deg)`;
    tr=dragging.current?"none":"transform .3s cubic-bezier(.34,1.56,.64,1)";
  } else {
    const sc=0.93+stackPos*0.035, ty=-stackPos*14;
    tf=`scale(${sc}) translateY(${ty}px)`; tr="transform .3s ease";
  }

  return (
    <div
      style={{position:"absolute",width:"100%",transform:tf,transition:tr,
        zIndex:isTop?10:8-stackPos,userSelect:"none",touchAction:"none",
        cursor:isTop?(dragging.current?"grabbing":"grab"):"default"}}
      onMouseDown={onStart} onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd}
      onClick={()=>{ if (!didMove.current) speak(word.nikud||word.hebrew); }}
    >
      {/* swipe labels */}
      {isTop && <>
        <div style={{position:"absolute",top:20,right:20,zIndex:20,pointerEvents:"none",
          opacity:dx>15?prog:0,transition:"opacity .08s",
          background:"rgba(78,205,196,.92)",color:"white",padding:"6px 16px",
          borderRadius:100,fontWeight:900,fontSize:14,fontFamily:"Tajawal,sans-serif",
          transform:"rotate(-10deg)"}}>✓ أعرفها</div>
        <div style={{position:"absolute",top:20,left:20,zIndex:20,pointerEvents:"none",
          opacity:dx<-15?prog:0,transition:"opacity .08s",
          background:"rgba(255,107,107,.92)",color:"white",padding:"6px 16px",
          borderRadius:100,fontWeight:900,fontSize:14,fontFamily:"Tajawal,sans-serif",
          transform:"rotate(10deg)"}}>✗ لا أعرف</div>
      </>}

      {/* Card body */}
      <div style={{width:"100%",minHeight:320,borderRadius:28,overflow:"hidden",
        background:"linear-gradient(145deg,rgba(108,99,255,.28),rgba(255,107,157,.16))",
        border:"1px solid rgba(255,255,255,.13)",backdropFilter:"blur(20px)",
        display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
        padding:"28px 24px 48px",position:"relative"}}>

        {/* SRS badge */}
        {srsInfo && isTop && (
          <div style={{position:"absolute",top:14,left:14,background:"rgba(108,99,255,.3)",
            color:"#C4BCFF",padding:"3px 10px",borderRadius:100,fontSize:10,fontWeight:700}}>
            {srsInfo}
          </div>
        )}

        {/* emoji / image */}
        <div style={{fontSize:64,marginBottom:12,lineHeight:1}}>{word.emoji || "📝"}</div>

        {/* Hebrew word */}
        <div style={{fontSize:word.nikud?.length>8?44:word.nikud?.length>5?52:60,
          fontWeight:900,color:"white",textAlign:"center",lineHeight:1.1,
          textShadow:"0 4px 28px rgba(108,99,255,.6)",letterSpacing:2,direction:"ltr",
          marginBottom:8}}>
          {word.nikud || word.hebrew}
        </div>

        {/* transliteration always shown */}
        {word.tr && (
          <div style={{fontSize:15,color:"rgba(255,255,255,.45)",fontStyle:"italic",
            direction:"ltr",marginBottom: mode==="study"?14:0}}>
            {word.tr}
          </div>
        )}

        {/* STUDY MODE: show Arabic meaning on same card */}
        {mode === "study" && word.arabic && (
          <div style={{marginTop:4,padding:"10px 20px",background:"rgba(255,255,255,.08)",
            borderRadius:16,border:"1px solid rgba(255,255,255,.12)",textAlign:"center"}}>
            <div style={{fontSize:26,fontWeight:900,color:"white"}}>{word.arabic}</div>
          </div>
        )}

        {/* hints */}
        <div style={{position:"absolute",bottom:14,fontSize:10,color:"rgba(255,255,255,.28)",textAlign:"center"}}>
          {mode==="study"
            ? "← اسحب يساراً للتالية · يميناً للسابقة"
            : "👆 اضغط للنطق · اسحب → أعرفها · ← لا أعرف"}
        </div>
      </div>
    </div>
  );
}

/* ── Add Word Sheet ─────────────────────────── */
function AddWordSheet({ deckColor, onSave, onClose }) {
  const [hebrew,  setHebrew]  = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null); // enriched data
  const [tr,      setTr]      = useState("");

  async function handleEnrich() {
    if (!hebrew.trim()) return;
    setLoading(true); setResult(null);
    const data = await aiEnrich(hebrew.trim());
    setResult(data);
    setLoading(false);
  }

  function handleSave() {
    if (!hebrew.trim()) return;
    onSave({
      id: Date.now(),
      hebrew: hebrew.trim(),
      nikud:  result?.nikud  || hebrew.trim(),
      arabic: result?.arabic || "",
      emoji:  result?.emoji  || "📝",
      tr:     tr.trim(),
    });
    setHebrew(""); setTr(""); setResult(null);
  }

  const inp = {
    width:"100%", height:48, background:"rgba(255,255,255,.07)",
    border:"1px solid rgba(255,255,255,.14)", borderRadius:14,
    padding:"0 14px", color:"white", fontSize:15,
    fontFamily:"Tajawal,sans-serif", outline:"none",
  };

  return (
    <div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",
      width:430,height:"100vh",background:"rgba(0,0,0,.78)",backdropFilter:"blur(12px)",
      zIndex:300,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div style={{width:"100%",background:"#141428",borderRadius:"28px 28px 0 0",
        border:"1px solid rgba(255,255,255,.1)",padding:"20px 22px 36px",
        animation:"sheetUp .35s cubic-bezier(.34,1.56,.64,1)"}}
        onClick={e=>e.stopPropagation()}>
        <style>{`@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
        <div style={{width:36,height:4,background:"rgba(255,255,255,.18)",borderRadius:2,margin:"0 auto 18px"}}/>
        <div style={{fontSize:18,fontWeight:900,color:"white",marginBottom:16,textAlign:"center"}}>
          ➕ أضف كلمة
        </div>

        {/* Hebrew input */}
        <div style={{marginBottom:10}}>
          <label style={{fontSize:12,color:"rgba(255,255,255,.45)",fontWeight:700,display:"block",marginBottom:5}}>
            الكلمة بالعبرية *
          </label>
          <div style={{display:"flex",gap:8}}>
            <input style={{...inp,flex:1,direction:"ltr",textAlign:"left",
              fontSize:result?.nikud?20:15,letterSpacing:result?.nikud?2:0}}
              placeholder="כתוב כאן..." value={result?.nikud||hebrew}
              onChange={e=>{
                const v=e.target.value;
                setHebrew(v); setResult(null);
              }}/>
            <button onClick={handleEnrich} disabled={!hebrew.trim()||loading}
              style={{height:48,padding:"0 14px",borderRadius:14,
                background:`${deckColor}33`,border:`1px solid ${deckColor}66`,
                color:deckColor,fontSize:13,fontWeight:800,cursor:"pointer",
                fontFamily:"Tajawal,sans-serif",whiteSpace:"nowrap",
                opacity:(!hebrew.trim()||loading)?0.4:1,transition:"opacity .2s"}}>
              {loading?"⏳":"✨ تلقائي"}
            </button>
          </div>
          <div style={{fontSize:11,color:"rgba(255,255,255,.3)",marginTop:4}}>
            اضغط "تلقائي" ليضيف النظام التشكيل والمعنى والإيموجي
          </div>
        </div>

        {/* Preview enriched result */}
        {result && (
          <div style={{background:"rgba(255,255,255,.05)",borderRadius:14,padding:"12px 16px",
            marginBottom:12,border:"1px solid rgba(255,255,255,.1)",
            display:"flex",alignItems:"center",gap:14}}>
            <div style={{fontSize:40}}>{result.emoji}</div>
            <div>
              <div style={{fontSize:22,fontWeight:900,color:"white",direction:"ltr",letterSpacing:2}}>
                {result.nikud}
              </div>
              <div style={{fontSize:15,color:"rgba(255,255,255,.7)",marginTop:2}}>{result.arabic}</div>
            </div>
            <div style={{marginRight:"auto",fontSize:11,color:"rgba(255,255,255,.3)"}}>معاينة</div>
          </div>
        )}

        {/* Optional transliteration */}
        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:"rgba(255,255,255,.45)",fontWeight:700,display:"block",marginBottom:5}}>
            النطق بالحروف اللاتينية (اختياري)
          </label>
          <input style={{...inp,direction:"ltr",textAlign:"left"}}
            placeholder="Shalom" value={tr} onChange={e=>setTr(e.target.value)}/>
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,height:50,borderRadius:14,
            background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",
            color:"rgba(255,255,255,.55)",fontSize:15,fontWeight:800,cursor:"pointer",
            fontFamily:"Tajawal,sans-serif"}}>إلغاء</button>
          <button onClick={handleSave} disabled={!hebrew.trim()}
            style={{flex:2,height:50,borderRadius:14,
              background:`linear-gradient(135deg,${deckColor},${deckColor}99)`,border:"none",
              color:"white",fontSize:15,fontWeight:900,cursor:"pointer",
              fontFamily:"Tajawal,sans-serif",
              boxShadow:`0 6px 18px ${deckColor}44`,
              opacity:!hebrew.trim()?0.4:1}}>
            💾 أضف الكلمة
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Deck Sheet ─────────────────────────── */
const PALETTE = ["#6C63FF","#FF6B6B","#4ECDC4","#FF9F43","#A29BFE","#FD79A8","#55EFC4","#45B7D1","#FFEAA7","#00CEC9"];

function AddDeckSheet({ onSave, onClose }) {
  const [name,  setName]  = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  return (
    <div style={{position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",
      width:430,height:"100vh",background:"rgba(0,0,0,.78)",backdropFilter:"blur(12px)",
      zIndex:300,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div style={{width:"100%",background:"#141428",borderRadius:"28px 28px 0 0",
        border:"1px solid rgba(255,255,255,.1)",padding:"20px 22px 36px",
        animation:"sheetUp .35s cubic-bezier(.34,1.56,.64,1)"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{width:36,height:4,background:"rgba(255,255,255,.18)",borderRadius:2,margin:"0 auto 18px"}}/>
        <div style={{fontSize:18,fontWeight:900,color:"white",marginBottom:18,textAlign:"center"}}>
          📚 تخصص جديد
        </div>

        <div style={{marginBottom:16}}>
          <label style={{fontSize:12,color:"rgba(255,255,255,.45)",fontWeight:700,display:"block",marginBottom:5}}>
            اسم التخصص *
          </label>
          <input
            style={{width:"100%",height:50,background:"rgba(255,255,255,.07)",
              border:`2px solid ${color}66`,borderRadius:14,padding:"0 16px",
              color:"white",fontSize:16,fontFamily:"Tajawal,sans-serif",outline:"none"}}
            placeholder="مثال: كلمات الصف الثامن"
            value={name} onChange={e=>setName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&name.trim()&&onSave({name:name.trim(),color})}
          />
        </div>

        <div style={{marginBottom:20}}>
          <label style={{fontSize:12,color:"rgba(255,255,255,.45)",fontWeight:700,display:"block",marginBottom:8}}>
            اللون
          </label>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            {PALETTE.map(c=>(
              <div key={c} onClick={()=>setColor(c)}
                style={{width:36,height:36,borderRadius:"50%",background:c,cursor:"pointer",
                  border:color===c?"3px solid white":"3px solid transparent",
                  transition:"border .15s",boxShadow:color===c?`0 0 0 2px ${c}`:"none"}}/>
            ))}
          </div>
        </div>

        <div style={{display:"flex",gap:10}}>
          <button onClick={onClose} style={{flex:1,height:50,borderRadius:14,
            background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",
            color:"rgba(255,255,255,.55)",fontSize:15,fontWeight:800,cursor:"pointer",
            fontFamily:"Tajawal,sans-serif"}}>إلغاء</button>
          <button onClick={()=>name.trim()&&onSave({name:name.trim(),color})}
            disabled={!name.trim()}
            style={{flex:2,height:50,borderRadius:14,
              background:`linear-gradient(135deg,${color},${color}88)`,border:"none",
              color:"white",fontSize:15,fontWeight:900,cursor:"pointer",
              fontFamily:"Tajawal,sans-serif",
              boxShadow:`0 6px 18px ${color}44`,opacity:!name.trim()?0.4:1}}>
            ✅ إنشاء التخصص
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════════ */
export default function App() {
  const [decks,    setDecks]    = useState(()=>loadDecks());
  const [srs,      setSRS]      = useState(()=>loadSRS());
  const [view,     setView]     = useState("home");   // "home"|"deck"|"session"
  const [activeDeck, setActiveDeck] = useState(null); // deck object
  const [mode,     setMode]     = useState("study");  // "study"|"quiz"
  const [queue,    setQueue]    = useState([]);
  const [idx,      setIdx]      = useState(0);
  const [score,    setScore]    = useState(0);
  const [correct,  setCorrect]  = useState(0);
  const [wrong,    setWrong]    = useState(0);
  const [toast,    setToast]    = useState(null);
  const [showAddDeck,  setShowAddDeck]  = useState(false);
  const [showAddWord,  setShowAddWord]  = useState(false);
  const [sessionDone,  setSessionDone]  = useState(false);

  useEffect(()=>{ saveDecks(decks); },[decks]);
  useEffect(()=>{ saveSRS(srs); },[srs]);

  function showToast(msg, dur=2000) {
    setToast(msg);
    setTimeout(()=>setToast(null), dur);
  }

  /* ── Deck actions ── */
  function createDeck({name, color}) {
    const d = { id:Date.now(), name, color, words:[] };
    setDecks(ds=>[...ds,d]);
    setShowAddDeck(false);
  }

  function deleteDeck(id) {
    setDecks(ds=>ds.filter(d=>d.id!==id));
    if (activeDeck?.id===id) { setView("home"); setActiveDeck(null); }
  }

  function addWord(deckId, word) {
    setDecks(ds=>ds.map(d=>d.id===deckId ? {...d,words:[...d.words,word]} : d));
    setShowAddWord(false);
    showToast("✅ تمت إضافة الكلمة!");
  }

  function deleteWord(deckId, wordId) {
    setDecks(ds=>ds.map(d=>d.id===deckId ? {...d,words:d.words.filter(w=>w.id!==wordId)} : d));
  }

  /* ── Session ── */
  function startSession(deck, sessionMode) {
    const words = deck.words;
    if (!words.length) { showToast("أضف كلمات أولاً!"); return; }

    let pool;
    if (sessionMode === "study") {
      // Study: all words shuffled
      pool = [...words].sort(()=>Math.random()-.5);
    } else {
      // Quiz: due cards first, then rest
      const due  = words.filter(w=>isDue(srs,w.id));
      const rest = words.filter(w=>!isDue(srs,w.id));
      pool = due.length > 0
        ? [...due].sort(()=>Math.random()-.5)
        : [...words].sort(()=>Math.random()-.5);
    }

    setActiveDeck(deck); setMode(sessionMode);
    setQueue(pool); setIdx(0);
    setScore(0); setCorrect(0); setWrong(0);
    setSessionDone(false); setView("session");
  }

  function advance(knew) {
    const cur = queue[idx];
    if (mode === "quiz") {
      const newSRS = updateSRS(srs, cur.id, knew);
      setSRS(newSRS);
      if (knew) {
        setScore(s=>s+10); setCorrect(c=>c+1);
        const days = daysLeft(newSRS, cur.id);
        showToast(days<=1 ? "🎉 ممتاز! ستراها غداً" : `🔥 رائع! بعد ${days} أيام`);
      } else {
        setWrong(w=>w+1);
        showToast("💪 ستراها مجدداً غداً");
      }
    } else {
      // study mode: just advance, no scoring
      if (idx >= queue.length-1) { setSessionDone(true); return; }
      setIdx(i=>i+1); return;
    }
    if (idx >= queue.length-1) setSessionDone(true);
    else setIdx(i=>i+1);
  }

  function advancePrev() {
    if (idx > 0) setIdx(i=>i-1);
  }

  /* ── derived ── */
  const cur   = queue[idx];
  const next1 = queue[idx+1];
  const next2 = queue[idx+2];
  const deck  = activeDeck ? decks.find(d=>d.id===activeDeck.id) || activeDeck : null;

  // Update activeDeck when decks change
  useEffect(()=>{
    if (activeDeck) {
      const updated = decks.find(d=>d.id===activeDeck.id);
      if (updated) setActiveDeck(updated);
    }
  },[decks]);

  const S = {
    page: { maxWidth:430,margin:"0 auto",minHeight:"100vh",
      background:"#0F0F1A",fontFamily:"Tajawal,sans-serif",direction:"rtl",
      position:"relative",overflow:"hidden" },
    blob: (c,s,t,r,b) => ({position:"fixed",width:s,height:s,borderRadius:"50%",
      background:c,filter:"blur(80px)",opacity:.12,
      top:t,right:r,bottom:b,left:"auto",pointerEvents:"none",zIndex:0}),
  };

  /* ══ HOME ══ */
  if (view === "home") return (
    <div style={S.page}>
      <div style={S.blob("#6C63FF","280px","-80px","-80px","auto")}/>
      <div style={S.blob("#FF6B9D","220px","auto","auto","-60px")}/>
      <div style={{position:"relative",zIndex:1}}>
        {/* Header */}
        <div style={{padding:"52px 22px 20px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:24,fontWeight:900,color:"white"}}>🇮🇱 عبري بسهولة</div>
            <div style={{fontSize:13,color:"rgba(255,255,255,.45)",marginTop:2}}>تخصصاتي</div>
          </div>
          <button onClick={()=>setShowAddDeck(true)}
            style={{height:44,padding:"0 18px",borderRadius:14,
              background:"linear-gradient(135deg,#6C63FF,#FF6B9D)",border:"none",
              color:"white",fontSize:14,fontWeight:800,cursor:"pointer",
              fontFamily:"Tajawal,sans-serif",boxShadow:"0 4px 16px rgba(108,99,255,.4)"}}>
            + تخصص جديد
          </button>
        </div>

        {/* Empty state */}
        {decks.length === 0 && (
          <div style={{padding:"60px 32px",textAlign:"center"}}>
            <div style={{fontSize:72,marginBottom:20}}>📚</div>
            <div style={{fontSize:20,fontWeight:900,color:"white",marginBottom:8}}>
              لا توجد تخصصات بعد
            </div>
            <div style={{fontSize:14,color:"rgba(255,255,255,.45)",lineHeight:1.7,marginBottom:28}}>
              أنشئ تخصصك الأول وأضف<br/>الكلمات التي تريد حفظها
            </div>
            <button onClick={()=>setShowAddDeck(true)}
              style={{padding:"14px 32px",borderRadius:18,
                background:"linear-gradient(135deg,#6C63FF,#FF6B9D)",border:"none",
                color:"white",fontSize:16,fontWeight:900,cursor:"pointer",
                fontFamily:"Tajawal,sans-serif",boxShadow:"0 8px 24px rgba(108,99,255,.4)"}}>
              📚 إنشاء تخصص
            </button>
          </div>
        )}

        {/* Deck cards */}
        <div style={{padding:"0 20px",display:"flex",flexDirection:"column",gap:14}}>
          {decks.map(d => {
            const dueCount = d.words.filter(w=>isDue(srs,w.id)&&getCard(srs,w.id).streak>0).length;
            const learnedCount = d.words.filter(w=>getCard(srs,w.id).streak>0).length;
            return (
              <div key={d.id}
                style={{background:`linear-gradient(135deg,${d.color}22,${d.color}11)`,
                  border:`1px solid ${d.color}44`,borderRadius:22,padding:"18px 20px",
                  cursor:"pointer",transition:"transform .15s"}}
                onClick={()=>{ setActiveDeck(d); setView("deck"); }}
                onMouseEnter={e=>e.currentTarget.style.transform="translateY(-2px)"}
                onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div>
                    <div style={{fontSize:18,fontWeight:900,color:"white",marginBottom:4}}>{d.name}</div>
                    <div style={{fontSize:13,color:"rgba(255,255,255,.5)"}}>
                      {d.words.length} كلمة
                      {learnedCount>0 && <span style={{color:"#4ECDC4",marginRight:8}}>· {learnedCount} محفوظة</span>}
                    </div>
                  </div>
                  <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
                    {dueCount > 0 && (
                      <div style={{background:d.color,color:"white",padding:"4px 12px",
                        borderRadius:100,fontSize:12,fontWeight:800}}>
                        🔔 {dueCount} للمراجعة
                      </div>
                    )}
                    <div style={{width:10,height:10,borderRadius:"50%",background:d.color}}/>
                  </div>
                </div>
                {/* Mini progress bar */}
                {d.words.length > 0 && (
                  <div style={{marginTop:12,height:4,background:"rgba(255,255,255,.1)",borderRadius:100,overflow:"hidden"}}>
                    <div style={{height:"100%",background:d.color,borderRadius:100,
                      width:`${(learnedCount/d.words.length)*100}%`,transition:"width .5s"}}/>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{height:32}}/>
      </div>
      {showAddDeck && <AddDeckSheet onSave={createDeck} onClose={()=>setShowAddDeck(false)}/>}
      {toast && <Toast msg={toast}/>}
    </div>
  );

  /* ══ DECK VIEW ══ */
  if (view === "deck" && deck) return (
    <div style={S.page}>
      <div style={S.blob(deck.color,"280px","-80px","-80px","auto")}/>
      <div style={{position:"relative",zIndex:1}}>
        {/* Header */}
        <div style={{padding:"52px 22px 16px"}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16}}>
            <button onClick={()=>setView("home")}
              style={{width:40,height:40,borderRadius:12,background:"rgba(255,255,255,.08)",
                border:"1px solid rgba(255,255,255,.12)",color:"white",fontSize:18,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              ←
            </button>
            <div style={{flex:1}}>
              <div style={{fontSize:20,fontWeight:900,color:"white"}}>{deck.name}</div>
              <div style={{fontSize:12,color:"rgba(255,255,255,.45)",marginTop:1}}>
                {deck.words.length} كلمة
              </div>
            </div>
            <button onClick={()=>{ if(window.confirm(`حذف تخصص "${deck.name}"؟`)) deleteDeck(deck.id); }}
              style={{width:40,height:40,borderRadius:12,background:"rgba(255,107,107,.12)",
                border:"1px solid rgba(255,107,107,.25)",color:"#FF6B6B",fontSize:16,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              🗑
            </button>
          </div>

          {/* Mode buttons */}
          {deck.words.length > 0 && (
            <div style={{display:"flex",gap:10,marginBottom:16}}>
              <button onClick={()=>startSession(deck,"study")}
                style={{flex:1,height:52,borderRadius:16,
                  background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.15)",
                  color:"white",fontSize:14,fontWeight:800,cursor:"pointer",
                  fontFamily:"Tajawal,sans-serif"}}>
                📖 وضع الدراسة
              </button>
              <button onClick={()=>startSession(deck,"quiz")}
                style={{flex:1,height:52,borderRadius:16,
                  background:`linear-gradient(135deg,${deck.color},${deck.color}88)`,
                  border:"none",color:"white",fontSize:14,fontWeight:800,cursor:"pointer",
                  fontFamily:"Tajawal,sans-serif",
                  boxShadow:`0 4px 16px ${deck.color}44`}}>
                🎯 وضع الاختبار
              </button>
            </div>
          )}
        </div>

        {/* Words list */}
        <div style={{padding:"0 20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div style={{fontSize:13,color:"rgba(255,255,255,.45)",fontWeight:700}}>الكلمات</div>
            <button onClick={()=>setShowAddWord(true)}
              style={{height:36,padding:"0 16px",borderRadius:12,
                background:deck.color,border:"none",color:"white",
                fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"Tajawal,sans-serif"}}>
              + أضف كلمة
            </button>
          </div>

          {deck.words.length === 0 ? (
            <div style={{textAlign:"center",padding:"48px 0",color:"rgba(255,255,255,.35)"}}>
              <div style={{fontSize:48,marginBottom:12}}>✍️</div>
              <div style={{fontSize:15,fontWeight:700}}>لا توجد كلمات بعد</div>
              <div style={{fontSize:13,marginTop:4}}>اضغط "+ أضف كلمة" لتبدأ</div>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {deck.words.map(w => {
                const s = getCard(srs,w.id);
                return (
                  <div key={w.id}
                    style={{background:"rgba(255,255,255,.06)",borderRadius:16,
                      padding:"14px 16px",border:"1px solid rgba(255,255,255,.08)",
                      display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:36,flexShrink:0}}>{w.emoji||"📝"}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:20,fontWeight:900,color:"white",
                        direction:"ltr",letterSpacing:1}}>{w.nikud||w.hebrew}</div>
                      <div style={{fontSize:13,color:"rgba(255,255,255,.55)",marginTop:2}}>
                        {w.arabic}
                        {w.tr && <span style={{color:"rgba(255,255,255,.3)",marginRight:6,fontStyle:"italic"}}>· {w.tr}</span>}
                      </div>
                    </div>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                      {s.streak>0 && (
                        <div style={{fontSize:11,color:"#4ECDC4",fontWeight:700}}>
                          {"🔥".repeat(Math.min(s.streak,3))} {s.streak}
                        </div>
                      )}
                      <button onClick={()=>deleteWord(deck.id,w.id)}
                        style={{width:28,height:28,borderRadius:8,background:"rgba(255,107,107,.1)",
                          border:"none",color:"rgba(255,107,107,.6)",cursor:"pointer",fontSize:12}}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{height:32}}/>
      </div>

      {showAddWord && (
        <AddWordSheet
          deckColor={deck.color}
          onSave={w=>addWord(deck.id,w)}
          onClose={()=>setShowAddWord(false)}
        />
      )}
      {toast && <Toast msg={toast}/>}
    </div>
  );

  /* ══ SESSION ══ */
  if (view === "session") {
    if (sessionDone) return (
      <div style={{...S.page,display:"flex",flexDirection:"column",alignItems:"center",
        justifyContent:"center",padding:32}}>
        <div style={S.blob(deck?.color||"#6C63FF","300px","-80px","-80px","auto")}/>
        <div style={{position:"relative",zIndex:1,textAlign:"center",width:"100%"}}>
          <div style={{fontSize:80,marginBottom:16}}>
            {mode==="quiz" ? (correct>=queue.length*.8?"🏆":correct>=queue.length*.5?"⭐":"💪") : "📖"}
          </div>
          <div style={{fontSize:28,fontWeight:900,color:"white",marginBottom:8}}>
            {mode==="quiz"
              ? (correct>=queue.length*.8?"ممتاز!":correct>=queue.length*.5?"جيد جداً!":"استمر!")
              : "انتهيت من المراجعة!"}
          </div>
          <div style={{fontSize:14,color:"rgba(255,255,255,.55)",marginBottom:28}}>
            {mode==="quiz" ? `${queue.length} بطاقة · جلسة ${deck?.name}` : `راجعت ${queue.length} كلمة`}
          </div>
          {mode==="quiz" && (
            <div style={{display:"flex",gap:14,justifyContent:"center",marginBottom:32}}>
              {[["✓",correct,"#4ECDC4","صح"],["✗",wrong,"#FF6B6B","خطأ"],["⭐",score,"#FFD700","نقطة"]].map(([ic,val,cl,lb])=>(
                <div key={lb} style={{background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.12)",
                  borderRadius:18,padding:"14px 20px",textAlign:"center"}}>
                  <div style={{fontSize:28,fontWeight:900,color:cl}}>{val}</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,.45)",marginTop:3}}>{lb}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{ setView("deck"); }}
              style={{flex:1,height:52,borderRadius:16,background:"rgba(255,255,255,.08)",
                border:"1px solid rgba(255,255,255,.15)",color:"white",fontSize:14,fontWeight:800,
                cursor:"pointer",fontFamily:"Tajawal,sans-serif"}}>
              ← العودة
            </button>
            <button onClick={()=>startSession(deck,mode)}
              style={{flex:1,height:52,borderRadius:16,
                background:`linear-gradient(135deg,${deck?.color||"#6C63FF"},${deck?.color||"#6C63FF"}88)`,
                border:"none",color:"white",fontSize:14,fontWeight:800,cursor:"pointer",
                fontFamily:"Tajawal,sans-serif",
                boxShadow:`0 4px 16px ${deck?.color||"#6C63FF"}44`}}>
              🔁 مرة أخرى
            </button>
          </div>
        </div>
      </div>
    );

    return (
      <div style={S.page}>
        <div style={S.blob(deck?.color||"#6C63FF","280px","-60px","-60px","auto")}/>
        <div style={{position:"relative",zIndex:1}}>
          {/* Session header */}
          <div style={{padding:"50px 22px 12px",display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setView("deck")}
              style={{width:38,height:38,borderRadius:11,background:"rgba(255,255,255,.08)",
                border:"1px solid rgba(255,255,255,.12)",color:"white",fontSize:16,
                cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
              ←
            </button>
            <div style={{flex:1}}>
              <div style={{fontSize:14,fontWeight:800,color:"rgba(255,255,255,.7)"}}>
                {mode==="study"?"📖 وضع الدراسة":"🎯 وضع الاختبار"} · {deck?.name}
              </div>
            </div>
            {mode==="quiz" && (
              <div style={{background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",
                borderRadius:12,padding:"5px 12px",textAlign:"center"}}>
                <div style={{fontSize:18,fontWeight:900,color:"#FFD700",lineHeight:1}}>{score}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,.4)"}}>نقطة</div>
              </div>
            )}
          </div>

          {/* Progress */}
          <div style={{padding:"0 22px 14px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>
                {idx+1} / {queue.length}
              </span>
              {mode==="quiz" && (
                <span style={{fontSize:12,color:"rgba(255,255,255,.45)"}}>
                  ✓{correct} · ✗{wrong}
                </span>
              )}
            </div>
            <div style={{height:5,background:"rgba(255,255,255,.1)",borderRadius:100,overflow:"hidden"}}>
              <div style={{height:"100%",borderRadius:100,
                background:`linear-gradient(90deg,${deck?.color||"#6C63FF"},${deck?.color||"#6C63FF"}88)`,
                width:`${((idx+1)/queue.length)*100}%`,transition:"width .4s"}}/>
            </div>
          </div>

          {/* Card stack */}
          <div style={{padding:"0 22px",height:340,position:"relative",
            display:"flex",alignItems:"center",justifyContent:"center"}}>
            {next2 && <SwipeCard key={`bg2-${idx+2}`} word={next2} mode={mode} isTop={false} stackPos={2}
              onKnow={()=>{}} onDontKnow={()=>{}} srsInfo={null}/>}
            {next1 && <SwipeCard key={`bg1-${idx+1}`} word={next1} mode={mode} isTop={false} stackPos={1}
              onKnow={()=>{}} onDontKnow={()=>{}} srsInfo={null}/>}
            {cur && <SwipeCard key={`top-${idx}`} word={cur} mode={mode} isTop={true} stackPos={0}
              onKnow={()=>advance(true)} onDontKnow={()=>advance(false)}
              srsInfo={mode==="quiz" && getCard(srs,cur.id).streak>0
                ? `🔁 بعد ${daysLeft(srs,cur.id)||"<1"} يوم` : null}/>}
          </div>

          {/* Bottom actions */}
          <div style={{padding:"10px 22px 8px",display:"flex",gap:10}}>
            {mode==="study" ? (
              <>
                <button onClick={advancePrev} disabled={idx===0}
                  style={{flex:1,height:52,borderRadius:16,background:"rgba(255,255,255,.07)",
                    border:"1px solid rgba(255,255,255,.12)",color:idx===0?"rgba(255,255,255,.25)":"white",
                    fontSize:22,cursor:idx===0?"not-allowed":"pointer"}}>
                  ←
                </button>
                <button onClick={()=>speak(cur?.nikud||cur?.hebrew||"")}
                  style={{flex:2,height:52,borderRadius:16,background:"rgba(255,255,255,.08)",
                    border:"1px solid rgba(255,255,255,.15)",color:"white",fontSize:14,fontWeight:800,
                    cursor:"pointer",fontFamily:"Tajawal,sans-serif"}}>
                  🔊 استمع
                </button>
                <button onClick={()=>advance(true)} disabled={idx>=queue.length-1}
                  style={{flex:1,height:52,borderRadius:16,
                    background:deck?.color||"#6C63FF",border:"none",
                    color:"white",fontSize:22,cursor:"pointer"}}>
                  →
                </button>
              </>
            ) : (
              <>
                <button onClick={()=>advance(false)}
                  style={{flex:1,height:52,borderRadius:16,background:"rgba(255,107,107,.14)",
                    border:"2px solid rgba(255,107,107,.35)",color:"#FF6B6B",
                    fontSize:14,fontWeight:900,cursor:"pointer",fontFamily:"Tajawal,sans-serif"}}>
                  ✗ لا أعرف
                </button>
                <button onClick={()=>speak(cur?.nikud||cur?.hebrew||"")}
                  style={{width:52,height:52,borderRadius:16,background:"rgba(255,255,255,.07)",
                    border:"1px solid rgba(255,255,255,.12)",color:"white",fontSize:18,cursor:"pointer"}}>
                  🔊
                </button>
                <button onClick={()=>advance(true)}
                  style={{flex:1,height:52,borderRadius:16,background:"rgba(78,205,196,.14)",
                    border:"2px solid rgba(78,205,196,.35)",color:"#4ECDC4",
                    fontSize:14,fontWeight:900,cursor:"pointer",fontFamily:"Tajawal,sans-serif"}}>
                  ✓ أعرفها
                </button>
              </>
            )}
          </div>

          {/* Swipe hint */}
          {mode==="quiz" && (
            <div style={{textAlign:"center",fontSize:11,color:"rgba(255,255,255,.22)",padding:"0 0 8px"}}>
              أو اسحب البطاقة يميناً / يساراً
            </div>
          )}

          {/* Dots */}
          <div style={{display:"flex",gap:6,justifyContent:"center",padding:"4px 0 16px"}}>
            {queue.slice(Math.max(0,idx-3),idx+6).map((_,i)=>{
              const ri=Math.max(0,idx-3)+i;
              return <div key={ri} style={{height:7,borderRadius:4,transition:"all .25s",
                background:ri<idx?"#4ECDC4":ri===idx?(deck?.color||"white"):"rgba(255,255,255,.18)",
                width:ri===idx?"20px":"7px"}}/>;
            })}
          </div>
        </div>
        {toast && <Toast msg={toast}/>}
      </div>
    );
  }

  return null;
}

function Toast({ msg }) {
  return (
    <div style={{position:"fixed",bottom:28,left:"50%",transform:"translateX(-50%)",
      background:"rgba(20,20,40,.96)",border:"1px solid rgba(255,255,255,.15)",
      borderRadius:100,padding:"10px 22px",color:"white",fontSize:14,fontWeight:700,
      zIndex:999,backdropFilter:"blur(10px)",whiteSpace:"nowrap",
      fontFamily:"Tajawal,sans-serif",
      animation:"fadeUp .2s ease"}}>
      <style>{`@keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`}</style>
      {msg}
    </div>
  );
}
