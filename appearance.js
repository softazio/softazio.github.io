/* Appearance controls: site-wide preferences; preserves game logic. */
(function(){
  const prefix='softazio-appearance-';
  const root=document.documentElement;
  function get(key,fallback,allowed){try{const v=localStorage.getItem(prefix+key);return allowed.includes(v)?v:fallback}catch(e){return fallback}}
  let theme=get('theme','white',['white','black']);
  function apply(){root.dataset.szTheme=theme;root.removeAttribute('data-sz-font')}
  try{localStorage.removeItem(prefix+'font')}catch(e){}
  apply();
  document.addEventListener('DOMContentLoaded',function(){
    const host=document.createElement('div');
    host.className='sz-settings';
    host.innerHTML='<button class="sz-toggle" type="button" aria-expanded="false" aria-controls="sz-settings-panel">⚙ 表示設定</button>'+
      '<div class="sz-panel" id="sz-settings-panel" hidden role="group" aria-label="表示設定">'+
      '<strong>表示設定</strong><fieldset><legend>背景色</legend><div class="sz-choices">'+
      '<button type="button" class="sz-choice" data-theme="white">白</button><button type="button" class="sz-choice" data-theme="black">黒</button>'+
      '</div></fieldset><button type="button" class="sz-close">閉じる</button></div>';
    document.body.appendChild(host);
    const toggle=host.querySelector('.sz-toggle'),panel=host.querySelector('.sz-panel');
    function sync(){host.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)))}
    function close(){panel.hidden=true;toggle.setAttribute('aria-expanded','false');toggle.focus()}
    function open(){panel.hidden=false;toggle.setAttribute('aria-expanded','true');host.querySelector('[data-theme]').focus()}
    toggle.addEventListener('click',()=>{if(panel.hidden)open();else close()});
    host.querySelectorAll('[data-theme]').forEach(b=>b.addEventListener('click',()=>{theme=b.dataset.theme;try{localStorage.setItem(prefix+'theme',theme)}catch(e){}apply();sync()}));
    host.querySelector('.sz-close').addEventListener('click',close);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!panel.hidden)close();if(e.key==='Tab'&&!panel.hidden){const focusable=Array.from(panel.querySelectorAll('button'));const first=focusable[0],last=focusable[focusable.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
    document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!host.contains(e.target)){panel.hidden=true;toggle.setAttribute('aria-expanded','false')}});
    sync();
  });
})();
