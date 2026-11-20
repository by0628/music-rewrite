/* 原始 index.html 行段：2077-2324、2326-2340；外观设置与歌词控制按原文搬移。 */
export function initSettings(ctx) {
  function resetTint(){ ctx.curTint=null; applyVars(); }

  /* 莫蘭迪色按深/淺主題派生：淺色往白裡調，深色往黑裡沉 */
  function mixc(c, t, f){ return Math.round(c+(t-c)*f); }
  function applyVars(){
    var dark=document.documentElement.getAttribute('data-theme')==='dark';
    var c=ctx.curTint||{r:125, g:139, b:150};
    var root=document.documentElement.style;
    function rgb(r,g,b){ return 'rgb('+r+','+g+','+b+')'; }
    if(dark){
      root.setProperty('--accent', rgb(mixc(c.r,255,.18), mixc(c.g,255,.18), mixc(c.b,255,.18)));
      root.setProperty('--accent-d', rgb(mixc(c.r,255,.58), mixc(c.g,255,.58), mixc(c.b,255,.58)));
      root.setProperty('--accent-l', rgb(mixc(c.r,255,.32), mixc(c.g,255,.32), mixc(c.b,255,.32)));
      root.setProperty('--wash', rgb(mixc(c.r,14,.84), mixc(c.g,19,.84), mixc(c.b,24,.84)));
    }else{
      root.setProperty('--accent', rgb(Math.round(c.r*.88), Math.round(c.g*.88), Math.round(c.b*.88)));
      root.setProperty('--accent-d', rgb(Math.round(c.r*.6), Math.round(c.g*.6), Math.round(c.b*.6)));
      root.setProperty('--accent-l', rgb(mixc(c.r,255,.5), mixc(c.g,255,.5), mixc(c.b,255,.5)));
      root.setProperty('--wash', rgb(mixc(c.r,242,.87), mixc(c.g,243,.87), mixc(c.b,239,.87)));
    }
  }

  /* 主题切换：自动（跟随系统）/ 浅色 / 深色，选择会被记住 */
  (function(){
    var seg=document.getElementById('themeSeg');
    if(!seg) return;
    var mq=window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    var mode=document.documentElement.getAttribute('data-tmode')||'auto';
    function resolve(){
      var d=(mode==='dark')||(mode==='auto'&&mq&&mq.matches);
      document.documentElement.setAttribute('data-theme', d?'dark':'light');
      var meta=document.querySelector('meta[name="theme-color"]');
      if(meta) meta.setAttribute('content', d?'#171d21':'#e9edeb');
      var btns=seg.querySelectorAll('button');
      for(var i=0;i<btns.length;i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-mode')===mode);
      applyVars();
    }
    seg.addEventListener('click', function(e){
      var b=e.target.closest ? e.target.closest('button') : null;
      if(!b) return;
      mode=b.getAttribute('data-mode');
      try{ localStorage.setItem('unsentTheme', mode); }catch(err){}
      document.documentElement.setAttribute('data-tmode', mode);
      resolve();
    });
    if(mq && mq.addEventListener) mq.addEventListener('change', function(){ if(mode==='auto') resolve(); });
    resolve();
  })();

  /* 字体与字号切换：字体走 CDN 分片按字加载（不整包装），选择会被记住 */
  (function(){
    var FONTS={wenkai:'"LXGW WenKai","Noto Serif SC","Songti SC",serif',serif:'"Noto Serif SC","Songti SC","STSong","SimSun",serif',xiaowei:'"ZCOOL XiaoWei","LXGW WenKai","Noto Serif SC","Songti SC",serif',brush:'"Ma Shan Zheng","LXGW WenKai","Noto Serif SC","Songti SC",serif',system:'-apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif'};
    var SIZES={s:'.88',m:'1',l:'1.16'};
    var fseg=document.getElementById('fontSeg'), sseg=document.getElementById('sizeSeg');
    var f='serif', s='m';
    try{ f=localStorage.getItem('unsentFont')||'serif'; s=localStorage.getItem('unsentFontSize')||'m'; }catch(e){}
    if(!FONTS[f]) f='serif';
    if(!SIZES[s]) s='m';
    function mark(seg, attr, val){ if(!seg) return; var bs=seg.querySelectorAll('button'); for(var i=0;i<bs.length;i++) bs[i].classList.toggle('on', bs[i].getAttribute(attr)===val); }
    function apply(){
      document.documentElement.style.setProperty('--font', FONTS[f]);
      document.documentElement.style.setProperty('--fs', SIZES[s]);
      mark(fseg,'data-f',f); mark(sseg,'data-s',s);
    }
    if(fseg) fseg.addEventListener('click', function(e){
      var b=e.target.closest ? e.target.closest('button') : null;
      if(!b) return;
      f=b.getAttribute('data-f');
      try{ localStorage.setItem('unsentFont', f); }catch(err){}
      apply();
    });
    if(sseg) sseg.addEventListener('click', function(e){
      var b=e.target.closest ? e.target.closest('button') : null;
      if(!b) return;
      s=b.getAttribute('data-s');
      try{ localStorage.setItem('unsentFontSize', s); }catch(err){}
      apply();
    });
    apply();
  })();

  /* 简繁切换：繁体时懒加载 OpenCC（cn→tw），歌词、歌名与界面文案统一转换；
     切回简体时歌词按原始数据重建、静态文案按保存的原文还原。转换库加载失败就静默保持简体 */
  (function(){
    var seg=document.getElementById('langSeg');
    var lang='simp';
    try{ lang=localStorage.getItem('unsentLang')||'simp'; }catch(e){}
    if(lang!=='trad') lang='simp';
    var conv=null, convLoading=false;
    function T(s){
      if(lang==='trad' && conv && typeof s==='string'){ try{ return conv(s); }catch(e){ return s; } }
      return s;
    }
    window.T=T;
    function mark(){
      if(!seg) return;
      var bs=seg.querySelectorAll('button');
      for(var i=0;i<bs.length;i++) bs[i].classList.toggle('on', bs[i].getAttribute('data-l')===lang);
    }
    /* 静态文案的文本节点 walker：只碰页眉设定区、全屏顶栏、副标题、标题、页脚与全屏按钮；
       不碰播放器本体和歌词容器（歌词由 renderLyrics 经 T() 重建）。
       #setBtnSum 由设定面板自己经 T() 维护，walker 跳过免得还原时串字 */
    var savedTexts=new Map();
    function nodeFilter(node){
      if(!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      var p=node.parentElement;
      if(p && p.id==='setBtnSum') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
    function collectTexts(root){
      var out=[], walker=document.createTreeWalker(root, NodeFilter.SHOW_TEXT, nodeFilter), n;
      while((n=walker.nextNode())) out.push(n);
      return out;
    }
    function staticRoots(){
      var roots=[];
      ['ctlWrap','stageHead','stageBtn'].forEach(function(id){
        var el=document.getElementById(id); if(el) roots.push(el);
      });
      var ft=document.querySelector('footer'); if(ft) roots.push(ft);
      var sb=document.querySelector('.sub'); if(sb) roots.push(sb);
      var h1=document.querySelector('h1'); if(h1) roots.push(h1);
      return roots;
    }
    function applyStatic(){
      var roots=staticRoots();
      if(lang==='trad'){
        if(!conv) return;
        roots.forEach(function(root){
          collectTexts(root).forEach(function(node){
            if(!savedTexts.has(node)) savedTexts.set(node, node.nodeValue);
            node.nodeValue=T(node.nodeValue);
          });
        });
      }else{
        roots.forEach(function(root){
          collectTexts(root).forEach(function(node){
            if(savedTexts.has(node)) node.nodeValue=savedTexts.get(node);
          });
        });
        savedTexts.clear();
      }
    }
    /* 播放器里的歌名/歌手由 APlayer 按原始数据渲染，这里按当前语言重写一遍 */
    function refreshLangDOM(){
      try{
        if(!ctx.songMeta || !ctx.songMeta.length) return;
        var titles=document.querySelectorAll('.aplayer-list-title');
        var authors=document.querySelectorAll('.aplayer-list-author');
        for(var i=0;i<titles.length && i<ctx.songMeta.length;i++) titles[i].textContent=T(ctx.songMeta[i].title);
        for(var j=0;j<authors.length && j<ctx.songMeta.length;j++) authors[j].textContent=T(ctx.songMeta[j].artist||'');
        var cur=ctx.songMeta[ctx.curIdx];
        if(cur){
          var tEl=document.querySelector('.aplayer-title'); if(tEl) tEl.textContent=T(cur.title);
          var aEl=document.querySelector('.aplayer-author'); if(aEl) aEl.textContent=T(cur.artist||'');
          var stEl=document.getElementById('stageTitle');
          if(stEl) stEl.textContent=T((cur.artist ? cur.artist+' - ' : '')+cur.title);
          if(window.updateDocTitle) window.updateDocTitle();
        }
      }catch(e){}
    }
    window.refreshLangDOM=refreshLangDOM;
    function applyAll(){
      mark();
      if(lang==='trad' && !conv){ ensureConv(); return; }
      applyStatic();
      if(ctx.ap){ try{ ctx.renderLyrics(); }catch(e){} }
      refreshLangDOM();
      if(window.buildGroups){ try{ window.buildGroups(); }catch(e){} }
    }
    function ensureConv(){
      if(conv){ applyAll(); return; }
      if(convLoading) return;
      convLoading=true;
      var sc=document.createElement('script');
      sc.src='https://cdn.jsdelivr.net/npm/opencc-js@1.0.5/dist/umd/cn2t.js';
      sc.onload=function(){
        convLoading=false;
        try{ if(window.OpenCC && window.OpenCC.Converter) conv=window.OpenCC.Converter({from:'cn',to:'tw'}); }catch(e){ conv=null; }
        if(conv) applyAll();
      };
      sc.onerror=function(){ convLoading=false; };
      document.head.appendChild(sc);
    }
    if(seg) seg.addEventListener('click', function(e){
      var b=e.target.closest ? e.target.closest('button') : null;
      if(!b) return;
      lang=b.getAttribute('data-l')==='trad' ? 'trad' : 'simp';
      try{ localStorage.setItem('unsentLang', lang); }catch(err){}
      applyAll();
    });
    applyAll();
  })();

  /* 版面设定面板：按钮点开下拉、点外部或 Esc 关闭；按钮上的摘要跟随字体/字号选择刷新 */
  (function(){
    var wrap=document.getElementById('ctlWrap'), btn=document.getElementById('setBtn'),
        panel=document.getElementById('setPanel'), sum=document.getElementById('setBtnSum');
    if(!wrap || !btn || !panel) return;
    var FLAB={wenkai:'文楷',serif:'宋体',xiaowei:'小薇',brush:'书法',system:'系统'};
    var SLAB={s:'小',m:'中',l:'大'};
    function refreshSum(){
      if(!sum) return;
      var f='serif', s='m';
      try{ f=localStorage.getItem('unsentFont')||'serif'; s=localStorage.getItem('unsentFontSize')||'m'; }catch(e){}
      var raw=' · '+(FLAB[f]||'宋体')+' · '+(SLAB[s]||'中');
      sum.textContent=(window.T ? window.T(raw) : raw);
    }
    var shield=document.getElementById('setShield');
    function setOpen(open){
      panel.classList.toggle('open', open);
      if(shield) shield.classList.toggle('on', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if(shield) shield.addEventListener('click', function(){ setOpen(false); });
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      setOpen(!panel.classList.contains('open'));
    });
    panel.addEventListener('click', function(e){
      e.stopPropagation();
      if(e.target.closest && e.target.closest('button')) refreshSum();
    });
    document.addEventListener('click', function(){ setOpen(false); });
    document.addEventListener('keydown', function(e){ if(e.key==='Escape') setOpen(false); });
    refreshSum();
  })();

  /* ---------- 全屏样式切换 ---------- */
  (function(){
    var seg=document.getElementById('stageSeg'), stageEl=document.getElementById('stage');
    var saved='classic';
    try{ saved=localStorage.getItem('unsentStageStyle')||'classic'; }catch(e){}
    function applyStyle(name){
      stageEl.classList.remove('style-drift','style-single','style-tide','style-cinema','style-paper');
      if(name!=='classic') stageEl.classList.add('style-'+name);
      var btns=seg.querySelectorAll('button');
      for(var i=0;i<btns.length;i++) btns[i].classList.toggle('on', btns[i].getAttribute('data-style')===name);
      try{ localStorage.setItem('unsentStageStyle', name); }catch(e){}
      ctx.syncLyrics(true);
    }
    seg.addEventListener('click', function(e){
      var b=e.target.closest ? e.target.closest('button') : null;
      if(b) applyStyle(b.getAttribute('data-style'));
    });
    applyStyle(saved);
  })();

  ctx.applyVars=applyVars; ctx.resetTint=resetTint;
}
