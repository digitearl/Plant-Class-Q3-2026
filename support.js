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
      const templateChildren = Array.from(root.childNodes).filter(n => !(n.nodeType===1 && n.tagName.toLowerCase() === 'script' && n.getAttribute('type') === 'text/x-dc'));
      const container = document.createDocumentFragment();
      templateChildren.forEach(n => container.appendChild(processNode(n, ctx)));

      // replace root content
      root.innerHTML = '';
      root.appendChild(container);
    };

    comp._render();
    window.__dc_comp = comp;
  });
})();
