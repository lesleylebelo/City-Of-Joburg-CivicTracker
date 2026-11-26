const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../../docs');
const theme=fs.readFileSync(path.join(root,'Assets/CSS/theme.css'),'utf8');
const values=new Map([...theme.matchAll(/(--civic-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map(m=>[m[1],m[2]]));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.name==='Vendor'?[]:entry.isDirectory()?files(path.join(dir,entry.name)):[path.join(dir,entry.name)]);}
function luminance(hex){const channels=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
function ratio(a,b){const l=[luminance(a),luminance(b)].sort((x,y)=>y-x);return(l[0]+.05)/(l[1]+.05);}
test('every application entry loads the same theme before page CSS and local stylesheets exist',()=>{
    for(const file of files(root).filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(file,'utf8');const links=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);assert.ok(links[0]?.includes('CSS/theme.css'),path.relative(root,file));for(const href of links){if(/^https?:/.test(href))continue;assert.ok(fs.existsSync(path.resolve(path.dirname(file),decodeURIComponent(href.split('?')[0]))),href);}}
});
test('shared text and status colours meet AA and input borders remain distinguishable',()=>{
    const v=name=>{assert.ok(values.has('--civic-'+name),name);return values.get('--civic-'+name);};
    for(const fg of ['heading','text','muted','accent','error','success'])for(const bg of ['background','chrome','surface','raised'])assert.ok(ratio(v(fg),v(bg))>=4.5,fg+' on '+bg);
    assert.ok(ratio(v('on-accent'),v('accent'))>=4.5);
    for(const bg of ['background','surface'])assert.ok(ratio(v('input-border'),v(bg))>=3,'input boundary on '+bg);
    for(const [fg,bg] of [['pending','pending-fill'],['progress','progress-fill'],['success','success-fill'],['error','error-fill']])assert.ok(ratio(v(fg),v(bg))>=4.5,fg+' badge');
});
test('application styles reference only defined shared palette tokens',()=>{
    const declared=new Set([...theme.matchAll(/(--civic-[\w-]+):/g)].map(m=>m[1]));
    for(const file of files(root).filter(f=>f.endsWith('.css')))for(const m of fs.readFileSync(file,'utf8').matchAll(/var\((--civic-[\w-]+)/g))assert.ok(declared.has(m[1]),path.relative(root,file)+': '+m[1]);
});
