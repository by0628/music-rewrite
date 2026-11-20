import { initSource } from './source.js';
import { initSearch } from './search.js';
import { initLyrics } from './lyrics.js';
import { initCovers } from './covers.js';
import { initSettings } from './settings.js';
import { initPlayer } from './player.js';

(function(){
  var OWNER='by0628', REPO='Music', DIR='songs';
  var CDN='https://cdn.jsdelivr.net/gh/'+OWNER+'/'+REPO+'@main/'+DIR+'/';
  var AUDIO=['mp3','m4a','wav','ogg','oga','flac','aac','opus'];
  var IMG=['jpg','jpeg','png','webp'];
  var statusEl=document.getElementById('status')||{textContent:'',style:{}};/* 提示条已按要求删除，写入落到空对象上 */
  var API='https://api.github.com/repos/'+OWNER+'/'+REPO;
  function T(s){ return window.T ? window.T(s) : s; }




  var songMeta=[], songSources=[], lyrState=[], durations={}, coverState=[];
  var ap=null, curIdx=0, curLine=-1;
  var curTint=null;

  var lrcPanel=document.getElementById('lrcPanel'), lrcScroll=document.getElementById('lrcScroll'),
      lrcNote=document.getElementById('lrcNote'), stageBtn=document.getElementById('stageBtn'),
      stage=document.getElementById('stage'), stageScroll=document.getElementById('stageScroll'),
      stageNote=document.getElementById('stageNote'), stageTitle=document.getElementById('stageTitle'),
      stageBarFill=document.getElementById('stageBarFill');


  /* ---------- 按作者分组的歌单（自建，替代播放器自带列表；新歌按文件名歌手自动归组） ---------- */
  var groupsEl=document.getElementById('groups');
  function fmtDur(sec){
    if(!sec || !isFinite(sec)) return '';
    sec=Math.round(sec);
    return Math.floor(sec/60)+':'+('0'+(sec%60)).slice(-2);
  }
  function markGroupCurrent(){
    if(!groupsEl) return;
    var rows=groupsEl.querySelectorAll('.grp-row');
    for(var i=0;i<rows.length;i++) rows[i].classList.toggle('on', +rows[i].getAttribute('data-gi')===curIdx);
  }
  /* 折叠状态（按歌手记、存本地）与搜索词：歌多了靠折叠收起、靠搜索直达 */
  var foldState={}, foldLoaded=false, songQuery='';
  function loadFold(){
    if(foldLoaded) return; foldLoaded=true;
    try{ var o=JSON.parse(localStorage.getItem('unsentFoldV1')||'null'); if(o && typeof o==='object') foldState=o; }catch(e){}
  }
  function saveFold(){ try{ localStorage.setItem('unsentFoldV1', JSON.stringify(foldState)); }catch(e){} }
  function groupElOf(artist){
    if(!groupsEl) return null;
    var gs=groupsEl.querySelectorAll('.grp');
    for(var i=0;i<gs.length;i++) if(gs[i].getAttribute('data-artist')===artist) return gs[i];
    return null;
  }
  /* 切到一首歌时，自动展开它所在的组，别让正在放的歌藏在折叠里 */
  function expandGroupForSong(i){
    var m=songMeta[i]; if(!m) return;
    var a=m.artist||'佚名';
    if(foldState[a]){ foldState[a]=false; saveFold(); }
    var g=groupElOf(a);
    if(g && !songQuery) g.classList.remove('folded');
    updateFoldBtn();
  }
  function updateFoldBtn(){
    var btn=document.getElementById('foldAllBtn'); if(!btn) return;
    var TT=function(s){ return window.T ? window.T(s) : s; };
    var allFolded=true;
    for(var k in foldState){ if(!foldState[k]){ allFolded=false; break; } }
    btn.textContent=TT(allFolded ? '全部展开' : '全部折叠');
  }
  function applyFilter(){
    if(!groupsEl) return;
    var q=(songQuery||'').replace(/\s+/g,'').toLowerCase();
    var anyVisible=false;
    var gs=groupsEl.querySelectorAll('.grp');
    for(var i=0;i<gs.length;i++){
      var g=gs[i], a=g.getAttribute('data-artist'), j, rs;
      if(!q){
        g.style.display='';
        g.classList.toggle('folded', !!foldState[a]);
        rs=g.querySelectorAll('.grp-row');
        for(j=0;j<rs.length;j++) rs[j].style.display='';
        anyVisible=true;
      }else{
        var vis=0;
        rs=g.querySelectorAll('.grp-row');
        for(j=0;j<rs.length;j++){
          var hit=(rs[j].getAttribute('data-q')||'').indexOf(q)>=0;
          rs[j].style.display=hit?'':'none';
          if(hit) vis++;
        }
        g.style.display=vis?'':'none';
        g.classList.remove('folded'); /* 搜索时命中组强制展开，清空后恢复折叠状态 */
        if(vis) anyVisible=true;
      }
    }
    var none=document.getElementById('grpNone');
    if(none) none.style.display=(q && !anyVisible)?'block':'none';
    updateFoldBtn();
  }
  function buildGroups(){
    if(!groupsEl || !songMeta.length) return;
    loadFold();
    var TT=function(s){ return window.T ? window.T(s) : s; };
    var byArtist={}, order=[];
    songMeta.forEach(function(m,i){
      var a=m.artist||'佚名';
      if(!byArtist[a]){ byArtist[a]=[]; order.push(a); }
      byArtist[a].push(i);
    });
    order.sort(function(x,y){ return byArtist[y].length-byArtist[x].length || x.localeCompare(y,'zh-Hans-CN'); });
    /* 「我喜欢的」固定置顶，复用同一套折叠 / 搜索 / 高亮逻辑 */
    var favList=[];
    songMeta.forEach(function(m,i){ if(ctx.isFav(i)) favList.push(i); });
    byArtist['我喜欢的']=favList;
    order.unshift('我喜欢的');
    /* 首次出现的组默认折叠，只展开正在放的那一组，歌单再长也不占满屏 */
    order.forEach(function(a){
      if(!(a in foldState)) foldState[a]=(a==='我喜欢的') ? false : byArtist[a].indexOf(curIdx)<0;
    });
    groupsEl.innerHTML='';
    /* 工具行：搜索框 + 全部折叠/展开 */
    var tools=document.createElement('div'); tools.className='grp-tools';
    var sw=document.createElement('div'); sw.className='grp-search';
    var ic=document.createElement('span'); ic.className='s-ic'; ic.textContent='⌕';
    var inp=document.createElement('input'); inp.type='text'; inp.id='songSearch';
    inp.setAttribute('placeholder', TT('搜索歌曲或歌手')); inp.setAttribute('autocomplete','off');
    inp.value=songQuery;
    var clr=document.createElement('button'); clr.className='s-clear'; clr.textContent='✕';
    clr.style.display=songQuery?'':'none';
    sw.appendChild(ic); sw.appendChild(inp); sw.appendChild(clr);
    var fab=document.createElement('button'); fab.className='tool-btn'; fab.id='foldAllBtn';
    tools.appendChild(sw); tools.appendChild(fab);
    groupsEl.appendChild(tools);
    inp.addEventListener('input', function(){
      songQuery=inp.value;
      clr.style.display=songQuery?'':'none';
      applyFilter();
    });
    clr.addEventListener('click', function(){
      songQuery=''; inp.value=''; clr.style.display='none'; applyFilter(); inp.focus();
    });
    fab.addEventListener('click', function(){
      var anyOpen=false;
      order.forEach(function(a){ if(!foldState[a]) anyOpen=true; });
      order.forEach(function(a){ foldState[a]=anyOpen; });
      saveFold(); applyFilter();
    });
    order.forEach(function(a){
      var g=document.createElement('div'); g.className='grp'+(foldState[a]?' folded':'');
      g.setAttribute('data-artist', a);
      var h=document.createElement('div'); h.className='grp-h';
      var nm=document.createElement('span'); nm.className='nm'; nm.textContent=TT(a);
      var rgt=document.createElement('span'); rgt.className='rgt';
      var cnt=document.createElement('span'); cnt.className='cnt'; cnt.textContent=byArtist[a].length+' 首';
      var chv=document.createElement('span'); chv.className='chev'; chv.textContent='▾';
      rgt.appendChild(cnt); rgt.appendChild(chv);
      h.appendChild(nm); h.appendChild(rgt);
      h.addEventListener('click', function(){
        if(songQuery) return; /* 搜索中不改折叠，清空搜索后自动恢复 */
        foldState[a]=!foldState[a];
        saveFold();
        g.classList.toggle('folded', !!foldState[a]);
        updateFoldBtn();
      });
      g.appendChild(h);
      var body=document.createElement('div'); body.className='grp-body';
      var inner=document.createElement('div'); inner.className='grp-inner';
      if(!byArtist[a].length){
        var em=document.createElement('div'); em.className='fav-empty';
        em.textContent=TT('还没有收藏的歌'); inner.appendChild(em);
      }else{
        byArtist[a].forEach(function(gi,n){ inner.appendChild(ctx.makeRow(gi,n)); });
      }
      body.appendChild(inner);
      g.appendChild(body);
      groupsEl.appendChild(g);
    });
    var none=document.createElement('div'); none.className='grp-none'; none.id='grpNone';
    none.textContent=TT('没有找到这首歌'); none.style.display='none';
    groupsEl.appendChild(none);
    groupsEl.style.display='block';
    ctx.hideSkeleton();
    statusEl.textContent=TT('共 '+songMeta.length+' 首 · '+(order.length-1)+' 位作者 · 已按作者分好组');
    markGroupCurrent();
    applyFilter();
  }
  window.buildGroups=buildGroups;

  /* 浏览器标签页标题跟随当前歌曲；切歌与简繁切换都会重算 */
  function updateDocTitle(){
    try{
      var ti='', au='';
      var tEl=document.querySelector('.aplayer-title'); if(tEl) ti=tEl.textContent.replace(/\s+/g,' ').trim();
      var aEl=document.querySelector('.aplayer-author'); if(aEl) au=aEl.textContent.replace(/\s+/g,' ').trim();
      var t = ti ? ((au ? au+' - ' : '')+ti) : (stageTitle.textContent ? stageTitle.textContent.replace(/\s+/g,' ').trim() : '');
      document.title = t ? (t+' · 雾中来信') : '雾中来信';
    }catch(e){}
  }
  window.updateDocTitle=updateDocTitle;

  /* ---------- 进站预加载：把所有歌的时长/封面/歌词在后台错峰拉好，切歌秒开 ---------- */
  function preloadOne(i){
    if(durations[i]){ ctx.loadCover(i, true); ctx.loadLyrics(i); return; }
    var a=new Audio(); a.preload='metadata';
    var done=false;
    function fin(){
      if(done) return; done=true;
      if(a.duration && isFinite(a.duration)){
        durations[i]=a.duration;
        var drow=groupsEl ? groupsEl.querySelector('.grp-row[data-gi="'+i+'"] .dur') : null;
        if(drow) drow.textContent=fmtDur(a.duration);
      }
      ctx.loadCover(i, true); ctx.loadLyrics(i);
      try{ a.removeAttribute('src'); a.load(); }catch(e){}
    }
    a.addEventListener('loadedmetadata', fin);
    a.addEventListener('error', fin);
    setTimeout(fin, 7000);
    a.src=songSources[i][0];
  }
  function preloadAll(){
    var order=[curIdx];
    songMeta.forEach(function(_, i){ if(i!==curIdx) order.push(i); });
    order.forEach(function(i, n){ setTimeout(function(){ preloadOne(i); }, n*450); });
  }

  var ctx={
    get OWNER(){return OWNER;},
    get REPO(){return REPO;},
    get DIR(){return DIR;},
    get CDN(){return CDN;},
    get AUDIO(){return AUDIO;},
    get IMG(){return IMG;},
    get API(){return API;},
    get statusEl(){return statusEl;},
    get ap(){return ap;}, set ap(v){ap=v;},
    get songMeta(){return songMeta;}, set songMeta(v){songMeta=v;},
    get songSources(){return songSources;}, set songSources(v){songSources=v;},
    get lyrState(){return lyrState;}, set lyrState(v){lyrState=v;},
    get durations(){return durations;}, set durations(v){durations=v;},
    get coverState(){return coverState;}, set coverState(v){coverState=v;},
    get curIdx(){return curIdx;}, set curIdx(v){curIdx=v;},
    get curLine(){return curLine;}, set curLine(v){curLine=v;},
    get curTint(){return curTint;}, set curTint(v){curTint=v;},
    get lrcPanel(){return lrcPanel;},
    get lrcScroll(){return lrcScroll;},
    get lrcNote(){return lrcNote;},
    get stageBtn(){return stageBtn;},
    get stage(){return stage;},
    get stageScroll(){return stageScroll;},
    get stageNote(){return stageNote;},
    get stageTitle(){return stageTitle;},
    get stageBarFill(){return stageBarFill;},
    get groupsEl(){return groupsEl;},
    get fmtDur(){return fmtDur;},
    get markGroupCurrent(){return markGroupCurrent;},
    get expandGroupForSong(){return expandGroupForSong;},
    get buildGroups(){return buildGroups;},
    get updateDocTitle(){return updateDocTitle;},
    get preloadAll(){return preloadAll;},
    get groupElOf(){return groupElOf;},
    get applyFilter(){return applyFilter;},
    SRC_API:'https://music-source.by120628.workers.dev/resolve',
    get T(){return T;}
  };

  initLyrics(ctx);
  initSettings(ctx);
  initCovers(ctx);
  initSource(ctx);
  initSearch(ctx);
  initPlayer(ctx);
})();
