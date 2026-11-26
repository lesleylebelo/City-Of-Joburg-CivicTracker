const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../docs/Assets/JS/sidebar.js'),'utf8');
function fixture(isMobile){
    const nodes=new Map(),keys={},classes=new Set();let doc;
    const node=id=>{if(!nodes.has(id))nodes.set(id,{id,attrs:{},events:{},hidden:false,inert:false,
        setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
        addEventListener(k,fn){this.events[k]=fn;},focus(){doc.activeElement=this;},closest(){return null;}});return nodes.get(id);};
    const close=node('sidebar-close'),last=node('last-link');
    node('sidebar').querySelectorAll=()=>[close,last];
    node('sidebar').contains=el=>[close,last].includes(el);
    doc={getElementById:node,body:{classList:{add:v=>classes.add(v),toggle:(v,on)=>on?classes.add(v):classes.delete(v)}},addEventListener:(k,fn)=>keys[k]=fn};
    const media={matches:isMobile,addEventListener:(k,fn)=>media.change=fn};
    vm.runInNewContext(source,{document:doc,window:{matchMedia:()=>media}});
    return {node,doc,keys,classes,media};
}
test('desktop sidebar can collapse, expand and close with Escape without blocking page content',()=>{
    const f=fixture(false);assert.equal(f.node('sidebar').inert,false);assert.equal(f.node('sidebar-toggle').attrs['aria-expanded'],'true');
    f.node('sidebar-toggle').events.click();assert.equal(f.node('sidebar').inert,true);assert.equal(f.node('main-wrapper').inert,false);assert.equal(f.node('sidebar-toggle').attrs['aria-expanded'],'false');
    f.node('sidebar-toggle').events.click();assert.ok(f.classes.has('sidebar-open'));
    f.keys.keydown({key:'Escape',preventDefault(){}});assert.equal(f.node('sidebar').inert,true);assert.equal(f.doc.activeElement,f.node('sidebar-toggle'));
});
test('mobile drawer isolates background, contains keyboard focus, and closes on selection or backdrop',()=>{
    const f=fixture(true);assert.equal(f.node('sidebar').inert,true);assert.equal(f.node('sidebar-backdrop').hidden,true);
    f.node('sidebar-toggle').events.click();assert.equal(f.node('main-wrapper').inert,true);assert.equal(f.node('sidebar').attrs['aria-modal'],'true');assert.equal(f.doc.activeElement,f.node('sidebar-close'));
    f.node('last-link').focus();f.keys.keydown({key:'Tab',shiftKey:false,preventDefault(){}});assert.equal(f.doc.activeElement,f.node('sidebar-close'));
    f.keys.keydown({key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(f.doc.activeElement,f.node('last-link'));
    f.node('sidebar').events.click({target:{closest:()=>({dataset:{section:'report'}})}});assert.equal(f.node('main-wrapper').inert,false);assert.equal(f.node('sidebar').inert,true);assert.equal(f.doc.activeElement,f.node('page-title'));
    f.node('sidebar-toggle').events.click();f.node('sidebar-backdrop').events.click();assert.equal(f.doc.activeElement,f.node('sidebar-toggle'));assert.equal(f.node('sidebar-backdrop').hidden,true);
});
test('breakpoint changes clear modal state and retain desktop collapsed preference',()=>{
    const f=fixture(false);f.node('sidebar-toggle').events.click();
    f.media.matches=true;f.media.change();assert.equal(f.node('sidebar').inert,true);
    f.node('sidebar-toggle').events.click();assert.equal(f.node('main-wrapper').inert,true);
    f.media.matches=false;f.media.change();assert.equal(f.node('main-wrapper').inert,false);assert.equal(f.node('sidebar').inert,true);assert.equal(f.node('sidebar').attrs['aria-modal'],undefined);
});
