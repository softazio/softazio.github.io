
'use strict';

/*
  COLOR BLOCKS DX 5.25
  COLOR CHAIN full rebuild.
  Key design rule: a falling piece is a MATRIX OF COLORS.
  Rotation rotates that colored matrix itself, so four 90-degree rotations
  always return the piece to its original state.
*/

const CFG={
  cols:10,
  rows:20,
  cell:28,
  boardW:280,
  boardH:560,
  lockDelay:380,
  spawnDelay:120,
  clearDelay:230,
  gravityDelay:190,
  dogChance:0
};

// Color-blind-conscious palette:
// NO red and NO green.
const COLORS=[
  0xffffff, // white
  0x56d9f5, // aqua
  0xf5d90a, // yellow
  0x151515, // black
  0xf01818  // red
];

const SHAPE_MASKS=[
  [[1,1,1],[0,1,0]],      // T
  [[1,1],[1,1]],          // O
  [[1,1,0],[0,1,1]],      // Z
  [[0,1,1],[1,1,0]],      // S
  [[1,1,1,1]],            // I
  [[1,0,0],[1,1,1]],      // J
  [[0,0,1],[1,1,1]]       // L
];

const PIECE_WEIGHTS=[13.45,13.45,13.45,13.45,19.30,13.45,13.45];

const STAGE_MESSAGES=['','達人','天才','神域','怪物','無双','伝説','覚醒','極限','王者','制覇'];

const REAL_BGM={
  1:[
    {
      title:'ボギー大佐',
      url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Colonel_Bogey.ogg',
      rate:1.08, volume:.98
    },
    {
      title:'Scott Joplin：The Entertainer',
      url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/The_Entertainer_-_Scott_Joplin.ogg',
      rate:1.08, volume:.98
    },
    {
      title:'12th Street Rag',
      url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Twelfth_Street_Rag.ogg',
      rate:1.08, volume:.98
    }
  ],
  2:{
    title:'ラデツキー行進曲',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Radetzky_March.ogg',
    rate:1.10, volume:.98
  },
  3:{
    title:'モーツァルト：レクイエム「怒りの日」',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/PMLP02751-S002-02-Mozart_Requiem_Mass.ogg',
    rate:1.08, volume:.98
  },
  4:{
    title:'カンカン',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Offenbach_-_Orpheus_in_the_Underworld_-_Overture,_Can_Can_section.ogg',
    rate:1.20, volume:.98
  },
  5:{
    title:'ウィリアム・テル序曲',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Gioachino_Rossini,_William_Tell_Overture_(military_band_version,_2000).ogg',
    rate:1.16, volume:.98, startAt:450, loopEnd:661
  },
  6:{
    title:'ハンガリー舞曲 第5番',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Brahms_nikisch_hd5.ogg',
    rate:1.20, volume:.98
  },
  7:{
    title:'Jazz Me Blues',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/OriginalDixielandJassBand-JazzMeBlues.ogg',
    rate:1.10, volume:.98
  },
  8:{
    title:'山の魔王の宮殿にて',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Musopen_-_In_the_Hall_Of_The_Mountain_King.ogg',
    rate:1.22, volume:.98
  },
  9:{
    title:'ワシントン・ポスト・マーチ',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Washington_Post_March_-_U.S._Army_Band.ogg',
    rate:1.14, volume:.98
  },
  10:{
    title:'リパブリック讃歌',
    url:'https://commons.wikimedia.org/wiki/Special:Redirect/file/Battle_Hymn_of_the_Republic_(USAFB).ogg',
    rate:1.14, volume:1.0
  }
};

const Store={
  best(){
    try{return Math.max(0,Number(localStorage.getItem('neko_dx53_best'))||0)}
    catch{return 0}
  },
  setBest(v){
    try{localStorage.setItem('neko_dx53_best',String(Math.max(0,v|0)))}catch{}
  }
};

function setControlsVisible(v){
  const e=document.getElementById('controls');
  if(e)e.style.display=v?'block':'none';
}

function cloneMatrix(m){return m.map(r=>r.slice())}

function rotateCW(matrix){
  const h=matrix.length;
  const w=matrix[0].length;
  const out=Array.from({length:w},()=>Array(h).fill(null));
  for(let y=0;y<h;y++){
    for(let x=0;x<w;x++){
      out[x][h-1-y]=matrix[y][x];
    }
  }
  return out;
}

function occupied(matrix,cb){
  for(let y=0;y<matrix.length;y++){
    for(let x=0;x<matrix[y].length;x++){
      if(matrix[y][x]!==null)cb(x,y,matrix[y][x]);
    }
  }
}

class AudioEngine{
  constructor(){
    this.ctx=null;
    this.realAudio=null;
    this.realStage=0;
    this.wantBgm=true;
    this.currentCfg=null;
    this.titleTimer=null;
    this.titlePlaying=false;
    this.titleGain=null;
  }

  ensure(){
    if(this.ctx)return;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      this.ctx=new AC();
    }catch{}
  }

  tone(freq,dur=.07,vol=.025,type='triangle',delay=0){
    this.ensure();
    if(!this.ctx)return;
    if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    const t=this.ctx.currentTime+delay;
    const o=this.ctx.createOscillator();
    const g=this.ctx.createGain();
    o.type=type;
    o.frequency.setValueAtTime(freq,t);
    g.gain.setValueAtTime(.0001,t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0001,vol),t+.008);
    g.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);o.stop(t+dur+.03);
  }

  land(){this.tone(125,.045,.017,'sine')}
  rotateClick(){
    this.tone(980,.032,.038,'square');
    this.tone(620,.045,.024,'triangle',.018);
  }
  meow(){this.tone(540,.06,.018);this.tone(680,.08,.016,'triangle',.045)}
  bark(){this.tone(170,.055,.023,'square');this.tone(125,.08,.020,'square',.04)}
  clear(chain){
    // 5.11: stronger arcade clear hit + bright tail.
    const b=520+Math.min(7,chain)*75;
    this.tone(92,.055,.065,'square');
    this.tone(180,.075,.052,'sawtooth',.012);
    this.tone(b,.085,.060,'square',.025);
    this.tone(b*1.28,.10,.050,'triangle',.075);
    this.tone(b*1.58,.13,.042,'triangle',.135);
  }

  comboVoice(chain){
    const text=chain<=1?'コンボ！':`${chain}コンボ！`;
    try{
      if('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window){
        window.speechSynthesis.cancel();
        const u=new SpeechSynthesisUtterance(text);
        u.lang='ja-JP';
        u.rate=1.34;
        u.pitch=1.42+Math.min(chain,7)*.045;
        u.volume=1.0;
        const voices=window.speechSynthesis.getVoices?.()||[];
        const jp=voices.find(v=>String(v.lang||'').toLowerCase().startsWith('ja'));
        if(jp)u.voice=jp;
        window.speechSynthesis.speak(u);

        // bright arcade cheer underneath the voice
        const base=620+Math.min(chain,8)*62;
        this.tone(base,.07,.04,'square');
        this.tone(base*1.24,.09,.035,'triangle',.05);
        this.tone(base*1.52,.11,.03,'triangle',.10);
      }else{
        throw new Error('speech unavailable');
      }
    }catch{
      const base=620+Math.min(chain,8)*62;
      this.tone(base,.07,.05,'square');
      this.tone(base*1.24,.10,.045,'triangle',.05);
      this.tone(base*1.52,.12,.04,'triangle',.10);
    }
  }
  thunder(chain){
    // 5.15: large synchronized thunder hit for 3+ combos.
    this.tone(58,.30,.075,'sawtooth');
    this.tone(41,.42,.060,'sawtooth',.025);
    this.tone(92,.16,.055,'square',.015);
    this.tone(1250,.045,.035,'square',.02);
    this.tone(760,.08,.035,'triangle',.065);
    if(chain>=4){
      this.tone(1500,.05,.035,'square',.10);
      this.tone(34,.48,.050,'sawtooth',.08);
    }
    if(chain>=5){
      this.tone(1850,.045,.032,'square',.15);
    }
  }


  startTitleMusic(){
    this.ensure();
    if(!this.ctx || this.titlePlaying)return;
    if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});

    this.titlePlaying=true;
    const ctx=this.ctx;

    this.titleGain=ctx.createGain();
    this.titleGain.gain.setValueAtTime(.0001,ctx.currentTime);
    this.titleGain.gain.exponentialRampToValueAtTime(.075,ctx.currentTime+.8);
    this.titleGain.connect(ctx.destination);

    // Original title theme: 8-beat anime-like motif, fully synthesized.
    const melody=[
      [523.25,.0,.36],[659.25,.5,.32],[783.99,1.0,.34],[659.25,1.5,.28],
      [587.33,2.0,.34],[698.46,2.5,.30],[880.00,3.0,.40],[783.99,3.55,.32],
      [659.25,4.0,.34],[783.99,4.5,.34],[987.77,5.0,.42],[880.00,5.6,.30],
      [698.46,6.0,.30],[659.25,6.45,.30],[587.33,6.9,.32],[523.25,7.4,.46]
    ];
    const bass=[
      [130.81,0],[146.83,2],[174.61,4],[196.00,6]
    ];
    const beat=.34;
    const loopSec=8*beat;

    const scheduleLoop=()=>{
      if(!this.titlePlaying || !this.ctx || !this.titleGain)return;
      const base=ctx.currentTime+.05;

      const note=(freq,start,dur,vol,type='triangle')=>{
        const o=ctx.createOscillator();
        const gg=ctx.createGain();
        o.type=type;
        o.frequency.setValueAtTime(freq,start);
        gg.gain.setValueAtTime(.0001,start);
        gg.gain.exponentialRampToValueAtTime(vol,start+.018);
        gg.gain.exponentialRampToValueAtTime(.0001,start+dur);
        o.connect(gg).connect(this.titleGain);
        o.start(start);o.stop(start+dur+.03);
      };

      melody.forEach(([f,b,d])=>note(f,base+b*beat,d*beat,.12,'triangle'));
      bass.forEach(([f,b])=>{
        note(f,base+b*beat,beat*1.85,.055,'sine');
        note(f*2,base+b*beat,beat*1.75,.025,'triangle');
      });

      // soft sparkle at phrase ends
      note(1318.51,base+3.6*beat,.18,.022,'sine');
      note(1567.98,base+7.45*beat,.18,.022,'sine');

      this.titleTimer=setTimeout(scheduleLoop,Math.max(100,(loopSec-.08)*1000));
    };

    scheduleLoop();
  }

  stopTitleMusic(fade=.28){
    if(!this.titlePlaying)return;
    this.titlePlaying=false;
    if(this.titleTimer){
      clearTimeout(this.titleTimer);
      this.titleTimer=null;
    }
    if(this.titleGain && this.ctx){
      const now=this.ctx.currentTime;
      try{
        this.titleGain.gain.cancelScheduledValues(now);
        this.titleGain.gain.setValueAtTime(Math.max(.0001,this.titleGain.gain.value||.05),now);
        this.titleGain.gain.exponentialRampToValueAtTime(.0001,now+fade);
      }catch{}
      const gain=this.titleGain;
      setTimeout(()=>{try{gain.disconnect()}catch{}},(fade+.08)*1000);
      this.titleGain=null;
    }
  }

  gameOverJingle(){
    this.ensure();
    if(!this.ctx)return;

    const playJingle=()=>{
      const ctx=this.ctx;
      const t0=ctx.currentTime+.04;

      const master=ctx.createGain();
      master.gain.setValueAtTime(.42,t0);
      master.gain.exponentialRampToValueAtTime(.20,t0+.85);
      master.connect(ctx.destination);

      const hit=(f,offset,dur,vol,type='square')=>{
        const o=ctx.createOscillator();
        const gg=ctx.createGain();
        const t=t0+offset;
        o.type=type;
        o.frequency.setValueAtTime(f,t);
        o.frequency.exponentialRampToValueAtTime(Math.max(60,f*.82),t+dur);
        gg.gain.setValueAtTime(.0001,t);
        gg.gain.exponentialRampToValueAtTime(vol,t+.008);
        gg.gain.exponentialRampToValueAtTime(.0001,t+dur);
        o.connect(gg).connect(master);
        o.start(t);
        o.stop(t+dur+.04);
      };

      // 明確な「チャン！　チャン！」
      hit(523.25,.00,.20,.44,'square');
      hit(392.00,.00,.22,.28,'triangle');
      hit(261.63,.01,.25,.22,'sine');

      hit(440.00,.36,.24,.46,'square');
      hit(329.63,.36,.25,.30,'triangle');
      hit(220.00,.37,.28,.24,'sine');

      // アタックを強くする小さな高音
      hit(1046.50,.00,.055,.14,'square');
      hit(880.00,.36,.060,.14,'square');

      setTimeout(()=>{try{master.disconnect()}catch{}},1200);
    };

    if(this.ctx.state==='suspended'){
      this.ctx.resume().then(playJingle).catch(playJingle);
    }else{
      playJingle();
    }
  }

  setStage(stage){
    this.stopTitleMusic(.12);
    let cfg=REAL_BGM[stage];
    if(!cfg)return;

    // Stage 1 deliberately randomizes among three familiar tracks
    // each time a new game/retry begins.
    if(Array.isArray(cfg)){
      cfg=cfg[(Math.random()*cfg.length)|0];
    }
    this.currentCfg=cfg;

    this.stop();

    const a=new Audio();
    a.src=cfg.url;
    a.preload='auto';
    a.loop=!Number.isFinite(cfg.loopEnd);
    a.volume=cfg.volume;
    a.playbackRate=cfg.rate;

    if('preservesPitch' in a)a.preservesPitch=true;
    if('webkitPreservesPitch' in a)a.webkitPreservesPitch=true;

    a.addEventListener('loadedmetadata',()=>{
      if(Number.isFinite(cfg.startAt)&&cfg.startAt>0){
        try{a.currentTime=cfg.startAt}catch{}
      }
    },{once:true});

    a.addEventListener('timeupdate',()=>{
      if(Number.isFinite(cfg.loopEnd)&&a.currentTime>=cfg.loopEnd){
        try{a.currentTime=Number.isFinite(cfg.startAt)?cfg.startAt:0}catch{}
        if(this.wantBgm)a.play().catch(()=>{});
      }
    });

    this.realAudio=a;
    this.realStage=stage;

    if(this.wantBgm)a.play().catch(()=>{});
  }

  userGestureResume(){
    this.ensure();
    if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    if(this.realAudio&&this.wantBgm)this.realAudio.play().catch(()=>{});
  }

  pause(){if(this.realAudio)this.realAudio.pause()}
  resume(){this.userGestureResume()}

  stop(){
    if(this.realAudio){
      this.realAudio.pause();
      try{this.realAudio.currentTime=0}catch{}
      this.realAudio.removeAttribute('src');
      this.realAudio.load();
      this.realAudio=null;
    }
  }
}
function trackEvent(name, params={}) {
  try {
    if (window.gtag) window.gtag('event', name, params);
  } catch (e) {}
}

const AUDIO=new AudioEngine();

class PieceFactory{
  constructor(){
    this.stage=1;
    this.lastShape=-1;
    this.streak=0;
  }

  setStage(stage){this.stage=stage}
  colorCount(){return 5}

  pickShape(){
    let r=Math.random()*100;
    for(let i=0;i<PIECE_WEIGHTS.length;i++){
      r-=PIECE_WEIGHTS[i];
      if(r<0)return i;
    }
    return 4;
  }

  create(){
    let shapeIdx=this.pickShape();

    for(let k=0;k<30&&shapeIdx===this.lastShape&&this.streak>=2;k++){
      shapeIdx=this.pickShape();
    }

    if(shapeIdx===this.lastShape)this.streak++;
    else{
      this.lastShape=shapeIdx;
      this.streak=1;
    }

    const mask=SHAPE_MASKS[shapeIdx];
    const cc=this.colorCount();

    let matrix=mask.map(row=>row.map(v=>v?((Math.random()*cc)|0):null));

    const vals=[];
    occupied(matrix,(_,__,c)=>vals.push(c));

    // Never spawn a four-cell piece all in the same color.
    if(vals.length===4&&vals.every(c=>c===vals[0])){
      let seen=0;
      outer:
      for(let y=matrix.length-1;y>=0;y--){
        for(let x=matrix[y].length-1;x>=0;x--){
          if(matrix[y][x]!==null){
            matrix[y][x]=(matrix[y][x]+1+(Math.random()*(cc-1)|0))%cc;
            break outer;
          }
        }
      }
    }

    return {
      shapeIdx,
      matrix,
      dog:false,
      x:0,
      y:0
    };
  }
}

class Board{
  constructor(){
    this.grid=Array.from({length:CFG.rows},()=>Array(CFG.cols).fill(null));
  }

  collides(piece,dx=0,dy=0,matrix=piece.matrix){
    let hit=false;
    occupied(matrix,(x,y)=>{
      if(hit)return;
      const nx=piece.x+x+dx;
      const ny=piece.y+y+dy;
      if(nx<0||nx>=CFG.cols||ny>=CFG.rows)hit=true;
      else if(ny>=0&&this.grid[ny][nx])hit=true;
    });
    return hit;
  }

  lock(piece){
    let overflow=false;
    occupied(piece.matrix,(x,y,colorIdx)=>{
      const bx=piece.x+x;
      const by=piece.y+y;
      if(by<0){
        overflow=true;
        return;
      }
      if(bx>=0&&bx<CFG.cols&&by>=0&&by<CFG.rows){
        this.grid[by][bx]={
          colorIdx,
          dog:piece.dog
        };
      }
    });
    return overflow;
  }

  ghostY(piece){
    let gy=piece.y;
    while(!this.collides({...piece,y:gy},0,1))gy++;
    return gy;
  }

  findGroups(min=4){
    const seen=Array.from({length:CFG.rows},()=>Array(CFG.cols).fill(false));
    const groups=[];

    for(let y=0;y<CFG.rows;y++){
      for(let x=0;x<CFG.cols;x++){
        const c=this.grid[y][x];
        if(!c||seen[y][x])continue;

        const color=c.colorIdx;
        const stack=[[x,y]];
        const group=[];
        seen[y][x]=true;

        while(stack.length){
          const [cx,cy]=stack.pop();
          group.push([cx,cy]);

          for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nx=cx+dx,ny=cy+dy;
            if(nx<0||nx>=CFG.cols||ny<0||ny>=CFG.rows||seen[ny][nx])continue;
            const n=this.grid[ny][nx];
            if(n&&n.colorIdx===color){
              seen[ny][nx]=true;
              stack.push([nx,ny]);
            }
          }
        }

        if(group.length>=min)groups.push(group);
      }
    }
    return groups;
  }

  expandDogBomb(cells){
    const kill=new Set(cells.map(([x,y])=>`${x},${y}`));
    const snapshot=[...kill].map(s=>s.split(',').map(Number));

    for(const [x,y] of snapshot){
      for(let dy=-1;dy<=1;dy++){
        for(let dx=-1;dx<=1;dx++){
          const nx=x+dx,ny=y+dy;
          if(nx<0||nx>=CFG.cols||ny<0||ny>=CFG.rows)continue;
          const c=this.grid[ny][nx];
          if(!c||!c.dog)continue;

          for(let ddy=-1;ddy<=1;ddy++){
            for(let ddx=-1;ddx<=1;ddx++){
              const bx=nx+ddx,by=ny+ddy;
              if(bx>=0&&bx<CFG.cols&&by>=0&&by<CFG.rows&&this.grid[by][bx]){
                kill.add(`${bx},${by}`);
              }
            }
          }
        }
      }
    }

    return [...kill].map(s=>s.split(',').map(Number));
  }

  remove(cells){
    for(const [x,y] of cells){
      if(x>=0&&x<CFG.cols&&y>=0&&y<CFG.rows)this.grid[y][x]=null;
    }
  }

  collapse(){
    for(let x=0;x<CFG.cols;x++){
      const kept=[];
      for(let y=CFG.rows-1;y>=0;y--){
        if(this.grid[y][x])kept.push(this.grid[y][x]);
      }
      let i=0;
      for(let y=CFG.rows-1;y>=0;y--){
        this.grid[y][x]=i<kept.length?kept[i++]:null;
      }
    }
  }
}

class BootScene extends Phaser.Scene{
  constructor(){super('Boot')}

  preload(){
    this.load.image('cat0','cat_white.png');
    this.load.image('cat1','cat_aqua.png');
    this.load.image('cat2','cat_yellow.png');
    this.load.image('cat3','cat_black.png');
    this.load.image('cat4','cat_red.png');
  }

  create(){
    // Dog remains a special procedurally-drawn bomb block.
    const d=this.add.graphics();
    d.fillStyle(0x9b7a55,1);
    d.fillRoundedRect(1,1,24,24,3);
    d.lineStyle(2,0x101010,1);
    d.strokeRoundedRect(1,1,24,24,3);
    d.fillStyle(0xffffff,1);
    d.fillCircle(8,10,3);d.fillCircle(18,10,3);
    d.fillStyle(0x111111,1);
    d.fillCircle(8,10,1.2);d.fillCircle(18,10,1.2);d.fillCircle(13,16,2);
    d.generateTexture('dog',26,26);
    d.destroy();

    this.scene.start('Title');
  }
}

class TitleScene extends Phaser.Scene{
  constructor(){super('Title')}

  create(){
    setControlsVisible(false);
    const w=this.scale.width,h=this.scale.height;
    this.cameras.main.setBackgroundColor('#071019');

    const bg=this.add.graphics();
    bg.fillGradientStyle(0x102b3c,0x071019,0x12334a,0x05090e,1);
    bg.fillRect(0,0,w,h);

    for(let i=0;i<5;i++){
      const band=this.add.rectangle(-110+i*90,145+i*48,245,17,0x56b4e9,.10)
        .setAngle(-24).setDepth(1);
      this.tweens.add({
        targets:band,x:w+140,
        duration:3500+i*430,delay:i*220,
        repeat:-1,ease:'Linear'
      });
    }

    for(let i=0;i<42;i++){
      const p=this.add.circle(
        Math.random()*w,Math.random()*h*.80,
        .7+Math.random()*1.7,
        i%4===0?0xf0e442:0xffffff,
        .18+Math.random()*.55
      ).setDepth(2);
      this.tweens.add({
        targets:p,y:p.y-35-Math.random()*65,
        alpha:{from:p.alpha,to:.04},
        duration:2200+Math.random()*3300,
        yoyo:true,repeat:-1,
        delay:Math.random()*900,
        ease:'Sine.easeInOut'
      });
    }

    const cats=[[44,132,0,-12],[112,112,2,8],[308,112,3,-8],[376,132,1,12]];
    for(const [x,y,c,a] of cats){
      const s=this.add.image(x,y,'cat'+c).setScale(1.22).setAngle(a).setDepth(4);
      this.tweens.add({
        targets:s,y:y-8,angle:a+(a>0?-3:3),
        duration:1300+Math.random()*500,
        yoyo:true,repeat:-1,ease:'Sine.easeInOut'
      });
    }

    const logo=this.add.text(w/2,230,'COLOR BLOCKS',{
      fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
      fontSize:'40px',fontStyle:'bold',
      color:'#ffffff',stroke:'#0a3145',strokeThickness:8,
      shadow:{offsetX:0,offsetY:0,color:'#56b4e9',blur:18,fill:true}
    }).setOrigin(.5).setDepth(6).setScale(.72).setAlpha(0).setInteractive({useHandCursor:true});

    const dx=this.add.text(w/2,282,'DX',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'58px',fontStyle:'bold',
      color:'#f0e442',stroke:'#4a3a00',strokeThickness:8,
      shadow:{offsetX:0,offsetY:0,color:'#f0e442',blur:20,fill:true}
    }).setOrigin(.5).setDepth(6).setScale(.15).setAlpha(0);

    const sub=this.add.text(w/2,332,'COLOR CHAIN',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'21px',fontStyle:'bold',
      color:'#56b4e9'
    }).setOrigin(.5).setDepth(6).setAlpha(0);

    this.tweens.add({targets:logo,alpha:1,scale:1,duration:520,ease:'Back.easeOut'});
    this.tweens.add({targets:dx,alpha:1,scale:1,duration:460,delay:220,ease:'Back.easeOut'});
    this.tweens.add({targets:sub,alpha:1,y:322,duration:420,delay:460,ease:'Cubic.easeOut'});

    const slash=this.add.rectangle(-120,255,180,5,0xffffff,0).setAngle(-18).setDepth(8);
    this.time.delayedCall(620,()=>{
      slash.setAlpha(.9);
      this.tweens.add({
        targets:slash,x:w+140,duration:420,ease:'Cubic.easeOut',
        onComplete:()=>slash.destroy()
      });
      this.cameras.main.flash(75,190,235,255);
    });

    this.add.text(w/2,395,
      '同じ色を4つつなげて消せ。\n落下から生まれる連鎖が勝負を変える。',
      {align:'center',fontSize:'15px',fontStyle:'bold',color:'#dbeef8',lineSpacing:7}
    ).setOrigin(.5).setDepth(6);

    const start=this.add.text(w/2,505,'▶  START',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'27px',fontStyle:'bold',
      color:'#071019',backgroundColor:'#f0e442',
      padding:{left:34,right:34,top:13,bottom:13}
    }).setOrigin(.5).setDepth(10).setInteractive({useHandCursor:true});

    const glow=this.add.rectangle(w/2,505,194,58,0xf0e442,.16).setDepth(9);
    this.tweens.add({
      targets:glow,scaleX:1.13,scaleY:1.22,alpha:.03,
      duration:820,yoyo:true,repeat:-1,ease:'Sine.easeInOut'
    });

    start.on('pointerdown',()=>{
      start.setScale(.94).setAlpha(.72);
      AUDIO.userGestureResume();
      AUDIO.stopTitleMusic(.32);
      this.time.delayedCall(340,()=>this.scene.start('Game'));
    });
    start.on('pointerup',()=>start.setScale(1).setAlpha(1));
    start.on('pointerout',()=>start.setScale(1).setAlpha(1));

    this.add.text(w/2,520,'SOFTAZIO',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'18px',fontStyle:'bold',
      color:'#dff6ff',stroke:'#071019',strokeThickness:5
    }).setOrigin(.5).setDepth(6);

    this.add.text(w/2,542,'SOFTWARE FROM A TO Z',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'8px',fontStyle:'bold',
      color:'#7fa8ba'
    }).setOrigin(.5).setDepth(6);

    this.add.text(w/2,558,'PRODUCT 001',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'9px',fontStyle:'bold',
      color:'#f0e442'
    }).setOrigin(.5).setDepth(6);

    this.add.text(w/2,582,'BUILD 5.25 • STABLE',{
      fontFamily:'Arial Black, sans-serif',fontSize:'10px',color:'#6c8797'
    }).setOrigin(.5).setDepth(6);

    // Hidden developer/secret mode: tap the title logo 5 times quickly.
    this.secretTapCount=0;
    this.secretTapTimer=null;

    const resetSecretTap=()=>{
      this.secretTapCount=0;
      if(this.secretTapTimer){
        this.secretTapTimer.remove(false);
        this.secretTapTimer=null;
      }
    };

    const openSecretStageSelect=()=>{
      resetSecretTap();
      AUDIO.userGestureResume();

      const overlay=this.add.rectangle(w/2,h/2,w,h,0x02070b,.94)
        .setDepth(300).setInteractive();
      const frame=this.add.rectangle(w/2,h/2,326,470,0x071019,.98)
        .setStrokeStyle(3,0x56b4e9,.95).setDepth(301);
      const title=this.add.text(w/2,145,'SECRET STAGE SELECT',{
        fontFamily:'Arial Black, sans-serif',fontSize:'21px',fontStyle:'bold',
        color:'#f0e442',stroke:'#000000',strokeThickness:6
      }).setOrigin(.5).setDepth(302);
      const note=this.add.text(w/2,182,'開発・確認用 / BEST記録には反映しません',{
        fontFamily:'"Noto Sans JP", sans-serif',fontSize:'11px',fontStyle:'bold',
        color:'#b8d5e5'
      }).setOrigin(.5).setDepth(302);

      const objs=[overlay,frame,title,note];

      for(let i=1;i<=10;i++){
        const col=(i-1)%2;
        const row=Math.floor((i-1)/2);
        const x=116+col*128;
        const y=238+row*62;
        const isFinal=i===10;

        const b=this.add.text(x,y,`STAGE ${i}`,{
          fontFamily:'Arial Black, sans-serif',fontSize:'17px',fontStyle:'bold',
          color:isFinal?'#0a0a0a':'#071019',
          backgroundColor:isFinal?'#f0e442':'#dff4ff',
          padding:{left:16,right:16,top:10,bottom:10}
        }).setOrigin(.5).setDepth(303).setInteractive({useHandCursor:true});

        b.on('pointerdown',()=>{
          b.setScale(.94).setAlpha(.72);
          AUDIO.userGestureResume();
          AUDIO.stopTitleMusic(.18);
          this.time.delayedCall(200,()=>{
            this.scene.start('Game',{secretMode:true,secretStage:i});
          });
        });
        objs.push(b);
      }

      const close=this.add.text(w/2,566,'×  CLOSE',{
        fontFamily:'Arial Black, sans-serif',fontSize:'15px',
        color:'#ffffff',backgroundColor:'#243541',
        padding:{left:22,right:22,top:8,bottom:8}
      }).setOrigin(.5).setDepth(303).setInteractive({useHandCursor:true});

      close.on('pointerdown',()=>{
        objs.forEach(o=>o&&o.destroy&&o.destroy());
        close.destroy();
      });
    };

    logo.on('pointerdown',()=>{
      this.secretTapCount++;
      if(this.secretTapTimer)this.secretTapTimer.remove(false);
      this.secretTapTimer=this.time.delayedCall(1200,resetSecretTap);
      if(this.secretTapCount>=5){
        this.cameras.main.flash(120,86,180,233);
        openSecretStageSelect();
      }
    });

    this.add.text(w/2,643,'CONNECT  •  DROP  •  CHAIN',{
      fontFamily:'Arial Black, sans-serif',fontSize:'12px',color:'#9fb8c7'
    }).setOrigin(.5).setDepth(6);

    const soundHint=this.add.text(w/2,675,'TAP TO SOUND',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'10px',color:'#5f7886'
    }).setOrigin(.5).setDepth(6);

    const startTitleSound=()=>{
      AUDIO.userGestureResume();
      AUDIO.startTitleMusic();
      soundHint.setText('♪ TITLE THEME').setColor('#8fb8ca');
    };

    this.input.once('pointerdown',startTitleSound);
    this.input.keyboard.once('keydown',startTitleSound);
  }
}

class GameScene extends Phaser.Scene{
  constructor(){super('Game')}

  create(data={}){
    trackEvent('game_start',{product:'COLOR BLOCKS DX',version:'5.25'});
    setControlsVisible(false);

    this.board=new Board();
    this.factory=new PieceFactory();

    this.secretMode=!!data.secretMode;
    this.secretStartStage=Phaser.Math.Clamp(Number(data.secretStage)||1,1,10);

    this.score=0;
    this.stage=this.secretMode?this.secretStartStage:1;
    this.clears=this.secretMode?(this.stage-1)*10:0;
    this.level=1+Math.floor(this.clears/10);
    this.best=Store.best();

    this.state='SPAWN';
    this.piece=null;
    this.nextQueue=[];
    this.ended=false;
    this.pausedByUser=false;
    this.stageCutin=false;
    this.softDrop=false;
    this.dropAccum=0;

    // 5.11 touch controls
    this.touchDrag=null;
    this.touchingPiece=false;
    this.rotatingUntil=0;

    // 5.18: selectable drag-drop mode
    this.instantDropMode=false;

    // 5.21: combo reward star stock
    this.rescueStarStock=0;
    this.rescueStarMax=3;
    this.rescueStarActive=null;

    // 5.7: stage-FX runtime state
    this.stageAmbientObjects=[];
    this.stageAmbientTweens=[];
    this.stageAmbientTimers=[];

    this.bx=Math.floor((this.scale.width-CFG.boardW)/2);
    this.by=118;

    this.buildUI();
    this.bindControls();
    this.applyTheme();
    this.stageArrivalFX(this.stage);

    this.factory.setStage(this.stage);
    this.nextQueue=[
      this.createSmartPiece(),
      this.createSmartPiece(),
      this.createSmartPiece()
    ];

    AUDIO.setStage(this.stage);
    if(this.secretMode)this.buildSecretStageControls();

    this.spawn();
  }

  createSmartPiece(){
    const piece=this.factory.create();
    piece.dog=false;

    // If the board is still almost empty, keep some randomness.
    const freq=Array(5).fill(0);
    const nearBottom=Array(5).fill(0);
    let occupiedCount=0;

    for(let y=0;y<CFG.rows;y++){
      for(let x=0;x<CFG.cols;x++){
        const c=this.board?.grid?.[y]?.[x];
        if(!c)continue;
        occupiedCount++;
        freq[c.colorIdx]++;
        if(y>=CFG.rows-6)nearBottom[c.colorIdx]+=2;
      }
    }

    if(occupiedCount<5 || Math.random()>.78)return piece;

    // Favor colors already present in the lower field.
    const ranked=[0,1,2,3,4].sort((a,b)=>
      (freq[b]+nearBottom[b])-(freq[a]+nearBottom[a])
    );
    const main=ranked[0];
    const sub=ranked[1];

    // Recolor 2–3 cells, making planned cascades more likely,
    // but never force a guaranteed four-of-a-kind piece.
    const cells=[];
    occupied(piece.matrix,(x,y)=>cells.push([x,y]));
    Phaser.Utils.Array.Shuffle(cells);

    const targetCount=Math.random()<.58?3:2;
    for(let i=0;i<Math.min(targetCount,cells.length);i++){
      const [x,y]=cells[i];
      piece.matrix[y][x]=(i===targetCount-1 && Math.random()<.32)?sub:main;
    }

    const vals=[];
    occupied(piece.matrix,(_,__,c)=>vals.push(c));
    if(vals.length===4 && vals.every(c=>c===vals[0])){
      const [x,y]=cells[cells.length-1];
      piece.matrix[y][x]=(main+1+((Math.random()*4)|0))%5;
    }

    return piece;
  }

  addEmbossFrame(x,y,w,h,base=0x071019,accent=0x56b4e9,depth=18){
    const c=this.add.container(0,0).setDepth(depth);

    // soft outer shadow
    const shadow=this.add.rectangle(x+3,y+4,w+6,h+6,0x000000,.28);
    c.add(shadow);

    // outer metallic rim
    const outer=this.add.rectangle(x,y,w+4,h+4,base,.98)
      .setStrokeStyle(2,accent,.88);
    c.add(outer);

    // top-left highlight gives the emboss/bevel feeling
    const hiTop=this.add.rectangle(x,y-h/2+2,w-8,2,0xffffff,.28);
    const hiLeft=this.add.rectangle(x-w/2+2,y,2,h-8,0xffffff,.20);
    c.add([hiTop,hiLeft]);

    // bottom-right dark bevel
    const loBottom=this.add.rectangle(x,y+h/2-2,w-8,3,0x000000,.48);
    const loRight=this.add.rectangle(x+w/2-2,y,3,h-8,0x000000,.42);
    c.add([loBottom,loRight]);

    // inner glossy plate
    const inner=this.add.rectangle(x,y,w-8,h-8,base,.94)
      .setStrokeStyle(1,0xffffff,.10);
    c.add(inner);

    return c;
  }

  buildCabinetShell(){
    const w=this.scale.width;
    const h=this.scale.height;

    // Full-screen arcade cabinet background: eliminates dead empty margins.
    this.shellBg=this.add.rectangle(w/2,h/2,w,h,0x08131a,1).setDepth(-50);

    // vertical side panels
    this.shellLeft=this.add.rectangle(14,h/2,28,h,0x101f29,.98).setDepth(-48);
    this.shellRight=this.add.rectangle(w-14,h/2,28,h,0x101f29,.98).setDepth(-48);

    // subtle metallic rails
    this.add.rectangle(29,h/2,3,h,0xffffff,.08).setDepth(-47);
    this.add.rectangle(w-29,h/2,3,h,0x000000,.38).setDepth(-47);

    // top decorative strip
    this.shellTop=this.add.rectangle(w/2,4,w,8,0x1b3948,.98)
      .setStrokeStyle(1,0x56b4e9,.45).setDepth(-46);

    // bottom decorative strip
    this.shellBottom=this.add.rectangle(w/2,h-4,w,8,0x071019,.98)
      .setStrokeStyle(1,0xffd54f,.25).setDepth(-46);

    // faint corner bolts/details
    const bolts=[[15,16],[w-15,16],[15,h-16],[w-15,h-16]];
    bolts.forEach(([x,y])=>{
      this.add.circle(x,y,4,0x607d8b,.8)
        .setStrokeStyle(1,0xffffff,.18)
        .setDepth(-45);
    });
  }

  buildUI(){
    this.buildCabinetShell();

    // ============================================================
    // 5.23 GRID HUD
    // All top boxes share exact edges. No overlap, no random gaps.
    // ============================================================

    this.boardEmboss=this.addEmbossFrame(
      this.bx+CFG.boardW/2,
      this.by+CFG.boardH/2,
      CFG.boardW+10,CFG.boardH+10,
      0x16242d,0x56b4e9,0
    );

    this.boardBg=this.add.rectangle(
      this.bx+CFG.boardW/2,
      this.by+CFG.boardH/2,
      CFG.boardW,CFG.boardH,
      0xffffff,.94
    ).setStrokeStyle(2,0x223849,1).setDepth(1);

    this.guides=this.add.graphics().setDepth(2);
    this.guides.lineStyle(1,0x6d7c86,.14);
    for(let x=1;x<CFG.cols;x++){
      const px=this.bx+x*CFG.cell;
      this.guides.lineBetween(px,this.by,px,this.by+CFG.boardH);
    }

    this.lockedLayer=this.add.container(0,0).setDepth(4);
    this.ghostLayer=this.add.container(0,0).setDepth(5);
    this.activeLayer=this.add.container(0,0).setDepth(6);
    this.nextLayer=this.add.container(0,0).setDepth(20);

    // ---------- TOP GRID ----------
    // Exact boundaries:
    // x=20..160 SCORE
    // x=160..300 STAGE
    // x=300..400 PAUSE
    const y0=30;
    const h0=52;

    this.scoreCard=this.add.rectangle(90,y0,140,h0,0x081018,.98)
      .setStrokeStyle(2,0xffd54f,.95).setDepth(18);
    this.stageCard=this.add.rectangle(230,y0,140,h0,0x081018,.98)
      .setStrokeStyle(2,0x56b4e9,.95).setDepth(18);
    this.pauseCard=this.add.rectangle(350,y0,100,h0,0x081018,.98)
      .setStrokeStyle(2,0xf0e442,.95).setDepth(18);

    // shared bevel highlights; exactly aligned edges
    [
      [90,20,132,2],[230,20,132,2],[350,20,92,2]
    ].forEach(([x,y,w,h])=>this.add.rectangle(x,y,w,h,0xffffff,.18).setDepth(19));

    [
      [90,40,132,3],[230,40,132,3],[350,40,92,3]
    ].forEach(([x,y,w,h])=>this.add.rectangle(x,y,w,h,0x000000,.40).setDepth(19));

    this.scoreLabel=this.add.text(28,10,'SCORE',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'10px',fontStyle:'bold',color:'#ffe88a'
    }).setDepth(22);
    this.scoreT=this.add.text(28,22,'0',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'21px',fontStyle:'bold',
      color:'#ffffff',stroke:'#000000',strokeThickness:4
    }).setDepth(22);

    this.stageLabel=this.add.text(168,10,'STAGE',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'10px',fontStyle:'bold',color:'#91e4ff'
    }).setDepth(22);
    this.stageT=this.add.text(168,22,'1',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'21px',fontStyle:'bold',
      color:'#ffffff',stroke:'#000000',strokeThickness:4
    }).setDepth(22);

    this.pauseBtn=this.add.text(350,y0,'Ⅱ',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'20px',fontStyle:'bold',color:'#ffffff'
    }).setOrigin(.5).setDepth(35).setInteractive({useHandCursor:true});

    this.pauseBtn.on('pointerdown',()=>{
      AUDIO.userGestureResume();
      this.pauseBtn.setScale(.92).setAlpha(.72);
      this.togglePause();
    });
    this.pauseBtn.on('pointerup',()=>this.pauseBtn.setScale(1).setAlpha(1));
    this.pauseBtn.on('pointerout',()=>this.pauseBtn.setScale(1).setAlpha(1));

    // ---------- NEXT GRID ----------
    const nextY=88;
    this.nextHeader=this.add.rectangle(72,nextY,104,38,0x081018,.98)
      .setStrokeStyle(2,0xffd54f,.92).setDepth(18);
    this.nextT=this.add.text(72,nextY,'次  NEXT',{
      fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
      fontSize:'13px',fontStyle:'bold',color:'#fff0a0'
    }).setOrigin(.5).setDepth(22);

    // ---------- RESCUE STOCK ----------
    this.rescueStockPanel=this.add.rectangle(390,194,54,148,0x081018,.98)
      .setStrokeStyle(2,0xffd54f,.90).setDepth(28);

    this.rescueStockLabel=this.add.text(390,138,'STAR',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'10px',fontStyle:'bold',color:'#fff1a6'
    }).setOrigin(.5).setDepth(33);

    this.rescueStockCount=this.add.text(390,154,'0/3',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'11px',fontStyle:'bold',color:'#d8e8f0'
    }).setOrigin(.5).setDepth(33);

    this.rescueStockSlots=[];
    [180,214,248].forEach((sy,index)=>{
      const bg=this.add.rectangle(390,sy,44,28,0x0b151b,.96)
        .setStrokeStyle(1,0x6b7f8b,.35)
        .setDepth(32);
      const icon=this.add.text(390,sy,'☆',{fontSize:'22px'})
        .setOrigin(.5).setAlpha(.30).setDepth(33);
      const hit=this.add.zone(390,sy,54,32)
        .setDepth(41).setInteractive({useHandCursor:true});
      hit.on('pointerdown',()=>{
        if(index>=this.rescueStarStock)return;
        icon.setScale(.70);
        this.time.delayedCall(90,()=>icon.setScale(1));
        this.useRescueStock();
      });
      this.rescueStockSlots.push({bg,icon,hit});
    });
    this.updateRescueStockUI();

    // ---------- AUTO DROP PANEL ----------
    const dropX=390;
    const dropY=430;

    this.dropPanel=this.add.rectangle(dropX,dropY,54,218,0x071019,.98)
      .setStrokeStyle(2,0x56b4e9,.95).setDepth(30);

    this.dropModeTitle=this.add.text(dropX,dropY-68,'AUTO',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'13px',fontStyle:'bold',color:'#ffffff'
    }).setOrigin(.5).setDepth(33);

    this.dropModeTitle2=this.add.text(dropX,dropY-48,'DROP',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'13px',fontStyle:'bold',color:'#ffffff'
    }).setOrigin(.5).setDepth(33);

    this.dropArrow=this.add.text(dropX,dropY-6,'▼',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'28px',fontStyle:'bold',color:'#56b4e9'
    }).setOrigin(.5).setDepth(33);

    this.dropState=this.add.text(dropX,dropY+43,'OFF',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'15px',fontStyle:'bold',color:'#9fb8c7'
    }).setOrigin(.5).setDepth(33);

    this.dropModeLed=this.add.circle(dropX,dropY+76,8,0x56636b,1)
      .setStrokeStyle(2,0xffffff,.22).setDepth(33);

    this.dropHit=this.add.zone(dropX,dropY,60,224)
      .setDepth(40).setInteractive({useHandCursor:true});

    const refreshDropMode=()=>{
      const on=this.instantDropMode;
      this.dropState.setText(on?'ON':'OFF');
      this.dropState.setColor(on?'#fff3a0':'#9fb8c7');
      this.dropArrow.setColor(on?'#f0e442':'#56b4e9');
      this.dropModeLed.setFillStyle(on?0xf0e442:0x56636b,1);
      this.dropPanel.setStrokeStyle(2,on?0xf0e442:0x56b4e9,on?1:.95);
    };

    this.dropHit.on('pointerdown',()=>{
      AUDIO.userGestureResume();
      this.instantDropMode=!this.instantDropMode;
      refreshDropMode();
    });
    refreshDropMode();

    // Score-rule hint: temporary, not part of permanent layout.
    this.scoreRuleHint=this.add.text(this.scale.width/2,115,'得点は「消した時だけ」',{
      fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
      fontSize:'10px',fontStyle:'bold',
      color:'#20323d',
      backgroundColor:'rgba(255,255,255,0.82)',
      padding:{left:8,right:8,top:3,bottom:3}
    }).setOrigin(.5).setDepth(24).setAlpha(0);

    this.tweens.add({
      targets:this.scoreRuleHint,
      alpha:1,duration:250,delay:500,
      hold:1400,yoyo:true,
      onComplete:()=>this.scoreRuleHint.setVisible(false)
    });

    this.studioBadge=this.add.text(18,this.scale.height-18,'SOFTAZIO  •  PRODUCT 001',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'8px',fontStyle:'bold',
      color:'#6f8c9b'
    }).setDepth(25);

    this.chainT=this.add.text(this.scale.width/2,this.by+155,'',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'36px',fontStyle:'bold',
      color:'#ffffff',stroke:'#000000',strokeThickness:8
    }).setOrigin(.5).setAlpha(0).setDepth(75);

    // Pause overlay
    this.pauseShade=this.add.rectangle(
      this.scale.width/2,this.scale.height/2,
      this.scale.width,this.scale.height,
      0x000000,.75
    ).setVisible(false).setDepth(180).setInteractive();

    this.pauseText=this.add.text(this.scale.width/2,this.scale.height/2-104,'PAUSE',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'42px',fontStyle:'bold',
      color:'#ffffff',stroke:'#000000',strokeThickness:8
    }).setOrigin(.5).setVisible(false).setDepth(181);

    this.resumeFrame=this.addEmbossFrame(
      this.scale.width/2,this.scale.height/2,116,98,0xf0e442,0xffffff,181
    );
    this.resumeFrame.setVisible(false);

    this.resumeBtn=this.add.text(this.scale.width/2,this.scale.height/2,'▶',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'62px',fontStyle:'bold',color:'#071019'
    }).setOrigin(.5).setVisible(false).setDepth(182).setInteractive({useHandCursor:true});

    this.resumeHint=this.add.text(this.scale.width/2,this.scale.height/2+84,'タップして再開',{
      fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
      fontSize:'13px',fontStyle:'bold',color:'#ffffff'
    }).setOrigin(.5).setVisible(false).setDepth(182);

    this.resumeBtn.on('pointerdown',()=>{
      if(!this.pausedByUser)return;
      this.resumeBtn.setScale(.90).setAlpha(.70);
      this.togglePause();
    });
    this.resumeBtn.on('pointerup',()=>this.resumeBtn.setScale(1).setAlpha(1));
    this.resumeBtn.on('pointerout',()=>this.resumeBtn.setScale(1).setAlpha(1));
  }

  buildSecretStageControls(){
    const w=this.scale.width;

    this.add.text(w/2,697,`SECRET • STAGE ${this.stage}`,{
      fontFamily:'Arial Black, sans-serif',fontSize:'10px',fontStyle:'bold',
      color:'#f0e442',stroke:'#000000',strokeThickness:3
    }).setOrigin(.5).setDepth(140);

    const prev=this.add.text(55,701,'◀ STAGE',{
      fontFamily:'Arial Black, sans-serif',fontSize:'10px',fontStyle:'bold',
      color:'#071019',backgroundColor:'#d9eef9',
      padding:{left:8,right:8,top:6,bottom:6}
    }).setOrigin(.5).setDepth(140).setInteractive({useHandCursor:true});

    const title=this.add.text(w/2,701,'TITLE',{
      fontFamily:'Arial Black, sans-serif',fontSize:'10px',fontStyle:'bold',
      color:'#ffffff',backgroundColor:'#263944',
      padding:{left:12,right:12,top:6,bottom:6}
    }).setOrigin(.5).setDepth(140).setInteractive({useHandCursor:true});

    const next=this.add.text(w-55,701,'STAGE ▶',{
      fontFamily:'Arial Black, sans-serif',fontSize:'10px',fontStyle:'bold',
      color:'#071019',backgroundColor:'#d9eef9',
      padding:{left:8,right:8,top:6,bottom:6}
    }).setOrigin(.5).setDepth(140).setInteractive({useHandCursor:true});

    const jump=(s)=>{
      const stage=Phaser.Math.Clamp(s,1,10);
      AUDIO.stop();
      this.scene.restart({secretMode:true,secretStage:stage});
    };

    prev.on('pointerdown',()=>jump(this.stage<=1?10:this.stage-1));
    next.on('pointerdown',()=>jump(this.stage>=10?1:this.stage+1));
    title.on('pointerdown',()=>{
      AUDIO.stop();
      setControlsVisible(false);
      this.scene.start('Title');
    });
  }

  buttonVisual(el,down){
    if(!el)return;
    el.classList.toggle('is-pressed',!!down);
  }

  bindControls(){
    // Direct board controls:
    // tap = rotate, horizontal drag = move, downward drag = drop.
    const insideBoard=(p)=>(
      p.x>=this.bx && p.x<=this.bx+CFG.boardW &&
      p.y>=this.by && p.y<=this.by+CFG.boardH
    );

    this.input.on('pointerdown',p=>{
      if(!insideBoard(p) || !this.canControl())return;
      AUDIO.userGestureResume();
      this.touchingPiece=true;
      this.redraw();
      this.touchDrag={
        startX:p.x,startY:p.y,
        lastX:p.x,lastY:p.y,
        moved:false,
        downAt:this.time.now
      };
    });

    this.input.on('pointermove',p=>{
      if(!this.touchDrag || !p.isDown || !this.canControl())return;

      const d=this.touchDrag;
      const dx=p.x-d.lastX;
      const dy=p.y-d.lastY;

      // horizontal movement one column per threshold
      if(Math.abs(dx)>=18){
        const dir=dx>0?1:-1;
        if(!this.board.collides(this.piece,dir,0)){
          this.piece.x+=dir;
          this.dropAccum=0;
          this.redraw();
        }
        d.lastX=p.x;
        d.moved=true;
      }

      // downward drag: normal mode = cell-by-cell / DROP▼ mode = bottom instantly
      if(dy>=18){
        if(this.instantDropMode){
          const gy=this.board.ghostY(this.piece);
          const moved=Math.max(0,gy-this.piece.y);
          this.piece.y=gy;
          this.dropAccum=0;
          d.lastY=p.y;
          d.moved=true;
          this.redraw();
          this.beginLock(true);
          return;
        }

        let steps=Math.max(1,Math.floor(dy/18));
        while(steps-->0 && this.canControl()){
          if(!this.board.collides(this.piece,0,1)){
            this.piece.y++;
            this.dropAccum=0;
          }else{
            this.beginLock(false);
            break;
          }
        }
        d.lastY=p.y;
        d.moved=true;
        this.redraw();
      }
    });

    const endPointer=p=>{
      if(!this.touchDrag)return;
      const d=this.touchDrag;
      const totalDx=p.x-d.startX;
      const totalDy=p.y-d.startY;
      const duration=this.time.now-d.downAt;
      const isTap=!d.moved && Math.abs(totalDx)<13 && Math.abs(totalDy)<13 && duration<420;
      this.touchDrag=null;
      this.touchingPiece=false;
      this.redraw();

      if(isTap && this.canControl()){
        this.rotate();
      }
    };

    this.input.on('pointerup',endPointer);
    this.input.on('pointerupoutside',endPointer);

    // Keyboard remains for desktop testing.
    this.input.keyboard.on('keydown-LEFT',()=>this.move(-1));
    this.input.keyboard.on('keydown-RIGHT',()=>this.move(1));
    this.input.keyboard.on('keydown-UP',()=>this.rotate());
    this.input.keyboard.on('keydown-SPACE',()=>this.hardDrop());
    this.input.keyboard.on('keydown-P',()=>this.togglePause());
    this.input.keyboard.on('keydown-DOWN',()=>this.softDrop=true);
    this.input.keyboard.on('keyup-DOWN',()=>this.softDrop=false);
  }

  currentStage(){
    return Math.min(10,Math.floor(this.clears/10)+1);
  }

  fallMs(){
    return [760,700,640,580,520,470,420,370,320,270][this.stage-1]||270;
  }

  canControl(){
    return !this.ended&&!this.pausedByUser&&!this.stageCutin&&this.state==='FALLING'&&!!this.piece;
  }

  update(_,delta){
    if(!this.canControl())return;

    // While the tap-rotation animation window is active, gravity is frozen.
    if(this.time.now<this.rotatingUntil){
      this.dropAccum=0;
      return;
    }

    this.dropAccum+=delta;
    const interval=this.softDrop?Math.max(55,this.fallMs()*.12):this.fallMs();

    if(this.dropAccum>=interval){
      this.dropAccum=0;

      if(!this.board.collides(this.piece,0,1)){
        this.piece.y++;
        this.redraw();
      }else{
        this.beginLock(false);
      }
    }
  }

  spawn(){
    if(this.ended)return;

    this.touchingPiece=false;
    this.state='SPAWN';
    this.factory.setStage(this.stage);

    if(!this.nextQueue || this.nextQueue.length<3){
      this.nextQueue=this.nextQueue||[];
      while(this.nextQueue.length<3)this.nextQueue.push(this.createSmartPiece());
    }

    this.piece=this.nextQueue.shift()||this.createSmartPiece();
    this.nextQueue.push(this.createSmartPiece());

    this.piece.x=Math.floor((CFG.cols-this.piece.matrix[0].length)/2);
    this.piece.y=0;

    if(this.board.collides(this.piece)){
      this.gameOver();
      return;
    }

    this.dropAccum=0;
    this.state='FALLING';
    this.redraw();
  }

  move(dx){
    if(!this.canControl())return;
    if(!this.board.collides(this.piece,dx,0)){
      this.piece.x+=dx;
      this.redraw();
    }
  }

  rotate(){
    if(!this.canControl())return;

    this.rotatingUntil=this.time.now+230;
    this.dropAccum=0;

    const rotated=rotateCW(this.piece.matrix);

    for(const kick of [0,-1,1,-2,2]){
      const test={
        ...this.piece,
        x:this.piece.x+kick,
        matrix:rotated
      };

      if(!this.board.collides(test,0,0,rotated)){
        this.piece=test;
        AUDIO.rotateClick();
        this.redraw();
        return;
      }
    }
  }

  hardDrop(){
    if(!this.canControl())return;

    let d=0;
    while(!this.board.collides(this.piece,0,1)){
      this.piece.y++;
      d++;
    }

    this.redraw();
    this.beginLock(true);
  }

  beginLock(immediate){
    if(this.state!=='FALLING')return;
    this.state='LOCKING';

    this.time.delayedCall(immediate?0:CFG.lockDelay,()=>{
      if(this.ended)return;

      const overflow=this.board.lock(this.piece);
      AUDIO.land();
      this.piece.dog?AUDIO.bark():AUDIO.meow();
      this.piece=null;

      if(overflow){
        this.gameOver();
        return;
      }

      // 5.4: settle every occupied cell to the bottom of its column
      // before checking matches. This guarantees no floating cells / holes.
      this.board.collapse();
      this.redraw();

      this.time.delayedCall(110,()=>this.resolve(1));
    });
  }

  updateRescueStockUI(){
    if(!this.rescueStockSlots)return;

    this.rescueStockSlots.forEach((slot,index)=>{
      const filled=index<this.rescueStarStock;
      slot.icon.setText(filled?'💫':'☆');
      slot.icon.setAlpha(filled?1:.30);
      slot.icon.setScale(filled?1:.82);
      slot.bg.setStrokeStyle(
        filled?2:1,
        filled?0xffd54f:0x6b7f8b,
        filled?.95:.35
      );
    });

    if(this.rescueStockCount){
      this.rescueStockCount.setText(`${this.rescueStarStock}/3`);
      this.rescueStockCount.setColor(this.rescueStarStock>=3?'#fff2a0':'#d8e8f0');
    }
  }

  spawnComboRewardStar(){
    if(this.ended || this.pausedByUser || this.stageCutin)return;
    if(this.rescueStarStock>=this.rescueStarMax)return;
    if(this.rescueStarActive)return;

    const y=this.by+82+Math.random()*120;

    // 5.22: use one moving container with a large 80x80 hit zone.
    const carrier=this.add.container(-44,y).setDepth(170);

    const glow=this.add.circle(0,0,31,0xfff59d,.18)
      .setStrokeStyle(2,0xffffff,.46);

    const star=this.add.text(0,0,'💫',{fontSize:'42px'})
      .setOrigin(.5);

    const hit=this.add.zone(0,0,80,80)
      .setInteractive({useHandCursor:true});

    carrier.add([glow,star,hit]);

    // tiny pulse makes it easier to notice
    this.tweens.add({
      targets:[star,glow],
      scale:{from:.92,to:1.10},
      duration:360,
      yoyo:true,
      repeat:-1,
      ease:'Sine.easeInOut'
    });

    this.rescueStarActive={carrier,star,glow,hit};

    const fly=this.tweens.add({
      targets:carrier,
      x:this.scale.width+44,
      duration:5600,
      ease:'Linear',
      onComplete:()=>{
        if(this.rescueStarActive?.carrier===carrier){
          this.rescueStarActive=null;
        }
        carrier.destroy(true);
      }
    });

    const catchStar=()=>{
      if(!carrier.active)return;

      fly.stop();

      if(this.rescueStarStock<this.rescueStarMax){
        this.rescueStarStock++;
        trackEvent('rescue_star_caught',{stock:this.rescueStarStock});
        this.updateRescueStockUI();
        this.toneRescueCatch();

        // Visual confirmation: fly a copy toward stock area.
        const caught=this.add.text(carrier.x,carrier.y,'💫',{fontSize:'40px'})
          .setOrigin(.5).setDepth(176);

        this.tweens.add({
          targets:caught,
          x:390,y:205,
          scale:.55,
          duration:360,
          ease:'Quad.easeIn',
          onComplete:()=>caught.destroy()
        });

        const stockMsg=this.add.text(350,140,`STOCK ${this.rescueStarStock}/3`,{
          fontFamily:'Arial Black, sans-serif',
          fontSize:'16px',fontStyle:'bold',
          color:'#fff1a6',
          stroke:'#000000',strokeThickness:5
        }).setOrigin(.5).setDepth(176).setScale(.65).setAlpha(0);

        this.tweens.add({
          targets:stockMsg,
          scale:1,alpha:1,y:stockMsg.y-12,
          duration:180,ease:'Back.easeOut',
          hold:360,yoyo:true,
          onComplete:()=>stockMsg.destroy()
        });
      }

      this.rescueStarActive=null;
      carrier.destroy(true);
    };

    hit.on('pointerdown',catchStar);
    star.setInteractive({useHandCursor:true}).on('pointerdown',catchStar);
    glow.setInteractive(
      new Phaser.Geom.Circle(0,0,34),
      Phaser.Geom.Circle.Contains
    ).on('pointerdown',catchStar);
  }

  toneRescueCatch(){
    AUDIO.tone(880,.06,.035,'square');
    AUDIO.tone(1175,.08,.032,'triangle',.05);
    AUDIO.tone(1568,.11,.028,'triangle',.10);
  }

  useRescueStock(){
    if(this.rescueStarStock<=0 || this.ended || this.pausedByUser)return;

    this.rescueStarStock--;
    trackEvent('rescue_star_used',{stock_after:this.rescueStarStock});
    this.updateRescueStockUI();

    for(let y=CFG.rows-6;y<CFG.rows;y++){
      for(let x=0;x<CFG.cols;x++)this.board.grid[y][x]=null;
    }

    this.board.collapse();

    if(this.piece && this.state==='FALLING'){
      let guard=0;
      while(this.board.collides(this.piece) && this.piece.y>-4 && guard<8){
        this.piece.y--;
        guard++;
      }
    }

    this.redraw();

    AUDIO.thunder(5);
    this.cameras.main.flash(240,255,245,155);
    this.cameras.main.shake(400,.020);

    this.fxShockwave(
      this.bx+CFG.boardW/2,
      this.by+CFG.boardH-84,
      0xffd54f,6,9
    );
    this.fxBurst(
      this.bx+CFG.boardW/2,
      this.by+CFG.boardH-84,
      0xffffff,64,70,260
    );

    const msg=this.add.text(
      this.bx+CFG.boardW/2,
      this.by+CFG.boardH-110,
      `💫 お助けスター！
下6段クリア`,
      {
        fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
        fontSize:'24px',fontStyle:'bold',
        align:'center',
        color:'#fff5b0',
        stroke:'#000000',strokeThickness:7
      }
    ).setOrigin(.5).setDepth(175).setScale(.5).setAlpha(0);

    this.tweens.add({
      targets:msg,
      scale:1,alpha:1,y:msg.y-26,
      duration:220,ease:'Back.easeOut',
      hold:430,yoyo:true,
      onComplete:()=>msg.destroy()
    });
  }

  resolve(chainNo){
    if(this.ended)return;

    this.state='CHECKING';
    const groups=this.board.findGroups(4);

    if(groups.length===0){
      this.state='STABLE';
      this.redraw();

      if(this.clears>=100){
        this.masterClear();
        return;
      }

      const nextStage=this.currentStage();

      if(nextStage!==this.stage){
        this.enterStage(nextStage);
      }else{
        this.time.delayedCall(CFG.spawnDelay,()=>this.spawn());
      }
      return;
    }

    let cells=[];
    groups.forEach(g=>cells.push(...g));
    cells=this.board.expandDogBomb(cells);

    const uniq=[...new Set(cells.map(([x,y])=>`${x},${y}`))]
      .map(s=>s.split(',').map(Number));

    this.state='CLEARING';

    // 5.14 simple score rule:
    // 1 block = 10 pt. Chain multiplier = 1x / 2x / 3x / 4x...
    const multiplier=Math.max(1,chainNo);
    const gained=uniq.length*10*multiplier;
    this.score+=gained;
    this.lastGain=gained;
    if(chainNo>=2){
      trackEvent('combo_reached',{combo:chainNo,score:this.score,cleared_blocks:uniq.length});
    }
    this.clears++;
    this.level=1+Math.floor(this.clears/10);

    AUDIO.clear(chainNo);
    if(chainNo>=3)AUDIO.thunder(chainNo);

    this.showChain(chainNo,uniq.length);

    if(chainNo===2){
      this.time.delayedCall(140,()=>this.spawnComboRewardStar());
    }

    this.animateClear(uniq,chainNo,()=>{
      this.board.remove(uniq);

      this.state='GRAVITY';
      this.time.delayedCall(CFG.gravityDelay,()=>{
        this.board.collapse();
        this.redraw();

        this.time.delayedCall(80,()=>this.resolve(chainNo+1));
      });
    });
  }

  animateClear(cells,chainNo,done){
    for(const [x,y] of cells){
      const c=this.board.grid[y][x];
      if(!c)continue;

      const sp=this.makeCell(c,x,y,1).setDepth(60);

      const spinDir=Math.random()>.5?1:-1;
      const firstScale=chainNo>=3?1.42:1.30;
      const firstAngle=chainNo>=3?spinDir*(70+Math.random()*70):(Math.random()-.5)*18;
      const finalAngle=chainNo>=3?spinDir*(240+Math.random()*180):(Math.random()-.5)*35;

      this.tweens.add({
        targets:sp,
        scaleX:firstScale,scaleY:firstScale,
        angle:firstAngle,
        duration:95,
        ease:'Quad.easeOut',
        onComplete:()=>{
          this.tweens.add({
            targets:sp,
            alpha:0,scaleX:.05,scaleY:.05,
            angle:finalAngle,
            duration:165,
            ease:'Back.easeIn',
            onComplete:()=>sp.destroy()
          });
        }
      });
    }

    if(chainNo>=3)this.chainLightning(chainNo,cells);
    if(chainNo>=5)this.chainFinisher(chainNo);

    this.time.delayedCall(CFG.clearDelay,done);
  }

  showChain(chainNo,count){
    const x=this.scale.width/2;
    const y=this.by+155;

    // A single clear is not called a combo.
    if(chainNo<=1){
      const gain=this.add.text(x,y,`${count}個 CLEAR   +${(this.lastGain||0).toLocaleString('ja-JP')} pt`,{
        fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
        fontSize:'18px',fontStyle:'bold',
        color:'#ffffff',
        stroke:'#000000',strokeThickness:5,
        backgroundColor:'rgba(10,16,21,0.78)',
        padding:{left:12,right:12,top:7,bottom:7}
      }).setOrigin(.5).setDepth(94).setAlpha(0).setScale(.72);

      this.tweens.add({
        targets:gain,
        alpha:1,scale:1,y:gain.y-12,
        duration:160,ease:'Back.easeOut',
        hold:240,yoyo:true,
        onComplete:()=>gain.destroy()
      });
      return;
    }

    const label=`${chainNo}コンボ！`;

    const bubble=this.add.graphics().setDepth(92);
    bubble.fillStyle(0xffffff,.98);
    bubble.lineStyle(chainNo>=3?5:4,chainNo>=3?0xffd54f:0x101820,1);
    bubble.fillRoundedRect(x-116,y-52,232,104,24);
    bubble.strokeRoundedRect(x-116,y-52,232,104,24);
    bubble.fillTriangle(x-16,y+50,x+10,y+50,x-3,y+68);

    const txt=this.add.text(x,y-22,label,{
      fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
      fontSize:chainNo>=5?'30px':'28px',
      fontStyle:'bold',
      color:chainNo>=3?'#d52e2e':'#101820',
      stroke:'#ffffff',strokeThickness:2
    }).setOrigin(.5).setDepth(93).setScale(.4).setAlpha(0);

    const formula=`${count}個 × 10 × ${chainNo}`;
    const detail=this.add.text(x,y+9,formula,{
      fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
      fontSize:'11px',fontStyle:'bold',color:'#52616b'
    }).setOrigin(.5).setDepth(93).setAlpha(0);

    const gain=this.add.text(x,y+31,`+${(this.lastGain||0).toLocaleString('ja-JP')} pt`,{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'17px',fontStyle:'bold',
      color:'#b97700',stroke:'#ffffff',strokeThickness:2
    }).setOrigin(.5).setDepth(94).setAlpha(0).setScale(.7);

    bubble.setScale(.45).setAlpha(0);

    this.tweens.add({
      targets:bubble,scale:1,alpha:1,
      duration:150,ease:'Back.easeOut',
      hold:340,yoyo:true,
      onComplete:()=>bubble.destroy()
    });
    this.tweens.add({
      targets:txt,scale:1,alpha:1,
      duration:165,ease:'Back.easeOut',
      hold:315,yoyo:true,
      onComplete:()=>txt.destroy()
    });
    this.tweens.add({
      targets:detail,alpha:1,
      duration:140,delay:45,
      hold:290,yoyo:true,
      onComplete:()=>detail.destroy()
    });
    this.tweens.add({
      targets:gain,alpha:1,scale:1,
      duration:150,delay:70,
      hold:270,yoyo:true,
      onComplete:()=>gain.destroy()
    });
  }

  chainLightning(chainNo,cells){
    const ax=cells.reduce((s,p)=>s+p[0],0)/cells.length;
    const ay=cells.reduce((s,p)=>s+p[1],0)/cells.length;
    const tx=this.bx+ax*CFG.cell+CFG.cell/2;
    const ty=this.by+ay*CFG.cell+CFG.cell/2;
    const boltCount=Math.min(9,4+chainNo);

    // Sound and visuals hit together.
    this.cameras.main.flash(150,235,248,255);
    this.cameras.main.shake(340,.014+Math.min(.012,chainNo*.0018));

    // Blue-white shock rings.
    for(let r=0;r<3;r++){
      const ring=this.add.circle(tx,ty,18)
        .setStrokeStyle(4-r, r===1?0x56b4e9:0xffffff,.92)
        .setDepth(96);
      this.tweens.add({
        targets:ring,
        scale:5.5+r*1.6,alpha:0,
        duration:420+r*110,
        onComplete:()=>ring.destroy()
      });
    }

    for(let n=0;n<boltCount;n++){
      const bolt=this.add.graphics().setDepth(98);
      const glow=this.add.graphics().setDepth(97);
      const sx=this.bx+Math.random()*CFG.boardW;
      const points=[[sx,this.by-28]];
      let px=sx;
      const seg=10;

      for(let i=1;i<=seg;i++){
        const t=i/seg;
        px+=(Math.random()-.5)*50;
        points.push([
          Phaser.Math.Linear(px,tx,t)+(Math.random()-.5)*28,
          Phaser.Math.Linear(this.by-28,ty,t)
        ]);
      }
      points.push([tx,ty]);

      glow.lineStyle(10,0x56b4e9,.20);
      glow.beginPath(); glow.moveTo(...points[0]);
      points.slice(1).forEach(p=>glow.lineTo(...p)); glow.strokePath();

      bolt.lineStyle(n%3===0?5:3,n%3===0?0xffffff:0xbfefff,1);
      bolt.beginPath(); bolt.moveTo(...points[0]);
      points.slice(1).forEach(p=>bolt.lineTo(...p)); bolt.strokePath();

      this.tweens.add({
        targets:[bolt,glow],
        alpha:0,
        duration:220+Math.random()*180,
        delay:n*20,
        onComplete:()=>{bolt.destroy();glow.destroy();}
      });
    }

    // secondary flash gives the arcade "crack" feeling
    this.time.delayedCall(110,()=>{
      this.cameras.main.flash(80,255,255,255);
    });
  }

  chainFinisher(chainNo){
    const t=this.add.text(this.scale.width/2,this.scale.height*.38,
      `${chainNo} CHAIN!!`,
      {
        fontFamily:'Arial Black, sans-serif',
        fontSize:'54px',fontStyle:'bold',
        color:'#fff59d',
        stroke:'#000000',strokeThickness:9
      }
    ).setOrigin(.5).setDepth(105).setScale(.35);

    this.cameras.main.flash(130,255,245,185);
    this.cameras.main.shake(300,.014);

    this.tweens.add({
      targets:t,
      scale:1.25,y:t.y-40,
      duration:230,ease:'Back.easeOut',
      hold:420,yoyo:true,
      onComplete:()=>t.destroy()
    });
  }


  clearStageAmbientFX(){
    for(const tw of this.stageAmbientTweens||[]){try{tw.stop()}catch{}}
    for(const tm of this.stageAmbientTimers||[]){try{tm.remove(false)}catch{}}
    for(const o of this.stageAmbientObjects||[]){try{o.destroy()}catch{}}
    this.stageAmbientTweens=[];
    this.stageAmbientTimers=[];
    this.stageAmbientObjects=[];
  }

  fxArcadeFlash(color=0xffffff, alpha=.5, duration=120){
    const w=this.scale.width,h=this.scale.height;
    const r=this.add.rectangle(w/2,h/2,w,h,color,alpha).setDepth(200);
    this.tweens.add({targets:r,alpha:0,duration,onComplete:()=>r.destroy()});
  }

  fxScanlines(duration=850, alpha=.18){
    const w=this.scale.width,h=this.scale.height;
    const group=[];
    for(let y=0;y<h;y+=8){
      const ln=this.add.rectangle(w/2,y,w,2,0xffffff,alpha).setDepth(119);
      group.push(ln);
    }
    this.tweens.add({
      targets:group,
      y:'+=18',
      alpha:0,
      duration,
      ease:'Linear',
      onComplete:()=>group.forEach(o=>o.destroy())
    });
  }

  fxShockwave(cx,cy,color,count=5,maxScale=9){
    for(let i=0;i<count;i++){
      const r=this.add.circle(cx,cy,18)
        .setStrokeStyle(Math.max(2,7-i),color,.98-i*.12)
        .setDepth(121);
      this.tweens.add({
        targets:r,scale:maxScale+i*1.6,alpha:0,
        duration:460+i*110,delay:i*55,
        ease:'Expo.easeOut',
        onComplete:()=>r.destroy()
      });
    }
  }

  fxBurst(cx,cy,color,count=48,minD=80,maxD=280){
    for(let i=0;i<count;i++){
      const a=Math.random()*Math.PI*2;
      const d=minD+Math.random()*(maxD-minD);
      const p=this.add.rectangle(cx,cy,2+Math.random()*4,6+Math.random()*10,color,.95)
        .setAngle(Math.random()*180).setDepth(123);
      this.tweens.add({
        targets:p,
        x:cx+Math.cos(a)*d,
        y:cy+Math.sin(a)*d,
        angle:p.angle+(Math.random()>.5?360:-360),
        alpha:0,
        scale:.2,
        duration:480+Math.random()*420,
        ease:'Cubic.easeOut',
        onComplete:()=>p.destroy()
      });
    }
  }

  fxLaserCross(color,count=6){
    const w=this.scale.width,h=this.scale.height;
    for(let i=0;i<count;i++){
      const y=90+i*(h-180)/(count-1);
      const beam=this.add.rectangle(w/2,y,w*1.25,4+(i%2)*2,color,.58)
        .setDepth(120)
        .setAngle(i%2===0?-18:18)
        .setAlpha(0);
      this.tweens.add({
        targets:beam,
        alpha:{from:0,to:.72},
        scaleX:{from:.1,to:1},
        duration:130,
        yoyo:true,
        hold:40,
        delay:i*55,
        onComplete:()=>beam.destroy()
      });
    }
  }

  fxCometRain(color,count=24,angle=18){
    const w=this.scale.width,h=this.scale.height;
    for(let i=0;i<count;i++){
      const x=-80+Math.random()*(w+160);
      const y=-100-Math.random()*260;
      const beam=this.add.rectangle(x,y,3,45+Math.random()*85,color,.85)
        .setAngle(angle).setDepth(118);
      this.tweens.add({
        targets:beam,
        x:x+160,
        y:h+120,
        alpha:0,
        duration:520+Math.random()*680,
        delay:Math.random()*220,
        ease:'Cubic.easeIn',
        onComplete:()=>beam.destroy()
      });
    }
  }

  fxLightning(color,branches=5,power=1.1){
    const w=this.scale.width;
    const top=this.by-18;
    const bottom=this.by+CFG.boardH+18;
    for(let n=0;n<branches;n++){
      const gg=this.add.graphics().setDepth(126);
      const glow=this.add.graphics().setDepth(125);
      const baseX=w*(.10+.80*((n+1)/(branches+1)));
      let x=baseX;
      let pts=[[x,top]];
      const seg=12;
      for(let i=1;i<=seg;i++){
        x+=(Math.random()-.5)*(34+22*power);
        pts.push([x,Phaser.Math.Linear(top,bottom,i/seg)]);
      }

      glow.lineStyle(10*power,color,.16);
      glow.beginPath(); glow.moveTo(...pts[0]);
      pts.slice(1).forEach(p=>glow.lineTo(...p)); glow.strokePath();

      gg.lineStyle(3.2*power,color,1);
      gg.beginPath(); gg.moveTo(...pts[0]);
      pts.slice(1).forEach(p=>gg.lineTo(...p)); gg.strokePath();

      this.tweens.add({
        targets:[gg,glow],alpha:0,
        duration:180+Math.random()*150,
        onComplete:()=>{gg.destroy();glow.destroy();}
      });
    }
  }

  fxConfetti(colors,count=55){
    const w=this.scale.width,h=this.scale.height;
    for(let i=0;i<count;i++){
      const color=colors[i%colors.length];
      const c=this.add.rectangle(
        Math.random()*w,-20-Math.random()*180,
        4+Math.random()*6,10+Math.random()*14,color,.98
      ).setAngle(Math.random()*180).setDepth(122);
      this.tweens.add({
        targets:c,
        y:h+60,
        x:c.x+(Math.random()-.5)*160,
        angle:c.angle+(Math.random()>.5?540:-540),
        alpha:.05,
        duration:1050+Math.random()*1200,
        delay:Math.random()*200,
        ease:'Sine.easeIn',
        onComplete:()=>c.destroy()
      });
    }
  }

  fxArcadeText(stage,mainColor,accentColor,title,subtitle){
    const w=this.scale.width;
    const y=this.by+CFG.boardH*.38;

    const plate=this.add.rectangle(w/2,y,330,112,0x000000,.82)
      .setStrokeStyle(4,mainColor,1)
      .setDepth(130)
      .setScale(.05,.7)
      .setAlpha(0);

    const glow=this.add.rectangle(w/2,y,338,120,accentColor,.12)
      .setDepth(129)
      .setScale(.05,.7)
      .setAlpha(0);

    const st=this.add.text(w/2,y-21,`STAGE ${stage}`,{
      fontFamily:'Arial Black, sans-serif',
      fontSize:stage===10?'42px':'36px',
      color:'#ffffff',
      stroke:'#000000',strokeThickness:8
    }).setOrigin(.5).setDepth(132).setScale(.3).setAlpha(0);

    const ttl=this.add.text(w/2,y+16,title,{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'16px',
      color:Phaser.Display.Color.IntegerToColor(mainColor).rgba,
      stroke:'#000000',strokeThickness:4
    }).setOrigin(.5).setDepth(132).setAlpha(0);

    const sub=this.add.text(w/2,y+39,subtitle,{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'9px',
      color:'#d9e6ef'
    }).setOrigin(.5).setDepth(132).setAlpha(0);

    this.tweens.add({
      targets:[plate,glow],
      alpha:1,scaleX:1,scaleY:1,
      duration:170,ease:'Back.easeOut',
      hold:500,yoyo:true,
      onComplete:()=>{plate.destroy();glow.destroy();}
    });
    this.tweens.add({
      targets:st,
      alpha:1,scale:1.12,
      duration:180,ease:'Back.easeOut',
      hold:330,yoyo:true,
      onComplete:()=>st.destroy()
    });
    this.tweens.add({
      targets:[ttl,sub],
      alpha:1,
      duration:180,delay:70,
      hold:320,yoyo:true,
      onComplete:()=>{ttl.destroy();sub.destroy();}
    });
  }

  startStageAmbientFX(stage){
    this.clearStageAmbientFX();
    const w=this.scale.width,h=this.scale.height;
    const palette=[
      [0x7ad7ff,0xffffff],
      [0xffd54f,0xef5350],
      [0xb388ff,0xff4081],
      [0xff80ab,0xffffff],
      [0x4dd0e1,0xffb74d],
      [0xff7043,0xffca28],
      [0x5c6bc0,0x26c6da],
      [0x66bb6a,0xb2ff59],
      [0xffffff,0xef5350],
      [0xffd54f,0xffffff]
    ][stage-1];

    for(let i=0;i<14;i++){
      const left=i%2===0;
      const x=left?8+Math.random()*20:w-8-Math.random()*20;
      const y=80+Math.random()*(h-140);
      const p=this.add.circle(x,y,1.2+Math.random()*2.8,palette[i%2],.16+.18*Math.random())
        .setDepth(2);
      this.stageAmbientObjects.push(p);
      const tw=this.tweens.add({
        targets:p,
        y:y-60-Math.random()*120,
        x:x+(left?1:-1)*(4+Math.random()*10),
        alpha:{from:.32,to:.03},
        scale:{from:1,to:1.9},
        duration:1300+Math.random()*1600,
        delay:Math.random()*1000,
        yoyo:true,repeat:-1,ease:'Sine.easeInOut'
      });
      this.stageAmbientTweens.push(tw);
    }

    if(stage>=4){
      const timer=this.time.addEvent({
        delay:1800-Math.min(650,(stage-4)*90),
        loop:true,
        callback:()=>{
          if(this.ended||this.stageCutin)return;
          const c=palette[(Math.random()*palette.length)|0];
          const left=Math.random()<.5;
          const ray=this.add.rectangle(left?-80:w+80,100+Math.random()*(h-200),150,2,c,.17)
            .setAngle(left?-12:192).setDepth(2);
          this.tweens.add({
            targets:ray,
            x:left?180:w-180,
            alpha:0,
            duration:420,
            onComplete:()=>ray.destroy()
          });
        }
      });
      this.stageAmbientTimers.push(timer);
    }
  }

  stageArrivalFX(stage){
    const w=this.scale.width,h=this.scale.height;
    const cx=w/2;
    const cy=this.by+CFG.boardH*.44;

    const C=[
      {m:0x7ad7ff,a:0xffe082,f:[150,220,255],t:'SKY RUSH',s:'READY'},
      {m:0xffd54f,a:0xef5350,f:[255,225,160],t:'MARCH BREAK',s:'GO! GO! GO!'},
      {m:0xb388ff,a:0xff4081,f:[190,145,255],t:'REQUIEM BLAST',s:'DANGER'},
      {m:0xff80ab,a:0xffffff,f:[255,165,210],t:'CAN-CAN FEVER',s:'SHOW TIME'},
      {m:0x4dd0e1,a:0xffb74d,f:[130,235,255],t:'HEROIC RUSH',s:'FULL SPEED'},
      {m:0xff7043,a:0xffca28,f:[255,145,85],t:'DANCE IGNITION',s:'BURN UP'},
      {m:0x5c6bc0,a:0xffd54f,f:[110,140,255],t:'JAZZ ATTACK',s:'SWING HARD'},
      {m:0x66bb6a,a:0xb2ff59,f:[115,235,165],t:'MOUNTAIN KING',s:'WARNING'},
      {m:0xffffff,a:0xef5350,f:[255,245,225],t:'VICTORY MARCH',s:'CLIMAX'},
      {m:0xffd54f,a:0xffffff,f:[255,210,70],t:'FINAL OVERDRIVE',s:'MAXIMUM'}
    ][stage-1];

    // Arcade hit sequence: flash -> zoom -> shake -> scanline
    this.fxArcadeFlash(C.m,.42,95);
    this.time.delayedCall(95,()=>this.fxArcadeFlash(C.a,.28,85));
    this.cameras.main.shake(stage===10?520:330,stage===10?.021:.013);

    // Camera zoom punch
    const cam=this.cameras.main;
    const z0=cam.zoom;
    this.tweens.add({
      targets:cam,
      zoom:stage===10?1.085:1.055,
      duration:90,
      yoyo:true,
      ease:'Quad.easeOut',
      onComplete:()=>cam.setZoom(z0)
    });

    this.fxScanlines(stage===10?1100:850,stage===10?.22:.14);
    this.fxShockwave(cx,cy,C.m,stage===10?8:(stage===1?6:7),stage===10?11.5:(stage===1?9.3:10.2));
    this.fxBurst(cx,cy,C.m,stage===10?84:(stage===1?58:70),70,stage===10?330:(stage===1?280:305));
    this.fxBurst(cx,cy,C.a,stage===10?58:(stage===1?36:46),60,stage===10?255:245);
    this.fxLaserCross(C.a,stage===10?12:(stage===1?8:10));

    // 5.9: Every stage receives a boss-class multi-wave signature attack.
    if(stage===1){
      this.fxCometRain(C.m,24,15);
      this.fxConfetti([C.m,C.a,0xffffff],44);
      this.fxLaserCross(C.a,9);
      this.fxBurst(cx,cy,C.a,54,75,245);
      this.time.delayedCall(180,()=>this.fxCometRain(0xffffff,12,-12));
      this.time.delayedCall(300,()=>this.fxArcadeFlash(C.m,.18,90));

    }else if(stage===2){
      this.fxConfetti([0xffd54f,0xffffff,0xef5350],92);
      this.fxCometRain(0xffffff,26,6);
      this.fxLaserCross(0xffd54f,12);
      this.fxLightning(0xffd54f,5,.80);
      this.fxBurst(cx,cy,0xef5350,66,85,270);
      this.time.delayedCall(170,()=>this.fxConfetti([0xffffff,0xffd54f],40));
      this.time.delayedCall(310,()=>this.fxArcadeFlash(0xffd54f,.20,95));

    }else if(stage===3){
      this.fxLightning(C.m,9,1.18);
      this.fxLightning(C.a,5,.72);
      this.fxCometRain(C.a,28,20);
      this.fxBurst(cx,cy,C.a,86,85,315);
      this.fxLaserCross(C.m,12);
      this.time.delayedCall(180,()=>this.fxLightning(0xffffff,4,.62));
      this.time.delayedCall(320,()=>this.fxArcadeFlash(C.a,.22,95));

    }else if(stage===4){
      this.fxLaserCross(C.m,15);
      this.fxConfetti([0xff80ab,0xffffff,0xffd54f],88);
      this.fxCometRain(0xffffff,24,-18);
      this.fxLightning(0xff80ab,5,.82);
      this.fxBurst(cx,cy,0xffd54f,68,80,270);
      this.time.delayedCall(175,()=>this.fxLaserCross(0xffffff,8));
      this.time.delayedCall(310,()=>this.fxArcadeFlash(0xff80ab,.20,90));

    }else if(stage===5){
      this.fxCometRain(C.a,38,24);
      this.fxLightning(C.m,7,.96);
      this.fxLaserCross(0xffffff,12);
      this.fxBurst(cx,cy,C.m,84,85,310);
      this.fxConfetti([C.m,C.a,0xffffff],56);
      this.time.delayedCall(180,()=>this.fxCometRain(0xffffff,16,-20));
      this.time.delayedCall(325,()=>this.fxArcadeFlash(C.a,.22,100));

    }else if(stage===6){
      this.fxLightning(C.a,8,1.12);
      this.fxLightning(C.m,4,.72);
      this.fxCometRain(C.m,36,13);
      this.fxConfetti([0xff7043,0xffca28,0x7e57c2],78);
      this.fxLaserCross(C.a,11);
      this.fxBurst(cx,cy,C.m,76,85,290);
      this.time.delayedCall(180,()=>this.fxLightning(0xffffff,4,.62));
      this.time.delayedCall(320,()=>this.fxArcadeFlash(C.m,.22,95));

    }else if(stage===7){
      this.fxLightning(C.a,8,.96);
      this.fxLaserCross(C.m,13);
      this.fxConfetti([0x5c6bc0,0x26c6da,0xffd54f],72);
      this.fxCometRain(C.a,28,-14);
      this.fxBurst(cx,cy,C.m,82,80,300);
      this.time.delayedCall(185,()=>this.fxLaserCross(0xffd54f,8));
      this.time.delayedCall(325,()=>this.fxArcadeFlash(C.a,.20,95));

    }else if(stage===8){
      this.fxLightning(C.a,10,1.22);
      this.fxLightning(0xffffff,4,.66);
      this.fxCometRain(0xb2ff59,34,22);
      this.fxBurst(cx,cy,C.m,96,78,325);
      this.fxLaserCross(C.a,13);
      this.fxConfetti([C.m,C.a,0xffffff],66);
      this.time.delayedCall(170,()=>this.fxLightning(C.m,6,1.0));
      this.time.delayedCall(315,()=>this.fxArcadeFlash(C.a,.24,100));

    }else if(stage===9){
      this.fxConfetti([0xffffff,0xef5350,0xffd54f],108);
      this.fxLaserCross(0xffffff,15);
      this.fxCometRain(C.a,32,10);
      this.fxLightning(C.a,8,1.04);
      this.fxBurst(cx,cy,C.m,98,78,325);
      this.fxLightning(0xffffff,4,.64);
      this.time.delayedCall(180,()=>this.fxLaserCross(C.a,8));
      this.time.delayedCall(320,()=>this.fxArcadeFlash(0xffffff,.24,100));

    }else if(stage===10){
      // Final stage stays the ceiling: strongest and has two extra waves.
      this.fxLightning(0xffd54f,11,1.55);
      this.fxLightning(0xffffff,6,.90);
      this.fxCometRain(0xffd54f,44,20);
      this.fxLaserCross(0xffffff,16);
      this.fxConfetti([0xffd54f,0xffffff,0xff8f00],100);
      this.fxBurst(cx,cy,0xffd54f,110,70,350);
      this.time.delayedCall(160,()=>this.fxLightning(0xffd54f,8,1.38));
      this.time.delayedCall(280,()=>this.fxLaserCross(0xffd54f,8));
      this.time.delayedCall(400,()=>this.fxArcadeFlash(0xffd54f,.25,110));
    }

    this.fxArcadeText(stage,C.m,C.a,C.t,C.s);

    // Extra "warning stripe" for 3,8,10
    if([3,8,10].includes(stage)){
      const warn=this.add.rectangle(w/2,this.by+CFG.boardH*.72,w+100,30,0x000000,.72)
        .setDepth(128).setAlpha(0);
      const wt=this.add.text(w/2,warn.y,stage===10?'FINAL STAGE':'WARNING',{
        fontFamily:'Arial Black, sans-serif',
        fontSize:'14px',
        color:stage===10?'#ffd54f':'#ffffff',
        letterSpacing:3
      }).setOrigin(.5).setDepth(129).setAlpha(0);
      this.tweens.add({targets:[warn,wt],alpha:1,duration:110,hold:260,yoyo:true,
        onComplete:()=>{warn.destroy();wt.destroy();}});
    }

    this.time.delayedCall(450,()=>this.startStageAmbientFX(stage));
  }

  enterStage(newStage){
    trackEvent('stage_reached',{stage:newStage,score:this.score||0});
    this.clearStageAmbientFX();

    this.stage=newStage;
    this.factory.setStage(newStage);
    AUDIO.setStage(newStage);
    this.applyTheme();
    this.updateHUD();

    // Seamless stage transition: no "天才 / 神域" blocking cut-in.
    // A short top notice + stage FX plays while the next piece continues immediately.
    const w=this.scale.width;
    const notice=this.add.text(w/2,55,`STAGE ${newStage}`,{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'19px',fontStyle:'bold',
      color:newStage===10?'#ffd54f':'#ffffff',
      stroke:'#000000',strokeThickness:5
    }).setOrigin(.5).setDepth(135).setAlpha(0).setScale(.72);

    this.tweens.add({
      targets:notice,
      alpha:1,scale:1,y:61,
      duration:170,ease:'Back.easeOut',
      hold:330,yoyo:true,
      onComplete:()=>notice.destroy()
    });

    this.stageArrivalFX(newStage);
    this.state='STABLE';
    this.time.delayedCall(90,()=>this.spawn());
  }

  masterClear(){
    if(this.rescueStarActive){
      try{this.rescueStarActive.carrier?.destroy(true)}catch{}
      try{this.rescueStarActive.star?.destroy()}catch{}
      try{this.rescueStarActive.glow?.destroy()}catch{}
      this.rescueStarActive=null;
    }
    if(this.ended)return;
    this.ended=true;
    this.state='COMPLETE';

    const w=this.scale.width,h=this.scale.height;
    this.add.rectangle(w/2,h/2,w,h,0x020406,1).setDepth(150);

    for(let i=0;i<56;i++){
      const p=this.add.circle(
        Math.random()*w,h+Math.random()*160,
        1+Math.random()*2.4,
        i%3===0?0xffffff:0xf0e442,
        .32+Math.random()*.65
      ).setDepth(151);
      this.tweens.add({
        targets:p,
        y:-30,x:p.x+(Math.random()-.5)*90,
        duration:2500+Math.random()*2700,
        delay:Math.random()*1200,
        repeat:-1,ease:'Sine.easeIn'
      });
    }

    const halo=this.add.circle(w/2,h*.40,84,0xf0e442,.06)
      .setStrokeStyle(3,0xf0e442,.28).setDepth(151);

    this.tweens.add({
      targets:halo,scale:1.45,alpha:.01,
      duration:1100,yoyo:true,repeat:-1,ease:'Sine.easeInOut'
    });

    const small=this.add.text(w/2,h*.25,'ALL STAGES COMPLETE',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'18px',fontStyle:'bold',color:'#56b4e9'
    }).setOrigin(.5).setDepth(153).setAlpha(0);

    const title=this.add.text(w/2,h*.39,'完全制覇',{
      fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
      fontSize:'60px',fontStyle:'bold',
      color:'#fff8c6',stroke:'#6d5000',strokeThickness:10,
      shadow:{offsetX:0,offsetY:0,color:'#f0e442',blur:18,fill:true}
    }).setOrigin(.5).setDepth(154).setScale(2.2).setAlpha(0);

    const sub=this.add.text(w/2,h*.52,'100 CLEAR',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'28px',fontStyle:'bold',
      color:'#ffffff',stroke:'#000000',strokeThickness:5
    }).setOrigin(.5).setDepth(154).setAlpha(0);

    this.add.text(w/2,h*.62,'COLOR BLOCKS DX',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'22px',fontStyle:'bold',color:'#9fb8c7'
    }).setOrigin(.5).setDepth(153);

    this.time.delayedCall(220,()=>{
      this.cameras.main.flash(220,255,244,170);
      this.tweens.add({targets:small,alpha:1,y:small.y-8,duration:480,ease:'Cubic.easeOut'});
      this.tweens.add({targets:title,alpha:1,scale:1,duration:620,ease:'Back.easeOut'});
      this.tweens.add({targets:sub,alpha:1,y:sub.y-6,duration:480,delay:380,ease:'Cubic.easeOut'});
    });

    this.time.delayedCall(1800,()=>{
      const retry=this.add.text(w/2,h*.75,'PLAY AGAIN',{
        fontFamily:'Arial Black, sans-serif',
        fontSize:'22px',fontStyle:'bold',
        color:'#071019',backgroundColor:'#f0e442',
        padding:{left:30,right:30,top:11,bottom:11}
      }).setOrigin(.5).setDepth(160).setAlpha(0).setInteractive();

      this.tweens.add({targets:retry,alpha:1,y:retry.y-8,duration:380,ease:'Cubic.easeOut'});

      retry.on('pointerdown',()=>{
        retry.setScale(.94).setAlpha(.72);
        AUDIO.userGestureResume();
        this.time.delayedCall(90,()=>{ trackEvent('game_retry',{stage:this.stage||1,score:this.score||0}); this.scene.restart(this.secretMode?{secretMode:true,secretStage:this.stage}:{}); });
      });
    });
  }

  togglePause(){
    if(this.ended||this.stageCutin)return;
    trackEvent('pause_toggled',{paused:!this.pausedByUser});

    this.pausedByUser=!this.pausedByUser;

    this.pauseShade.setVisible(this.pausedByUser);
    this.pauseText.setVisible(this.pausedByUser);
    this.resumeFrame.setVisible(this.pausedByUser);
    this.resumeBtn.setVisible(this.pausedByUser).setScale(1).setAlpha(1);
    this.resumeHint.setVisible(this.pausedByUser);

    if(this.pauseBtn){
      this.pauseBtn.setVisible(!this.pausedByUser);
      this.pauseBtn.setScale(1).setAlpha(1);
    }

    if(this.pausedByUser){
      AUDIO.pause();
    }else{
      AUDIO.resume();
    }
  }

  applyTheme(){
    // Stronger darkening progression by stage.
    const shades=[
      '#f2fbff', // 1
      '#d7ebf5', // 2
      '#bed2dd', // 3
      '#a1b5c2', // 4
      '#8499a7', // 5
      '#677d8b', // 6
      '#4d616e', // 7
      '#334550', // 8
      '#19242c', // 9
      '#000000'  // 10
    ];

    const boardFills=[
      0xffffff, // 1
      0xf6fbff, // 2
      0xecf3f8, // 3
      0xdde6ed, // 4
      0xc8d3dc, // 5
      0xaebac4, // 6
      0x8996a0, // 7
      0x5c6973, // 8
      0x222a31, // 9
      0x080808  // 10
    ];

    const boardStrokes=[
      0x21313b,0x223540,0x243947,0x233a49,0x244050,
      0x27475a,0x2d556d,0x356883,0x6b8799,0xffd54f
    ];

    this.cameras.main.setBackgroundColor(shades[this.stage-1]||'#000000');

    if(this.boardBg){
      const fill=boardFills[this.stage-1] ?? 0xffffff;
      const stroke=boardStrokes[this.stage-1] ?? 0x1b2830;
      const alpha=this.stage>=9 ? .96 : (this.stage>=7 ? .94 : .92);
      this.boardBg.setFillStyle(fill,alpha);
      this.boardBg.setStrokeStyle(3,stroke,1);
    }

    this.redraw();
  }

  makeCell(cell,x,y,alpha=1){
    const key=cell.dog?'dog':'cat'+cell.colorIdx;
    const sp=this.add.image(
      this.bx+x*CFG.cell+CFG.cell/2,
      this.by+y*CFG.cell+CFG.cell/2,
      key
    ).setAlpha(alpha).setDisplaySize(CFG.cell,CFG.cell);
    return sp;
  }

  drawPiece(layer,piece,boardY,alpha=1,ghost=false){
    const activeGrow=(!ghost && this.touchingPiece)?1.28:1;

    occupied(piece.matrix,(x,y,colorIdx)=>{
      const key='cat'+colorIdx;
      const px=this.bx+(piece.x+x)*CFG.cell+CFG.cell/2;
      const py=this.by+(boardY+y)*CFG.cell+CFG.cell/2;

      if(!ghost && this.touchingPiece){
        const glow=this.add.image(px,py,key)
          .setAlpha(.18)
          .setTint(0xffffff)
          .setDisplaySize(CFG.cell*1.42,CFG.cell*1.42)
          .setBlendMode(Phaser.BlendModes.ADD);
        layer.add(glow);
      }

      const sp=this.add.image(px,py,key)
        .setAlpha(alpha)
        .setDisplaySize(CFG.cell*activeGrow,CFG.cell*activeGrow);

      if(ghost){
        // landing navigation remains unchanged
        sp.setTint(0xffffff);
        sp.setAlpha(.18);
        sp.setDisplaySize(CFG.cell,CFG.cell);
      }else if(this.touchingPiece){
        sp.setDepth(7);
      }

      layer.add(sp);
    });
  }

  drawNext(){
    this.nextLayer.removeAll(true);
    if(!this.nextQueue || !this.nextQueue.length)return;

    const centers=[168,252,332];
    const centerY=88;

    this.nextQueue.slice(0,3).forEach((piece,index)=>{
      const isFirst=index===0;
      const cellSize=isFirst?19:16;
      const cx=centers[index];
      const cy=centerY;
      const slotW=isFirst?72:66;
      const slotH=isFirst?62:58;
      const accent=isFirst?0xffd54f:0x56b4e9;

      const slot=this.add.rectangle(cx,cy,slotW,slotH,0x081018,.98)
        .setStrokeStyle(2,accent,isFirst?1:.55);
      this.nextLayer.add(slot);

      const badge=this.add.text(cx,cy-slotH/2-9,isFirst?'次':'NEXT '+(index+1),{
        fontFamily:'Arial Black, sans-serif',
        fontSize:isFirst?'10px':'8px',
        fontStyle:'bold',
        color:isFirst?'#8a6500':'#506a79'
      }).setOrigin(.5);
      this.nextLayer.add(badge);

      const mw=piece.matrix[0].length;
      const mh=piece.matrix.length;
      const ox=cx-(mw*cellSize)/2+cellSize/2;
      const oy=cy-(mh*cellSize)/2+cellSize/2;

      occupied(piece.matrix,(x,y,colorIdx)=>{
        const sp=this.add.image(ox+x*cellSize,oy+y*cellSize,'cat'+colorIdx)
          .setDisplaySize(cellSize-1,cellSize-1);
        this.nextLayer.add(sp);
      });
    });
  }

  redraw(){
    if(!this.lockedLayer)return;

    this.lockedLayer.removeAll(true);
    this.ghostLayer.removeAll(true);
    this.activeLayer.removeAll(true);

    for(let y=0;y<CFG.rows;y++){
      for(let x=0;x<CFG.cols;x++){
        const c=this.board.grid[y][x];
        if(!c)continue;

        const sp=this.makeCell(c,x,y,1);
        this.lockedLayer.add(sp);

        if(this.stage===10&&!c.dog){
          // gold outline/glow, while preserving original matching color
          const glow=this.add.image(sp.x,sp.y,sp.texture.key)
            .setAlpha(.18)
            .setTint(0xffd54f)
            .setDisplaySize(CFG.cell*1.08,CFG.cell*1.08)
            .setBlendMode(Phaser.BlendModes.ADD);
          this.lockedLayer.add(glow);
        }
      }
    }

    if(this.piece&&this.state==='FALLING'){
      const gy=this.board.ghostY(this.piece);
      this.drawPiece(this.ghostLayer,this.piece,gy,.18,true);
      this.drawPiece(this.activeLayer,this.piece,this.piece.y,1,false);
    }

    this.drawNext();
    this.updateHUD();
  }

  updateHUD(){
    this.scoreT.setText(this.score.toLocaleString('ja-JP'));
    this.stageT.setText(String(this.stage));

    if(!this.secretMode && this.score>this.best){
      this.best=this.score;
      Store.setBest(this.best);
    }
  }

  gameOver(){
    trackEvent('game_over',{
      score:this.score||0,
      stage:this.stage||1,
      clears:this.clears||0,
      secret_mode:!!this.secretMode
    });
    this.touchingPiece=false;
    if(this.rescueStarActive){
      try{this.rescueStarActive.carrier?.destroy(true)}catch{}
      try{this.rescueStarActive.star?.destroy()}catch{}
      try{this.rescueStarActive.glow?.destroy()}catch{}
      this.rescueStarActive=null;
    }
    if(this.ended)return;
    this.ended=true;
    this.state='GAME_OVER';
    this.clearStageAmbientFX();

    // Music must stop immediately.
    AUDIO.pause();
    AUDIO.stop();
    AUDIO.stopTitleMusic(0);

    // Then the short "チャンチャン!" jingle.
    AUDIO.gameOverJingle();

    const w=this.scale.width,h=this.scale.height;
    const shade=this.add.rectangle(w/2,h/2,w,h,0x000000,.80).setDepth(160);

    const over=this.add.text(w/2,h*.39,'GAME OVER',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'44px',color:'#ffffff',
      stroke:'#000000',strokeThickness:7
    }).setOrigin(.5).setDepth(161).setScale(.7).setAlpha(0);

    const brand=this.add.text(w/2,h*.46,'SOFTAZIO  •  PRODUCT 001',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'10px',fontStyle:'bold',
      color:'#f0e442'
    }).setOrigin(.5).setDepth(161).setAlpha(0);

    const stat=this.add.text(w/2,h*.52,
      `SCORE ${this.score}
CLEAR ${this.clears}
STAGE ${this.stage}`,
      {align:'center',fontSize:'18px',color:'#ffffff',lineSpacing:8}
    ).setOrigin(.5).setDepth(161).setAlpha(0);

    this.tweens.add({targets:over,alpha:1,scale:1,duration:260,ease:'Back.easeOut'});
    this.tweens.add({targets:[brand,stat],alpha:1,duration:300,delay:150});

    this.time.delayedCall(1150,()=>{
      this.tweens.add({
        targets:[over,brand,stat,shade],alpha:0,duration:320,
        onComplete:()=>{
          over.destroy();brand.destroy();stat.destroy();shade.destroy();
          this.playStage10Demo();
        }
      });
    });
  }

  playStage10Demo(){
    const w=this.scale.width,h=this.scale.height;

    this.cameras.main.setBackgroundColor('#000000');

    const bg=this.add.rectangle(w/2,h/2,w,h,0x000000,1).setDepth(170);
    const frame=this.add.rectangle(
      this.bx+CFG.boardW/2,
      this.by+CFG.boardH/2,
      CFG.boardW,CFG.boardH,
      0x070707,.99
    ).setStrokeStyle(3,0xffd54f,1).setDepth(171);

    const title=this.add.text(w/2,24,'STAGE 10  DEMO',{
      fontFamily:'Arial Black, sans-serif',
      fontSize:'22px',fontStyle:'bold',
      color:'#ffd54f',stroke:'#000000',strokeThickness:5
    }).setOrigin(.5,0).setDepth(178);

    const demoBlocks=[];
    const keys=['cat0','cat1','cat2','cat3','cat4'];
    const layout=[
      [0,19,0],[1,19,1],[2,19,2],[3,19,3],[4,19,4],[5,19,0],[6,19,2],[7,19,1],[8,19,3],[9,19,4],
      [0,18,1],[1,18,1],[2,18,2],[3,18,4],[4,18,4],[5,18,0],[6,18,0],[7,18,2],[8,18,3],[9,18,3],
      [1,17,2],[2,17,2],[3,17,4],[4,17,0],[5,17,0],[6,17,1],[7,17,1],[8,17,3],
      [2,16,2],[3,16,4],[4,16,0],[5,16,1],[6,16,1],[7,16,3],
      [3,15,4],[4,15,0],[5,15,1],[6,15,3]
    ];

    layout.forEach(([x,y,c],i)=>{
      const sp=this.add.image(
        this.bx+x*CFG.cell+CFG.cell/2,
        this.by+y*CFG.cell+CFG.cell/2,
        keys[c]
      ).setDisplaySize(CFG.cell,CFG.cell).setDepth(174).setAlpha(0);
      demoBlocks.push(sp);

      this.tweens.add({
        targets:sp,alpha:1,y:sp.y-5,
        duration:260+Math.random()*170,delay:i*8,
        yoyo:true,ease:'Sine.easeOut'
      });
    });

    // gold particle field
    for(let i=0;i<30;i++){
      const p=this.add.circle(
        this.bx+Math.random()*CFG.boardW,
        this.by+CFG.boardH+Math.random()*80,
        1+Math.random()*2,
        i%4===0?0xffffff:0xffd54f,
        .30+Math.random()*.55
      ).setDepth(172);
      this.tweens.add({
        targets:p,
        y:this.by-25,
        x:p.x+(Math.random()-.5)*45,
        duration:2200+Math.random()*1800,
        delay:Math.random()*700,
        repeat:-1,ease:'Sine.easeIn'
      });
    }

    this.time.delayedCall(620,()=>{
      const fall=[];
      for(let i=0;i<4;i++){
        const sp=this.add.image(
          this.bx+(2+i)*CFG.cell+CFG.cell/2,
          this.by-30,
          'cat2'
        ).setDisplaySize(CFG.cell,CFG.cell).setDepth(180);
        fall.push(sp);

        this.tweens.add({
          targets:sp,
          y:this.by+(14+(i%2))*CFG.cell+CFG.cell/2,
          duration:620+i*55,
          ease:'Cubic.easeIn'
        });
      }

      this.time.delayedCall(760,()=>{
        fall.forEach(s=>s.destroy());

        this.stageArrivalFX(10);

        const chain=this.add.text(w/2,h*.42,'4 CHAIN!!',{
          fontFamily:'Arial Black, sans-serif',
          fontSize:'50px',fontStyle:'bold',
          color:'#fff59d',stroke:'#000000',strokeThickness:9,
          shadow:{offsetX:0,offsetY:0,color:'#ffd54f',blur:14,fill:true}
        }).setOrigin(.5).setDepth(190).setScale(.3).setAlpha(0);

        this.cameras.main.flash(140,255,240,160);
        this.cameras.main.shake(260,.012);

        this.tweens.add({
          targets:chain,alpha:1,scale:1.12,y:chain.y-28,
          duration:260,ease:'Back.easeOut',
          hold:460,yoyo:true,
          onComplete:()=>chain.destroy()
        });
      });
    });

    this.time.delayedCall(3450,()=>{
      const retry=this.add.text(w/2,h*.78,'RETRY',{
        fontFamily:'Arial Black, sans-serif',
        fontSize:'25px',fontStyle:'bold',
        color:'#101010',backgroundColor:'#ffd54f',
        padding:{left:30,right:30,top:11,bottom:11}
      }).setOrigin(.5).setDepth(195).setAlpha(0).setInteractive();

      const hint=this.add.text(w/2,h*.835,'もう一度挑戦',{
        fontFamily:'Arial Black, "Noto Sans JP", sans-serif',
        fontSize:'13px',color:'#e7d78b',
        stroke:'#000000',strokeThickness:3
      }).setOrigin(.5).setDepth(195).setAlpha(0);

      this.tweens.add({targets:[retry,hint],alpha:1,y:'-=8',duration:360,ease:'Cubic.easeOut'});

      retry.on('pointerdown',()=>{
        retry.setScale(.94).setAlpha(.72);
        AUDIO.userGestureResume();
        this.time.delayedCall(90,()=>this.scene.restart(this.secretMode?{secretMode:true,secretStage:this.stage}:{}));
      });
    });
  }
}

const config={
  type:Phaser.AUTO,
  parent:'game',
  width:420,
  height:720,
  backgroundColor:'#eef7fb',
  scene:[BootScene,TitleScene,GameScene],
  scale:{
    mode:Phaser.Scale.FIT,
    autoCenter:Phaser.Scale.CENTER_BOTH
  },
  render:{
    antialias:false,
    pixelArt:false
  }
};

new Phaser.Game(config);
