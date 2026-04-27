'use strict';

// Firebase functions exposed by the module script in index.html
// window._fbLoadQuestions(USER_STORE) — loads all stored questions
// window._fbSaveQuestion(question, embedding, doorChosen) — saves a question

const API_URL   = 'https://itp-ima-replicate-proxy.web.app/api/create_n_get';
const API_MODEL = 'openai/gpt-5.2';

// Per-door themes and question focus areas
const DOOR_THEMES = [
    { name:'The Familiar', focus:'staying, returning to what is known, comfort, safety, familiarity', topics:['what it costs to stay','the fear of leaving','the comfort you keep choosing','what you already know this life looks like','who you become if you never leave'] },
    { name:'The Ending',   focus:'leaving, making an irreversible choice, walking away for good',     topics:['what you lose by leaving','who gets hurt','the moment you say goodbye','what life looks like after','what becomes possible when it is over'] },
    { name:'The Silence',  focus:'not deciding, waiting, letting time pass, avoiding the choice',     topics:['how long you have already waited','what you are really waiting for','what happens if you never decide','what the delay is costing you','who you are when you avoid choosing'] },
];

const FINAL_TEXT = [
    { t:'This system let you return.',             em:false },
    { t:'',                                        spacer:true },
    { t:'It let you replay,',                      em:false },
    { t:'revise,',                                 em:false },
    { t:'and reopen what was once closed.',        em:false },
    { t:'',                                        spacer:true },
    { t:'Reality does not.',                       em:true },
    { t:'',                                        spacer:true },
    { t:'In life,',                                em:false },
    { t:'you do not choose between outcomes.',     em:false },
    { t:'',                                        spacer:true },
    { t:'You choose which uncertainty',            em:false },
    { t:'you are willing to live with.',           em:false },
    { t:'',                                        spacer:true },
    { t:'And once you live it,',                   em:false },
    { t:'it becomes the only version',             em:false },
    { t:'that ever existed.',                      em:true },
];

const VISION_INTROS = [
    'Now let me show you how this life unfolds.',
    'Let me draw the shape of this path forward.',
    'Here is where this road eventually leads.',
    'Let me show you the life this choice creates.',
];

const S = {
    screen:'landing', blocked:false,
    decision:'', answers:[], questions:[], qIndex:0,
    paths:null, visited:[false,false,false], doorIndex:null,
    chatQuestions:[], chatAnswers:[], chatStep:0,
    chatDone:false, canExitChat:false,
    fragmentShown:false,
    doorChoicesCount:[0,0,0],
    galaxyDecision: null,   // preserved after reset for galaxy display
    galaxyVisited:  null,
    userEmbedding:  null,   // real embedding of user's decision
};

const $     = id => document.getElementById(id);
const delay = ms => new Promise(r => setTimeout(r, ms));
function rand(min,max){ return Math.random()*(max-min)+min; }

// ── CURSOR ─────────────────────────────────────────────
const cursorDot  = $('cursor');
const cursorRing = $('cursor-ring');
let ringX=0, ringY=0, dotX=0, dotY=0;
document.addEventListener('mousemove', e => {
    dotX=e.clientX; dotY=e.clientY;
    cursorDot.style.left=dotX+'px'; cursorDot.style.top=dotY+'px';
});
(function animateRing(){
    ringX += (dotX-ringX)*0.12; ringY += (dotY-ringY)*0.12;
    cursorRing.style.left=ringX+'px'; cursorRing.style.top=ringY+'px';
    requestAnimationFrame(animateRing);
})();
// Cursor scale on interactive elements
document.addEventListener('mouseover', e => {
    const t = e.target.closest('.door-wrap,.pc-door,.ep-btn,.enter-btn,.return-to-start-btn button');
    if(t){ cursorDot.style.width='16px'; cursorDot.style.height='16px'; cursorDot.style.background='rgba(255,155,200,1)'; cursorRing.style.width='52px'; cursorRing.style.height='52px'; cursorRing.style.borderColor='rgba(255,155,200,0.75)'; }
});
document.addEventListener('mouseout', e => {
    const t = e.target.closest('.door-wrap,.pc-door,.ep-btn,.enter-btn,.return-to-start-btn button');
    if(t){ cursorDot.style.width='8px'; cursorDot.style.height='8px'; cursorDot.style.background='#fff'; cursorRing.style.width='28px'; cursorRing.style.height='28px'; cursorRing.style.borderColor='rgba(255,210,230,0.7)'; }
});

// ── BACKGROUND ─────────────────────────────────────────
function setBg(name){
    document.querySelectorAll('.bg-layer').forEach(l=>l.classList.remove('active'));
    if(name==='landing') $('bg-landing').classList.add('active');
    else if(name==='arch') $('bg-arch').classList.add('active');
    else if(name==='doors') $('bg-doors').classList.add('active');
}

// ── PARTICLE CANVAS ────────────────────────────────────
(function initCanvas(){
    const canvas=$('ripple-canvas'), ctx=canvas.getContext('2d');
    let W,H, ripples=[], particles=[];
    function resize(){ W=canvas.width=window.innerWidth; H=canvas.height=window.innerHeight; }

    // Ambient floating particles (visible on dark bg)
    for(let i=0;i<40;i++) particles.push({
        x:rand(0,1), y:rand(0,1), vy:rand(-0.0003,-0.0001), vx:rand(-0.00015,0.00015),
        r:rand(0.8,2.2), op:rand(0.05,0.2), phase:rand(0,Math.PI*2)
    });

    function addRipple(x,y,size){
        ripples.push({x,y,r:0,max:size||rand(65,130),op:0.28,speed:rand(1,2.2)});
    }
    document.addEventListener('mousemove',e=>{ if(Math.random()<0.05) addRipple(e.clientX,e.clientY,rand(35,85)); });
    document.addEventListener('click',e=>{ for(let i=0;i<3;i++) setTimeout(()=>addRipple(e.clientX,e.clientY,rand(70,160)),i*120); });

    let t=0;
    function draw(){
        t+=0.012;
        ctx.clearRect(0,0,W,H);
        // Particles only on dark screens
        if(['landing','doors'].includes(S.screen)){
            particles.forEach(p=>{
                p.x+=p.vx; p.y+=p.vy;
                if(p.y<-0.02) p.y=1.02;
                if(p.x<-0.02) p.x=1.02;
                if(p.x>1.02)  p.x=-0.02;
                const tw=p.op*(0.5+0.5*Math.sin(t+p.phase));
                ctx.beginPath(); ctx.arc(p.x*W,p.y*H,p.r,0,Math.PI*2);
                ctx.fillStyle=`rgba(255,200,225,${tw})`; ctx.fill();
            });
        }
        // Ripples
        for(let i=ripples.length-1;i>=0;i--){
            const r=ripples[i]; r.r+=r.speed; r.op*=0.958;
            if(r.r>r.max||r.op<0.004){ripples.splice(i,1);continue;}
            ctx.beginPath(); ctx.arc(r.x,r.y,r.r,0,Math.PI*2);
            ctx.strokeStyle=`rgba(255,190,215,${r.op})`; ctx.lineWidth=1; ctx.stroke();
        }
        requestAnimationFrame(draw);
    }
    resize(); draw();
    window.addEventListener('resize',resize);
})();

// ── LLM ────────────────────────────────────────────────
async function llm(systemPrompt,userPrompt,maxTokens=400){
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({version:API_MODEL,input:{prompt:userPrompt,system_prompt:systemPrompt,max_tokens:maxTokens}})});
    const data=await res.json();
    let out=data.output||'';
    if(Array.isArray(out)) out=out.join('');
    return out.trim();
}
function parseLines(text){
    return text.split('\n').map(l=>l.replace(/^[\d\-\.\*\•\s]+/,'').trim()).filter(l=>l.length>3);
}

// ── SCREENS ────────────────────────────────────────────
function goTo(id,ms=500){
    return new Promise(resolve=>{
        setTimeout(()=>{
            document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
            $(id).classList.add('active');
            S.screen=id; resolve();
        },ms);
    });
}

// ── LANDING ────────────────────────────────────────────
$('enterBtn').addEventListener('click', startExperience);

// ── BGM ──────────────────────────────────────────────
// Created lazily on first user click — required for GitHub Pages autoplay policy
// (browsers block Audio objects created before any gesture on https:// origins)
let bgm = null;
let bgmStarted = false;

function startBGM(){
    if(bgmStarted) return;
    bgmStarted = true;
    // Create the Audio object here — inside a real user gesture — so autoplay is allowed
    bgm = new Audio('bgm.mp3');
    bgm.loop   = true;
    bgm.volume = 0;
    bgm.play().catch(()=>{});
    // Fade BGM in slowly
    let v = 0;
    const fade = setInterval(()=>{
        v = Math.min(v + 0.01, 0.18);
        bgm.volume = v;
        if(v >= 0.18) clearInterval(fade);
    }, 80);
}

function duckBGM(targetVol = 0.07, ms = 600){
    if(!bgm) return;
    const step = (bgm.volume - targetVol) / (ms / 30);
    const t = setInterval(()=>{
        bgm.volume = Math.max(bgm.volume - step, targetVol);
        if(bgm.volume <= targetVol) clearInterval(t);
    }, 30);
}

function unduckBGM(ms = 800){
    if(!bgm) return;
    const target = 0.18;
    const step = (target - bgm.volume) / (ms / 30);
    const t = setInterval(()=>{
        bgm.volume = Math.min(bgm.volume + step, target);
        if(bgm.volume >= target) clearInterval(t);
    }, 30);
}

// Override playAudio to duck BGM while voice plays
function playAudioWithDuck(filename, fadeInMs = 600){
    if(bgmStarted) duckBGM(0.07, 400);
    playAudio(filename, fadeInMs);
    // Restore BGM when voice ends
    const probe = new Audio(filename);
    probe.addEventListener('loadedmetadata', ()=>{
        setTimeout(()=>{ if(bgmStarted) unduckBGM(); }, probe.duration * 1000 + 200);
    });
    probe.load();
}

async function startExperience(){
    if(S.blocked) return;
    S.blocked=true;
    // BGM starts immediately on click
    startBGM();
    // Welcome voice plays 1 second later, on top of BGM
    setTimeout(()=> playAudioWithDuck('Landing page welcome.mp3', 200), 1000);
    const l=$('landing');
    l.style.transition='opacity 0.9s ease';
    l.style.opacity='0';
    await delay(700);
    setBg('arch');
    await goTo('decisionInput',0);
    $('decisionField').focus();
    S.blocked=false;
}

// ── DECISION ───────────────────────────────────────────
$('decisionField').addEventListener('keydown',e=>{ if(e.key==='Enter') submitDecision(); });
async function submitDecision(){
    const val=$('decisionField').value.trim();
    if(!val||S.blocked) return;
    S.decision=val; S.blocked=true;
    // Start embedding in background immediately — will be ready by the time galaxy opens
    getRealEmbedding(val).then(emb=>{ if(emb) S.userEmbedding=emb; });
    await goTo('loading',200);
    await generateQuestions();
    S.blocked=false;
}

// ── GENERATE QUESTIONS ─────────────────────────────────
async function generateQuestions(){
    const sys=`Someone is thinking about this decision: "${S.decision}"
Ask them 4 simple questions to understand their situation.
Topics: what they're afraid of, what they want, who else is affected, what's stopping them.
Rules: under 10 words each. Everyday simple language. Like a friend asking. No big words. No numbering.
Return ONLY 4 questions, one per line.`;
    try{
        const out=await llm(sys,'generate',220);
        S.questions=parseLines(out).slice(0,4);
        if(!S.questions.length) throw new Error('empty');
    }catch{
        S.questions=['How long have you been thinking about this?','What are you most afraid will happen?','Who else does this decision affect?','What has stopped you from deciding so far?'];
    }
    $('qTotal').textContent=S.questions.length;
    S.qIndex=0; S.answers=[];
    await goTo('questioning',200);
    showQuestion();
}

// ── QUESTIONING ────────────────────────────────────────
$('answerField').addEventListener('keydown',e=>{ if(e.key==='Enter') submitAnswer(); });
function showQuestion(){
    const qEl=$('qText'),aEl=$('answerField');
    qEl.style.transition='opacity 0.6s'; qEl.style.opacity='0';
    aEl.value='';
    setTimeout(()=>{ qEl.textContent=S.questions[S.qIndex]; $('qNum').textContent=S.qIndex+1; qEl.style.opacity='1'; aEl.focus(); },400);
}
async function submitAnswer(){
    const val=$('answerField').value.trim();
    if(!val||S.blocked) return;
    S.answers.push(val); S.qIndex++;
    if(S.qIndex>=S.questions.length){ S.blocked=true; await goTo('loading',300); await generatePaths(); S.blocked=false; }
    else showQuestion();
}

// ── GENERATE PATHS ─────────────────────────────────────
async function generatePaths(){
    const ansText=S.answers.map((a,i)=>`Q${i+1}: ${a}`).join('\n');
    const sys=`Decision: "${S.decision}" | Answers: ${ansText}
Write 3 short path titles (under 7 words each) that feel completely different from each other.
Path 1 = staying / keeping things the same (familiar, safe, unchanged)
Path 2 = leaving / ending it (permanent, final, a clean break)
Path 3 = doing nothing / waiting (delay, avoidance, uncertainty)
Make each title feel like a different emotional world. Be specific and evocative.
Return ONLY JSON: {"paths":[{"pathTitle":"..."},{"pathTitle":"..."},{"pathTitle":"..."}]}`;
    try{
        const out=await llm(sys,'paths',300);
        S.paths=JSON.parse(out.match(/\{[\s\S]*\}/)[0]).paths;
    }catch{
        S.paths=[{pathTitle:'The weight of familiar ground'},{pathTitle:'The clarity of an ending'},{pathTitle:'The silence of suspension'}];
    }
    for(let i=0;i<3;i++){
        const el=$(`dt${i}`);
        if(el&&S.paths[i]) el.textContent=S.paths[i].pathTitle;
    }
    setBg('doors');
    await goTo('doors',400);
}

// ── DOORS ──────────────────────────────────────────────
document.querySelectorAll('.door-wrap').forEach(door=>{
    door.addEventListener('click',()=>{
        if(S.blocked||door.classList.contains('visited')) return;
        const idx=parseInt(door.dataset.door,10);
        if(!isNaN(idx)) enterDoor(idx);
    });
});

async function enterDoor(idx){
    S.blocked=true; S.doorIndex=idx;
    const door=document.querySelector(`.door-wrap[data-door="${idx}"]`);
    door.style.transition='opacity 0.5s,transform 0.5s';
    door.style.transform='scale(1.06) translateY(-10px)';
    door.style.opacity='0.4';
    await delay(520);
    $('chatHeaderPath').textContent=S.paths?.[idx]?.pathTitle||'';
    await goTo('chat',0);
    S.chatQuestions=[]; S.chatAnswers=[]; S.chatStep=0;
    S.chatDone=false; S.canExitChat=false; S.fragmentShown=false;
    $('chatMessages').innerHTML=''; $('chatInput').value='';
    $('chatInput').placeholder='speak your truth...';
    door.style.transform=''; door.style.opacity='';
    await delay(600);
    await startDoorChat(idx);
    S.blocked=false;
}

// ── CHAT ───────────────────────────────────────────────
$('chatInput').addEventListener('keydown',e=>{
    if(e.key!=='Enter') return;
    e.preventDefault();
    if(S.canExitChat){ exitChatAndReturn(); return; }  // always allow exit
    if(S.blocked) return;
    handleChatInput();
});

async function startDoorChat(idx){
    const theme=DOOR_THEMES[idx];
    const pathTitle=S.paths?.[idx]?.pathTitle||theme.name;
    const ansCtx=S.answers.join('. ');
    await delay(700);
    botSay("You're here now.");

    // Each door gets uniquely themed questions
    const sys=`You are a quiet presence guiding someone through the path of: "${pathTitle}"
This path is about: ${theme.focus}
Their decision: "${S.decision}"
Context: ${ansCtx}

Generate 5 short questions about this path. Each question must directly relate to their specific decision.

For questions 2-5, include a SHORT reaction (1 sentence, max 7 words) before the question.

Return ONLY valid JSON:
{"questions":[
  {"reaction":"","question":"..."},
  {"reaction":"...","question":"..."},
  {"reaction":"...","question":"..."},
  {"reaction":"...","question":"..."},
  {"reaction":"...","question":"..."}
]}

Rules:
- Simple everyday language, like talking to a friend
- Under 10 words per question
- Direct and specific to their situation
- No complex vocabulary, no metaphors
- Questions should feel easy to answer honestly`;

    const fetchPromise=llm(sys,'chat questions',450)
        .then(out=>{
            const json=out.match(/\{[\s\S]*\}/)?.[0];
            const data=JSON.parse(json);
            if(!data.questions?.length) throw new Error('empty');
            return data.questions;
        })
        .catch(()=>{
            const fallbacks={
                0:[
                    {reaction:'',question:"What would actually change if you stayed?"},
                    {reaction:'I see.',question:"What are you most afraid to lose?"},
                    {reaction:'That makes sense.',question:"Who else is affected by this?"},
                    {reaction:'Mm.',question:"What do you keep ignoring about this situation?"},
                    {reaction:'I hear that.',question:"What would feel like a relief right now?"}
                ],
                1:[
                    {reaction:'',question:"What would you miss the most?"},
                    {reaction:'That stayed with me.',question:"What are you most scared of after leaving?"},
                    {reaction:'I see.',question:"Who would be hurt if you walked away?"},
                    {reaction:'Mm.',question:"What would finally be over?"},
                    {reaction:'I hear that.',question:"What have you already lost by waiting?"}
                ],
                2:[
                    {reaction:'',question:"How long have you been putting this off?"},
                    {reaction:'I hear that.',question:"What are you waiting for exactly?"},
                    {reaction:'That makes sense.',question:"What happens if you never decide?"},
                    {reaction:'Mm.',question:"What does waiting cost you every day?"},
                    {reaction:'I see.',question:"What would push you to finally choose?"}
                ],
            };
            return fallbacks[idx]||fallbacks[0];
        });

    const [questions]=await Promise.all([fetchPromise,delay(2200)]);
    S.chatQuestions=questions;
    askNextChatQuestion();
}

function askNextChatQuestion(){
    if(S.chatStep>=S.chatQuestions.length){ S.chatDone=true; generateAndShowOutcome(); return; }
    botSay(S.chatQuestions[S.chatStep].question);
}

async function handleChatInput(){
    const input=$('chatInput');
    const val=input.value.trim();
    if(!val||S.chatDone) return;
    input.value='';
    userSay(val);
    S.chatAnswers.push(val);
    S.chatStep++;

    await delay(650+Math.random()*400);

    // ── FRAGMENT: show once, after answer 2 or 3, non-blocking ──
    if(!S.fragmentShown && (S.chatStep===2 || S.chatStep===3)){
        S.fragmentShown=true;
        // Fire and forget — don't await, so chat continues normally
        showFragment();
    }

    const next=S.chatQuestions[S.chatStep];
    if(next&&next.reaction&&next.reaction.trim()){
        botSay(next.reaction,false,true);
        await delay(850+Math.random()*300);
    }
    askNextChatQuestion();
}

// ── CHAT RENDER ────────────────────────────────────────
function botSay(text,isOutcome=false,isReaction=false){
    const msgs=$('chatMessages');
    const el=document.createElement('div');
    if(isOutcome) el.className='cmsg bot outcome';
    else if(isReaction) el.className='cmsg bot reaction';
    else el.className='cmsg bot';
    el.textContent=text;
    msgs.appendChild(el);
    scrollMsgs();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{ el.classList.add('show'); scrollMsgs(); }));
    return el;
}
function userSay(text){
    const msgs=$('chatMessages');
    const el=document.createElement('div');
    el.className='cmsg user show';
    el.textContent=text;
    msgs.appendChild(el);
    scrollMsgs();
}
function scrollMsgs(){ const m=$('chatMessages'); m.scrollTop=m.scrollHeight; }

// ── OUTCOME ────────────────────────────────────────────
async function generateAndShowOutcome(){
    await delay(1400);
    const introLine=VISION_INTROS[S.doorIndex%VISION_INTROS.length];
    botSay(introLine);
    await delay(2000);

    // ── Disable input + show loading dots while story generates ──
    const input = $('chatInput');
    input.disabled = true;
    input.placeholder = '...';
    // Add typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'cmsg bot typing-indicator show';
    typingEl.innerHTML = '<span></span><span></span><span></span>';
    $('chatMessages').appendChild(typingEl);
    scrollMsgs();

    const ansText=S.chatAnswers.map((a,i)=>`${i+1}. ${a}`).join('\n');
    const sys=`Write a short second-person narrative about the path: "${S.paths?.[S.doorIndex]?.pathTitle||''}"
Decision: "${S.decision}" | Context: ${ansText}
4 paragraphs: (1) moment decision becomes real, (2) immediate after, (3) months/years later, (4) final quiet moment.
2-3 sentences each. Under 130 words total. No lessons. Grounded, specific. Calm, slightly melancholy.
Return ONLY the 4 paragraphs separated by blank lines.`;

    let lines;
    try{
        const out=await llm(sys,'outcome',380);
        lines=out.split(/\n\n+/).map(p=>p.replace(/\n/g,' ').trim()).filter(p=>p.length>10).slice(0,4);
        if(!lines.length) throw new Error('empty');
    }catch{
        lines=['You say the words out loud, and the decision becomes solid.','The next morning the world looks the same, but you carry it differently.','A year later you find a routine that fits the shape of this choice.','At night, sometimes, you wonder. But it is already the only life you know.'];
    }

    // Remove typing indicator, re-enable input
    typingEl.remove();
    input.disabled = false;

    for(let i=0;i<lines.length;i++){
        await delay(i===0?800:3200);
        botSay(lines[i],true);
    }
    await delay(2600);
    const wrap=document.createElement('div');
    wrap.className='chat-exit-cta';
    wrap.innerHTML='<button class="chat-exit-cta-inner" id="chatExitBtn">press enter or click to leave</button>';
    $('chatMessages').appendChild(wrap);
    scrollMsgs();
    S.canExitChat=true;
    $('chatInput').placeholder='press enter to leave...';
    $('chatInput').focus();
    // Also allow clicking the button directly
    document.getElementById('chatExitBtn').addEventListener('click', ()=>{
        if(S.canExitChat) exitChatAndReturn();
    });
}

// ── EXIT CHAT ──────────────────────────────────────────
async function exitChatAndReturn(){
    S.canExitChat=false; S.blocked=true;
    $('chatInput').placeholder='speak your truth...';
    const idx=S.doorIndex;
    S.visited[idx]=true;

    // Record this door visit in collective stats
    S.doorChoicesCount[idx]++;

    // Save this user's question + door choice to the collective store
    if(S.decision){
        USER_STORE.push({
            question: S.decision,
            embedding: null,   // populated asynchronously by saveUserFragment
            doorChosen: idx,
        });
    }

    const door=document.querySelector(`.door-wrap[data-door="${idx}"]`);

    // Build the "doors remaining" notice
    const DOOR_NAMES=['The Familiar','The Ending','The Silence'];
    const remaining=S.visited.map((v,i)=>v?null:DOOR_NAMES[i]).filter(Boolean);
    const notice=$('returnDoorsNotice');
    if(remaining.length>0){
        notice.innerHTML=`You can still enter:<br>${remaining.map(n=>`<span>${n}</span>`).join('')}`;
        notice.style.display='';
    } else {
        notice.style.display='none';
    }

    await goTo('returnState',400);
    if(door) setTimeout(()=>door.classList.add('visited'),200);
    S.blocked=false;
}

$('returnState').addEventListener('click',handleReturnClick);
async function handleReturnClick(){
    if(S.blocked) return; S.blocked=true;
    if(S.visited.every(v=>v)){
        await goTo('finalState',400);
        await delay(300);
        displayFinalLines();
    } else {
        setBg('doors');
        await goTo('doors',400);
    }
    S.blocked=false;
}

// ══════════════════════════════════════════════════════════════
// AUDIO — MP3 playback
// All 4 files must be in the same folder as index.html
// ══════════════════════════════════════════════════════════════

let currentAudio = null;

function playAudio(filename, fadeInMs = 600){
    stopSpeech();
    const audio = new Audio(filename);
    audio.volume = 0;
    currentAudio = audio;
    audio.play().catch(()=>{});
    let vol = 0;
    const steps = 20;
    const increment = 0.85 / steps;
    const interval = fadeInMs / steps;
    const fade = setInterval(()=>{
        vol = Math.min(vol + increment, 0.85);
        if(audio === currentAudio) audio.volume = vol;
        if(vol >= 0.85) clearInterval(fade);
    }, interval);
}

function stopSpeech(fadeOutMs = 500){
    if(!currentAudio) return;
    const audio = currentAudio;
    currentAudio = null;
    let vol = audio.volume;
    if(vol === 0){ audio.pause(); return; }
    const steps = 20;
    const decrement = vol / steps;
    const interval = fadeOutMs / steps;
    const fade = setInterval(()=>{
        vol = Math.max(vol - decrement, 0);
        audio.volume = vol;
        if(vol <= 0){ clearInterval(fade); audio.pause(); }
    }, interval);
}

// ── FINAL STATE ────────────────────────────────────────
async function displayFinalLines(){
    const container=$('finalLines');
    container.innerHTML='';

    playAudioWithDuck('Finalline.mp3', 400);   // starts playing as first line appears

    for(const item of FINAL_TEXT){
        const el=document.createElement('p');
        if(item.spacer){ el.className='fline spacer'; el.innerHTML='&nbsp;'; }
        else{ el.className=item.em?'fline em':'fline'; el.textContent=item.t; }
        container.appendChild(el);
        await delay(30); el.classList.add('show');
        // 1300ms per line / 500ms per spacer → total ~20.9s, matches Finalline.mp3 (20.2s)
        await delay(item.spacer ? 500 : 1300);
    }
    await delay(3500);   // let last word linger, audio finishes naturally
    stopSpeech(1200);    // slow fade at end
    await delay(1200);
    await goTo('pathChoice',600);
    populatePathChoice();
}

// ── PATH CHOICE ────────────────────────────────────────
function populatePathChoice(){
    for(let i=0;i<3;i++){
        const el=$(`pc-title-${i}`);
        if(el&&S.paths?.[i]) el.textContent=S.paths[i].pathTitle;
    }
}
document.querySelectorAll('.pc-door').forEach(door=>{
    door.addEventListener('click',async()=>{
        if(S.blocked) return; S.blocked=true;
        door.style.transition='opacity 0.4s,transform 0.4s';
        door.style.opacity='0.4'; door.style.transform='scale(0.96)';
        await delay(500);
        await goTo('epilogue',400);
        // ep-question animates in at 0.4s — play audio at same moment
        setTimeout(() => playAudioWithDuck('Question.mp3', 500), 400);
        S.blocked=false;
    });
});

// ── EPILOGUE + RETURN TO START ─────────────────────────
document.querySelectorAll('.ep-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
        if(btn.disabled) return;
        document.querySelectorAll('.ep-btn').forEach(b=>{ b.disabled=true; b.style.opacity='0.2'; b.style.pointerEvents='none'; });
        // Play immediately on click — After_choice.mp3 is 3.9s
        playAudioWithDuck('After choice.mp3', 200);
        setTimeout(()=>{
            const el=$('epResponse');
            const responseText = 'You already did. Just not in the life you lived.';
            el.textContent=responseText;
            el.style.whiteSpace='pre-line';
            el.classList.add('show');
            setTimeout(()=>{
                const wrap=$('returnToStartWrap');
                wrap.style.display='inline-block';
            },2200);
        },600);
    });
});

$('returnToStartBtn').addEventListener('click',async()=>{
    if(S.blocked) return; S.blocked=true;
    stopSpeech();   // stop any playing audio
    const allDone = S.visited.every(v=>v);
    const savedDecision  = S.decision;
    const savedVisited   = [...S.visited];
    const savedEmbedding = S.userEmbedding;  // real embedding
    // Full reset
    S.screen='landing'; S.decision=''; S.answers=[]; S.questions=[]; S.qIndex=0;
    S.paths=null; S.visited=[false,false,false]; S.doorIndex=null;
    S.chatQuestions=[]; S.chatAnswers=[]; S.chatStep=0;
    S.chatDone=false; S.canExitChat=false;
    S.galaxyDecision = savedDecision;
    S.galaxyVisited  = savedVisited;
    S.userEmbedding  = savedEmbedding;
    // Add this user's real question to the shared galaxy for future visitors
    if(savedDecision && savedEmbedding){
        const lastDoor = savedVisited.lastIndexOf(true);
        const doorChosen = lastDoor >= 0 ? lastDoor : 0;
        USER_STORE.push({ question: savedDecision, embedding: savedEmbedding, doorChosen });
        saveQuestionToStorage(savedDecision, savedEmbedding, doorChosen);
    }
    document.querySelectorAll('.door-wrap').forEach(d=>d.classList.remove('visited'));
    document.querySelectorAll('.ep-btn').forEach(b=>{ b.disabled=false; b.style.opacity=''; b.style.pointerEvents=''; });
    $('epResponse').classList.remove('show'); $('epResponse').textContent='';
    $('returnToStartWrap').style.display='none';
    $('decisionField').value=''; $('answerField').value='';
    // Transition back
    setBg('landing');
    const land=$('landing');
    land.style.transition='none'; land.style.opacity='0'; land.style.transform='scale(0.96)';
    await goTo('landing',400);
    setTimeout(()=>{
        land.style.transition='opacity 1.2s ease,transform 1.2s ease';
        land.style.opacity='1'; land.style.transform='scale(1)';
        // Show "see others" prompt on landing if all doors were completed
        if(allDone){
            const prompt=$('seeOthersPrompt');
            if(prompt){
                // Reset any inline styles from previous hide
                prompt.style.opacity='';
                prompt.style.transform='';
                prompt.style.display='block';
                // Force reflow so transition plays fresh
                prompt.offsetHeight;
                prompt.classList.add('sop-visible');
            }
        }
    },50);
    S.blocked=false;
});

// ══════════════════════════════════════════════════════════════
// ANONYMOUS SIMILAR FRAGMENTS
// Each user leaves a short emotional trace after finishing a door.
// Future users with semantically similar input encounter it.
// ══════════════════════════════════════════════════════════════

// In-memory store: [{ embedding: float[], fragment: string, doorIndex: int }]
// Pre-seeded with real-feeling fragments so the first user sees traces immediately.
const FRAGMENT_STORE = [
    // Door 0 — The Familiar
    { embedding:[0.6,0.3,-0.4,0.5,0.7,-0.2,0.4,-0.3,0.6,0.1,-0.5,0.2,0.3,0.5,-0.1,0.4], fragment:"I stayed because leaving would make it real.", doorIndex:0 },
    { embedding:[0.7,0.4,-0.3,0.4,0.6,-0.1,0.5,-0.2,0.5,0.2,-0.4,0.3,0.2,0.6,-0.2,0.5], fragment:"I kept calling it patience when it was fear.", doorIndex:0 },
    { embedding:[0.5,0.2,-0.5,0.6,0.8,-0.3,0.3,-0.4,0.7,0.0,-0.6,0.1,0.4,0.4,-0.3,0.3], fragment:"Nothing changed, and that became the answer.", doorIndex:0 },
    { embedding:[0.4,0.5,-0.2,0.3,0.5,0.1,0.6,-0.1,0.4,0.3,-0.3,0.4,0.1,0.7,-0.1,0.6], fragment:"I knew the room by heart and that felt like enough.", doorIndex:0 },
    // Door 1 — The Ending
    { embedding:[-0.3,0.6,0.5,-0.4,0.2,0.7,-0.5,0.6,-0.2,0.4,0.5,-0.6,0.3,-0.4,0.6,-0.3], fragment:"I packed one bag and stood at the door for an hour.", doorIndex:1 },
    { embedding:[-0.2,0.7,0.4,-0.5,0.1,0.8,-0.4,0.7,-0.1,0.5,0.4,-0.5,0.4,-0.3,0.7,-0.2], fragment:"The last conversation was smaller than I imagined it would be.", doorIndex:1 },
    { embedding:[-0.4,0.5,0.6,-0.3,0.3,0.6,-0.6,0.5,-0.3,0.3,0.6,-0.4,0.2,-0.5,0.5,-0.4], fragment:"I thought relief would feel different than loneliness.", doorIndex:1 },
    { embedding:[-0.1,0.8,0.3,-0.6,0.0,0.9,-0.3,0.8,0.0,0.6,0.3,-0.7,0.5,-0.2,0.8,-0.1], fragment:"Once I said it out loud, there was no version where I stayed.", doorIndex:1 },
    // Door 2 — The Silence
    { embedding:[0.1,-0.5,0.2,0.8,-0.3,0.4,0.2,-0.7,0.3,-0.6,0.1,0.7,-0.4,0.2,-0.8,0.1], fragment:"I kept waiting for the choice to become obvious.", doorIndex:2 },
    { embedding:[0.2,-0.4,0.3,0.7,-0.2,0.5,0.1,-0.6,0.4,-0.5,0.2,0.6,-0.3,0.3,-0.7,0.2], fragment:"Every month I said next month, until the months were years.", doorIndex:2 },
    { embedding:[0.0,-0.6,0.1,0.9,-0.4,0.3,0.3,-0.8,0.2,-0.7,0.0,0.8,-0.5,0.1,-0.9,0.0], fragment:"I was not avoiding the decision. I was avoiding being wrong.", doorIndex:2 },
    { embedding:[0.3,-0.3,0.4,0.6,-0.1,0.6,0.0,-0.5,0.5,-0.4,0.3,0.5,-0.2,0.4,-0.6,0.3], fragment:"The door was always open. That was the problem.", doorIndex:2 },
];

// ── COLLECTIVE STORE: all users' questions + embeddings for galaxy ──
const USER_STORE = [
    { question:"Should I stay in a city that no longer feels like mine?",       embedding:[0.5,0.3,-0.2,0.4,0.6,-0.1,0.3,-0.2,0.5,0.2,-0.3,0.4,0.2,0.5,-0.1,0.3], doorChosen:0 },
    { question:"Is it too late to leave a relationship that is just okay?",      embedding:[0.4,0.6,0.3,-0.3,0.2,0.5,-0.4,0.5,-0.1,0.4,0.3,-0.4,0.4,-0.2,0.6,-0.1], doorChosen:2 },
    { question:"Should I quit and start over, even if it might fail?",           embedding:[-0.2,0.7,0.5,-0.4,0.1,0.8,-0.3,0.6,-0.1,0.5,0.4,-0.5,0.3,-0.3,0.7,-0.2], doorChosen:1 },
    { question:"Do I stay in a career I'm good at but no longer believe in?",   embedding:[0.6,0.2,-0.4,0.5,0.7,-0.2,0.4,-0.3,0.6,0.1,-0.5,0.2,0.3,0.5,-0.1,0.4], doorChosen:0 },
    { question:"Should I tell someone I love them, knowing they might leave?",   embedding:[0.3,0.5,0.4,-0.2,0.3,0.6,-0.2,0.5,0.1,0.6,0.2,-0.3,0.5,-0.1,0.5,0.2], doorChosen:2 },
    { question:"Can I wait longer before deciding about having children?",       embedding:[0.1,-0.4,0.2,0.8,-0.3,0.4,0.2,-0.7,0.3,-0.5,0.1,0.7,-0.3,0.2,-0.8,0.1], doorChosen:2 },
    { question:"Should I move back home even if it feels like giving up?",       embedding:[0.7,0.1,-0.5,0.4,0.8,-0.3,0.5,-0.4,0.7,-0.1,-0.6,0.1,0.2,0.4,-0.2,0.3], doorChosen:0 },
    { question:"Is staying silent about what I know the right thing to do?",    embedding:[0.2,-0.5,0.1,0.9,-0.4,0.3,0.1,-0.8,0.2,-0.6,0.0,0.8,-0.4,0.1,-0.9,0.0], doorChosen:0 },
    { question:"Should I end a friendship that only hurts in small ways?",       embedding:[-0.1,0.8,0.4,-0.5,0.0,0.9,-0.3,0.7,0.0,0.5,0.3,-0.6,0.4,-0.2,0.8,-0.1], doorChosen:1 },
    { question:"Do I accept a promotion that will cost me everything else?",     embedding:[0.5,0.4,-0.3,0.3,0.5,0.2,0.6,-0.1,0.4,0.3,-0.2,0.4,0.1,0.6,-0.1,0.5], doorChosen:0 },
    { question:"Should I say what I really think, even if it ends things?",      embedding:[-0.3,0.6,0.6,-0.3,0.2,0.7,-0.5,0.6,-0.2,0.4,0.5,-0.5,0.2,-0.4,0.6,-0.3], doorChosen:1 },
    { question:"Am I staying because I want to, or because I am afraid to go?", embedding:[0.6,0.3,-0.4,0.5,0.7,-0.2,0.4,-0.2,0.5,0.2,-0.4,0.3,0.3,0.5,-0.1,0.4], doorChosen:0 },
    { question:"Should I wait to see if things get better on their own?",        embedding:[0.1,-0.5,0.3,0.8,-0.2,0.4,0.1,-0.7,0.3,-0.5,0.2,0.6,-0.3,0.3,-0.7,0.2], doorChosen:2 },
    { question:"Is it too late to choose a completely different life path?",      embedding:[-0.2,0.5,0.6,-0.2,0.3,0.6,-0.4,0.5,-0.2,0.3,0.6,-0.4,0.3,-0.3,0.5,-0.3], doorChosen:0 },
    { question:"Can I keep living this way without ever making the choice?",     embedding:[0.2,-0.4,0.2,0.7,-0.2,0.5,0.2,-0.6,0.3,-0.5,0.1,0.6,-0.2,0.3,-0.7,0.2], doorChosen:2 },
    { question:"Do I forgive someone who will never apologise?",                 embedding:[0.4,0.5,-0.1,0.3,0.4,0.3,0.5,-0.1,0.3,0.4,-0.1,0.5,0.2,0.4,-0.1,0.5], doorChosen:0 },
    { question:"Should I leave a safe life for an uncertain one I actually want?", embedding:[-0.1,0.8,0.5,-0.3,0.2,0.7,-0.4,0.6,-0.1,0.5,0.4,-0.4,0.3,-0.2,0.7,-0.1], doorChosen:1 },
    { question:"Is it wrong to want more when I already have enough?",           embedding:[0.3,0.4,0.2,-0.1,0.5,0.3,0.4,-0.2,0.4,0.3,-0.2,0.4,0.1,0.5,-0.1,0.4], doorChosen:2 },
    { question:"Should I go back to someone I never really got over?",           embedding:[0.5,0.2,-0.3,0.4,0.6,-0.1,0.3,-0.3,0.5,0.1,-0.4,0.3,0.2,0.5,-0.1,0.3], doorChosen:0 },
    { question:"Do I keep the secret even if the silence is destroying me?",     embedding:[0.1,-0.4,0.2,0.8,-0.3,0.5,0.2,-0.7,0.2,-0.5,0.1,0.7,-0.3,0.2,-0.8,0.1], doorChosen:2 },
];

// ── LOCALSTORAGE PERSISTENCE ──────────────────────────────────
// All user-submitted questions survive refresh and code updates.
// Key: 'tol_user_questions' — stores array of {question, embedding, doorChosen}
const LS_KEY = 'tol_user_questions';

function loadStoredQuestions(){
    try{
        const raw = localStorage.getItem(LS_KEY);
        if(!raw) return;
        const saved = JSON.parse(raw);
        if(!Array.isArray(saved)) return;
        // Merge: skip any already in USER_STORE (by question text)
        const existing = new Set(USER_STORE.map(u=>u.question.trim().toLowerCase()));
        for(const entry of saved){
            if(entry.question && !existing.has(entry.question.trim().toLowerCase())){
                USER_STORE.push(entry);
                existing.add(entry.question.trim().toLowerCase());
            }
        }
    } catch(e){}
}

function saveQuestionToStorage(question, embedding, doorChosen){
    // Save to Firestore (shared across all users)
    if(window._fbSaveQuestion) window._fbSaveQuestion(question, embedding, doorChosen);
    // Also save to localStorage as offline fallback
    try{
        const raw = localStorage.getItem(LS_KEY);
        const saved = raw ? JSON.parse(raw) : [];
        const exists = saved.some(e=>e.question.trim().toLowerCase()===question.trim().toLowerCase());
        if(!exists){
            saved.push({ question, embedding, doorChosen });
            localStorage.setItem(LS_KEY, JSON.stringify(saved));
        }
    } catch(e){}
}

// Safety: force landing elements visible after 8s if animation somehow failed
setTimeout(()=>{
    if(S.screen === 'landing'){
        document.querySelectorAll('.land-content *').forEach(el=>{
            el.style.opacity='1'; el.style.transform='none';
        });
    }
}, 8000);

// Load persisted questions immediately on script load
loadStoredQuestions();

// Seed the doorChoicesCount from USER_STORE with realistic distribution
USER_STORE.forEach(u => { if(u.doorChosen !== undefined) S.doorChoicesCount[u.doorChosen]++; });
// Add extra weight to make it feel real — most people choose familiarity
S.doorChoicesCount[0] += 12;   // The Familiar — most common
S.doorChoicesCount[1] += 7;    // The Ending
S.doorChoicesCount[2] += 4;    // The Silence — least chosen
function cosineSim(a, b){
    if(!a || !b || a.length !== b.length) return 0;
    let dot=0, na=0, nb=0;
    for(let i=0; i<a.length; i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
    if(na===0||nb===0) return 0;
    return dot/(Math.sqrt(na)*Math.sqrt(nb));
}

// ── EMBEDDINGS via LLM proxy ──────────────────────────────
// Uses your existing Replicate proxy to generate a 64-dim semantic embedding.
// The LLM encodes emotional/semantic dimensions as a float vector.
// This gives real similarity-based positioning in the galaxy.

async function getRealEmbedding(text){
    const sys = `You are a semantic embedding encoder.
Given a life decision question, output a JSON array of exactly 64 floats between -1 and 1.
Each dimension encodes a different emotional/semantic aspect:
dims 0-7:   certainty vs uncertainty
dims 8-15:  fear vs hope
dims 16-23: staying vs leaving
dims 24-31: time pressure vs patience
dims 32-39: identity and self-concept
dims 40-47: relationships and others
dims 48-55: control vs surrender
dims 56-63: specific emotional tone (regret, longing, relief, grief, love, anger, peace, confusion)
Be precise and consistent — similar questions must produce similar vectors.
Return ONLY the JSON array, no explanation.`;
    try{
        const out = await llm(sys, `Encode this life question: "${text}"`, 300);
        const match = out.match(/\[[\s\S]*?\]/);
        if(!match) return null;
        const arr = JSON.parse(match[0]);
        if(Array.isArray(arr) && arr.length === 64) return arr;
    }catch{}
    return null;
}

// Project 64-dim embedding → 2D for galaxy positioning.
// Uses the first 2 dims directly + spreads with dims 2-5 for variety.
// Similar embeddings (high cosine sim) → close positions.
function projectTo2D(emb, allEmbs, W, H){
    if(!emb) return { x:W*0.5, y:H*0.5 };

    // Use UMAP-like approach: position based on similarity to two anchor embeddings
    // Anchors = most different items in the store (first vs last)
    let x, y;
    if(allEmbs.length >= 2){
        const anchorA = allEmbs[0];
        const anchorB = allEmbs[allEmbs.length-1];
        x = (cosineSim(emb, anchorA) + 1) / 2;  // 0-1
        y = (cosineSim(emb, anchorB) + 1) / 2;  // 0-1
    } else {
        // Fallback: use first two embedding dimensions directly
        x = (emb[0] + 1) / 2;
        y = (emb[1] + 1) / 2;
    }

    // Add spread from dims 2-5 so items don't cluster too tightly
    x += (emb[2] || 0) * 0.18;
    y += (emb[3] || 0) * 0.18;
    x += (emb[4] || 0) * 0.08;
    y += (emb[5] || 0) * 0.08;

    // Keep within margins
    x = Math.max(0.09, Math.min(0.91, x));
    y = Math.max(0.11, Math.min(0.87, y));
    return { x: x*W, y: y*H };
}

// Embed USER_STORE seed questions on first galaxy open (async, non-blocking)
let seedEmbedded = false;
async function embedSeedData(){
    if(seedEmbedded) return;
    seedEmbedded = true;
    for(const u of USER_STORE){
        if(!u.embedding || u.embedding.length !== 64){
            const emb = await getRealEmbedding(u.question);
            if(emb) u.embedding = emb;
            await new Promise(r => setTimeout(r, 300)); // rate limit
        }
    }
}

// Generate one short fragment sentence from the user's door answers
async function generateFragment(decision, answers, doorIdx){
    const theme = DOOR_THEMES[doorIdx];
    const combined = `Decision: ${decision}. Answers: ${answers.join(' ')}`;
    const sys=`Extract one short emotionally precise sentence from this person's responses.
Rules:
- under 16 words
- sounds like a private thought they had
- slightly specific, not generic
- no explanation, no summary, no moral
- do NOT start with "I felt" or "I was"
- prefer something that captures a precise realization or image
Return only the sentence, nothing else.`;
    try{
        const out = await llm(sys, combined, 60);
        const clean = out.replace(/^["']|["']$/g,'').trim();
        if(clean.split(' ').length <= 18) return clean;
    }catch{}
    return null;
}

// After a user finishes a door: generate fragment + embedding and store
async function saveUserFragment(){
    const idx = S.doorIndex;
    const combined = [S.decision, ...S.chatAnswers].join(' ');
    try{
        const [fragment, embedding] = await Promise.all([
            generateFragment(S.decision, S.chatAnswers, idx),
            getRealEmbedding(S.decision),  // embed just the core decision question
        ]);
        if(fragment && embedding){
            FRAGMENT_STORE.push({ fragment, embedding, doorIndex: idx });
        }
    }catch{}
}

// Retrieve top 4 most similar fragments (all scored, sorted, deduplicated)
async function retrieveTopFragments(count=4){
    if(FRAGMENT_STORE.length === 0) return [];
    const combined = [S.decision, ...S.chatAnswers].join(' ');
    const userEmbedding = await getRealEmbedding(S.decision);

    // Score all entries
    const scored = FRAGMENT_STORE.map(entry => {
        let score = cosineSim(userEmbedding, entry.embedding);
        if(entry.doorIndex === S.doorIndex) score += 0.08;
        return { ...entry, score };
    });

    // Sort descending, take top N unique fragments
    scored.sort((a,b)=>b.score-a.score);
    const seen = new Set();
    const results = [];
    for(const e of scored){
        if(!seen.has(e.fragment) && e.score >= 0.15){
            seen.add(e.fragment);
            results.push(e.fragment);
            if(results.length >= count) break;
        }
    }
    return results;
}

// Spawn a single floating bubble over the chat screen
function spawnBubble(text){
    // Attach to the full #chat screen so bubbles float freely over everything
    const screen = $('chat');
    if(!screen) return;

    const bubble = document.createElement('div');
    bubble.className = 'fragment-bubble';
    bubble.innerHTML = `<span class="fragment-label">Anonymous:</span><span class="fragment-bubble-text">${text}</span>`;

    // Scatter across the visible screen area, avoiding the centre where the card is
    // Left side or right side, random vertical
    const side = Math.random() < 0.5 ? 'left' : 'right';
    const leftVal  = side === 'left'  ? (2  + Math.random() * 18) : (72 + Math.random() * 22);
    const topVal   = 8 + Math.random() * 72;
    bubble.style.left = leftVal + '%';
    bubble.style.top  = topVal  + '%';

    screen.appendChild(bubble);

    requestAnimationFrame(()=> requestAnimationFrame(()=> bubble.classList.add('visible')));

    const lifetime = 7000 + Math.random() * 4000;
    setTimeout(()=>{
        bubble.classList.remove('visible');
        bubble.classList.add('leaving');
        setTimeout(()=> bubble.remove(), 1200);
    }, lifetime);
}

async function showFragment(){
    await delay(600);

    // Try semantic retrieval, fall back to random door-matched fragments instantly
    let fragments;
    try{
        fragments = await Promise.race([
            retrieveTopFragments(4),
            new Promise(r => setTimeout(()=>r([]), 4000)) // 4s timeout
        ]);
    } catch{ fragments = []; }

    // If semantic retrieval failed or too slow, use door-matched fallback
    if(!fragments.length){
        const doorFragments = FRAGMENT_STORE.filter(f=>f.doorIndex===S.doorIndex);
        const pool = doorFragments.length ? doorFragments : FRAGMENT_STORE;
        const shuffled = pool.slice().sort(()=>Math.random()-0.5);
        fragments = shuffled.slice(0,4).map(f=>f.fragment);
    }

    if(!fragments.length) return;

    const gaps = [2000, 3000, 2500, 4000];
    for(let i=0; i<fragments.length; i++){
        await delay(gaps[i] + Math.random()*1000);
        spawnBubble(fragments[i]);
    }

    setTimeout(()=> saveUserFragment(), 14000);
}

// ══════════════════════════════════════════════════════════════
// LANDING NAV + SEE OTHERS ROUTING
// ══════════════════════════════════════════════════════════════

// Extend cursor hover to nav/galaxy/stats elements
document.addEventListener('mouseover', e => {
    const t = e.target.closest('.galaxy-continue,.stats-return,.sop-link');
    if(t){ cursorDot.style.width='14px'; cursorDot.style.height='14px'; cursorDot.style.background='rgba(220,160,240,1)'; cursorRing.style.width='46px'; cursorRing.style.height='46px'; cursorRing.style.borderColor='rgba(220,160,240,0.65)'; }
});
document.addEventListener('mouseout', e => {
    const t = e.target.closest('.galaxy-continue,.stats-return,.sop-link');
    if(t){ cursorDot.style.width='8px'; cursorDot.style.height='8px'; cursorDot.style.background='#fff'; cursorRing.style.width='28px'; cursorRing.style.height='28px'; cursorRing.style.borderColor='rgba(255,210,230,0.7)'; }
});

// Post-experience "sop-link" button (appears after returning from all doors)
$('sopLink').addEventListener('click', async () => {
    if(S.screen !== 'landing') return;
    const prompt = $('seeOthersPrompt');
    if(prompt){ 
        prompt.classList.remove('sop-visible');
        setTimeout(()=>{ prompt.style.display='none'; prompt.style.opacity=''; prompt.style.transform=''; },600);
    }
    await goToGalaxy();
});

async function goToGalaxy(){
    const l = $('landing');
    l.style.transition = 'opacity 0.9s ease';
    l.style.opacity = '0';
    await delay(700);
    await goTo('galaxyView', 0);
    // Load all stored questions from Firestore first, then build galaxy
    if(window._fbLoadQuestions) await window._fbLoadQuestions(USER_STORE);
    initGalaxy();
    // Embed seed data in background — nodes rebuild automatically as embeddings arrive
    embedSeedData().then(()=> initGalaxy());
}

// ══════════════════════════════════════════════════════════════
// GALAXY VIEW
// ══════════════════════════════════════════════════════════════

let galaxyAnimId = null;
let galaxyNodes  = [];          // global so the single mousemove handler can always see them
let galaxyHovered = null;

// Register hover handler on document — same logic as galaxy_preview.html which works
document.addEventListener('mousemove', function(e){
    // Always run detection — tooltip is only shown when galaxyView is active
    if(!galaxyNodes.length) return;
    const mx = e.clientX, my = e.clientY;

    let found = null, minDist = 80;
    for(const n of galaxyNodes){
        const ddx = mx - n.x, ddy = my - n.y;
        const dist = Math.sqrt(ddx*ddx + ddy*ddy);
        if(dist < minDist){ minDist = dist; found = n; }
    }
    galaxyHovered = found;

    const tooltip = $('galaxyTooltip');
    // Only show tooltip when on galaxy screen
    if(found && S.screen === 'galaxyView'){
        const prefix = found.isUser ? '✦ You:' : 'Anonymous:';
        tooltip.innerHTML = `<span style="font-family:'Cinzel',serif;font-size:0.5rem;letter-spacing:0.2em;text-transform:uppercase;color:rgba(210,160,240,1);display:block;margin-bottom:0.4rem;">${prefix}</span>${found.question}`;
        tooltip.style.left = Math.min(mx + 24, window.innerWidth - 300) + 'px';
        tooltip.style.top  = Math.max(12, my - 24) + 'px';
        tooltip.classList.add('visible');
    } else {
        tooltip.classList.remove('visible');
    }
});

function initGalaxy(){
    const canvas = $('galaxyCanvas');
    if(!canvas) return;

    // Cancel any previous animation loop
    if(galaxyAnimId){ cancelAnimationFrame(galaxyAnimId); galaxyAnimId = null; }

    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const onResize = () => { canvas.width=window.innerWidth; canvas.height=window.innerHeight; };
    window.removeEventListener('resize', onResize);
    window.addEventListener('resize', onResize);

    // ── Project embedding → 2D ──
    function embedTo2D(emb, W, H){
        if(!emb) return { x:W*0.5, y:H*0.5 };
        const allEmbs = USER_STORE.filter(u=>u.embedding && u.embedding.length===64).map(u=>u.embedding);
        return projectTo2D(emb, allEmbs, W, H);
    }

    function buildNodes(W, H){
        const nodes = [];
        USER_STORE.forEach((u) => {
            if(!u.embedding) return;
            const pos = embedTo2D(u.embedding, W, H);
            nodes.push({
                x:pos.x, y:pos.y, baseX:pos.x, baseY:pos.y,
                question:u.question, doorChosen:u.doorChosen, isUser:false,
                r:3+Math.random()*2, phase:Math.random()*Math.PI*2,
                speed:0.3+Math.random()*0.4, vx:(Math.random()-0.5)*0.18, vy:(Math.random()-0.5)*0.18,
            });
        });

        // Current user's node — positioned by their real embedding if available
        const userQuestion = S.galaxyDecision || S.decision || null;
        const visitedArr   = S.galaxyVisited  || S.visited;
        const lastDoor     = visitedArr.lastIndexOf(true);

        if(userQuestion){
            const userEmb = S.userEmbedding || null;
            let cx, cy;
            if(userEmb && userEmb.length === 64){
                const pos = embedTo2D(userEmb, W, H);
                cx = pos.x; cy = pos.y;
            } else {
                cx = W*0.48 + (Math.random()-0.5)*W*0.08;
                cy = H*0.44 + (Math.random()-0.5)*H*0.08;
            }
            nodes.push({
                x:cx, y:cy, baseX:cx, baseY:cy,
                question: userQuestion,
                doorChosen: lastDoor >= 0 ? lastDoor : 0,
                isUser: true,
                r: 7, phase: 0, speed: 0.35, vx:0, vy:0,
            });
        }

        return nodes;
    }

    let t = 0;

    function draw(){
        if(S.screen !== 'galaxyView'){ galaxyAnimId=null; return; }
        const W=canvas.width, H=canvas.height;
        t += 0.005;
        const nodes = galaxyNodes;

        ctx.clearRect(0,0,W,H);

        // ── Deep space background ──
        ctx.fillStyle='#03010a';
        ctx.fillRect(0,0,W,H);

        // Nebula glows
        [{x:0.28,y:0.38,r:0.32,c:'rgba(80,20,120,0.18)'},{x:0.68,y:0.52,r:0.25,c:'rgba(20,40,110,0.14)'},
         {x:0.50,y:0.72,r:0.22,c:'rgba(100,30,80,0.12)'},{x:0.15,y:0.65,r:0.20,c:'rgba(30,80,100,0.10)'},
         {x:0.82,y:0.25,r:0.18,c:'rgba(90,20,110,0.12)'}]
        .forEach(n=>{
            const g=ctx.createRadialGradient(n.x*W,n.y*H,0,n.x*W,n.y*H,n.r*W);
            g.addColorStop(0,n.c); g.addColorStop(1,'transparent');
            ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
        });

        // ── Background stars (many, varied sizes, twinkling) ──
        if(!draw._bg){
            draw._bg=[];
            for(let i=0;i<320;i++) draw._bg.push({
                x:Math.random(), y:Math.random(),
                r:Math.random()<0.08 ? Math.random()*1.8+1.2 : Math.random()*0.8+0.2,
                op:Math.random()*0.7+0.15,
                ph:Math.random()*Math.PI*2,
                sp:Math.random()*0.012+0.002,
                col: Math.random()<0.15 ? [220,200,255] : Math.random()<0.1 ? [255,230,200] : [255,255,255]
            });
        }
        draw._bg.forEach(s=>{
            const tw=s.op*(0.45+0.55*Math.sin(t*s.sp+s.ph));
            ctx.beginPath(); ctx.arc(s.x*W, s.y*H, s.r, 0, Math.PI*2);
            ctx.fillStyle=`rgba(${s.col[0]},${s.col[1]},${s.col[2]},${tw})`; ctx.fill();
        });

        // ── Soft connection lines between nearby question nodes ──
        for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++){
            const dx=nodes[j].x-nodes[i].x, dy=nodes[j].y-nodes[i].y, dist=Math.sqrt(dx*dx+dy*dy);
            if(dist<120){
                ctx.beginPath(); ctx.moveTo(nodes[i].x,nodes[i].y); ctx.lineTo(nodes[j].x,nodes[j].y);
                ctx.strokeStyle=`rgba(180,120,220,${0.08*(1-dist/120)})`; ctx.lineWidth=0.6; ctx.stroke();
            }
        }

        const COLS=[[255,160,200],[140,185,255],[120,230,195]]; // pink/blue/teal per door

        nodes.forEach(n=>{
            n.x+=n.vx*0.10; n.y+=n.vy*0.10;
            n.vx+=(n.baseX-n.x)*0.003; n.vy+=(n.baseY-n.y)*0.003;
            n.vx*=0.986; n.vy*=0.986;
            const pulse=0.55+0.45*Math.sin(t*n.speed+n.phase);
            const [r,g,b]=n.doorChosen>=0?COLS[n.doorChosen]:[200,160,255];
            const isHov = n===galaxyHovered;

            if(n.isUser){
                // Massive outer glow — impossible to miss
                const grd=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r*20);
                grd.addColorStop(0,`rgba(${r},${g},${b},0.35)`); grd.addColorStop(1,'transparent');
                ctx.beginPath(); ctx.arc(n.x,n.y,n.r*20,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();

                // Animated orbit ring
                ctx.beginPath(); ctx.arc(n.x,n.y,n.r*6+pulse*4,0,Math.PI*2);
                ctx.strokeStyle=`rgba(${r},${g},${b},${0.7*pulse})`; ctx.lineWidth=1.8; ctx.stroke();

                // Second ring
                ctx.beginPath(); ctx.arc(n.x,n.y,n.r*8+pulse*2,0,Math.PI*2);
                ctx.strokeStyle=`rgba(${r},${g},${b},${0.3*pulse})`; ctx.lineWidth=1; ctx.stroke();

                // Core glow
                ctx.beginPath(); ctx.arc(n.x,n.y,n.r*3,0,Math.PI*2);
                ctx.fillStyle=`rgba(${r},${g},${b},0.9)`; ctx.fill();
                // White hot centre
                ctx.beginPath(); ctx.arc(n.x,n.y,n.r*1.5,0,Math.PI*2);
                ctx.fillStyle='rgba(255,255,255,1)'; ctx.fill();

                // "You are here" label — clear white text above
                ctx.save();
                ctx.font=`600 13px 'Cinzel', Georgia, serif`;
                ctx.textAlign='center';
                ctx.fillStyle=`rgba(255,255,255,0.95)`;
                ctx.fillText('✦  You are here  ✦', n.x, n.y - n.r*10 - 6);
                ctx.restore();
            } else {
                // Outer glow (brighter on hover)
                const glowR=isHov?n.r*12:n.r*7;
                const glowOp=isHov?0.45:0.22*pulse;
                const grd=ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,glowR);
                grd.addColorStop(0,`rgba(${r},${g},${b},${glowOp})`); grd.addColorStop(1,'transparent');
                ctx.beginPath(); ctx.arc(n.x,n.y,glowR,0,Math.PI*2); ctx.fillStyle=grd; ctx.fill();
                // Core dot — brighter and bigger on hover
                const dotR = isHov ? n.r*2.2 : n.r*(0.9+0.4*pulse);
                ctx.beginPath(); ctx.arc(n.x,n.y,dotR,0,Math.PI*2);
                ctx.fillStyle=`rgba(${r},${g},${b},${isHov?1:0.82*pulse})`; ctx.fill();
                // White sparkle centre
                ctx.beginPath(); ctx.arc(n.x,n.y,dotR*0.45,0,Math.PI*2);
                ctx.fillStyle=`rgba(255,255,255,${isHov?0.9:0.5*pulse})`; ctx.fill();
                // Hover ring
                if(isHov){
                    ctx.beginPath(); ctx.arc(n.x,n.y,n.r*3.5,0,Math.PI*2);
                    ctx.strokeStyle=`rgba(${r},${g},${b},0.75)`; ctx.lineWidth=1.5; ctx.stroke();
                }
            }
        });

        galaxyAnimId = requestAnimationFrame(draw);
    }

    // populate global nodes and start draw
    galaxyNodes = buildNodes(canvas.width, canvas.height);
    draw();
}

$('galaxyContinue').addEventListener('click', async () => {
    $('galaxyTooltip').classList.remove('visible');
    await goTo('statsView', 400);
    renderStats();
});

// ══════════════════════════════════════════════════════════════
// STATS VIEW
// ══════════════════════════════════════════════════════════════

function renderStats(){
    const total = S.doorChoicesCount.reduce((a,b)=>a+b,0);
    if(total===0){ ['pct0','pct1','pct2'].forEach(id=>$(id).textContent='—'); $('statsTotal').textContent=''; return; }
    S.doorChoicesCount.forEach((c,i)=>{
        $(`pct${i}`).textContent = Math.round((c/total)*100)+'%';
        const glow=document.querySelectorAll('.stats-door-glow')[i];
        if(glow) glow.style.opacity=(0.1+(c/total)*0.4).toFixed(2);
    });
    $('statsTotal').textContent = total+' lives have passed through';
}

$('statsReturn').addEventListener('click', async () => {
    if(S.screen !== 'statsView') return;
    setBg('landing');
    const land=$('landing');
    land.style.transition='none'; land.style.opacity='0'; land.style.transform='scale(0.96)';
    await goTo('landing',400);
    setTimeout(()=>{ land.style.transition='opacity 1.2s ease,transform 1.2s ease'; land.style.opacity='1'; land.style.transform='scale(1)'; },50);
});
document.addEventListener('selectstart',e=>{ if(e.target.tagName!=='INPUT') e.preventDefault(); });