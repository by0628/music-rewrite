/* 原始 index.html 行段：1144-1455、1762-1877、2326-2340；歌词实现按原文搬移。 */
export function initLyrics(ctx) {
  /* ---------------- 逐字歌词：网易云 YRC（经 Worker /lyric 取逐字时间轴） ----------------
     命中逐字的歌：当前行拆成逐字 span 逐个点亮；没命中的歌维持原逐行扫光。
     数据只进独立通道，不覆盖 LRCLIB/本地歌词；逐字行渲染时 .cur 的行扫光会被压成 0。 */
  var WORD_API=ctx.SRC_API.replace(/\/resolve$/, '/lyric');
  var wordState=[];
  function wordKey(m){ return 'unsentWordV1:'+ctx.norm(m.artist)+'|'+ctx.norm(m.title); }
  function wordCacheGet(m){
    try{ var d=JSON.parse(localStorage.getItem(wordKey(m))||'null');
      if(d && d.lines && d.lines.length) return d.lines;
    }catch(e){}
    return null;
  }
  function wordCacheSet(m, lines){
    try{ localStorage.setItem(wordKey(m), JSON.stringify({lines:lines})); }catch(e){}
  }
  /* 正在唱的那一行：换行/刷新时给 .cur 拆逐字 span，并记下它属于哪个容器 */
  function paintWordLine(container){
    if(!ctx.ap) return false;
    var st=ctx.lyrState[ctx.curIdx]; if(!st || !st.lines || !st.lines.length) return false;
    var t=(ctx.ap.audio.currentTime||0)+curLrcOff();
    var lo=0, hi=st.lines.length-1, idx=-1;
    while(lo<=hi){ var mid=(lo+hi)>>1; if(st.lines[mid].t<=t){ idx=mid; lo=mid+1; } else hi=mid-1; }
    if(idx<0) return false;
    var line=st.lines[idx]; if(!line.words || !line.words.length) return false;
    var ps=container.querySelectorAll('p');
    if(idx>=ps.length) return false;
    var p=ps[idx];
    if(p.getAttribute('data-w')===String(idx)) return true;
    p.setAttribute('data-w', idx);
    p.style.backgroundImage='none'; /* 逐字模式下关掉整行扫光背景，避免两套效果打架 */
    p.textContent='';
    line.words.forEach(function(w){
      var s=document.createElement('span'); s.className='wd'; s.textContent=w.w;
      p.appendChild(s);
    });
    /* 点歌词行跳转沿用原行逻辑（原 buildLines 的点击是走 textContent 建的，这里补回） */
    p.addEventListener('click', function(){ if(ctx.ap){ ctx.ap.audio.currentTime=Math.max(0, line.t-curLrcOff())+0.01; ctx.ap.play(); } });
    return true;
  }
  var wordTickBusy=false;
  function wordTick(){
    if(wordTickBusy) return; wordTickBusy=true;
    try{
      var st=ctx.lyrState[ctx.curIdx];
      var has=!!(st && st.lines && st.lines.length && st.lines.some(function(l){ return l.words; }));
      [ctx.lrcScroll, ctx.stageScroll].forEach(function(c){
        if(!has) return;
        if(paintWordLine(c)){
          var cur=c.querySelector('p.cur'); if(!cur) return;
          cur.style.setProperty('--p','0%'); /* 当前行改逐字点亮，压掉整行扫光 */
          var t=(ctx.ap.audio.currentTime||0)+curLrcOff();
          var spans=cur.querySelectorAll('.wd');
          var line=st.lines[ctx.curLine];
          if(!line || !line.words) return;
          line.words.forEach(function(w, wi){
            var s=spans[wi]; if(!s) return;
            var on = t*1000 >= w.t + Math.max(60, w.d*0.35);
            /* 未唱的字必须显式给暗色：.cur 行的文字填充默认是透明的（给扫光渐变让路），不给色就会隐形 */
            s.style.color = on ? 'var(--accent-d)' : 'var(--sweep-dim)';
            s.style.webkitTextFillColor = on ? 'var(--accent-d)' : 'var(--sweep-dim)';
          });
        }
      });
    }catch(e){}
    wordTickBusy=false;
  }
  setInterval(wordTick, 90);
  /* 取逐字歌词：缓存 → Worker；命中后写进 lyrState 行对象并重绘（保持当前行位置） */
  function loadWords(i){
    if(wordState[i] && wordState[i].st!=='idle') return;
    var m=ctx.songMeta[i]; if(!m) return;
    wordState[i]={st:'busy'};
    var apply=function(lines){
      wordState[i]={st:'done'};
      var st=ctx.lyrState[i]; if(!st || !st.lines || !st.lines.length) return;
      var used=0;
      lines.forEach(function(wl){
        var cand=null, bd=1e9;
        st.lines.forEach(function(l){
          var d=Math.abs(l.t - wl.t/1000);
          if(d<bd){ bd=d; cand=l; }
        });
        if(cand && bd<=1.6){ cand.words=wl.words; used++; }
      });
      if(used && i===ctx.curIdx){ buildLines(ctx.lrcScroll, st.lines); buildLines(ctx.stageScroll, st.lines); syncLyrics(true); }
    };
    var cached=wordCacheGet(m);
    if(cached){ apply(cached); return; }
    var ctl=('AbortController' in window)?new AbortController():null;
    var to=setTimeout(function(){ if(ctl) ctl.abort(); }, 12000);
    fetch(WORD_API+'?title='+encodeURIComponent(m.title)+'&artist='+encodeURIComponent(m.artist||''), ctl?{signal:ctl.signal}:{})
      .then(function(r){ return r.json(); })
      .then(function(d){
        clearTimeout(to);
        if(d && d.ok && d.lines && d.lines.length){ wordCacheSet(m, d.lines); apply(d.lines); }
        else wordState[i]={st:'done'};
      })
      .catch(function(){ clearTimeout(to); wordState[i]={st:'done'}; });
  }
  (function(){
    var origLoad=loadLyrics;
    loadLyrics=function(i){ origLoad(i); loadWords(i); };
  })();
  /* ---------------- 歌词兜底：直连落空时经 Worker /lrc 代查 ----------------
     音源点播的歌没有本地 .lrc 垫底，lrclib.net 直连在国内网络又常失败；
     直连链跑完仍没歌词（或 16 秒还没跑完）就向 Worker 要一份，命中写进同一份歌词缓存。 */
  var LRC_API=WORD_API.replace(/\/lyric$/, '/lrc');
  var lrcFbTried={};
  function workerLyrics(i){
    var m=ctx.songMeta[i]; if(!m) return;
    var st=ctx.lyrState[i]; if(!st || (st.lines && st.lines.length)) return;
    var dur=ctx.durations[i]||0;
    fetchT(LRC_API+'?title='+encodeURIComponent(m.title)+'&artist='+encodeURIComponent(m.artist||'')+(dur?'&duration='+Math.round(dur):''), 15000)
      .then(function(r){ return r.json(); })
      .then(function(d){
        if(!d || !d.ok || !d.lines || !d.lines.length) return;
        var st2=ctx.lyrState[i]; if(!st2 || (st2.lines && st2.lines.length)) return;
        var lines=[];
        d.lines.forEach(function(l){ var tx=String(l.text||''); if(tx) lines.push({t:+l.t||0, text:tx}); });
        if(!lines.length) return;
        st2.lines=lines; st2.status='done';
        try{ lrcCacheSet(m, lines); }catch(e){}
        if(i===ctx.curIdx) renderLyrics();
      })
      .catch(function(){});
  }
  (function(){
    var prevLoad=loadLyrics;
    loadLyrics=function(i){
      prevLoad(i);
      if(lrcFbTried[i]) return; lrcFbTried[i]=1;
      setTimeout(function(){ workerLyrics(i); }, 5000);
      setTimeout(function(){ workerLyrics(i); }, 16000);
    };
  })();

  /* ---------------- lyrics engine ---------------- */
  /* 歌词时间对齐：同一首歌不同版本的音频前奏长短不一，歌词常整首差几秒。
     每首歌单独记一个偏移（秒，存本地），比较歌词时间时把播放时间加上它。 */
  var lrcOffStore={};
  try{ lrcOffStore=JSON.parse(localStorage.getItem('unsentLrcOffV1')||'{}')||{}; }catch(e){ lrcOffStore={}; }
  function lrcOffKey(m){ return m ? ((m.artist||'')+'|'+(m.title||'')) : ''; }
  function lrcOffAt(idx){ var m=ctx.songMeta[idx]; var v=m?lrcOffStore[lrcOffKey(m)]:0; return (typeof v==='number'&&isFinite(v))?v:0; }
  function curLrcOff(){ return lrcOffAt(ctx.curIdx); }
  function setLrcOff(idx, v){ var m=ctx.songMeta[idx]; if(!m) return; var k=lrcOffKey(m); v=Math.round(v*10)/10; if(v) lrcOffStore[k]=v; else delete lrcOffStore[k]; try{ localStorage.setItem('unsentLrcOffV1', JSON.stringify(lrcOffStore)); }catch(e){} }
  function parseLrc(text){
    var out=[];
    (text||'').split(/\r?\n/).forEach(function(line){
      var tags=line.match(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/g);
      if(!tags) return;
      var txt=line.replace(/\[[^\]]*\]/g,'').trim();
      tags.forEach(function(tag){
        var m=tag.match(/\[(\d{1,2}):(\d{2}(?:\.\d{1,3})?)\]/);
        out.push({t:parseInt(m[1],10)*60+parseFloat(m[2]), text:txt});
      });
    });
    out.sort(function(a,b){return a.t-b.t;});
    return out.filter(function(l){return l.text;});
  }
  function fetchText(urls){
    var chain=Promise.reject();
    urls.forEach(function(u){
      chain=chain.catch(function(){
        return fetch(u).then(function(r){ if(!r.ok) throw new Error(r.status); return r.text(); });
      });
    });
    return chain;
  }
  /* 带超时的 fetch：国外源（走其官方 CDN 域名直连）不通时 7 秒熔断，不拖住整条链 */
  function fetchT(url, ms){
    ms=ms||7000;
    if(window.AbortController){
      var ctl=new AbortController();
      var t=setTimeout(function(){ try{ ctl.abort(); }catch(e){} }, ms);
      return fetch(url, {signal: ctl.signal}).then(function(r){ clearTimeout(t); return r; }, function(e){ clearTimeout(t); throw e; });
    }
    return fetch(url);
  }
  function lrclibGet(artist,title,dur){
    var q='track_name='+encodeURIComponent(title)+(artist?'&artist_name='+encodeURIComponent(artist):'')+(dur?'&duration='+Math.round(dur):'');
    return fetchT('https://lrclib.net/api/get?'+q).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); });
  }
  function lrclibSearch(artist,title,dur){
    var q='track_name='+encodeURIComponent(title)+(artist?'&artist_name='+encodeURIComponent(artist):'');
    return fetchT('https://lrclib.net/api/search?'+q).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(list){
        var cand=(list||[]).filter(function(x){ return x.syncedLyrics && !x.instrumental; });
        if(!cand.length) return null;
        /* 本地打分匹配：标题/歌手吻合度在浏览器本地算分，再结合时长差挑最像的一条 */
        function score(x){
          var s=0;
          if(ctx.norm(x.trackName||'')===ctx.norm(title)) s+=4;
          if(artist && ctx.norm(artist) && ctx.norm(x.artistName||'')===ctx.norm(artist)) s+=3;
          else if(artist && ctx.norm(artist) && ctx.norm(x.artistName||'').indexOf(ctx.norm(artist))>=0) s+=1;
          return s;
        }
        if(dur){
          cand.sort(function(a,b){
            var dd=Math.abs((a.duration||0)-dur)-Math.abs((b.duration||0)-dur);
            return dd!==0 ? dd : score(b)-score(a);
          });
          if(Math.abs((cand[0].duration||0)-dur)>6) return null;
        }else{
          cand.sort(function(a,b){ return score(b)-score(a); });
          if(score(cand[0])<4) return null;
        }
        return cand[0];
      });
  }
  /* 歌名清洗：去掉（Live）/【】/伴奏等后缀再匹配一次，常能救回对不上的歌 */
  function cleanTitle(t){
    return (t||'').replace(/[\(\[【（][^)\]】）]*[\)\]】）]/g,'').replace(/\s*[-—]\s*(live|伴奏|纯音乐|instrumental).*$/i,'').trim();
  }
  /* 最后备用歌词源：lyrics.ovh（无时间轴纯文本，按时长均分出行时间粗对齐滚动） */
  function ovhLyrics(artist,title,dur){
    if(!artist) return Promise.resolve(null);
    return fetch('https://api.lyrics.ovh/v1/'+encodeURIComponent(artist)+'/'+encodeURIComponent(title))
      .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(d){
        return plainToLines((d && d.lyrics)||'', dur);
      })
      .catch(function(){ return null; });
  }
  /* 无时间轴的纯文本歌词：按时长均分行时间粗对齐（有总比没有强） */
  /* 无轴纯文本粗对齐：把歌词铺进「前奏之后、尾奏之前」的区间。
     旧做法从 0 秒起把整首时长均分给歌词行，开头恒定领先 2~3 行（《唤水剑》即此类）；
     没有真同步轴时只能是估算，但至少不能把前奏算进歌词里。 */
  function plainToLines(txt, dur){
    var ls=(txt||'').split(/\r?\n/).map(function(s){ return s.trim(); })
      .filter(function(s){ return s && !/^\[[^\]]*\]$/.test(s)
        && !/^(词|曲|编曲|制作人|演唱|作词|作曲|混音|和声)\s*[:：]/.test(s); });
    if(ls.length<4) return null;
    var D=(dur && isFinite(dur) && dur>0) ? dur : ls.length*4.5;
    var intro=Math.min(D*0.06, 10), outro=Math.min(D*0.05, 8);
    var span=Math.max(1, D-intro-outro);
    return ls.map(function(s,i){ return {t: intro + span*i/Math.max(1,ls.length-1), text:s}; });
  }
  /* LRCLIB 纯文本兜底：有些歌只有 plainLyrics 没有同步轴（例：《唤水剑》），也捞回来用 */
  function lrclibPlain(artist, title, dur){
    return lrclibGet(artist, title, dur)
      .then(function(rec){ return (rec && rec.plainLyrics) ? plainToLines(rec.plainLyrics, dur || rec.duration) : null; })
      .catch(function(){
        var q='track_name='+encodeURIComponent(title)+(artist?'&artist_name='+encodeURIComponent(artist):'');
        return fetchT('https://lrclib.net/api/search?'+q).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
          .then(function(list){
            var cand=(list||[]).filter(function(x){ return x.plainLyrics && !x.instrumental; });
            if(!cand.length) return null;
            if(dur){
              cand.sort(function(a,b){ return Math.abs((a.duration||0)-dur)-Math.abs((b.duration||0)-dur); });
              if(Math.abs((cand[0].duration||0)-dur)>6) return null;
            }
            return plainToLines(cand[0].plainLyrics, dur || cand[0].duration);
          });
      })
      .catch(function(){ return null; });
  }
  /* 歌词来源优先级：本地 .lrc > 本地缓存 > LRCLIB 精确 > LRCLIB 搜索 > LRCLIB 清洗歌名重试 > LRCLIB 纯文本 > lyrics.ovh */
  /* 歌词本地缓存：匹配成功就存浏览器 localStorage，下次进站直接命中、不用再联网等 */
  function lrcCacheGet(meta){
    try{
      var v=localStorage.getItem('unsentLrcV1:'+(meta.artist||'')+'|'+meta.title);
      if(!v) return null;
      var lines=JSON.parse(v);
      return (lines && lines.length) ? lines : null;
    }catch(e){ return null; }
  }
  function lrcCacheSet(meta, lines){
    try{ localStorage.setItem('unsentLrcV1:'+(meta.artist||'')+'|'+meta.title, JSON.stringify(lines)); }catch(e){}
  }
  function loadLyrics(idx){
    var st=ctx.lyrState[idx];
    if(st.status==='loading'||st.status==='done') return;
    st.status='loading';
    var meta=ctx.songMeta[idx], dur=ctx.durations[idx];
    var jobs=[];
    if(meta.lrcFile){
      /* 歌词换版时字节数会变：拉取地址带 ?v=尺寸，绕开 CDN 与浏览器对旧 .lrc 的长缓存 */
      var lrcSrcs=ctx.sourcesFor(encodeURIComponent(meta.lrcFile));
      if(meta.lrcSize) lrcSrcs=lrcSrcs.map(function(u){ return u+'?v='+meta.lrcSize; });
      jobs.push(fetchText(lrcSrcs).then(parseLrc));
    }
    jobs.push(Promise.resolve(lrcCacheGet(meta)));
    jobs.push(
      lrclibGet(meta.artist, meta.title, dur)
        .then(function(rec){ return rec && rec.syncedLyrics ? parseLrc(rec.syncedLyrics) : null; })
        .catch(function(){ return lrclibSearch(meta.artist, meta.title, dur).then(function(rec){ return rec ? parseLrc(rec.syncedLyrics) : null; }); })
        .catch(function(){ return null; })
    );
    var cleaned=cleanTitle(meta.title);
    if(cleaned && cleaned!==meta.title){
      jobs.push(
        lrclibGet(meta.artist, cleaned, dur)
          .then(function(rec){ return rec && rec.syncedLyrics ? parseLrc(rec.syncedLyrics) : null; })
          .catch(function(){ return lrclibSearch(meta.artist, cleaned, dur).then(function(rec){ return rec ? parseLrc(rec.syncedLyrics) : null; }); })
          .catch(function(){ return null; })
      );
    }
    jobs.push(lrclibPlain(meta.artist, meta.title, dur));
    jobs.push(ovhLyrics(meta.artist, meta.title, dur));
    var approxStart=jobs.length-2; /* 最后两档是粗对齐兜底，命中的不进缓存，留机会给精准同步版 */
    (function next(j){
      if(j>=jobs.length){ st.status='done'; if(!st.lines) st.lines=[]; renderLyrics(); return; }
      jobs[j].then(function(lines){
        if(lines && lines.length){
          st.status='done'; st.lines=lines;
          if(j<approxStart) lrcCacheSet(meta, lines);
          renderLyrics();
        }
        else next(j+1);
      }).catch(function(){ next(j+1); });
    })(0);
  }
  var panelDotsLine=null;
  function buildLines(container, lines){
    container.innerHTML='';
    if(container===ctx.lrcScroll){
      panelDotsLine=document.createElement('div');
      panelDotsLine.className='dotsline';
      panelDotsLine.innerHTML='<span></span><span></span><span></span>';
      container.appendChild(panelDotsLine);
    }
    lines.forEach(function(l,i){
      var p=document.createElement('p');
      p.textContent=ctx.T(l.text);
      p.addEventListener('click', function(){ if(ctx.ap){ ctx.ap.audio.currentTime=Math.max(0, l.t-curLrcOff())+0.01; ctx.ap.play(); } });
      container.appendChild(p);
    });
  }
  function renderLyrics(){
    var st=ctx.lyrState[ctx.curIdx];
    ctx.curLine=-1;
    sweepLast={i:-1,p:-1};
    if(!st || st.status!=='done'){
      if(window.__lrcToolsEl) __lrcToolsEl.style.display='none';
      ctx.lrcPanel.style.display='none'; ctx.lrcNote.style.display='none'; ctx.stageNote.style.display='none';
      ctx.setMsLine(''); return;
    }
    if(!st.lines.length){
      if(window.__lrcToolsEl) __lrcToolsEl.style.display='none';
      ctx.lrcPanel.style.display='none';
      ctx.lrcNote.textContent=ctx.T('这首歌还没有歌词 · 纯享旋律');
      ctx.lrcNote.style.display='block';
      ctx.stageNote.style.display='flex';
      ctx.stageScroll.innerHTML='';
      ctx.setMsLine(''); return;
    }
    ctx.lrcNote.style.display='none'; ctx.stageNote.style.display='none';
    if(window.__lrcToolsEl){ __lrcToolsEl.style.display='flex'; paintLrcOff(); }
    buildLines(ctx.lrcScroll, st.lines);
    buildLines(ctx.stageScroll, st.lines);
    ctx.lrcPanel.style.display='block';
    syncLyrics(true);
  }
  function centerLine(container, wrap, i){
    var el=container.querySelectorAll('p')[i]; if(!el) return;
    var y=el.offsetTop - wrap.clientHeight/2 + el.clientHeight/2;
    container.style.transform='translateY('+(-y)+'px)';
  }
  function syncLyrics(force){
    if(!ctx.ap) return;
    var st=ctx.lyrState[ctx.curIdx];
    var t=ctx.ap.audio.currentTime||0, d=ctx.ap.audio.duration||0;
    if(d>0) ctx.stageBarFill.style.width=(t/d*100)+'%';
    var lt=t+curLrcOff(); /* 歌词判定用对齐后的时间 */
    /* 间奏呼吸点：离下一句还远、且当前句已唱完一会儿时显示 */
    var dotsOn=false;
    if(st && st.lines && st.lines.length){
      var li=-1, lo2=0, hi2=st.lines.length-1;
      while(lo2<=hi2){ var md=(lo2+hi2)>>1; if(st.lines[md].t<=lt){ li=md; lo2=md+1; } else hi2=md-1; }
      var nextT = li+1<st.lines.length ? st.lines[li+1].t : Infinity;
      if(li===-1) dotsOn = lt < st.lines[0].t-1.2;
      else dotsOn = (nextT-lt>6) && (lt>st.lines[li].t+3.5);
    }
    if(panelDotsLine) panelDotsLine.classList.toggle('on', dotsOn);
    document.getElementById('stageDots').classList.toggle('on', dotsOn);
    ctx.lrcPanel.classList.toggle('gap', dotsOn);
    if(!st || !st.lines || !st.lines.length) return;
    var lo=0, hi=st.lines.length-1, idx=-1;
    while(lo<=hi){ var mid=(lo+hi)>>1; if(st.lines[mid].t<=lt){ idx=mid; lo=mid+1; } else hi=mid-1; }
    if(idx===ctx.curLine && !force) return;
    ctx.curLine=idx;
    /* 锁屏歌词只在换行时改一次 album，不跟着 100ms 扫光 tick 高频重建 metadata */
    ctx.setMsLine(idx>=0 && st.lines[idx] ? ctx.T(st.lines[idx].text) : '');
    /* 换行立刻给新的 .cur 写一次 --p，绕开节流，避免新行停在默认 0% 或沿用上一行的值 */
    sweepTick(true);
    [ctx.lrcScroll, ctx.stageScroll].forEach(function(container){
      var li2=0;
      for(var i=0;i<container.children.length;i++){
        var el=container.children[i];
        if(el.tagName!=='P') continue;
        el.className = li2===idx ? 'cur' : (Math.abs(li2-idx)<=2 ? 'near' : '');
        li2++;
      }
    });
    if(idx>=0){
      centerLine(ctx.lrcScroll, ctx.lrcPanel, idx);
      centerLine(ctx.stageScroll, document.getElementById('stageBody'), idx);
    }
  }
  setInterval(function(){ syncLyrics(false); }, 200);
  /* 歌词扫光进度：每 100ms 更新当前行点亮比例 --p（只写样式，不动播放链）。
     二分查找与 syncLyrics 用同一套 st.lines[mid].t<=t 判定，保证 .cur 与 --p 指向同一行。
     force=true（换行/切歌）时必定写一次，绕开 0.6% 节流，避免新行停在默认 0% 或沿用旧值。 */
  var sweepLast={i:-1,p:-1};
  function sweepTick(force){
    if(!ctx.ap) return;
    var st=ctx.lyrState[ctx.curIdx]; if(!st || !st.lines || !st.lines.length) return;
    var t=(ctx.ap.audio.currentTime||0)+curLrcOff(), d=ctx.ap.audio.duration||0;
    var lo=0, hi=st.lines.length-1, idx=-1;
    while(lo<=hi){ var mid=(lo+hi)>>1; if(st.lines[mid].t<=t){ idx=mid; lo=mid+1; } else hi=mid-1; }
    if(idx<0){
      /* 前奏还没到第一句：当前行不点亮，清掉旧值 */
      [ctx.lrcScroll, ctx.stageScroll].forEach(function(c){
        var cur=c.querySelector('p.cur'); if(cur) cur.style.setProperty('--p','0%');
      });
      return;
    }
    var start=st.lines[idx].t;
    var end=(idx+1<st.lines.length)?st.lines[idx+1].t:(d||start+5);
    if(end<=start) end=start+0.5;
    var pct=Math.max(0,Math.min(100,(t-start)/(end-start)*100));
    if(!force && idx===sweepLast.i && Math.abs(pct-sweepLast.p)<0.6) return;
    sweepLast={i:idx,p:pct};
    [ctx.lrcScroll, ctx.stageScroll].forEach(function(c){
      var el=c.querySelectorAll('p')[idx]; if(el) el.style.setProperty('--p', pct.toFixed(1)+'%');
    });
  }
  setInterval(function(){ sweepTick(false); }, 100);
  ctx.stageBtn.addEventListener('click', function(){
    ctx.stage.classList.add('open'); document.body.style.overflow='hidden'; syncLyrics(true);
  });
  /* 歌词对齐控件：偏移只作用于当前这首歌，存本地长期记住 */
  var __lrcToolsEl=document.getElementById('lrcTools'); window.__lrcToolsEl=__lrcToolsEl;
  var lrcOffValEl=document.getElementById('lrcOffVal');
  function paintLrcOff(){ if(lrcOffValEl){ var v=curLrcOff(); lrcOffValEl.textContent=(v>0?'+':'')+v.toFixed(1)+'s'; } }
  window.paintLrcOff=paintLrcOff;
  function bumpLrcOff(dv){ setLrcOff(ctx.curIdx, curLrcOff()+dv); paintLrcOff(); syncLyrics(true); sweepTick(true); }
  document.getElementById('lrcBack').addEventListener('click', function(){ bumpLrcOff(-0.5); });
  document.getElementById('lrcFwd').addEventListener('click', function(){ bumpLrcOff(0.5); });
  if(lrcOffValEl) lrcOffValEl.addEventListener('click', function(){ setLrcOff(ctx.curIdx, 0); paintLrcOff(); syncLyrics(true); sweepTick(true); });
  function closeStage(){ ctx.stage.classList.remove('open'); document.body.style.overflow=''; }
  document.getElementById('stageClose').addEventListener('click', closeStage);
  document.addEventListener('keydown', function(e){ if(e.key==='Escape') closeStage(); });

  ctx.fetchT=fetchT; ctx.fetchText=fetchText; ctx.parseLrc=parseLrc; ctx.cleanTitle=cleanTitle;
  ctx.plainToLines=plainToLines; ctx.loadLyrics=loadLyrics; ctx.lrcCacheGet=lrcCacheGet; ctx.lrcCacheSet=lrcCacheSet;
  ctx.buildLines=buildLines; ctx.renderLyrics=renderLyrics; ctx.syncLyrics=syncLyrics; ctx.sweepTick=sweepTick;
  ctx.curLrcOff=curLrcOff; ctx.setLrcOff=setLrcOff; ctx.paintLrcOff=paintLrcOff; ctx.paintWordLine=paintWordLine; ctx.loadWords=loadWords;
}
