/* 原始 index.html 行段：2342-2877；逻辑按原文搬移。 */
export function initPlayer(ctx) {
  /* ---------------- playlist ---------------- */
  var mainSha=null; /* 已弃用：不再调 branches 取 sha，jsDelivr 只用 @main 线路（保留变量防旧引用报错） */
  /* 站内清单 playlist.json 是主源：与页面同源（GitHub Pages 直发）、不限流、永远完整，
     由仓库的 GitHub Action 在 songs/ 有变动时自动重建。
     jsDelivr 的包清单在仓库超 50MB 后已被其停更（冻结在第一首歌），只能当最后兜底，绝不能缓存它的结果 */
  function listViaManifest(){
    return ctx.fetchT('playlist.json?ts='+Math.floor(Date.now()/60000), 9000)
      .then(function(r){ if(!r.ok) throw new Error('manifest '+r.status); return r.json(); })
      .then(function(d){
        var names=[];
        (d||[]).forEach(function(f){
          if(f && f.name) names.push({name:f.name, size:f.size||0});
        });
        if(!names.length) throw new Error('empty');
        return names;
      });
  }
  function listViaJsdelivr(){
    return ctx.fetchT('https://data.jsdelivr.com/v1/packages/gh/'+ctx.OWNER+'/'+ctx.REPO+'@main?structure=flat', 9000)
      .then(function(r){ if(!r.ok) throw new Error('jsd '+r.status); return r.json(); })
      .then(function(d){
        var names=[];
        (d.files||[]).forEach(function(f){
          var prefix='/'+ctx.DIR+'/';
          if(f.name.indexOf(prefix)!==0) return;
          var rest=f.name.slice(prefix.length);
          if(rest && rest.indexOf('/')<0) names.push({name:rest, size:f.size||0});
        });
        if(!names.length) throw new Error('empty');
        return names;
      });
  }
  function listViaGithub(){
    /* 一次 trees 调用同时拿到文件名和大小；原来的 contents+branches 两次调用太费匿名限额（60 次/小时）。
       带 9 秒超时：国内网络下 api.github.com 卡住时不能把整张歌单拖死 */
    return ctx.fetchT(ctx.API+'/git/trees/main?recursive=1', 9000)
      .then(function(r){ if(!r.ok) throw new Error('tree '+r.status); return r.json(); })
      .then(function(d){
        var out=[], prefix=ctx.DIR+'/';
        (d.tree||[]).forEach(function(it){
          if(it.type!=='blob' || it.path.indexOf(prefix)!==0) return;
          var rest=it.path.slice(prefix.length);
          if(rest && rest.indexOf('/')<0) out.push({name:rest, size:it.size||0});
        });
        if(!out.length) throw new Error('empty');
        return out;
      });
  }
  /* 三路清单取并集：站内 playlist.json（主源，完整不限流）+ GitHub trees（实时，刚传的新歌靠它立刻出现）
     + jsDelivr（已被停更、只剩第一首歌，仅作前两路全挂时的最后兜底）。
     关键规矩：只有主源或 GitHub 任一成功，结果才算「完整」才准写缓存；
     只剩 jsDelivr 兜底的残缺歌单绝不缓存——旧版就是把一首歌的残缺结果写进缓存，才会一直只剩一首 */
  function settle(p){ return p.then(function(v){ return {ok:true, v:v}; }, function(){ return {ok:false}; }); }
  /* 歌单缓存：10 分钟内重复打开直接用缓存（0 次接口调用）；拉取失败/被限流时回退缓存渲染旧歌单，不让页面空着。
     带 ?v= 的链接（自测新歌时用）强制绕过缓存拿最新清单。
     V2 换键：V1 可能已被旧逻辑用一首歌的残缺清单毒化，直接弃用 */
  var LIST_KEY='unsentListV2';
  function readListCache(){
    try{ localStorage.removeItem('unsentListV1'); }catch(e){}
    try{ var o=JSON.parse(localStorage.getItem(LIST_KEY)||'null');
      if(o && o.files && o.files.length) return o;
    }catch(e){}
    return null;
  }
  function fetchListUnion(){
    return Promise.all([settle(listViaManifest()), settle(listViaGithub()), settle(listViaJsdelivr())])
      .then(function(rs){
        var complete = rs[0].ok || rs[1].ok;
        var seen={}, names=[];
        rs.forEach(function(r){
          if(!r.ok) return;
          (r.v||[]).forEach(function(it){
            if(!it || !it.name) return;
            if(!seen[it.name]){ seen[it.name]=it; names.push(it); }
            else if(!seen[it.name].size && it.size) seen[it.name].size=it.size; /* 并集时把文件大小也带上，大文件分流要用 */
          });
        });
        if(!names.length) throw new Error('no list');
        if(complete){ try{ localStorage.setItem(LIST_KEY, JSON.stringify({t:Date.now(), files:names})); }catch(e){} }
        return names;
      });
  }
  var cachedList=readListCache();

  /* ================= 雾：新增功能（不碰音频链、不碰歌单数据源、不碰既有播放器逻辑） ================= */
  var FAV_KEY='unsentFavV1', MEM_KEY='unsentPlayV1';
  var favSet={};
  try{
    var favArr=JSON.parse(localStorage.getItem(FAV_KEY)||'[]');
    if(Object.prototype.toString.call(favArr)==='[object Array]') favArr.forEach(function(k){ favSet[k]=true; });
  }catch(e){}
  function favKey(i){ var m=ctx.songMeta[i]; return m ? ((m.artist||'')+'|'+m.title) : ''; }
  function isFav(i){ return !!favSet[favKey(i)]; }
  function saveFav(){ try{ localStorage.setItem(FAV_KEY, JSON.stringify(Object.keys(favSet))); }catch(e){} }
  function heartSVG(){
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4C12 20.4 3.6 14.7 3.6 9.2C3.6 6.6 5.5 4.7 8 4.7C9.7 4.7 11.1 5.6 12 6.9C12.9 5.6 14.3 4.7 16 4.7C18.5 4.7 20.4 6.6 20.4 9.2C20.4 14.7 12 20.4 12 20.4Z"/></svg>';
  }
  /* 歌单行：作者组与「我喜欢的」组共用，右侧细线条爱心 */
  function makeRow(gi, n){
    var TT=function(s){ return window.T ? window.T(s) : s; };
    var r=document.createElement('div'); r.className='grp-row'; r.setAttribute('data-gi',gi);
    r.style.setProperty('--i', n);
    var rawQ=(ctx.songMeta[gi].artist||'')+' '+(ctx.songMeta[gi].title||'');
    r.setAttribute('data-q',(rawQ+' '+TT(rawQ)).replace(/\s+/g,'').toLowerCase());
    var no=document.createElement('span'); no.className='no'; no.textContent=('0'+(n+1)).slice(-2);
    var tt=document.createElement('span'); tt.className='tt'; tt.textContent=TT(ctx.songMeta[gi].title);
    var du=document.createElement('span'); du.className='dur'; du.textContent=ctx.fmtDur(ctx.durations[gi]);
    var fav=document.createElement('button'); fav.className='fav'+(isFav(gi)?' on':''); fav.type='button';
    fav.setAttribute('aria-label', isFav(gi)?'取消收藏':'收藏');
    fav.innerHTML=heartSVG();
    fav.addEventListener('click', function(ev){
      ev.stopPropagation();                 /* 别把收藏点成切歌 */
      var k=favKey(gi);
      if(favSet[k]) delete favSet[k]; else favSet[k]=true;
      saveFav();
      toggleFavButtons(gi);
      refreshFavGroup();                   /* 收藏变化实时更新「我喜欢的」组 */
    });
    r.appendChild(no); r.appendChild(tt); r.appendChild(du); r.appendChild(fav);
    r.addEventListener('click', function(){ if(ctx.ap){ ctx.ap.list.switch(gi); ctx.ap.play(); } });
    return r;
  }
  function toggleFavButtons(gi){
    if(!ctx.groupsEl) return;
    var bs=ctx.groupsEl.querySelectorAll('.fav'), on=isFav(gi);
    for(var i=0;i<bs.length;i++){
      var row=bs[i].closest ? bs[i].closest('.grp-row') : null;
      if(!row || +row.getAttribute('data-gi')!==gi) continue;
      bs[i].classList.toggle('on',on);
      bs[i].setAttribute('aria-label', on?'取消收藏':'收藏');
    }
  }
  function refreshFavGroup(){
    if(!ctx.groupsEl) return;
    var g=ctx.groupElOf('我喜欢的');
    if(!g) return;
    var inner=g.querySelector('.grp-body .grp-inner');
    if(!inner) return;
    inner.innerHTML='';
    var list=[];
    ctx.songMeta.forEach(function(m,i){ if(isFav(i)) list.push(i); });
    var TT=function(s){ return window.T ? window.T(s) : s; };
    if(!list.length){
      var e=document.createElement('div'); e.className='fav-empty';
      e.textContent=TT('还没有收藏的歌'); inner.appendChild(e);
    }else{
      list.forEach(function(gi,n){ inner.appendChild(makeRow(gi,n)); });
    }
    var cnt=g.querySelector('.grp-h .cnt'); if(cnt) cnt.textContent=list.length+' 首';
    ctx.markGroupCurrent();
    ctx.applyFilter();
  }

  /* 1. 播放记忆：记住歌曲序号 / 进度 / 音量；进站只恢复到暂停态，绝不尝试自动播放 */
  var memTimer=0, memRestore=null, memBusy=false, memSeeked=false;
  function readMem(){
    try{ var o=JSON.parse(localStorage.getItem(MEM_KEY)||'null'); if(o && typeof o==='object') return o; }catch(e){}
    return null;
  }
  function saveMem(){
    if(!ctx.ap || memBusy) return;
    /* 进站恢复还没把进度 seek 到位之前，别用 0 把上次的记忆覆盖掉 */
    if(memRestore && !memSeeked) return;
    try{
      localStorage.setItem(MEM_KEY, JSON.stringify({
        i: ctx.ap.list.index|0,
        t: Math.max(0, Math.floor(ctx.ap.audio.currentTime||0)),
        v: (typeof ctx.ap.audio.volume==='number') ? ctx.ap.audio.volume : 0.85
      }));
    }catch(e){}
  }
  function saveMemThrottled(){
    var now=Date.now();
    if(now-memTimer<4000) return;
    memTimer=now; saveMem();
  }
  function initPlayMemory(){
    if(!ctx.ap) return;
    var o=readMem();
    if(o && typeof o.v==='number' && o.v>=0 && o.v<=1){
      try{ if(ctx.ap.volume) ctx.ap.volume(o.v, true); else ctx.ap.audio.volume=o.v; }
      catch(e){ try{ ctx.ap.audio.volume=o.v; }catch(e2){} }
    }
    if(o && typeof o.i==='number' && o.i>=0 && o.i<ctx.songMeta.length){
      memRestore={i:o.i, t:Math.max(0,o.t||0)};
      if(o.i!==ctx.ap.list.index){
        memBusy=true;
        try{ ctx.ap.list.switch(o.i); }catch(e){}
        memBusy=false;
      }
      /* 暂停态下 APlayer 只切列表高亮、不会加载目标歌曲的音频，进度条会对应错误的音频。
         把 audio.src 指到目标歌曲首条线路并 load，保证「那首那秒」落在正确的音频上。
         只操作 HTMLAudioElement，不接 Web Audio API，也不调用 play()。 */
      var srcs=ctx.songSources[o.i];
      if(srcs && srcs.length && ctx.ap.audio){
        try{ ctx.ap.audio.src=srcs[0]; ctx.ap.audio.load(); }catch(e){}
      }
    }
    ctx.ap.audio.addEventListener('timeupdate', saveMemThrottled);
    ctx.ap.audio.addEventListener('volumechange', function(){ saveMem(); });
    ctx.ap.audio.addEventListener('pause', function(){ saveMem(); });
    window.addEventListener('beforeunload', saveMem);
    document.addEventListener('visibilitychange', function(){ if(document.hidden) saveMem(); });
    /* 元数据到位才能 seek；只做一次。浏览器禁止自动播放，这里绝不调用 play()。
       本地/CDN 秒回时 loadedmetadata 可能抢在监听器注册前触发，所以除事件外
       再做一次立即检查 + 短轮询兜底，避免「元数据早就绪却永不 seek」。 */
    var done=false, tries=0;
    function restoreSeek(){
      if(done || !memRestore) return;
      var a=ctx.ap.audio, d=a.duration, t=memRestore.t;
      if(!isFinite(d) || d<=0) return;                  /* 元数据未到位，等下一轮 */
      t=Math.min(t, Math.max(0,d-0.5));
      if(t>0){
        try{ a.currentTime=t; }catch(e){ return; }
        if(Math.abs((a.currentTime||0)-t)>1) return;   /* 浏览器还没接受，下一轮再试 */
      }
      done=true; memSeeked=true;
      try{ a.dispatchEvent(new Event('timeupdate')); }catch(e){}  /* 进度条跟着真实时间刷新 */
    }
    ctx.ap.audio.addEventListener('loadedmetadata', restoreSeek);
    ctx.ap.audio.addEventListener('canplay', restoreSeek);
    restoreSeek();                                     /* 事件已抢跑时立即兜底 */
    var seekTimer=setInterval(function(){
      if(done){ clearInterval(seekTimer); return; }
      if(tries++>40){ clearInterval(seekTimer); memSeeked=true; return; }  /* 最多 8 秒，之后放开保存 */
      restoreSeek();
    }, 200);
  }

  /* 2. 睡眠定时：到点先用 1 秒把音量淡到 0 再 pause；只改 HTMLAudioElement.volume，不碰 Web Audio */
  var sleepMode='0', sleepEnd=0, sleepTick=null, sleepFading=false, sleepEndIdx=-1;
  function sleepLabel(){
    var el=document.getElementById('sleepState'); if(!el) return;
    var txt;
    if(sleepMode==='0') txt='未开启';
    else if(sleepMode==='end') txt='播完这首后停下';
    else{
      var left=Math.max(0, Math.ceil((sleepEnd-Date.now())/1000));
      txt='剩余 '+Math.floor(left/60)+':'+('0'+(left%60)).slice(-2);
    }
    el.textContent=(window.T ? window.T(txt) : txt);
  }
  function markSleep(){
    var seg=document.getElementById('sleepSeg'); if(!seg) return;
    var bs=seg.querySelectorAll('button');
    for(var i=0;i<bs.length;i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-min')===sleepMode);
  }
  function fadeOutAndPause(){
    if(!ctx.ap || sleepFading) return;
    sleepFading=true;
    var v=(typeof ctx.ap.audio.volume==='number') ? ctx.ap.audio.volume : 0.85;
    var t0=Date.now();
    var iv=setInterval(function(){
      var k=Math.min(1,(Date.now()-t0)/1000);
      try{ ctx.ap.audio.volume=Math.max(0, v*(1-k)); }catch(e){}
      if(k>=1){
        clearInterval(iv);
        try{ ctx.ap.pause(); }catch(e){}
        try{ ctx.ap.audio.volume=v; }catch(e){}   /* 恢复音量，下次播放正常 */
        sleepMode='0'; sleepEnd=0; markSleep(); sleepLabel();
        sleepFading=false; saveMem();
      }
    }, 80);
  }
  function setSleep(mode){
    sleepMode=mode||'0'; sleepEnd=0;
    if(sleepTick){ clearInterval(sleepTick); sleepTick=null; }
    if(sleepMode!=='0' && sleepMode!=='end') sleepEnd=Date.now()+parseInt(sleepMode,10)*60000;
    if(sleepMode==='end') sleepEndIdx=ctx.curIdx;
    markSleep(); sleepLabel();
    if(sleepMode!=='0' && sleepMode!=='end'){
      sleepTick=setInterval(function(){
        if(Date.now()>=sleepEnd) fadeOutAndPause(); else sleepLabel();
      }, 1000);
    }
  }
  function initSleep(){
    var seg=document.getElementById('sleepSeg'); if(!seg) return;
    seg.addEventListener('click', function(e){
      var b=e.target.closest ? e.target.closest('button') : null;
      if(b) setSleep(b.getAttribute('data-min')||'0');
    });
    if(ctx.ap) ctx.ap.audio.addEventListener('ended', function(){
      if(sleepMode==='end' && ctx.ap.list.index===sleepEndIdx){ setSleep('0'); fadeOutAndPause(); }
    });
    markSleep(); sleepLabel();
  }

  /* 5. 骨架屏：歌单加载完成前雾面灰条呼吸，完成后淡出（与歌单淡入重叠） */
  function hideSkeleton(){
    var sk=document.getElementById('skeleton');
    if(!sk || sk.getAttribute('data-off')) return;
    sk.setAttribute('data-off','1');
    sk.classList.add('off');
    setTimeout(function(){ sk.style.display='none'; }, 560);
  }

  /* 6. 单曲分享海报：canvas 1080×1440；封面跨域画不进就退回纯文字排版（黑方块），不用任何假图 */
  function roundRectPath(x,l,t,w,h,r){
    x.beginPath(); x.moveTo(l+r,t); x.lineTo(l+w-r,t); x.quadraticCurveTo(l+w,t,l+w,t+r);
    x.lineTo(l+w,t+h-r); x.quadraticCurveTo(l+w,t+h,l+w-r,t+h);
    x.lineTo(l+r,t+h); x.quadraticCurveTo(l,t+h,l,t+h-r);
    x.lineTo(l,t+r); x.quadraticCurveTo(l,t,l+r,t); x.closePath();
  }
  function drawSpaced(x,text,cx,y,sp){
    var chars=String(text||'').split(''), w=[], total=0, i;
    for(i=0;i<chars.length;i++){ var cw=x.measureText(chars[i]).width; w.push(cw); total+=cw; }
    total+=sp*Math.max(0,chars.length-1);
    var px=cx-total/2, prev=x.textAlign;
    x.textAlign='left';
    for(i=0;i<chars.length;i++){ x.fillText(chars[i],px,y); px+=w[i]+sp; }
    x.textAlign=prev;
  }
  function currentLyricLine(){
    var el=document.querySelector('#lrcScroll p.cur');
    var s=el ? (el.textContent||'').replace(/\s+/g,' ').trim() : '';
    if(s.length>26) s=s.slice(0,26)+'…';
    return s;
  }
  function drawPoster(withCover, img, meta, line){
    var W=1080,H=1440,c=document.createElement('canvas'); c.width=W; c.height=H;
    var x=c.getContext('2d');
    var g=x.createLinearGradient(0,0,0,H); g.addColorStop(0,'#e9edeb'); g.addColorStop(1,'#dde3e0');
    x.fillStyle=g; x.fillRect(0,0,W,H);
    var INK='#3a4147', DIM='#7c868d', ACC='#57646c', SER='"Noto Serif SC","Songti SC",serif';
    x.textAlign='center';
    x.fillStyle=DIM; x.font='22px '+SER; drawSpaced(x,'雾 中 来 信',W/2,120,10);
    var CX=(W-720)/2, CY=196;
    x.save(); roundRectPath(x,CX,CY,720,720,28); x.clip();
    if(withCover && img){
      try{ x.drawImage(img,CX,CY,720,720); }
      catch(e){ x.fillStyle='#101216'; x.fillRect(CX,CY,720,720); }
    }else{ x.fillStyle='#101216'; x.fillRect(CX,CY,720,720); }
    x.restore();
    x.strokeStyle='rgba(58,65,71,.10)'; x.lineWidth=1; roundRectPath(x,CX,CY,720,720,28); x.stroke();
    x.fillStyle=INK; x.font='46px '+SER; drawSpaced(x,meta.title||'',W/2,1010,8);
    x.fillStyle=DIM; x.font='26px '+SER; drawSpaced(x,meta.artist||'by0628',W/2,1074,6);
    x.fillStyle=ACC; x.font='28px '+SER; drawSpaced(x,line||'·',W/2,1172,4);
    x.strokeStyle='rgba(58,65,71,.14)'; x.beginPath(); x.moveTo(W/2-90,1238); x.lineTo(W/2+90,1238); x.stroke();
    x.fillStyle=INK; x.font='26px '+SER; drawSpaced(x,'雾中来信',W/2,1314,12);
    x.fillStyle=DIM; x.font='19px '+SER; drawSpaced(x,'by0628.github.io/Music',W/2,1362,3);
    return c;
  }
  function buildPoster(cb){
    var m=ctx.songMeta[ctx.curIdx] || {title:'',artist:''};
    var line=currentLyricLine(), url=m.cover||'';
    if(!url){ cb(drawPoster(false,null,m,line)); return; }
    var im=new Image(); im.crossOrigin='anonymous';
    var settled=false;
    var to=setTimeout(function(){
      if(settled) return; settled=true; cb(drawPoster(false,null,m,line));
    }, 6000);
    im.onload=function(){
      if(settled) return; settled=true; clearTimeout(to);
      var c=drawPoster(true,im,m,line);
      try{ c.toDataURL('image/png'); cb(c); }        /* 画布被跨域污染会在这里抛错 */
      catch(e){ cb(drawPoster(false,null,m,line)); }
    };
    im.onerror=function(){
      if(settled) return; settled=true; clearTimeout(to); cb(drawPoster(false,null,m,line));
    };
    im.src=url;
  }
  function initShare(){
    var btn=document.getElementById('shareBtn'), modal=document.getElementById('shareModal');
    if(!btn || !modal) return;
    var sheet=document.getElementById('shareSheet');
    btn.addEventListener('click', function(){
      var imgEl=document.getElementById('shareImg'), dl=document.getElementById('shareDl');
      buildPoster(function(canv){
        var data=canv.toDataURL('image/png');
        imgEl.src=data; dl.href=data;
        modal.classList.add('open'); modal.setAttribute('aria-hidden','false');
        sheet.classList.remove('mist-in','mist-out'); void sheet.offsetWidth;
        sheet.classList.add('mist-in');
      });
    });
    function close(){
      if(!modal.classList.contains('open')) return;
      sheet.classList.remove('mist-in'); sheet.classList.add('mist-out');
      setTimeout(function(){ modal.classList.remove('open'); modal.setAttribute('aria-hidden','true'); }, 560);
    }
    var cb=document.getElementById('shareClose'); if(cb) cb.addEventListener('click', close);
    modal.addEventListener('click', function(e){ if(e.target===modal) close(); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') close(); });
  }

  /* 8. 每日一首：按本地日期做固定 hash，同一天全天同一首 */
  function dailyIndex(n){
    if(!n) return 0;
    var d=new Date();
    var key=d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2);
    var h=2166136261;
    for(var i=0;i<key.length;i++){ h^=key.charCodeAt(i); h=(h*16777619)>>>0; }
    return h % n;
  }
  function initDaily(){
    var card=document.getElementById('dailyCard'); if(!card) return;
    var i=dailyIndex(ctx.songMeta.length), m=ctx.songMeta[i]; if(!m) return;
    var TT=function(s){ return window.T ? window.T(s) : s; };
    var dv=card.querySelector('.dv');
    if(dv) dv.textContent=TT(m.title)+(m.artist ? ' — '+TT(m.artist) : '');
    card.disabled=false;
    card.addEventListener('click', function(){ if(ctx.ap){ ctx.ap.list.switch(i); ctx.ap.play(); } });
  }

  var listPromise;
  if(cachedList && !/[?&]v=/.test(location.search) && (Date.now()-(cachedList.t||0))<600000){
    listPromise=Promise.resolve(cachedList.files);
  }else{
    listPromise=fetchListUnion().then(null, function(){ if(cachedList) return cachedList.files; throw new Error('no list'); });
  }
  listPromise
    .then(function(files){
      var covers={}, lrcFiles={}, lrcSizes={};
      files.forEach(function(f){
        var e=ctx.ext(f.name);
        if(ctx.IMG.indexOf(e)>=0) covers[ctx.base(f.name)]=ctx.CDN+encodeURIComponent(f.name);
        if(e==='lrc'){ lrcFiles[ctx.base(f.name)]=f.name; lrcSizes[ctx.base(f.name)]=f.size||0; }
      });
      var songs=files.filter(function(f){return ctx.AUDIO.indexOf(ctx.ext(f.name))>=0;})
        .sort(function(a,b){return a.name.localeCompare(b.name,'zh');})
        .map(function(f){
          var b=ctx.base(f.name), nm=ctx.splitName(b);
          var srcs=ctx.sourcesFor(encodeURIComponent(f.name), (f.size||0) >= 20*1024*1024);
          ctx.songSources.push(srcs);
          ctx.songMeta.push({artist:nm.artist, title:nm.title, file:b, lrcFile:lrcFiles[b]||null, lrcSize:lrcSizes[b]||0, cover:covers[b]||null});
          ctx.lyrState.push({status:'idle', lines:null});
          ctx.coverState.push({done:!!covers[b], triedNoDur:false, triedDur:false});
          var s={name:nm.title, artist:nm.artist||'by0628', url:srcs[0]};
          if(covers[b]) s.cover=covers[b];
          return s;
        });
      if(!songs.length){
        ctx.statusEl.textContent=ctx.T('歌单还空着——第一首歌，正在来的路上。');
        return;
      }
      ctx.statusEl.textContent=ctx.T('共 '+songs.length+' 首 · 点开任意一首开始');
      ctx.ap=new window.APlayer({
        container:document.getElementById('player'),
        audio:songs, theme:'#7d8b96', lrcType:0,
        listFolded:false, preload:'metadata', volume:0.85, mutex:true
      });
      /* 当前线路报错就自动顺延到下一条，直到能播为止 */
      var attempts={};
      ctx.ap.audio.addEventListener('error', function(){
        var i=ctx.ap.list.index, srcs=ctx.songSources[i];
        if(!srcs) return;
        var next=(attempts[i]||0)+1;
        if(next>=srcs.length) return;
        attempts[i]=next;
        var resume=!ctx.ap.audio.paused;
        ctx.ap.list.audios[i].url=srcs[next];
        ctx.ap.audio.src=srcs[next];
        if(resume) ctx.ap.play();
      });
      ctx.ap.audio.addEventListener('loadedmetadata', function(){
        ctx.durations[ctx.ap.list.index]=ctx.ap.audio.duration;
        var drow=ctx.groupsEl ? ctx.groupsEl.querySelector('.grp-row[data-gi="'+ctx.ap.list.index+'"] .dur') : null;
        if(drow) drow.textContent=ctx.fmtDur(ctx.ap.audio.duration);
        ctx.loadLyrics(ctx.ap.list.index);
        ctx.loadCover(ctx.ap.list.index, true);
      });
      ctx.ap.on('listswitch', function(e){
        ctx.curIdx=e.index; ctx.curLine=-1;
        saveMem();
        if(sleepMode==='end') sleepEndIdx=ctx.curIdx;
        msSig=''; msAlbum=MS_FALLBACK_ALBUM;  /* 切歌先复位，别把上一首的歌词留在锁屏 */
        ctx.updateMS();                           /* 先写标题/歌手；封面迟到时 applyCover 会再重建一次 */
        ctx.markGroupCurrent();
        ctx.expandGroupForSong(ctx.curIdx);
        stageTitle.textContent=ctx.T(ctx.songMeta[ctx.curIdx] ? (ctx.songMeta[ctx.curIdx].artist ? ctx.songMeta[ctx.curIdx].artist+' - ' : '')+ctx.songMeta[ctx.curIdx].title : '');
        if(window.refreshLangDOM) window.refreshLangDOM();
        ctx.updateDocTitle();
        ctx.renderLyrics();
        ctx.loadLyrics(ctx.curIdx);
        if(ctx.coverState[ctx.curIdx] && !ctx.coverState[ctx.curIdx].done && !(ctx.songMeta[ctx.curIdx] && ctx.songMeta[ctx.curIdx].cover)){
          /* 还没有真封面：每次切到这首都重查一次线上源，不让任何一次网络失败定终身 */
          ctx.coverState[ctx.curIdx].triedDur=false;
          ctx.loadCover(ctx.curIdx, true);
        }else{
          ctx.loadCover(ctx.curIdx, false);
        }
        ctx.vinylize();
        if(ctx.songMeta[ctx.curIdx].cover) ctx.tintFromCover(ctx.songMeta[ctx.curIdx].cover); else ctx.resetTint();
        ctx.applyStageBg();
        ctx.updateMS();
        ctx.warmNext();
        var li=ctx.curIdx; ctx.resolveSrc(li).then(function(u){ if(u) ctx.applySrcNow(li, u); });
      });
      ctx.buildGroups();
      initPlayMemory();
      initSleep();
      initDaily();
      initShare();
      refreshFavGroup();
      ctx.preloadAll();
      ctx.warmNext();
      var idx0=(ctx.ap&&ctx.ap.list&&typeof ctx.ap.list.index==='number')?ctx.ap.list.index:ctx.curIdx;  /* 暂停态下 list.switch 不触发 listswitch 事件，curIdx 还停在 0；以播放器自己的当前序号为准 */
      ctx.curIdx=idx0;
      ctx.resolveSrc(idx0).then(function(u){ if(u) ctx.applySrcNow(idx0, u); });
      var initMeta=ctx.songMeta[idx0]||ctx.songMeta[0];
      stageTitle.textContent=ctx.T((initMeta.artist ? initMeta.artist+' - ' : '')+initMeta.title);
      ctx.updateDocTitle();
      stageBtn.style.display='block';
      ctx.loadCover(0, false);
      ctx.applyStageBg();
      ctx.vinylize();
      ctx.ap.audio.addEventListener('loadedmetadata', function(){ if(window.updateDocTitle) window.updateDocTitle(); });
      ctx.ap.on('play', function(){
        document.body.classList.add('playing');
        if('mediaSession' in navigator) try{ navigator.mediaSession.playbackState='playing'; }catch(e){}
      });
      ctx.ap.on('pause', function(){
        document.body.classList.remove('playing');
        if('mediaSession' in navigator) try{ navigator.mediaSession.playbackState='paused'; }catch(e){}
      });
      if('mediaSession' in navigator){
        try{
          var msA=navigator.mediaSession;
          msA.setActionHandler('play', function(){ ctx.ap.play(); });
          msA.setActionHandler('pause', function(){ ctx.ap.pause(); });
          msA.setActionHandler('previoustrack', function(){ ctx.ap.skipBack(); });
          msA.setActionHandler('nexttrack', function(){ ctx.ap.skipForward(); });
          msA.setActionHandler('seekto', function(d){ if(d && d.seekTime!=null) ctx.ap.audio.currentTime=d.seekTime; });
        }catch(e){}
        ctx.updateMS();
      }
      /* 等元数据给出时长再匹配歌词更准；3.5 秒还没等到就先直接查 */
      setTimeout(function(){ ctx.loadLyrics(ctx.ap.list.index); }, 3500);
    })
    .catch(function(){
      ctx.statusEl.textContent=ctx.T('歌单暂时没打开（网络或接口限流），刷新一次试试。');
      var msg=document.getElementById('skeletonMsg');
      if(msg){ msg.textContent=(window.T?window.T('歌单还没打开 · 刷新一次试试'):'歌单还没打开 · 刷新一次试试'); msg.style.display='block'; }
    });


  ctx.isFav=isFav; ctx.makeRow=makeRow; ctx.hideSkeleton=hideSkeleton;
}
