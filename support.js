(function(){
  document.addEventListener('DOMContentLoaded', ()=>{
    const root = document.querySelector('x-dc') || document.body;

    class DCLogic {
      constructor(root){
        this.root = root;
        this.state = {};
      }
      setState(partial){ Object.assign(this.state, partial); this._render(); }
      renderVals(){ return {}; }
    }
    window.DCLogic = DCLogic;

    const script = document.querySelector('script[type="text/x-dc"][data-dc-script]');
    if(!script) return;

    let Component;
    try{ // evaluate user component script which defines `Component` extending DCLogic
      Component = new Function('DCLogic', `${script.textContent}\nreturn Component;`)(DCLogic);
    }catch(e){ console.error('Error evaluating component script', e); }

    if(typeof Component !== 'function'){
      console.error('Component class not found');
      return;
    }

    const comp = new Component(root);
    comp._templateChildren = Array.from(root.childNodes).filter(n => !(n.nodeType===1 && n.tagName.toLowerCase() === 'script' && n.getAttribute('type') === 'text/x-dc'));

    comp._render = function(){
      const ctx = comp.renderVals();
      ctx.component = comp;
      ctx.state = comp.state;

      function evalIn(context, expr){
        if(!expr) return '';
        expr = expr.trim();
        if(expr.startsWith('{{') && expr.endsWith('}}')) expr = expr.slice(2,-2);
        try{ return Function('with(this){return ('+expr+') }').call(context); }catch(e){ return ''; }
      }

      function processNode(node, localCtx){
        if(node.nodeType===3){
          const text = node.textContent.replace(/\{\{([^}]+)\}\}/g, (_,expr)=>{
            const v = evalIn(localCtx, expr);
            return (v===null||v===undefined)?'':v;
          });
          return document.createTextNode(text);
        }
        if(node.nodeType!==1) return node.cloneNode(true);

        const tag = node.tagName.toLowerCase();
        if(tag === 'sc-for'){
          const listAttr = node.getAttribute('list') || '';
          const asAttr = (node.getAttribute('as') || 'item').trim();
          const list = evalIn(localCtx, listAttr) || [];
          const frag = document.createDocumentFragment();
          Array.from(node.childNodes).forEach(childTemplate =>{
            for(let i=0;i<list.length;i++){
              const item = list[i];
              const ctx2 = Object.assign({}, localCtx);
              ctx2[asAttr] = item;
              ctx2['$index'] = i;
              frag.appendChild(processNode(childTemplate, ctx2));
            }
          });
          return frag;
        }
        if(tag === 'sc-if'){
          const valAttr = node.getAttribute('value') || '';
          const v = evalIn(localCtx, valAttr);
          if(v){
            const frag = document.createDocumentFragment();
            node.childNodes.forEach(child => frag.appendChild(processNode(child, localCtx)));
            return frag;
          }
          return document.createDocumentFragment();
        }

        // normal element
        const el = node.cloneNode(false);
        Array.from(node.attributes || []).forEach(attr =>{
          const name = attr.name;
          const val = attr.value;
          if(name === 'style-hover') return; // custom attr we ignore
          // replace {{ expr }} in attribute values
          const placeholders = val.match(/\{\{[^}]+\}\}/g);
          if(placeholders){
            let newVal = val;
            let handledFn = false;
            placeholders.forEach(ph =>{
                const inner = ph.slice(2,-2);
                const v = evalIn(localCtx, inner);
              if(typeof v === 'function'){
                // set event handler if attribute looks like an event
                const propName = name.toLowerCase();
                if(propName.startsWith('on')){
                  el[propName] = v.bind(comp);
                  handledFn = true;
                }
                newVal = newVal.replace(ph, '');
              } else {
                newVal = newVal.replace(ph, (v===null||v===undefined)?'':v);
              }
            });
            if(!handledFn){
              el.setAttribute(name, newVal);
            }
          } else {
            el.setAttribute(name, val);
          }
        });

        node.childNodes.forEach(child => el.appendChild(processNode(child, localCtx)));
        return el;
      }

      // move any <helmet> content into document.head (styles/scripts)
      const helmet = root.querySelector('helmet');
      if(helmet){
        Array.from(helmet.childNodes).forEach(n => {
          if(n.nodeType===1 && n.tagName.toLowerCase() === 'script' && n.getAttribute('src')){
            const s = document.createElement('script'); s.src = n.getAttribute('src'); document.head.appendChild(s);
          } else {
            document.head.appendChild(n.cloneNode(true));
          }
        });
        helmet.remove();
      }

      // process and render content (excluding the <script type="text/x-dc"> itself)
      const templateChildren = comp._templateChildren || [];
      const container = document.createDocumentFragment();
      templateChildren.forEach(n => container.appendChild(processNode(n, ctx)));

      // replace root content
      root.innerHTML = '';
      root.appendChild(container);

      if(comp.state.sel){
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position: fixed; inset: 0; z-index: 100; background: oklch(0.25 0.03 80 / 0.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 24px; animation: overlayIn 0.2s ease both;';
        overlay.onclick = ctx.closeModal;

        const card = document.createElement('div');
        card.style.cssText = 'position: relative; width: 100%; max-width: 470px; max-height: calc(100vh - 48px); overflow-y: auto; background: oklch(0.99 0.012 85); border-radius: 30px; box-shadow: 0 30px 70px -30px oklch(0.2 0.05 80 / 0.7); animation: popIn 0.28s cubic-bezier(0.34,1.56,0.64,1) both;';
        card.onclick = ctx.stop;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.style.cssText = 'position: absolute; top: 16px; right: 16px; z-index: 3; width: 38px; height: 38px; border-radius: 50%; border: none; background: oklch(0.2 0.03 80 / 0.4); color: oklch(1 0 0); font-size: 20px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center;';
        closeBtn.onclick = ctx.closeModal;
        closeBtn.textContent = '×';
        card.appendChild(closeBtn);

        const header = document.createElement('div');
        header.style.cssText = 'background: ' + (comp.state.sel.color || 'oklch(0.63 0.15 30)') + '; padding: 24px 24px 20px;';
        const crumb = document.createElement('div');
        crumb.style.cssText = 'display: inline-block; margin-top: 18px; background: oklch(1 0 0 / 0.24); color: oklch(1 0 0); font-weight: 800; font-size: 12px; letter-spacing: 0.6px; text-transform: uppercase; padding: 5px 14px; border-radius: 999px;';
        crumb.textContent = comp.state.sel.crumb || 'Skill';
        header.appendChild(crumb);
        card.appendChild(header);

        const body = document.createElement('div');
        body.style.cssText = 'padding: 24px 30px 32px;';
        const title = document.createElement('h3');
        title.style.cssText = 'font-family: "Fredoka", sans-serif; font-weight: 700; font-size: 25px; line-height: 1.15; margin: 0 0 12px; color: oklch(0.3 0.03 80); text-wrap: balance;';
        title.textContent = comp.state.sel.t || '';

        const desc = document.createElement('p');
        desc.style.cssText = 'margin: 0; font-size: 16.5px; line-height: 1.6; font-weight: 600; color: oklch(0.4 0.02 80); text-wrap: pretty;';
        desc.textContent = comp.state.sel.d || '';

        body.appendChild(title);
        body.appendChild(desc);
        card.appendChild(body);
        overlay.appendChild(card);
        root.appendChild(overlay);
      }
    };

    comp._render();
    window.__dc_comp = comp;
  });
})();
