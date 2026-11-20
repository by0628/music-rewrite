/* 原始 index.html 行段：832-1142；逻辑按原文搬移。 */
export function initSearch(ctx) {
  /* ---------------- 搜索台：搜库外歌曲出候选列表，点哪首播哪首（Worker v2） ----------------
     Worker 还是 v1 时 /search、/play 不存在，自动退回 /resolve 直达取链，功能不中断。 */
  (function(){
    var deck=document.getElementById('deck'); if(!deck) return;
    var qIn=document.getElementById('deckQ'), goBtn=document.getElementById('deckGo'),
        resBox=document.getElementById('deckRes'), msg=document.getElementById('deckMsg');
    var API_BASE=ctx.SRC_API.replace(/\/resolve$/, '');
    var TT=function(s){ return window.T ? window.T(s) : s; };
    var libN=-1;
    function say(s){ msg.textContent=TT(s); }
    function busy(b){ goBtn.disabled=b; goBtn.textContent=TT(b?'搜索中…':'搜索'); }
    say('搜歌名或歌手，库里没有的也能播；点歌手名看他的歌。');
    function fetchJ(url, ms){
      var ctl=('AbortController' in window)?new AbortController():null;
      var to=setTimeout(function(){ if(ctl) ctl.abort(); }, ms);
      return fetch(url, ctl?{signal:ctl.signal}:{}).then(function(r){ return r.json(); })
        .then(function(d){ clearTimeout(to); return d; })
        .catch(function(e){ clearTimeout(to); throw e; });
    }
    function playerReady(){
      if(typeof ctx.ap==='undefined' || !ctx.ap || !ctx.ap.list){ say('播放器还没就绪，等歌单加载完再试'); return false; }
      if(libN<0) libN=ctx.ap.list.audios.length;
      return true;
    }
    function findIdx(title, artist){
      for(var i=0;i<ctx.songMeta.length;i++){
        if(ctx.songMeta[i].title===title && (ctx.songMeta[i].artist||'')===(artist||'')) return i;
      }
      return -1;
    }
    /* 把一首远程歌放进播放器：库里有→切过去；点过→换新地址；新的→追加到列表末尾 */
    function coverRetry(idx){
      [4500, 11000].forEach(function(ms){
        setTimeout(function(){
          var st=ctx.coverState[idx];
          if(st && !st.done){ st.triedDur=false; st.triedNoDur=false; ctx.loadCover(idx, !!(typeof ctx.durations!=='undefined' && ctx.durations[idx])); }
        }, ms);
      });
      /* QQ 封面搜索对部分网络出口直接返回空（海外出口尤甚）：最后用 iTunes 兜底捞一次，歌名+歌手全中才用 */
      setTimeout(function(){
        var st=ctx.coverState[idx]; if(!st || st.done) return;
        var m=ctx.songMeta[idx]; if(!m || typeof ctx.itunesCover!=='function') return;
        ctx.itunesCover(m, (typeof ctx.durations!=='undefined' && ctx.durations[idx]) || null)
          .then(function(u){ return u || ctx.itunesCover(m, null); })
          .then(function(u){
            if(u && !ctx.coverState[idx].done){
              ctx.coverState[idx].done=true;
              try{ localStorage.setItem('unsentCovV1:'+(m.artist||'')+'|'+m.title, u); }catch(e){}
              ctx.applyCover(idx, u);
            }
          }).catch(function(){});
      }, 15000);
    }
    function addRemote(title, artist, url){
      var found=findIdx(title, artist);
      if(found>=0 && found<libN){ ctx.ap.list.switch(found); ctx.ap.play(); say('库里就有这首，已经切过去播了'); return; }
      if(found>=libN){
        ctx.songSources[found]=[url]; ctx.srcState[found]={st:'ok', url:url};
        ctx.ap.list.audios[found].url=url;
        ctx.ap.list.switch(found); ctx.ap.play();
        say('已重新取链：'+title+(artist?' - '+artist:''));
        coverRetry(found);
      }else{
        var idx=ctx.ap.list.audios.length;
        ctx.songMeta.push({artist:artist, title:title, file:null, lrcFile:null, lrcSize:0, cover:null});
        ctx.songSources.push([url]);
        ctx.lyrState.push({status:'idle', lines:null});
        ctx.coverState.push({done:false, triedNoDur:false, triedDur:false});
        ctx.srcState.push({st:'ok', url:url});
        ctx.ap.list.add([{name:title, artist:artist||'音源', url:url}]);
        ctx.ap.list.switch(idx); ctx.ap.play();
        say('已点上：'+title+(artist?' - '+artist:'')+'（音源直连）');
        coverRetry(idx);
      }
      if(window.__unsentAddRecent) window.__unsentAddRecent(title, artist);
    }
    function directResolve(title, artist){
      say('正在向音源找《'+title+'》，最慢十几秒…');
      function got(d){
        var ar=artist;
        if(!ar && d.matched && d.matched.indexOf(' - ')>0) ar=d.matched.slice(d.matched.indexOf(' - ')+3);
        addRemote(title, ar, d.url);
        return true;
      }
      function viaLocal(){
        say('音源中转连不上，改走本地直连找《'+title+'》…');
        return ctx.localResolve(title, artist||'').then(function(d){
          if(d && d.ok && d.url) return got(d);
          say('音源没找到这首：换个歌名，或把歌手也带上再试');
          return false;
        }).catch(function(){ say('取链超时或网络不通，稍等再试一次'); return false; });
      }
      return fetchJ(ctx.SRC_API+'?title='+encodeURIComponent(title)+'&artist='+encodeURIComponent(artist||''), 20000)
        .then(function(d){
          if(!d || !d.ok || !d.url) return viaLocal();
          return got(d);
        })
        .catch(function(){ return viaLocal(); });
    }
    function playItem(it, row){
      if(!playerReady()) return;
      if(row) row.classList.add('busy');
      say('正在取《'+it.title+'》的播放地址…');
      function viaLocal(){
        ctx.localPlay(it.source, it.id).then(function(d){
          if(d && d.ok && d.url) addRemote(it.title, it.artist, d.url);
          else directResolve(it.title, it.artist);
        }).catch(function(){ directResolve(it.title, it.artist); });
      }
      fetchJ(API_BASE+'/play?source='+encodeURIComponent(it.source)+'&id='+encodeURIComponent(it.id), 15000)
        .then(function(d){
          if(row) row.classList.remove('busy');
          if(d && d.ok && d.url){ addRemote(it.title, it.artist, d.url); }
          else viaLocal();
        })
        .catch(function(){ if(row) row.classList.remove('busy'); viaLocal(); });
    }
    /* 版本标记：带这些字样的多半不是原版录音室版本，排序时往后放（除非用户搜的就是它） */
    var VER_RE=/live|翻唱|伴奏|钢琴|纯音乐|remix|dj|cover|童声|3d环绕|环绕版|慢版|加速版|降调|升调/i;
    function rankOf(it, q){
      var r=(it.source==='tx'?0:2);
      if(ctx.norm(it.title)===ctx.norm(q)) r-=4;
      var ver=VER_RE.test(it.title||'');
      if(ver && !VER_RE.test(q)) r+=10;
      if(!ver && /[（(][^）)]*版[）)]/.test(it.title||'')) r+=6;
      return r;
    }
    /* 列表封面：缓存 → iTunes 先行（全球出口都快且不挑网络；带时长优先、无时长时歌名+歌手全中才用）
       → QQ 封面引擎兜底（QQ 搜索在部分出口会空等超时，放前面会拖住整条链）。命中写进同一份封面缓存，播放器也受益 */
    function rowCover(img, it){
      var key='unsentCovV1:'+(it.artist||'')+'|'+it.title;
      try{ var c=localStorage.getItem(key); if(c){ img.src=c; return; } }catch(e){}
      var meta={title:it.title, artist:it.artist||''};
      var done=false;
      function use(url){
        if(url && !done){ done=true; img.src=url; try{ localStorage.setItem(key, url); }catch(e){} }
      }
      function viaQQ(){
        if(typeof ctx.qqCover==='function') ctx.qqCover(meta, it.duration||null).then(use).catch(function(){});
      }
      if(typeof ctx.itunesCover==='function'){
        ctx.itunesCover(meta, it.duration||null)
          .then(function(u){ return u || ctx.itunesCover(meta, null); })
          .then(function(u){ if(u) use(u); else viaQQ(); })
          .catch(viaQQ);
      }else viaQQ();
    }
    function renderResults(list, q){
      resBox.innerHTML='';
      if(!list.length){ say('没搜到，换个关键词试试'); return; }
      say('找到 '+list.length+' 首，点任意一首播放');
      var sorted=list.slice().sort(function(a,b){ return rankOf(a,q)-rankOf(b,q); });
      sorted.forEach(function(it){
        var row=document.createElement('div'); row.className='deck-item';
        var img=document.createElement('img'); img.className='thumb'; img.alt=''; img.loading='lazy';
        row.appendChild(img);
        rowCover(img, it);
        var tt=document.createElement('span'); tt.className='tt'; tt.textContent=it.title;
        var ar=document.createElement('span'); ar.className='ar'; ar.textContent=it.artist||'';
        tt.appendChild(ar); row.appendChild(tt);
        var libIdx=(typeof ctx.songMeta!=='undefined') ? findIdx(it.title, it.artist||'') : -1;
        var tag=document.createElement('span'); tag.className='tag';
        if(libIdx>=0 && libN>=0 && libIdx<libN){ tag.textContent='库内'; tag.classList.add('lib'); }
        else tag.textContent=(it.source==='tx'?'QQ':it.source==='kw'?'酷我':it.source==='wy'?'网易云':it.source);
        row.appendChild(tag);
        if(it.duration){ var du=document.createElement('span'); du.className='dur'; du.textContent=ctx.fmtDur(it.duration); row.appendChild(du); }
        row.addEventListener('click', function(){
          if(!playerReady()) return;
          if(libIdx>=0 && libN>=0 && libIdx<libN){ ctx.ap.list.switch(libIdx); ctx.ap.play(); say('库里就有这首，已经切过去播了'); return; }
          playItem(it, row);
        });
        resBox.appendChild(row);
      });
    }
    function doSearch(){
      var q=(qIn.value||'').trim();
      if(!q){ say('先输入歌名或歌手'); qIn.focus(); return; }
      if(!playerReady()) return;
      busy(true); resBox.innerHTML=''; say('正在搜《'+q+'》…');
      function viaLocalSearch(){
        ctx.localSearch(q).then(function(d){
          if(d && d.ok && d.results && d.results.length){ renderResults(d.results, q); }
          else directResolve(q, '');
        }).catch(function(){ directResolve(q, ''); });
      }
      fetchJ(API_BASE+'/search?q='+encodeURIComponent(q), 12000)
        .then(function(d){
          busy(false);
          if(d && d.ok && d.results && d.results.length){ renderResults(d.results, q); }
          else if(d && d.results){ say('没搜到，换个关键词试试'); }
          else viaLocalSearch(); /* Worker 还是 v1 或连不上：本地直连搜 QQ */
        })
        .catch(function(){ busy(false); viaLocalSearch(); });
    }
    goBtn.addEventListener('click', doSearch);
    qIn.addEventListener('keydown', function(e){ if(e.key==='Enter') doSearch(); });
    /* 歌手直达 + 随机/今日 */
    var POOL=[['稻香','周杰伦'],['夜曲','周杰伦'],['江南','林俊杰'],['修炼爱情','林俊杰'],['麻雀','李荣浩'],
      ['光年之外','邓紫棋'],['孤勇者','陈奕迅'],['体面','于文文'],['消愁','毛不易'],['演员','薛之谦'],
      ['丑八怪','薛之谦'],['平凡之路','朴树'],['南山南','马頔'],['成都','赵雷'],['岁月神偷','金玟岐'],
      ['后来','刘若英'],['可惜不是你','梁静茹'],['你要的全拿走','胡彦斌'],['起风了','买辣椒也用券'],['晴天','周杰伦']];
    var moreBtn=document.getElementById('deckMoreBtn'), moreBox=document.getElementById('deckMore');
    if(moreBtn && moreBox){
      moreBtn.addEventListener('click', function(){
        var open=moreBox.classList.toggle('open');
        moreBtn.textContent=open ? '收起 ▴' : '快捷点歌 ▾';
      });
    }
    var chips=document.getElementById('deckChips');
    if(chips){
      chips.addEventListener('click', function(e){
        var b=e.target.closest('button'); if(!b) return;
        if(b.hasAttribute('data-singer')){ qIn.value=b.getAttribute('data-singer'); doSearch(); }
      });
    }
    var rnd=document.getElementById('chipRandom'), dly=document.getElementById('chipDaily');
    if(rnd) rnd.addEventListener('click', function(){
      if(!playerReady()) return;
      var p=POOL[Math.floor(Math.random()*POOL.length)];
      say('随机一首：'+p[0]+' - '+p[1]);
      directResolve(p[0], p[1]);
    });
    if(dly) dly.addEventListener('click', function(){
      if(!playerReady()) return;
      var d=new Date(), seed=d.getFullYear()*372+(d.getMonth()+1)*31+d.getDate();
      var p=POOL[seed%POOL.length];
      say('今日推荐：'+p[0]+' - '+p[1]);
      directResolve(p[0], p[1]);
    });
  })();

  /* ---------------- 工具条：下载 / 复制歌名 / 线路状态 / 最近点歌 ---------------- */
    /* 把工具条迁进播放器卡片内部：播放器是异步生成的（曲库慢时十几秒才出来），
       一次性等待会错过；改由下面的常驻徽标轮询每 1.5 秒检查一次，没到位就搬 */
    function relocateTools(){
      var apEl=document.querySelector('.aplayer'), tr=document.getElementById('toolRow');
      if(apEl && tr && tr.parentNode!==apEl){ apEl.appendChild(tr); tr.classList.add('in-player'); }
    }
  (function(){
    var TT=function(s){ return window.T ? window.T(s) : s; };
    var tmsg=document.getElementById('toolMsg');
    function toolSay(s){ if(tmsg) tmsg.textContent=TT(s); }
    var kd=document.getElementById('kickDate');
    if(kd){
      var d=new Date(), w='日一二三四五六'[d.getDay()], h=d.getHours();
      kd.textContent=' · 周'+w+((h>=22||h<5)?' 夜':'');
    }
    /* 最近点歌（只存歌名歌手，不存地址） */
    var RKEY='unsentRecentV1', rBox=document.getElementById('deckRecent');
    function readRecent(){ try{ return JSON.parse(localStorage.getItem(RKEY)||'[]'); }catch(e){ return []; } }
    function renderRecent(){
      if(!rBox) return;
      var list=readRecent(); rBox.innerHTML='';
      if(!list.length) return;
      var lab=document.createElement('span'); lab.className='rc-lab'; lab.textContent=TT('最近点过'); rBox.appendChild(lab);
      list.forEach(function(it){
        var b=document.createElement('button'); b.type='button'; b.textContent=it.t;
        b.addEventListener('click', function(){
          var q=document.getElementById('deckQ'), g=document.getElementById('deckGo');
          if(q && g){ q.value=it.t; g.click(); }
        });
        rBox.appendChild(b);
      });
    }
    window.__unsentAddRecent=function(title, artist){
      try{
        var list=readRecent().filter(function(it){ return !(it.t===title && it.a===(artist||'')); });
        list.unshift({t:title, a:artist||''});
        localStorage.setItem(RKEY, JSON.stringify(list.slice(0,6)));
        renderRecent();
      }catch(e){}
    };
    renderRecent();
    /* 下载 / 复制 */
    var dl=document.getElementById('dlBtn'), cp=document.getElementById('cpBtn');
    if(dl) dl.addEventListener('click', function(){
      if(typeof ctx.ap==='undefined' || !ctx.ap || !ctx.ap.audio){ toolSay('播放器还没就绪'); return; }
      var i=ctx.ap.list.index, m=ctx.songMeta[i]; if(!m){ toolSay('先选一首歌'); return; }
      var url=ctx.ap.audio.currentSrc || (ctx.ap.list.audios[i] && ctx.ap.list.audios[i].url) || '';
      if(!url){ toolSay('这首还没开始播，先点开它再下载'); return; }
      var a=document.createElement('a');
      a.href=url; a.target='_blank'; a.rel='noopener';
      a.download=(m.artist?m.artist+' - ':'')+m.title;
      document.body.appendChild(a); a.click(); a.remove();
      toolSay('已打开这首的音频地址，在新页里保存即可');
    });
    if(cp) cp.addEventListener('click', function(){
      if(typeof ctx.ap==='undefined' || !ctx.ap){ return; }
      var m=ctx.songMeta[ctx.ap.list.index]; if(!m) return;
      var s=(m.artist?m.artist+' - ':'')+m.title;
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(s).then(function(){ toolSay('已复制：'+s); }, function(){ toolSay(s); });
      }else toolSay(s);
    });
    /* 线路状态：轮询当前音频地址，判断走的哪条线 */
    var badge=document.getElementById('srcBadge'), lastBadge='';
    function lineOf(u){
      if(!u) return '—';
      if(u.indexOf('qqmusic.qq.com')>=0) return '音源 · QQ';
      if(u.indexOf('kuwo.cn')>=0) return '音源 · 酷我';
      if(u.indexOf('126.net')>=0) return '音源 · 网易云';
      if(u.indexOf('jsdelivr')>=0 || u.indexOf('statically')>=0 || u.indexOf('githubusercontent')>=0 || u.indexOf('github.io')>=0) return '仓库线路';
      return '仓库线路';
    }
    setInterval(function(){
      relocateTools();
      if(!badge || typeof ctx.ap==='undefined' || !ctx.ap || !ctx.ap.audio) return;
      var t='当前线路 · '+lineOf(ctx.ap.audio.currentSrc||'');
      if(t!==lastBadge){ lastBadge=t; badge.textContent=TT(t); }
    }, 1500);
  })();

  ctx.relocateTools=relocateTools;
}
