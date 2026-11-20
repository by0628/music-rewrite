/* 原始 index.html 行段：674-831；逻辑按原文搬移。 */
export function initSource(ctx) {
  var OWNER=ctx.OWNER, REPO=ctx.REPO, DIR=ctx.DIR, CDN=ctx.CDN;
  function ext(name){ var m=name.toLowerCase().match(/\.([a-z0-9]+)$/); return m?m[1]:''; }
  function base(name){ return name.replace(/\.[^.]+$/,''); }
  /* "歌手 - 歌名" 拆分；拆不出就整名当歌名 */
  function splitName(b){
    var i=b.indexOf(' - ');
    if(i>0) return {artist:b.slice(0,i).trim(), title:b.slice(i+3).trim()};
    i=b.indexOf('-');
    if(i>0) return {artist:b.slice(0,i).trim(), title:b.slice(i+1).trim()};
    return {artist:'', title:b};
  }

  var API='https://api.github.com/repos/'+OWNER+'/'+REPO;
  function gh(url){ return fetch(url,{headers:{'Accept':'application/vnd.github+json'}}); }
  /* 每首歌准备多条线路，一条不通自动换下一条 */
  function sourcesFor(enc, big){
    /* 大文件（≥20MB）：jsDelivr 有 20MB 上限、必然 403，跳过它走 Pages/raw，少等两轮失败 */
    if(big){
      return [
        DIR+'/'+enc,
        'https://raw.githubusercontent.com/'+OWNER+'/'+REPO+'/main/'+DIR+'/'+enc,
        'https://cdn.statically.io/gh/'+OWNER+'/'+REPO+'/main/'+DIR+'/'+enc
      ];
    }
    var list=[];
    list.push('https://cdn.jsdelivr.net/gh/'+OWNER+'/'+REPO+'@main/'+DIR+'/'+enc);
    list.push('https://cdn.statically.io/gh/'+OWNER+'/'+REPO+'/main/'+DIR+'/'+enc);
    list.push('https://raw.githubusercontent.com/'+OWNER+'/'+REPO+'/main/'+DIR+'/'+enc);
    list.push(DIR+'/'+enc);
    return list;
  }

  /* ---------------- 音源线路：Worker 中转现查现解析，排在仓库线路之前，失败自动落回 ---------------- */
  var SRC_API='https://music-source.by120628.workers.dev/resolve';
  var srcState=[];
  function prependSrc(i, url){
    var srcs=ctx.songSources[i]; if(!srcs) return;
    if(srcs[0]!==url){
      var ix=srcs.indexOf(url); if(ix>0) srcs.splice(ix,1);
      srcs.unshift(url);
    }
    if(typeof ctx.ap!=='undefined' && ctx.ap && ctx.ap.list && ctx.ap.list.audios && ctx.ap.list.audios[i]){
      if(ctx.ap.list.index!==i || (ctx.ap.audio && ctx.ap.audio.paused)) ctx.ap.list.audios[i].url=url;
    }
  }
  function applySrcNow(i, url){
    if(!ctx.ap || ctx.ap.list.index!==i || !ctx.ap.audio) return;
    var a=ctx.ap.audio;
    if(a.currentTime>3) return; /* 已经听上了就不打断 */
    var wasPaused=a.paused, t=a.currentTime||0;
    ctx.ap.list.audios[i].url=url;
    a.src=url;
    try{ a.currentTime=t; }catch(e){}
    if(!wasPaused) ctx.ap.play();
  }
  function resolveSrc(i){
    var meta=ctx.songMeta[i]; if(!meta) return Promise.resolve('');
    if(srcState[i]){
      if(srcState[i].st==='ok') return Promise.resolve(srcState[i].url);
      if(srcState[i].st==='fail') return Promise.resolve('');
      if(srcState[i].p) return srcState[i].p;
    }
    var ck='unsentSrcV1:'+(meta.artist||'')+'|'+meta.title;
    try{
      var c=JSON.parse(localStorage.getItem(ck)||'null');
      if(c && c.url && (Date.now()-c.t)<50*60000){ srcState[i]={st:'ok', url:c.url}; prependSrc(i, c.url); return Promise.resolve(c.url); }
    }catch(e){}
    var p=new Promise(function(done){
      var finished=false, wDone=false, lDone=false, lStarted=false;
      function win(url){
        if(finished) return; finished=true;
        srcState[i]={st:'ok', url:url};
        try{ localStorage.setItem(ck, JSON.stringify({url:url, t:Date.now()})); }catch(e){}
        prependSrc(i, url);
        done(url);
      }
      function legFail(){
        if(finished || !wDone || !lDone) return;
        finished=true; srcState[i]={st:'fail'}; done('');
      }
      function kickLocal(){
        if(lStarted || finished) return; lStarted=true;
        localResolve(meta.title, meta.artist||'').then(function(d){
          lDone=true;
          if(d && d.ok && d.url) win(d.url); else legFail();
        }).catch(function(){ lDone=true; legFail(); });
      }
      var ctl=('AbortController' in window)?new AbortController():null;
      var to=setTimeout(function(){ if(ctl) ctl.abort(); }, 14000);
      fetch(SRC_API+'?title='+encodeURIComponent(meta.title)+'&artist='+encodeURIComponent(meta.artist||''), ctl?{signal:ctl.signal}:{})
        .then(function(r){ return r.json(); })
        .then(function(d){
          clearTimeout(to); wDone=true;
          if(d && d.ok && d.url) win(d.url); else { kickLocal(); legFail(); }
        })
        .catch(function(){ clearTimeout(to); wDone=true; kickLocal(); legFail(); });
      setTimeout(kickLocal, 5000); /* 中转 5 秒没结果就并行本地直连（不开梯子时中转常连不上） */
    });
    srcState[i]={st:'pending', p:p};
    return p;
  }

  /* ---------------- 本地直连解析：不开梯子时 Worker（workers.dev）在国内常连不上，
     这一套在浏览器里直接问国内接口：QQ 联想搜索（JSONP）→ tang 取链（CORS 全开）；
     酷我按 rid 走 nmobi 取链（CORS 全开）。与 Worker 同一套接口、同一种返回形状。 ---------------- */
  function fetchJT(url, ms){
    var ctl=('AbortController' in window)?new AbortController():null;
    var to=setTimeout(function(){ if(ctl) ctl.abort(); }, ms||9000);
    return fetch(url, ctl?{signal:ctl.signal}:{}).then(function(r){ return r.json(); })
      .then(function(d){ clearTimeout(to); return d; })
      .catch(function(e){ clearTimeout(to); throw e; });
  }
  function scoreCand(wantT, wantA, gotT, gotA){
    var t=ctx.norm(wantT), a=ctx.norm(wantA||''), gt=ctx.norm(gotT||''), ga=ctx.norm(gotA||'');
    var s=0;
    if(t && gt){ if(gt===t) s+=60; else if(gt.indexOf(t)>=0 || t.indexOf(gt)>=0) s+=30; }
    if(a && ga){ if(ga===a) s+=40; else if(ga.indexOf(a)>=0 || a.indexOf(ga)>=0) s+=20; }
    return s;
  }
  function localPlay(source, id){
    if(source==='tx'){
      return fetchJT('https://tang.api.s01s.cn/music_open_api.php?mid='+encodeURIComponent(id), 9000).then(function(d){
        var u=d && (d.song_play_url_hq || d.song_play_url || d.song_play_url_standard);
        if(u) return { ok:true, url:u.replace(/^http:\/\//, 'https://'), source:'tx', quality:'320k' };
        return { ok:false };
      }).catch(function(){ return { ok:false }; });
    }
    if(source==='kw'){
      return fetchJT('https://nmobi.kuwo.cn/mobi.s?f=web&user=0&source=kwplayerhd_ar_6.6.6.6_tianbao_T1A_qirui.apk&type=convert_url_with_sign&rid='+encodeURIComponent(id)+'&br=320kmp3', 9000).then(function(d){
        var u=d && d.data && d.data.url;
        if(u && u!=='None') return { ok:true, url:u.replace(/^http:\/\//, 'https://'), source:'kw', quality:'320k' };
        return { ok:false };
      }).catch(function(){ return { ok:false }; });
    }
    return Promise.resolve({ ok:false });
  }
  function localResolve(title, artist){
    var key=encodeURIComponent(((artist||'')+' '+title).trim());
    return ctx.jsonp('https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key='+key+'&format=jsonp&inCharset=utf-8&outCharset=utf-8', 9000, 'jsonpCallback').then(function(d){
      var list=(((d||{}).data||{}).song||{}).itemlist||[];
      var best=null, bs=-1;
      list.forEach(function(it){ var sc=scoreCand(title, artist, it.name, it.singer); if(sc>bs){ bs=sc; best=it; } });
      if(!best || bs<55) return { ok:false };
      return localPlay('tx', best.mid).then(function(r){
        if(r && r.ok) r.matched=best.name+' - '+best.singer;
        return r;
      });
    }).catch(function(){ return { ok:false }; });
  }
  function localSearch(q){
    return ctx.jsonp('https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?key='+encodeURIComponent(q)+'&format=jsonp&inCharset=utf-8&outCharset=utf-8', 9000, 'jsonpCallback').then(function(d){
      var list=(((d||{}).data||{}).song||{}).itemlist||[];
      var out=[];
      list.forEach(function(it){ if(it.mid && it.name) out.push({ source:'tx', id:it.mid, title:it.name, artist:it.singer||'' }); });
      return { ok:out.length>0, results:out };
    }).catch(function(){ return { ok:false, results:[] }; });
  }
  window.__localResolve=localResolve; window.__localPlay=localPlay; window.__localSearch=localSearch;


  ctx.SRC_API=SRC_API;
  ctx.srcState=srcState;
  ctx.ext=ext; ctx.base=base; ctx.splitName=splitName; ctx.sourcesFor=sourcesFor;
  ctx.prependSrc=prependSrc; ctx.applySrcNow=applySrcNow; ctx.resolveSrc=resolveSrc;
  ctx.localResolve=localResolve; ctx.localPlay=localPlay; ctx.localSearch=localSearch;
}
