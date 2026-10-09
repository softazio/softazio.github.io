/* Appearance controls: homepage-only pilot; preserves game logic. */
(function(){
  const prefix='softazio-appearance-';
  const root=document.documentElement;
  function get(key,fallback,allowed){try{const v=localStorage.getItem(prefix+key);return allowed.includes(v)?v:fallback}catch(e){return fallback}}
  let theme=get('theme','black',['black','forest','pink']);
  let size=get('font','normal',['normal','large']);
  function apply(){root.dataset.szTheme=theme;root.dataset.szFont=size}
  apply();
  document.addEventListener('DOMContentLoaded',function(){
    const host=document.createElement('div');
    host.className='sz-settings';
    host.innerHTML='<button class="sz-toggle" type="button" aria-expanded="false" aria-controls="sz-settings-panel">⚙ 表示設定</button>'+
      '<div class="sz-panel" id="sz-settings-panel" hidden role="group" aria-label="表示設定">'+
      '<strong>表示設定</strong><fieldset><legend>背景色</legend><div class="sz-choices">'+
      '<button type="button" class="sz-choice" data-theme="black">黒</button><button type="button" class="sz-choice" data-theme="forest">深緑</button><button type="button" class="sz-choice" data-theme="pink">ピンク</button>'+
      '</div></fieldset><fieldset><legend>文字サイズ</legend><div class="sz-choices">'+
      '<button type="button" class="sz-choice" data-font="normal">標準</button><button type="button" class="sz-choice" data-font="large">大きめ</button>'+
      '</div></fieldset><button type="button" class="sz-close">閉じる</button></div>';
    document.body.appendChild(host);
    const toggle=host.querySelector('.sz-toggle'),panel=host.querySelector('.sz-panel');
    function sync(){host.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)));host.querySelectorAll('[data-font]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.font===size)))}
    function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus()}
    toggle.addEventListener('click',()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)host.querySelector('[data-theme]').focus()});
    host.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>{theme=b.dataset.theme;try{localStorage.setItem(prefix+'theme',theme)}catch(e){}apply();sync()}));
    host.querySelectorAll('[data-font]').forEach(b=>b.addEventListener('click',()=>{size=b.dataset.font;try{localStorage.setItem(prefix+'font',size)}catch(e){}apply();sync()}));
    host.querySelector('.sz-close').addEventListener('click',close);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)close()});
    sync();
  });
})();
