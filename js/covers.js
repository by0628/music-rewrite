/* 原始 index.html 行段：1457-1751；逻辑按原文搬移。 */
export function initCovers(ctx) {
  /* ---------------- auto cover (iTunes) ---------------- */
  function norm(s){ return (s||'').toLowerCase().replace(/[\s\u3000·・'"'"'“”‘’()（）\[\]【】\-—_,，.。!！?？:：;；/\\]/g,''); }
  function itunesCover(meta, dur){
    /* 台湾/香港商店的歌手名是繁体（周杰倫），站点是简体：比较前先把常见繁体字折成简体，否则歌名歌手永远对不上 */
    var T2S={'倫':'伦','傑':'杰','陳':'陈','鄧':'邓','劉':'刘','張':'张','楊':'杨','蘇':'苏','華':'华','樂':'乐','飛':'飞','雲':'云','麗':'丽','國':'国','榮':'荣','謙':'谦','靜':'静','孫':'孙','頌':'颂','穎':'颖','兒':'儿','龍':'龙','鳳':'凤','許':'许','鄭':'郑','蕭':'萧','羅':'罗','譚':'谭','盧':'卢','鍾':'钟','馮':'冯','喬':'乔','韋':'韦','韓':'韩','顧':'顾','髮':'发','麼':'么','這':'这','裡':'里','們':'们','為':'为','愛':'爱','還':'还','過':'过','時':'时','間':'间','點':'点','開':'开','關':'关','門':'门','風':'风','葉':'叶','聲':'声','遠':'远','夢':'梦','長':'长','細':'细','說':'说','語':'语','詩':'诗','詞':'词','讓':'让','給':'给','誰':'谁','離':'离','別':'别','場':'场','戲':'戏','劍':'剑','溫':'温','學':'学','會':'会','後':'后','進':'进','連':'连','運':'运','達':'达','選':'选','邊':'边','縣':'县','區':'区','號':'号','線':'线','網':'网','頁':'页','圖':'图','書':'书','畫':'画','實':'实','現':'现','環':'环','繞':'绕','鋼':'钢','純':'纯','歡':'欢','聽':'听','見':'见','親':'亲','總':'总','戀':'恋','單':'单','雙':'双','個':'个','樣':'样','義':'义','氣':'气','靈':'灵','淚':'泪','緒':'绪','碎':'碎','塵':'尘','客':'客','棧':'栈','楓':'枫','淺':'浅','淚':'泪','灣':'湾'};
    function foldT(s){ return String(s||'').split('').map(function(c){ return T2S[c]||c; }).join(''); }
    function eqT(a, b){ return norm(foldT(ctx.cleanTitle(a||'')))===norm(foldT(ctx.cleanTitle(b||''))); }
    function eqA(a, b){ return norm(foldT(a||''))===norm(foldT(b||'')); }
    var term=(meta.artist?meta.artist+' ':'')+meta.title;
    var url='https://itunes.apple.com/search?term='+encodeURIComponent(term)+'&media=music&entity=song&limit=8&country=TW';
    return ctx.fetchT(url).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(data){
        var res=(data.results||[]).filter(function(x){ return x.artworkUrl100; });
        if(!res.length) return null;
        var pick=null;
        if(dur){
          var inWin=res.filter(function(x){ return Math.abs((x.trackTimeMillis||0)/1000-dur)<=4; });
          if(!inWin.length) return null;
          pick=inWin.filter(function(x){ return eqT(x.trackName, meta.title) && eqA(x.artistName, meta.artist); })[0]
            || inWin.filter(function(x){ return eqT(x.trackName, meta.title); })[0]
            || inWin.filter(function(x){ return eqA(x.artistName, meta.artist); })[0]
            || inWin[0];
        }else{
          pick=res.filter(function(x){ return eqT(x.trackName, meta.title) && eqA(x.artistName, meta.artist); })[0]||null;
        }
        return pick ? pick.artworkUrl100.replace('100x100bb.jpg','600x600bb.jpg') : null;
      });
  }
  function applyCover(idx, url){
    ctx.songMeta[idx].cover=url;
    if(ctx.ap && ctx.ap.list.audios[idx]) ctx.ap.list.audios[idx].cover=url;
    if(ctx.ap && idx===ctx.curIdx){
      applyStageBg();
      updateMS();
      vinylize();          /* 封面到位也走双层交叉淡入，不再硬切 */
      tintFromCover(url);
    }
  }
  /* 封面取色：把主色调染进整页氛围（进度条、高亮歌词、月光） */
  function tintFromCover(url){
    var img=new Image();
    img.crossOrigin='anonymous';
    img.onload=function(){
      try{
        var cv=document.createElement('canvas'); cv.width=cv.height=24;
        var cx=cv.getContext('2d'); cx.drawImage(img,0,0,24,24);
        var d=cx.getImageData(0,0,24,24).data, r=0,g=0,b=0,w=0;
        for(var i=0;i<d.length;i+=4){
          var R=d[i],G=d[i+1],B=d[i+2];
          var mx=Math.max(R,G,B), mn=Math.min(R,G,B);
          if(mx<28||mx>245) continue;
          var weight=0.35+((mx-mn)/255);
          r+=R*weight; g+=G*weight; b+=B*weight; w+=weight;
        }
        if(!w) return;
        r=Math.round(r/w); g=Math.round(g/w); b=Math.round(b/w);
        /* 莫蘭迪化：向自身灰度靠攏、去飽和，再派生深/淺/底色四檔 */
        var gray=Math.round((r+g+b)/3);
        r=Math.round(r+(gray-r)*0.55); g=Math.round(g+(gray-g)*0.55); b=Math.round(b+(gray-b)*0.55);
        ctx.curTint={r:r, g:g, b:b};
        ctx.applyVars();
      }catch(e){ /* 取色失败就保留默认夜蓝 */ }
    };
    img.src=url;
  }
  /* 封面双层交叉淡入 + 播放时外圈呼吸光晕。
     纯 DOM / CSS：不碰音频链、不生成任何图片；没有真封面时两层都保持 #101216 纯黑。 */
  var coverLayers=null, coverFront=0, coverHalo=null;
  function setCover(url){
    var pic=document.querySelector('.aplayer-pic');
    if(!pic) return;
    var host=pic.parentNode;
    if(!coverHalo){
      coverHalo=document.createElement('div'); coverHalo.className='cover-halo';
      host.insertBefore(coverHalo, host.firstChild);
    }
    if(!coverLayers){
      coverLayers=[];
      for(var k=0;k<2;k++){
        var d=document.createElement('div'); d.className='pic-rot';
        d.style.backgroundImage='none';
        pic.insertBefore(d, pic.firstChild);
        coverLayers.push(d);
      }
    }
    var next=1-coverFront, old=coverFront;
    coverLayers[next].style.backgroundImage = url ? 'url("'+url+'")' : 'none';
    coverLayers[next].classList.add('on');
    coverLayers[old].classList.remove('on');
    coverFront=next;
  }
  /* 旋转唱片：把封面搬到可旋转的内层上，按钮保持不动（现改为交叉淡入） */
  function vinylize(){
    var cov=ctx.songMeta[ctx.curIdx] && ctx.songMeta[ctx.curIdx].cover;
    setCover(cov||'');
  }
  function applyStageBg(){
    var bg=document.getElementById('stageBg');
    var cov=ctx.songMeta[ctx.curIdx] && ctx.songMeta[ctx.curIdx].cover;
    updateAmbient(cov||'');
    if(cov){ bg.style.backgroundImage='url("'+cov+'")'; bg.style.opacity='1'; }
    else { bg.style.opacity='0'; }
  }
  /* 氛围背景：与全屏舞台共用当前封面，双层交叉淡入 */
  var ambCur='';
  function updateAmbient(url){
    url=url||'';
    if(url===ambCur) return; ambCur=url;
    var A=document.getElementById('ambA'), B=document.getElementById('ambB');
    if(!A||!B) return;
    var showEl=A.classList.contains('on')?B:A, hideEl=(showEl===A)?B:A;
    if(url){ showEl.style.backgroundImage='url("'+url+'")'; showEl.classList.add('on'); }
    hideEl.classList.remove('on');
  }
  /* 锁屏/耳机控制：把歌名、歌手、封面报给系统媒体会话。
     重要：网页没有真正的「锁屏歌词」接口，系统也不承诺显示 album 字段。
     这里只是把当前正在唱的那一行塞进 MediaMetadata.album，属于近似实现，
     锁屏/通知栏是否展示、展示成什么样完全由系统决定。 */
  var MS_FALLBACK_ALBUM='雾中来信';
  var msAlbum=MS_FALLBACK_ALBUM, msSig='';
  /* MediaMetadata.artwork 只吃绝对地址：把站内相对路径补成 https 绝对 URL，http 一律丢弃 */
  function absHttps(u){
    if(!u) return '';
    try{
      var a=new URL(u, location.href).href;
      return /^https:\/\//i.test(a) ? a : '';
    }catch(e){ return ''; }
  }
  function msArtwork(src){
    if(!src) return [];
    var t=/\.png(\?|#|$)/i.test(src)?'image/png':(/\.webp(\?|#|$)/i.test(src)?'image/webp':'image/jpeg');
    /* 同一张真封面声明 256 / 512 两种尺寸；匹配不到真封面就给空数组，绝不生成或上传占位图 */
    return [{src:src,sizes:'256x256',type:t},{src:src,sizes:'512x512',type:t}];
  }
  function syncPlaybackState(){
    if(!('mediaSession' in navigator) || !ctx.ap) return;
    try{ navigator.mediaSession.playbackState = ctx.ap.audio.paused ? 'paused' : 'playing'; }catch(e){}
  }
  function updateMS(){
    if(!('mediaSession' in navigator) || !ctx.ap) return;
    var m=ctx.songMeta[ctx.curIdx]; if(!m) return;
    var src=absHttps(m.cover), arts=msArtwork(src);
    var title=m.title||'', artist=m.artist||'', album=msAlbum||MS_FALLBACK_ALBUM;
    /* 切歌、封面迟到、换行都会走到这里；内容没变就不重复 new MediaMetadata，避免高频重复设置 */
    var sig=title+'|'+artist+'|'+album+'|'+src;
    if(sig===msSig){ syncPlaybackState(); return; }
    msSig=sig;
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:title, artist:artist, album:album, artwork:arts});
    }catch(e){}
    syncPlaybackState();
  }
  /* 锁屏歌词：只在换行时改 album；没有歌词就恢复站名 */
  function setMsLine(text){
    var s=(text||'').replace(/\s+/g,' ').trim().slice(0,120);
    var next=s||MS_FALLBACK_ALBUM;
    if(next===msAlbum) return;
    msAlbum=next; msSig=''; updateMS();
  }
  /* 下一首预热：用一个不发声的 Audio 把下一首音频提前拉进缓存，切歌秒开 */
  var warmAudio=null, warmUrl='';
  function warmNext(){
    try{
      if(!ctx.songSources || ctx.songSources.length<2) return;
      var nx=(ctx.curIdx+1)%ctx.songSources.length;
      if(nx===ctx.curIdx || !ctx.songSources[nx] || !ctx.songSources[nx][0]) return;
      ctx.resolveSrc(nx);
      var u=ctx.songSources[nx][0];
      if(u===warmUrl) return; warmUrl=u;
      if(!warmAudio){ warmAudio=new Audio(); warmAudio.preload='auto'; }
      warmAudio.src=u;
    }catch(e){}
  }
  /* JSONP 小工具：给不支持 CORS 的国内接口用（脚本标签不受同源限制）
     注意：QQ 搜索接口不认 callback 参数（写了也白写、固定用 callback 包裹），只认 jsonpCallback，
     参数名传错会让回调永远不触发、整条链卡到超时——这是「封面一直加载不出来」的真凶 */
  var jsonpSeq=0;
  function jsonp(url, timeout, cbParam){
    return new Promise(function(res, rej){
      var cb='__unsentCb'+(++jsonpSeq)+'_'+Date.now();
      var sc=document.createElement('script');
      var timer=setTimeout(function(){ cleanup(); rej(new Error('jsonp timeout')); }, timeout||9000);
      function cleanup(){
        clearTimeout(timer);
        try{ delete window[cb]; }catch(e){ window[cb]=undefined; }
        if(sc.parentNode) sc.parentNode.removeChild(sc);
      }
      window[cb]=function(data){ cleanup(); res(data); };
      sc.onerror=function(){ cleanup(); rej(new Error('jsonp error')); };
      sc.src=url+(url.indexOf('?')>=0 ? '&' : '?')+(cbParam||'callback')+'='+cb;
      document.head.appendChild(sc);
    });
  }
  /* 首选封面源：QQ音乐（国内直连、华语曲库最全；本地打分+时长把关，图先验真再用） */
  function qqCover(meta, dur){
    var w=(meta.artist ? meta.artist+' ' : '')+meta.title;
    var url='https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=jsonp&p=1&n=6&aggr=1&lossless=0&flag_qc=0&w='+encodeURIComponent(w);
    return jsonp(url, 9000, 'jsonpCallback').then(function(d){
      var list=(d && d.data && d.data.song && d.data.song.list)||[];
      var scored=list.filter(function(x){ return x.albummid; }).map(function(x, i){
        var s=0;
        if(norm(ctx.cleanTitle(x.songname||''))===norm(ctx.cleanTitle(meta.title))) s+=4;
        var singers=(x.singer||[]).map(function(sg){ return sg.name||''; }).join(' ');
        if(meta.artist && norm(meta.artist)){
          if(norm(singers)===norm(meta.artist)) s+=3;
          else if(norm(singers).indexOf(norm(meta.artist))>=0) s+=2;
        }
        return {x:x, s:s, dd: dur ? Math.abs((x.interval||0)-dur) : 0, i:i};
      }).filter(function(o){ return o.s>=4 && (!dur || o.dd<=4); });
      if(!scored.length) return null;
      /* 分数、时长差都相同时，信 QQ 自己的排序（官方版通常排最前，防翻唱/钢琴版同分抢位） */
      scored.sort(function(a,b){ return (b.s-a.s) || (a.dd-b.dd) || (a.i-b.i); });
      var urls=scored.slice(0,2).map(function(o){ return 'https://y.qq.com/music/photo_new/T002R500x500M000'+o.x.albummid+'.jpg'; });
      return verifyImgUrls(urls, 0);
    }).catch(function(){ return null; });
  }
  /* 备用封面源：MusicBrainz 找唱片 + Cover Art Archive 取图（同样用时长把关，防翻唱误配） */
  function mbCover(meta, dur){
    var q='recording:"'+(meta.title||'').replace(/"/g,'')+'"'+(meta.artist?' AND artistname:"'+meta.artist.replace(/"/g,'')+'"':'');
    var url='https://musicbrainz.org/ws/2/recording/?query='+encodeURIComponent(q)+'&fmt=json&limit=10';
    return ctx.fetchT(url).then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(data){
        var recs=(data.recordings||[]).filter(function(x){ return x.releases && x.releases.length; });
        if(!recs.length) return null;
        if(dur){
          recs=recs.filter(function(x){ return x.length && Math.abs(x.length/1000-dur)<=5; });
        }else{
          recs=recs.filter(function(x){
            var ac=(x['artist-credit'] && x['artist-credit'][0] && x['artist-credit'][0].name)||'';
            return norm(x.title)===norm(meta.title) && (!meta.artist || norm(ac)===norm(meta.artist));
          });
        }
        if(!recs.length) return null;
        recs.sort(function(a,b){
          var da=dur ? Math.abs((a.length||0)/1000-dur) : 0, db=dur ? Math.abs((b.length||0)/1000-dur) : 0;
          return da-db || (b.score||0)-(a.score||0);
        });
        var ids=[];
        recs.slice(0,3).forEach(function(x){ var id=x.releases[0] && x.releases[0].id; if(id && ids.indexOf(id)<0) ids.push(id); });
        return tryCaa(ids, 0);
      })
      .catch(function(){ return null; });
  }
  /* 验图：URL 真能加载才采用，坏图自动试下一张 */
  function verifyImgUrls(urls, i){
    if(i>=urls.length) return Promise.resolve(null);
    var url=urls[i];
    return new Promise(function(res){
      var im=new Image();
      im.onload=function(){ res(url); };
      im.onerror=function(){ res(verifyImgUrls(urls, i+1)); };
      im.src=url;
    });
  }
  function tryCaa(ids, i){
    if(i>=ids.length) return Promise.resolve(null);
    var url='https://coverartarchive.org/release/'+ids[i]+'/front-500';
    return new Promise(function(res){
      var im=new Image();
      im.onload=function(){ res(url); };
      im.onerror=function(){ res(tryCaa(ids, i+1)); };
      im.src=url;
    });
  }
  /* 封面来源优先级：本地同名图（建单时已处理） > QQ音乐 > iTunes > MusicBrainz/CoverArtArchive；全落空不生成本地图，保持纯黑并靠切歌重试 */
  function loadCover(idx, withDur){
    var st=ctx.coverState[idx];
    if(!st || st.done) return;
    if(withDur ? st.triedDur : st.triedNoDur) return;
    if(withDur) st.triedDur=true; else st.triedNoDur=true;
    var meta=ctx.songMeta[idx], dur=withDur ? ctx.durations[idx] : null;
    var covCached=null;
    try{ covCached=localStorage.getItem('unsentCovV1:'+(meta.artist||'')+'|'+meta.title); }catch(e){}
    if(covCached){
      /* 缓存里的第三方图片 URL 可能已失效：先验图，挂了就清掉重查，不让一次缓存定终身 */
      return verifyImgUrls([covCached], 0).then(function(ok){
        if(ok){ st.done=true; applyCover(idx, ok); return; }
        try{ localStorage.removeItem('unsentCovV1:'+(meta.artist||'')+'|'+meta.title); }catch(e){}
        st.done=false; st.triedDur=false; st.triedNoDur=false;
        return loadCover(idx, withDur);
      });
    }
    qqCover(meta, dur)
      .then(function(url){ return url || itunesCover(meta, dur).catch(function(){ return null; }); })
      .then(function(url){ return url || mbCover(meta, dur); })
      .then(function(url){
        if(url){
          st.done=true;
          try{ localStorage.setItem('unsentCovV1:'+(meta.artist||'')+'|'+meta.title, url); }catch(e){}
          applyCover(idx, url);
        }
        /* 全源落空：不造本地图，封面保持纯黑，下次切到这首会自动重查 */
      })
      .catch(function(){});
  }

  ctx.norm=norm; ctx.jsonp=jsonp;
  ctx.itunesCover=itunesCover; ctx.qqCover=qqCover; ctx.mbCover=mbCover;
  ctx.applyCover=applyCover; ctx.loadCover=loadCover; ctx.tintFromCover=tintFromCover; ctx.setCover=setCover;
  ctx.vinylize=vinylize; ctx.applyStageBg=applyStageBg; ctx.updateAmbient=updateAmbient;
  ctx.updateMS=updateMS; ctx.setMsLine=setMsLine; ctx.warmNext=warmNext;
}
