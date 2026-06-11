(() => {
  "use strict";
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const formatNumber = (value) => Math.max(0, Math.floor(value)).toLocaleString("ko-KR");
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const elements = {
    canvas: $("#gameCanvas"), domGame: $("#domGame"), gameStage: $("#gameStage"), message: $("#gameMessage"),
    messageEyebrow: $("#messageEyebrow"), messageTitle: $("#messageTitle"), messageRestart: $("#messageRestart"),
    currentTitle: $("#currentGameTitle"), score: $("#score"), best: $("#bestScore"), totalBest: $("#totalBest"),
    controlsText: $("#controlsText"), touchActionLabel: $("#touchActionLabel"), stageLabel: $("#stageLabel"),
    stageStatus: $("#stageStatus"), restart: $("#restartButton"), pause: $("#pauseButton"), pauseLabel: $("#pauseLabel"),
    sound: $("#soundToggle"), gameMark: $("#gameMark"), gameCards: $$(".game-card"), touchButtons: $$("#touchControls button")
  };
  const GAME_META = {
    tetris: { title: "테트리스", index: "01", color: "#d5f52a", action: "회전", controls: [["← → ↓", "이동"], ["↑", "회전"], ["SPACE", "빠른 낙하"]] },
    mines: { title: "지뢰찾기", index: "02", color: "#f2e5c8", action: "깃발", controls: [["CLICK", "칸 열기"], ["우클릭", "깃발 표시"], ["R", "새 보드"]] },
    snake: { title: "스네이크", index: "03", color: "#d5f52a", action: "가속", controls: [["← → ↑ ↓", "방향 전환"], ["SPACE", "잠깐 가속"], ["P", "일시정지"]] },
    game2048: { title: "2048", index: "04", color: "#f6a623", action: "랜덤 이동", controls: [["← → ↑ ↓", "타일 이동"], ["SWIPE", "모바일 조작"], ["R", "새 보드"]] },
    breakout: { title: "벽돌깨기", index: "05", color: "#35b9cb", action: "공 발사", controls: [["← →", "패들 이동"], ["SPACE", "공 발사"], ["P", "일시정지"]] },
    memory: { title: "기억력 카드", index: "06", color: "#f35d4c", action: "힌트", controls: [["CLICK", "카드 뒤집기"], ["SPACE", "짧은 힌트"], ["R", "카드 섞기"]] }
  };
  const app = {
    activeKey: "tetris", game: null, score: 0, paused: false, soundOn: true, audio: null, pointerStart: null,
    loadBest(key) { return Number(localStorage.getItem(`playroom-best-${key}`) || 0); },
    saveBest(key, score) {
      const current = this.loadBest(key);
      if (score > current) localStorage.setItem(`playroom-best-${key}`, String(Math.floor(score)));
      this.updateTotal();
    },
    setScore(score) {
      this.score = Math.max(0, Math.floor(score));
      elements.score.textContent = formatNumber(this.score);
      elements.best.textContent = formatNumber(Math.max(this.loadBest(this.activeKey), this.score));
      if (this.score > this.loadBest(this.activeKey)) this.saveBest(this.activeKey, this.score);
    },
    addScore(points) { this.setScore(this.score + points); },
    updateTotal() {
      const total = Object.keys(GAME_META).reduce((sum, key) => sum + this.loadBest(key), 0);
      elements.totalBest.textContent = formatNumber(total);
    },
    beep(frequency = 440, duration = 0.05, type = "square", volume = 0.025) {
      if (!this.soundOn) return;
      try {
        this.audio ||= new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = this.audio.createOscillator();
        const gain = this.audio.createGain();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, this.audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + duration);
        oscillator.connect(gain); gain.connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + duration);
      } catch {}
    },
    showMessage(title, eyebrow = "ROUND OVER") {
      elements.messageEyebrow.textContent = eyebrow; elements.messageTitle.textContent = title; elements.message.hidden = false;
      elements.stageStatus.textContent = "FINISHED"; this.saveBest(this.activeKey, this.score); this.beep(150, 0.25, "sawtooth", 0.035);
    },
    hideMessage() { elements.message.hidden = true; },
    setPaused(force) {
      if (!this.game || this.game.finished) return;
      this.paused = typeof force === "boolean" ? force : !this.paused;
      this.game.setPaused?.(this.paused);
      elements.pauseLabel.textContent = this.paused ? "계속하기" : "일시정지";
      elements.stageStatus.textContent = this.paused ? "PAUSED" : "PLAYING";
      elements.pause.querySelector("svg").style.transform = this.paused ? "rotate(90deg)" : "";
      this.beep(this.paused ? 240 : 520);
    },
    renderControls(key) { elements.controlsText.innerHTML = GAME_META[key].controls.map(([keys, label]) => `<p><kbd>${keys}</kbd><span>${label}</span></p>`).join(""); },
    switchGame(key) {
      if (!GAME_META[key] || key === this.activeKey && this.game) return;
      this.game?.destroy?.(); this.hideMessage(); this.activeKey = key; this.paused = false;
      elements.pauseLabel.textContent = "일시정지"; elements.stageStatus.textContent = "PLAYING";
      elements.currentTitle.textContent = GAME_META[key].title; elements.stageLabel.textContent = `BLOCK ${GAME_META[key].index}`;
      elements.touchActionLabel.textContent = GAME_META[key].action; elements.gameMark.style.color = GAME_META[key].color; this.renderControls(key);
      elements.gameCards.forEach((card) => { const selected = card.dataset.game === key; card.classList.toggle("is-selected", selected); card.setAttribute("aria-pressed", String(selected)); });
      this.setScore(0); elements.best.textContent = formatNumber(this.loadBest(key));
      elements.canvas.hidden = ["mines", "game2048", "memory"].includes(key); elements.domGame.hidden = !elements.canvas.hidden; elements.domGame.innerHTML = "";
      this.game = gameFactories[key](); this.game.start(); this.beep(520, 0.045);
    },
    restart() { this.game?.destroy?.(); this.game = null; const key = this.activeKey; this.activeKey = ""; this.switchGame(key); },
    dispatch(action) { if (this.game && elements.message.hidden !== false) this.game.action?.(action); }
  };
  function fitCanvas() {
    const rect = elements.canvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.floor(rect.width * dpr)); const height = Math.max(1, Math.floor(rect.height * dpr));
    if (elements.canvas.width !== width || elements.canvas.height !== height) { elements.canvas.width = width; elements.canvas.height = height; }
    const ctx = elements.canvas.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, width: rect.width, height: rect.height };
  }
  function roundedRect(ctx, x, y, width, height, radius = 4) { ctx.beginPath(); ctx.roundRect(x, y, width, height, Math.min(radius, width / 2, height / 2)); }
  function createTetris() {
    const COLS = 10, ROWS = 20;
    const COLORS = ["", "#35b9cb", "#d5f52a", "#8b67c8", "#f6a623", "#3f84ca", "#f35d4c", "#e2cf35"];
    const SHAPES = [[[1,1,1,1]], [[2,2],[2,2]], [[0,3,0],[3,3,3]], [[4,0,0],[4,4,4]], [[0,0,5],[5,5,5]], [[0,6,6],[6,6,0]], [[7,7,0],[0,7,7]]];
    let board, piece, next, timer, lastDrop, dropEvery, paused = false, finished = false;
    const randomPiece = () => { const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)].map(row => [...row]); return { shape, x: Math.floor((COLS - shape[0].length) / 2), y: -1 }; };
    const collision = (candidate = piece, dx = 0, dy = 0, shape = candidate.shape) => shape.some((row, y) => row.some((value, x) => {
      if (!value) return false; const nx = candidate.x + x + dx, ny = candidate.y + y + dy;
      return nx < 0 || nx >= COLS || ny >= ROWS || (ny >= 0 && board[ny][nx]);
    }));
    const rotate = () => {
      const rotated = piece.shape[0].map((_, index) => piece.shape.map(row => row[index]).reverse());
      for (const kick of [0,-1,1,-2,2]) if (!collision(piece, kick, 0, rotated)) { piece.x += kick; piece.shape = rotated; app.beep(610, 0.025); return; }
    };
    const merge = () => {
      piece.shape.forEach((row,y) => row.forEach((value,x) => { if (value && piece.y + y >= 0) board[piece.y+y][piece.x+x] = value; }));
      let lines = 0;
      for (let y = ROWS - 1; y >= 0; y -= 1) if (board[y].every(Boolean)) { board.splice(y,1); board.unshift(Array(COLS).fill(0)); lines += 1; y += 1; }
      if (lines) { app.addScore([0,100,300,500,800][lines]); dropEvery = Math.max(130, 680 - Math.floor(app.score / 600) * 45); app.beep(860,0.08,"square",0.035); } else app.addScore(8);
      piece = next; piece.x = Math.floor((COLS - piece.shape[0].length) / 2); piece.y = -1; next = randomPiece();
      if (collision(piece)) { finished = true; cancelAnimationFrame(timer); app.showMessage("블록이 가득 찼어요"); }
    };
    const drop = () => { if (!collision(piece,0,1)) piece.y += 1; else merge(); };
    const hardDrop = () => { let distance = 0; while (!collision(piece,0,1)) { piece.y += 1; distance += 1; } app.addScore(distance * 2); merge(); app.beep(160,0.045); };
    const drawBlock = (ctx,x,y,size,color,alpha=1) => { ctx.globalAlpha=alpha; roundedRect(ctx,x+1.5,y+1.5,size-3,size-3,Math.max(2,size*0.09)); ctx.fillStyle=color; ctx.fill(); ctx.strokeStyle="rgba(255,255,255,.34)"; ctx.lineWidth=1; ctx.stroke(); ctx.fillStyle="rgba(255,255,255,.12)"; ctx.fillRect(x+4,y+4,Math.max(1,size-8),2); ctx.globalAlpha=1; };
    const render = () => {
      const {ctx,width,height}=fitCanvas(); ctx.clearRect(0,0,width,height); const cell=Math.floor(Math.min((height-40)/ROWS,(width*0.62)/COLS));
      const boardW=cell*COLS, boardH=cell*ROWS, bx=Math.round((width-boardW)/2+width*0.07), by=Math.round((height-boardH)/2);
      ctx.fillStyle="rgba(4,9,11,.62)"; ctx.fillRect(bx,by,boardW,boardH); ctx.strokeStyle="rgba(242,229,200,.3)"; ctx.strokeRect(bx-.5,by-.5,boardW+1,boardH+1);
      ctx.strokeStyle="rgba(53,185,203,.12)";
      for(let x=1;x<COLS;x++){ctx.beginPath();ctx.moveTo(bx+x*cell,by);ctx.lineTo(bx+x*cell,by+boardH);ctx.stroke();}
      for(let y=1;y<ROWS;y++){ctx.beginPath();ctx.moveTo(bx,by+y*cell);ctx.lineTo(bx+boardW,by+y*cell);ctx.stroke();}
      board.forEach((row,y)=>row.forEach((v,x)=>{if(v)drawBlock(ctx,bx+x*cell,by+y*cell,cell,COLORS[v]);}));
      if(piece){let ghostY=piece.y;while(!collision({...piece,y:ghostY},0,1))ghostY+=1;piece.shape.forEach((row,y)=>row.forEach((v,x)=>{if(!v)return;if(ghostY+y>=0)drawBlock(ctx,bx+(piece.x+x)*cell,by+(ghostY+y)*cell,cell,COLORS[v],.2);if(piece.y+y>=0)drawBlock(ctx,bx+(piece.x+x)*cell,by+(piece.y+y)*cell,cell,COLORS[v]);}));}
      const panelX=Math.max(18,bx-Math.min(150,width*.18));ctx.fillStyle="#b6aa92";ctx.font="700 11px 'Courier New'";ctx.fillText("NEXT BLOCK",panelX,by+16);
      next.shape.forEach((row,y)=>row.forEach((v,x)=>{if(v)drawBlock(ctx,panelX+x*Math.max(14,cell*.62),by+32+y*Math.max(14,cell*.62),Math.max(14,cell*.62),COLORS[v]);}));
    };
    const loop = time => { if(finished)return;if(!paused&&time-lastDrop>dropEvery){drop();lastDrop=time;}render();timer=requestAnimationFrame(loop); };
    return { get finished(){return finished;}, start(){board=Array.from({length:ROWS},()=>Array(COLS).fill(0));piece=randomPiece();next=randomPiece();lastDrop=performance.now();dropEvery=680;app.setScore(0);timer=requestAnimationFrame(loop);}, action(action){if(paused||finished)return;if(action==="left"&&!collision(piece,-1,0))piece.x-=1;if(action==="right"&&!collision(piece,1,0))piece.x+=1;if(action==="down")drop();if(action==="up"||action==="action")rotate();if(action==="space")hardDrop();render();}, setPaused(value){paused=value;}, destroy(){cancelAnimationFrame(timer);} };
  }
  function createMines() {
    const mobile=matchMedia("(max-width: 560px)").matches, cols=mobile?9:12, rows=mobile?12:9, mineCount=mobile?15:18;
    let cells=[],started=false,finished=false,opened=0,flags=0,startTime=0,timer=null,paused=false;
    const indexOf=(x,y)=>y*cols+x;
    const neighbors=index=>{const x=index%cols,y=Math.floor(index/cols),result=[];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx>=0&&nx<cols&&ny>=0&&ny<rows)result.push(indexOf(nx,ny));}return result;};
    const plant=safeIndex=>{const forbidden=new Set([safeIndex,...neighbors(safeIndex)]),candidates=shuffle(cells.map((_,i)=>i).filter(i=>!forbidden.has(i)));candidates.slice(0,mineCount).forEach(i=>cells[i].mine=true);cells.forEach((cell,i)=>cell.count=neighbors(i).filter(n=>cells[n].mine).length);started=true;startTime=Date.now();timer=setInterval(()=>{if(!paused&&!finished)app.setScore(Math.max(0,opened*25-Math.floor((Date.now()-startTime)/1000)));},1000);};
    const renderCell=index=>{const cell=cells[index],button=elements.domGame.querySelector(`[data-index="${index}"]`);if(!button)return;button.className="mine-cell";button.textContent="";button.removeAttribute("data-count");if(cell.open){button.classList.add("revealed");if(cell.mine){button.classList.add("mine");button.textContent="✦";}else if(cell.count){button.textContent=String(cell.count);button.dataset.count=cell.count;}}else if(cell.flag){button.classList.add("flagged");button.textContent="⚑";}};
    const reveal=index=>{const cell=cells[index];if(paused||finished||cell.open||cell.flag)return;if(!started)plant(index);cell.open=true;opened++;renderCell(index);if(cell.mine){finished=true;cells.forEach((item,i)=>{if(item.mine){item.open=true;renderCell(i);}});clearInterval(timer);app.showMessage("지뢰를 밟았어요");return;}app.beep(cell.count?420:610,.025);if(!cell.count)neighbors(index).forEach(reveal);const safeCount=rows*cols-mineCount;if(opened>=safeCount){finished=true;clearInterval(timer);const seconds=Math.max(1,Math.floor((Date.now()-startTime)/1000));app.setScore(5000+flags*20-seconds*8);app.showMessage("모든 지뢰를 찾았어요","BOARD CLEAR");}else app.setScore(opened*25-Math.floor((Date.now()-startTime)/1000));};
    const toggleFlag=index=>{const cell=cells[index];if(paused||finished||cell.open)return;if(!cell.flag&&flags>=mineCount)return;cell.flag=!cell.flag;flags+=cell.flag?1:-1;app.addScore(cell.flag?5:-5);renderCell(index);app.beep(cell.flag?760:280,.025);};
    return {get finished(){return finished;},start(){cells=Array.from({length:rows*cols},()=>({mine:false,count:0,open:false,flag:false}));elements.domGame.innerHTML=`<div class="mines-board" role="grid" aria-label="${cols}열 ${rows}행 지뢰찾기"></div>`;const board=$(".mines-board",elements.domGame);board.style.gridTemplateColumns=`repeat(${cols}, 1fr)`;cells.forEach((_,index)=>{const button=document.createElement("button");button.type="button";button.className="mine-cell";button.dataset.index=index;button.setAttribute("aria-label",`${Math.floor(index/cols)+1}행 ${index%cols+1}열`);button.addEventListener("click",()=>reveal(index));button.addEventListener("contextmenu",event=>{event.preventDefault();toggleFlag(index);});board.append(button);});},action(action){if(action==="action"){const closed=cells.findIndex(cell=>!cell.open&&!cell.flag);if(closed>=0)toggleFlag(closed);}},setPaused(value){paused=value;},destroy(){clearInterval(timer);}};
  }
  function createSnake() {
    const gridX=24,gridY=16;let snake,direction,nextDirection,food,timer,lastStep,speed,paused=false,finished=false,boostUntil=0;
    const spawnFood=()=>{const empty=[];for(let y=0;y<gridY;y++)for(let x=0;x<gridX;x++)if(!snake.some(part=>part.x===x&&part.y===y))empty.push({x,y});food=empty[Math.floor(Math.random()*empty.length)];};
    const step=()=>{direction=nextDirection;const head={x:snake[0].x+direction.x,y:snake[0].y+direction.y};if(head.x<0||head.x>=gridX||head.y<0||head.y>=gridY||snake.some(part=>part.x===head.x&&part.y===head.y)){finished=true;cancelAnimationFrame(timer);app.showMessage("꼬리에 부딪혔어요");return;}snake.unshift(head);if(head.x===food.x&&head.y===food.y){app.addScore(120);speed=Math.max(55,speed-5);spawnFood();app.beep(780,.07);}else{snake.pop();app.addScore(1);}};
    const draw=()=>{const{ctx,width,height}=fitCanvas();ctx.clearRect(0,0,width,height);const cell=Math.floor(Math.min((width-36)/gridX,(height-36)/gridY)),ox=Math.round((width-cell*gridX)/2),oy=Math.round((height-cell*gridY)/2);ctx.fillStyle="rgba(4,9,11,.6)";ctx.fillRect(ox,oy,cell*gridX,cell*gridY);ctx.strokeStyle="rgba(53,185,203,.08)";for(let x=0;x<=gridX;x++){ctx.beginPath();ctx.moveTo(ox+x*cell,oy);ctx.lineTo(ox+x*cell,oy+gridY*cell);ctx.stroke();}for(let y=0;y<=gridY;y++){ctx.beginPath();ctx.moveTo(ox,oy+y*cell);ctx.lineTo(ox+gridX*cell,oy+y*cell);ctx.stroke();}snake.forEach((part,index)=>{roundedRect(ctx,ox+part.x*cell+2,oy+part.y*cell+2,cell-4,cell-4,Math.max(3,cell*.18));ctx.fillStyle=index===0?"#f2e5c8":"#d5f52a";ctx.fill();if(index===0){ctx.fillStyle="#0b1013";const eyeY=oy+part.y*cell+cell*.34;ctx.beginPath();ctx.arc(ox+part.x*cell+cell*.35,eyeY,Math.max(1.5,cell*.06),0,Math.PI*2);ctx.arc(ox+part.x*cell+cell*.66,eyeY,Math.max(1.5,cell*.06),0,Math.PI*2);ctx.fill();}});const fx=ox+food.x*cell+cell/2,fy=oy+food.y*cell+cell/2;ctx.fillStyle="#f35d4c";ctx.beginPath();ctx.arc(fx,fy+cell*.04,cell*.34,0,Math.PI*2);ctx.fill();ctx.fillStyle="#d5f52a";ctx.save();ctx.translate(fx+cell*.12,fy-cell*.32);ctx.rotate(.55);ctx.fillRect(0,0,cell*.12,cell*.3);ctx.restore();};
    const loop=time=>{if(finished)return;const activeSpeed=time<boostUntil?speed*.55:speed;if(!paused&&time-lastStep>=activeSpeed){step();lastStep=time;}draw();timer=requestAnimationFrame(loop);};
    const turn=action=>{const vectors={left:{x:-1,y:0},right:{x:1,y:0},up:{x:0,y:-1},down:{x:0,y:1}},next=vectors[action];if(!next||next.x===-direction.x&&next.y===-direction.y)return;nextDirection=next;};
    return{get finished(){return finished;},start(){snake=[{x:11,y:8},{x:10,y:8},{x:9,y:8},{x:8,y:8}];direction={x:1,y:0};nextDirection=direction;speed=135;lastStep=performance.now();spawnFood();timer=requestAnimationFrame(loop);},action(action){if(paused||finished)return;if(action==="action"||action==="space"){boostUntil=performance.now()+800;app.beep(700,.04);}else turn(action);},setPaused(value){paused=value;},destroy(){cancelAnimationFrame(timer);}};
  }
  function create2048() {
    let board,finished=false,paused=false;
    const emptyCells=()=>board.map((value,index)=>value===0?index:-1).filter(index=>index>=0);
    const addTile=()=>{const empty=emptyCells();if(empty.length)board[empty[Math.floor(Math.random()*empty.length)]]=Math.random()<.9?2:4;};
    const render=()=>{elements.domGame.innerHTML='<div class="board-2048" role="grid" aria-label="2048 게임판"></div>';const root=$(".board-2048",elements.domGame);board.forEach(value=>{const tile=document.createElement("div");tile.className="tile-2048";tile.dataset.value=value||"";tile.textContent=value||"";root.append(tile);});};
    const collapse=line=>{const values=line.filter(Boolean),result=[];let gained=0;for(let i=0;i<values.length;i++){if(values[i]===values[i+1]){const merged=values[i]*2;result.push(merged);gained+=merged;i++;}else result.push(values[i]);}while(result.length<4)result.push(0);return{line:result,gained};};
    const getLine=(direction,index)=>{const line=[];for(let offset=0;offset<4;offset++){let x,y;if(direction==="left"){x=offset;y=index;}if(direction==="right"){x=3-offset;y=index;}if(direction==="up"){x=index;y=offset;}if(direction==="down"){x=index;y=3-offset;}line.push(board[y*4+x]);}return line;};
    const setLine=(direction,index,values)=>values.forEach((value,offset)=>{let x,y;if(direction==="left"){x=offset;y=index;}if(direction==="right"){x=3-offset;y=index;}if(direction==="up"){x=index;y=offset;}if(direction==="down"){x=index;y=3-offset;}board[y*4+x]=value;});
    const hasMoves=()=>{if(emptyCells().length)return true;for(let y=0;y<4;y++)for(let x=0;x<4;x++){const value=board[y*4+x];if(x<3&&board[y*4+x+1]===value)return true;if(y<3&&board[(y+1)*4+x]===value)return true;}return false;};
    const move=direction=>{if(paused||finished)return;const before=board.join(",");let gained=0;for(let i=0;i<4;i++){const result=collapse(getLine(direction,i));setLine(direction,i,result.line);gained+=result.gained;}if(before!==board.join(",")){app.addScore(gained||4);addTile();render();app.beep(gained?720:360,.04);if(board.includes(2048)){finished=true;app.showMessage("2048 완성!","YOU MADE IT");}else if(!hasMoves()){finished=true;app.showMessage("더 움직일 수 없어요");}}};
    return{get finished(){return finished;},start(){board=Array(16).fill(0);addTile();addTile();render();},action(action){move(action==="action"?["left","right","up","down"][Math.floor(Math.random()*4)]:action);},setPaused(value){paused=value;},destroy(){}};
  }
  function createBreakout() {
    let paddle,ball,bricks,timer,lastTime,paused=false,finished=false,launched=false,moveDirection=0;
    const resetBall=()=>{ball={x:.5,y:.77,vx:.26*(Math.random()>.5?1:-1),vy:-.34,r:.014};launched=false;};
    const buildBricks=()=>{bricks=[];const colors=["#f35d4c","#f6a623","#d5f52a","#35b9cb","#8b67c8"];for(let row=0;row<5;row++)for(let col=0;col<10;col++)bricks.push({x:.055+col*.089,y:.09+row*.052,w:.079,h:.034,color:colors[row],alive:true});};
    const update=dt=>{paddle.x=clamp(paddle.x+moveDirection*dt*.00055,.02,.98-paddle.w);if(!launched){ball.x=paddle.x+paddle.w/2;ball.y=paddle.y-ball.r*1.8;return;}ball.x+=ball.vx*dt/1000;ball.y+=ball.vy*dt/1000;if(ball.x<ball.r){ball.x=ball.r;ball.vx=Math.abs(ball.vx);}if(ball.x>1-ball.r){ball.x=1-ball.r;ball.vx=-Math.abs(ball.vx);}if(ball.y<ball.r){ball.y=ball.r;ball.vy=Math.abs(ball.vy);}if(ball.vy>0&&ball.y+ball.r>=paddle.y&&ball.y-ball.r<=paddle.y+paddle.h&&ball.x>=paddle.x&&ball.x<=paddle.x+paddle.w){const hit=(ball.x-(paddle.x+paddle.w/2))/(paddle.w/2);ball.vx=hit*.48;ball.vy=-Math.abs(ball.vy)*1.015;ball.y=paddle.y-ball.r;app.beep(430,.025);}bricks.forEach(brick=>{if(brick.alive&&ball.x+ball.r>brick.x&&ball.x-ball.r<brick.x+brick.w&&ball.y+ball.r>brick.y&&ball.y-ball.r<brick.y+brick.h){brick.alive=false;ball.vy*=-1;app.addScore(50);app.beep(680+Math.random()*180,.035);}});if(bricks.every(brick=>!brick.alive)){finished=true;cancelAnimationFrame(timer);app.addScore(1500);app.showMessage("모든 벽돌을 깼어요","STAGE CLEAR");}else if(ball.y-ball.r>1){paddle.lives--;if(paddle.lives<=0){finished=true;cancelAnimationFrame(timer);app.showMessage("공을 모두 놓쳤어요");}else{resetBall();app.beep(180,.15,"sawtooth");}}};
    const draw=()=>{const{ctx,width,height}=fitCanvas();ctx.clearRect(0,0,width,height);ctx.fillStyle="rgba(4,9,11,.45)";ctx.fillRect(0,0,width,height);bricks.forEach(brick=>{if(!brick.alive)return;roundedRect(ctx,brick.x*width,brick.y*height,brick.w*width,brick.h*height,3);ctx.fillStyle=brick.color;ctx.fill();ctx.strokeStyle="rgba(255,255,255,.28)";ctx.stroke();});roundedRect(ctx,paddle.x*width,paddle.y*height,paddle.w*width,paddle.h*height,99);ctx.fillStyle="#f2e5c8";ctx.fill();ctx.beginPath();ctx.arc(ball.x*width,ball.y*height,ball.r*Math.min(width,height),0,Math.PI*2);ctx.fillStyle="#d5f52a";ctx.fill();ctx.fillStyle="#b6aa92";ctx.font="700 12px 'Courier New'";ctx.fillText(`LIVES  ${"●".repeat(paddle.lives)}`,20,height-20);if(!launched){ctx.fillStyle="#f2e5c8";ctx.font=`900 ${Math.max(16,Math.min(28,width*.035))}px Arial`;ctx.textAlign="center";ctx.fillText("SPACE 또는 공 발사 버튼",width/2,height*.57);ctx.textAlign="left";}};
    const loop=time=>{if(finished)return;const dt=Math.min(32,time-lastTime||16);lastTime=time;if(!paused)update(dt);draw();timer=requestAnimationFrame(loop);};
    return{get finished(){return finished;},start(){paddle={x:.41,y:.88,w:.18,h:.022,lives:3};buildBricks();resetBall();lastTime=performance.now();timer=requestAnimationFrame(loop);},action(action){if(paused||finished)return;if(action==="left")paddle.x=clamp(paddle.x-.06,.02,.98-paddle.w);else if(action==="right")paddle.x=clamp(paddle.x+.06,.02,.98-paddle.w);else if(action==="action"||action==="space"||action==="up"){launched=true;app.beep(520,.04);}},keyState(key,active){if(key==="left")moveDirection=active?-1:moveDirection===-1?0:moveDirection;if(key==="right")moveDirection=active?1:moveDirection===1?0:moveDirection;},setPaused(value){paused=value;},destroy(){cancelAnimationFrame(timer);}};
  }
  function createMemory() {
    const symbols=["◆","●","▲","★","✚","⬟"];let deck,selected=[],matches=0,moves=0,locked=false,paused=false,finished=false,timeout=null;
    const render=()=>{elements.domGame.innerHTML='<div class="memory-board" role="grid" aria-label="기억력 카드 게임"></div>';const root=$(".memory-board",elements.domGame);deck.forEach((card,index)=>{const button=document.createElement("button");button.type="button";button.className=`memory-card${card.flipped?" flipped":""}${card.matched?" matched":""}`;button.dataset.index=index;button.setAttribute("aria-label",card.flipped||card.matched?`${card.symbol} 카드`:`뒤집힌 카드 ${index+1}`);button.innerHTML=`<span class="face back"></span><span class="face front">${card.symbol}</span>`;button.addEventListener("click",()=>flip(index));root.append(button);});};
    const flip=index=>{const card=deck[index];if(paused||finished||locked||card.flipped||card.matched)return;card.flipped=true;selected.push(index);render();app.beep(480+selected.length*100,.035);if(selected.length<2)return;moves++;const[first,second]=selected;if(deck[first].symbol===deck[second].symbol){deck[first].matched=true;deck[second].matched=true;selected=[];matches++;app.addScore(Math.max(60,220-moves*4));app.beep(820,.08);render();if(matches===symbols.length){finished=true;app.addScore(Math.max(0,1200-moves*25));setTimeout(()=>app.showMessage("모든 짝을 찾았어요","ALL MATCHED"),350);}}else{locked=true;timeout=setTimeout(()=>{deck[first].flipped=false;deck[second].flipped=false;selected=[];locked=false;app.setScore(Math.max(0,app.score-15));render();},680);}};
    const hint=()=>{if(paused||finished||locked)return;locked=true;const previous=deck.map(card=>card.flipped);deck.forEach(card=>{if(!card.matched)card.flipped=true;});app.setScore(Math.max(0,app.score-40));render();clearTimeout(timeout);timeout=setTimeout(()=>{deck.forEach((card,index)=>{if(!card.matched)card.flipped=previous[index];});selected=[];locked=false;render();},900);};
    return{get finished(){return finished;},start(){deck=shuffle([...symbols,...symbols]).map(symbol=>({symbol,flipped:false,matched:false}));render();},action(action){if(action==="action"||action==="space")hint();},setPaused(value){paused=value;},destroy(){clearTimeout(timeout);}};
  }
  const gameFactories={tetris:createTetris,mines:createMines,snake:createSnake,game2048:create2048,breakout:createBreakout,memory:createMemory};
  const keyToAction={ArrowLeft:"left",ArrowRight:"right",ArrowUp:"up",ArrowDown:"down"," ":"space"};
  document.addEventListener("keydown",event=>{if(["INPUT","TEXTAREA"].includes(event.target.tagName))return;if(event.key.toLowerCase()==="p"){event.preventDefault();app.setPaused();return;}if(event.key.toLowerCase()==="r"){event.preventDefault();app.restart();return;}const action=keyToAction[event.key];if(action){event.preventDefault();app.game?.keyState?.(action,true);if(action!=="left"&&action!=="right"||app.activeKey!=="breakout")app.dispatch(action);}});
  document.addEventListener("keyup",event=>{const action=keyToAction[event.key];if(action)app.game?.keyState?.(action,false);});
  elements.gameCards.forEach(card=>card.addEventListener("click",()=>app.switchGame(card.dataset.game)));
  elements.restart.addEventListener("click",()=>app.restart()); elements.messageRestart.addEventListener("click",()=>app.restart()); elements.pause.addEventListener("click",()=>app.setPaused());
  elements.sound.addEventListener("click",()=>{app.soundOn=!app.soundOn;elements.sound.setAttribute("aria-pressed",String(app.soundOn));app.beep(520,.04);});
  elements.touchButtons.forEach(button=>button.addEventListener("pointerdown",event=>{event.preventDefault();app.dispatch(button.dataset.action);}));
  elements.gameStage.addEventListener("pointerdown",event=>app.pointerStart={x:event.clientX,y:event.clientY});
  elements.gameStage.addEventListener("pointerup",event=>{if(!app.pointerStart||!["snake","game2048"].includes(app.activeKey))return;const dx=event.clientX-app.pointerStart.x,dy=event.clientY-app.pointerStart.y;app.pointerStart=null;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;app.dispatch(Math.abs(dx)>Math.abs(dy)?dx>0?"right":"left":dy>0?"down":"up");});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&app.game&&!app.paused&&!app.game.finished)app.setPaused(true);});
  app.updateTotal(); app.switchGame("tetris");
})();
