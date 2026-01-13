(function() {
    const serverWp = window.AppConfig.wallpaperUrl;
    const cachedWp = localStorage.getItem('last_wallpaper');
    const targetWp = serverWp || cachedWp;
    if (targetWp) {
        document.documentElement.style.backgroundImage = "url('" + targetWp + "')";
        document.documentElement.style.backgroundSize = "cover";
        document.documentElement.style.backgroundPosition = "center";
        document.documentElement.style.backgroundAttachment = "fixed";
        if (serverWp) localStorage.setItem('last_wallpaper', serverWp);
    }
    const cachedTree = localStorage.getItem('last_bookmarks');
    if (cachedTree) window.__PRELOADED_TREE__ = JSON.parse(cachedTree);
})();

const FALLBACK_ICON = window.AppConfig.fallbackIcon;
const CUSTOM_FOLDER_ICON = window.AppConfig.folderIcon;
const UI_CONF = window.AppConfig.uiConfig;

let tree = null, clipboard = null, activePath = [], openPanels = [], modalMode = '';
const isMobile = () => window.innerWidth <= 768;
function closeAllMenusInternal() { closeFromLevel(0); document.getElementById('ctx-menu').style.display='none'; document.getElementById('move-tool').style.display='none'; }
function closeDialog() { document.getElementById('modal-overlay').style.display='none'; const btn = document.getElementById('btn-confirm'); btn.onclick = confirmDialog; btn.innerText = '保存'; btn.style.backgroundColor = 'var(--accent)'; btn.style.color = '#121212'; noteToDeleteId = null; }
function closeFromLevel(l) { for(let i=openPanels.length-1; i>=l; i--) if(openPanels[i]) { openPanels[i].remove(); openPanels[i]=null; } }
function closeAllMenus(e) { if(e && (e.target.closest('.menu-panel') || e.target.closest('#ctx-menu') || e.target.closest('#move-tool'))) return; closeAllMenusInternal(); }
function getLunarDateString(date) {
    const opts = { calendar: 'chinese', timeZone: 'Asia/Shanghai' };
    const mStr = date.toLocaleString('zh-CN-u-ca-chinese', { ...opts, month: 'short' });
    const dStr = date.toLocaleString('zh-CN-u-ca-chinese', { ...opts, day: 'numeric' });
    let lMonth = parseInt(mStr.replace(/\D/g, ''));
    if (isNaN(lMonth)) {
        const cnMap = {'一':1, '正':1, '二':2, '三':3, '四':4, '五':5, '六':6, '七':7, '八':8, '九':9, '十':10, '十一':11, '冬':11, '十二':12, '腊':12};
        lMonth = cnMap[mStr.replace(/[月\s]/g, '')];
    }
    const monthNames = ['正月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '冬月', '腊月'];
    const monthText = (lMonth >= 1 && lMonth <= 12) ? monthNames[lMonth - 1] : mStr;
    const lDay = parseInt(dStr.replace(/\D/g, ''));
    const cnNums = ['十', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    let dayText = lDay===10?'初十':lDay===20?'二十':lDay===30?'三十':lDay<10?'初'+cnNums[lDay]:lDay<20?'十'+cnNums[lDay-10]:'廿'+cnNums[lDay-20];
    return monthText + dayText;
}
function updateClock() {
    const d = new Date(); const h = d.getHours();
    document.getElementById('time-prefix').innerText = h<5?"凌晨":h<11?"早上":h<13?"中午":h<18?"下午":"晚上";
    document.getElementById('time-val').innerText = `${h%12||12}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    document.getElementById('date-part').innerText = `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
    document.getElementById('week-part').innerText = ["周日","周一","周三","周四","周五","周六"][d.getDay()];
    document.getElementById('lunar-part').innerText = getLunarDateString(d);
}
async function init() { 
    if (window.__PRELOADED_TREE__) { tree = window.__PRELOADED_TREE__; render(); }
    try {
        const res = await fetch('/api/get_bookmarks');
        if(res.ok) { tree = await res.json(); localStorage.setItem('last_bookmarks', JSON.stringify(tree)); render(); }
        else if (res.status === 401) window.location.href = '/login';
    } catch (e) {}
}
function getToolbarList() { return tree.bookmarks[0].children; }
function getNode(p) { let curr = getToolbarList(); for(let i=0; i<p.length; i++){ if(i===p.length-1) return curr[p[i]]; curr=curr[p[i]].children; } return curr; }
function render() {
    const bar = document.getElementById('nav-bar'); if(!bar) return; bar.innerHTML = '';
    const list = getToolbarList();
    const measureDiv = document.createElement('div'); measureDiv.style.cssText="position:absolute;visibility:hidden;display:flex;white-space:nowrap;";
    document.body.appendChild(measureDiv);
    const barWidth = bar.clientWidth - 40; let curW = 0, overIdx = -1;
    list.forEach((n, i) => { const temp = createItem(n, [i]); measureDiv.appendChild(temp); if (overIdx === -1 && curW + temp.offsetWidth + 2 > barWidth) overIdx = i; curW += temp.offsetWidth + 2; });
    document.body.removeChild(measureDiv);
    const visCount = overIdx===-1?list.length:overIdx;
    for(let i=0; i<visCount; i++) bar.appendChild(createItem(list[i], [i]));
    if(overIdx!==-1) {
        const more = document.createElement('div'); more.className='item'; more.style.marginLeft='auto'; more.innerText='▶';
        more.onclick = e => { e.stopPropagation(); showOverflowMenu(list.slice(overIdx), more.getBoundingClientRect(), overIdx); };
        bar.appendChild(more);
    }
    refreshFloatingPanels();
}
function createItem(node, path) {
    const isF = 'children' in node; const el = document.createElement(isF?'div':'a'); el.className='item'; el.setAttribute('data-path', JSON.stringify(path));
    const currentMode = isMobile() ? UI_CONF.mobile_icon_only_mode : UI_CONF.pc_icon_only_mode;
    let hideText = false;
    if(!isF) {
        if(currentMode === 'always') hideText = true;
        else if(currentMode === 'never') hideText = false;
        else hideText = !!node.icon_only;
    }
    if(!isF && hideText) el.classList.add('icon-only');
    const dom = node.url ? node.url.split('/')[2].replace(/:/g, '-') : "";
    const icon = isF ? CUSTOM_FOLDER_ICON : `/static/ico/${dom}.webp`;
    const label = hideText ? '' : `<span>${node.title}</span>`;
    el.innerHTML = `<div class="icon-wrapper"><img src="${icon}" onerror="this.src='${FALLBACK_ICON}'"></div>${label}${isF && path.length>1?'<span class="arrow-right">▶</span>':''}`;
    if(isF) el.onclick = e => { e.stopPropagation(); document.getElementById('ctx-menu').style.display='none'; openMenu(el, node, path); }; else el.href = node.url;
    return el;
}
function openMenu(pEl, node, path) {
    const level = path.length; closeFromLevel(level-1);
    const panel = document.createElement('div'); panel.className='menu-panel'; panel.dataset.path = JSON.stringify(path);
    if(!node.children?.length) panel.innerHTML='<div style="padding:10px 20px;opacity:0.5;">(空)</div>'; else node.children.forEach((c, i) => panel.appendChild(createItem(c, [...path, i])));
    document.body.appendChild(panel); openPanels[level-1]=panel;
    if(!isMobile()){
        const rect = pEl.getBoundingClientRect(); const viewportH = window.innerHeight; let top, left;
        if(level === 1) { top = rect.bottom; left = rect.left; if(top + panel.offsetHeight > viewportH) top = rect.top - panel.offsetHeight; }
        else { top = rect.top; left = rect.right; if(top + panel.offsetHeight > viewportH) top = viewportH - panel.offsetHeight - 10; if(left + panel.offsetWidth > window.innerWidth) left = rect.left - panel.offsetWidth; }
        panel.style.top = Math.max(5, top) + 'px'; panel.style.left = left + 'px';
    }
}
function showOverflowMenu(items, rect, start) { closeFromLevel(0); const p = document.createElement('div'); p.className='menu-panel'; items.forEach((it, i) => p.appendChild(createItem(it, [start+i]))); document.body.appendChild(p); openPanels[0]=p; if(!isMobile()){ p.style.top=rect.bottom+'px'; p.style.left=Math.max(5, rect.right-180)+'px'; } }
function handleCtx(e, path) {
    activePath = [...path]; 
    const menu = document.getElementById('ctx-menu'); 
    menu.style.display='block';
    if(!isMobile()){ 
        let x = e.pageX, y = e.pageY; 
        if(x + 180 > window.innerWidth) x = window.innerWidth - 180; 
        if(y + 350 > window.innerHeight) y = window.innerHeight - 350; 
        menu.style.left=x+'px'; menu.style.top=y+'px'; 
    }
    const isRoot = path.length === 0;
    const node = !isRoot ? getNode(path) : null;
    document.getElementById('m-edit').style.display = isRoot ? 'none' : 'block'; 
    document.getElementById('m-del').style.display = isRoot ? 'none' : 'block'; 
    document.getElementById('m-cut').style.display = isRoot ? 'none' : 'block';
    document.getElementById('m-move-tool').style.display = isRoot ? 'none' : 'flex';
    document.getElementById('m-sep-1').style.display = isRoot ? 'none' : 'block';
    document.getElementById('m-paste').style.opacity = (clipboard && (isRoot || node.children)) ? 1 : 0.3;
    const mti = document.getElementById('m-toggle-icon'); 
    if(!isRoot && !node.children){ 
        mti.style.display='flex'; 
        mti.querySelector('span').innerText = node.icon_only ? "显示名称" : "仅显示图标"; 
    } else { mti.style.display='none'; }
}
window.addEventListener('contextmenu', e => { const item = e.target.closest('.item'), nav = e.target.closest('#nav-bar'), pan = e.target.closest('.menu-panel'); if(item || nav || pan) { e.preventDefault(); handleCtx(e, item?JSON.parse(item.dataset.path):(pan?JSON.parse(pan.dataset.path):[])); } else closeAllMenusInternal(); });
function openMoveTool(e) { const tool = document.getElementById('move-tool'); tool.style.display='flex'; document.getElementById('move-tool-title').innerText = "移动: "+getNode(activePath).title; if(!isMobile()){ tool.style.left=e.pageX+'px'; tool.style.top=e.pageY+'px'; } updateMoveButtons(); document.getElementById('ctx-menu').style.display='none'; }
function updateMoveButtons() { const idx = activePath[activePath.length-1], pP = activePath.slice(0,-1), arr = pP.length?getNode(pP).children:getToolbarList(), isB = activePath.length===1; document.getElementById('btn-up').className = (!isB && idx>0)?'move-btn':'move-btn disabled'; document.getElementById('btn-down').className = (!isB && idx<arr.length-1)?'move-btn':'move-btn disabled'; document.getElementById('btn-left').className = (isB && idx>0)?'move-btn':'move-btn disabled'; document.getElementById('btn-right').className = (isB && idx<arr.length-1)?'move-btn':'move-btn disabled'; }
async function onMoveItem(dir) { const idx = activePath[activePath.length-1], pP = activePath.slice(0,-1), arr = pP.length?getNode(pP).children:getToolbarList(), nI = idx + dir; if(nI>=0 && nI<arr.length){ [arr[idx], arr[nI]] = [arr[nI], arr[idx]]; activePath[activePath.length-1]=nI; render(); updateMoveButtons(); save(); } }
function openModal(mode) {
    modalMode = mode; closeAllMenusInternal(); document.getElementById('modal-overlay').style.display='flex'; 
    const isSearch = mode === 'search';
    document.getElementById('search-container').style.display = isSearch ? 'block' : 'none'; 
    document.getElementById('form-fields').style.display = isSearch ? 'none' : 'block';
    document.getElementById('modal-footer').style.display = isSearch ? 'none' : 'flex';
    const btn = document.getElementById('btn-confirm'); btn.onclick = confirmDialog; btn.innerText = '保存'; btn.style.backgroundColor = 'var(--accent)'; btn.style.color = '#121212';
    if(isSearch){ document.getElementById('modal-title').innerText = "搜索书签"; document.getElementById('inp-search-keyword').value = ''; document.getElementById('search-results').innerHTML = ''; setTimeout(() => document.getElementById('inp-search-keyword').focus(), 50); }
    else {
        document.getElementById('modal-title').innerText = mode==='edit'?"编辑书签":mode==='addLink'?"添加网页":"添加文件夹";
        const fdr = document.getElementById('inp-folder'); fdr.innerHTML='<option value="[]">根目录</option>'; const walk = (ns, p, d) => ns.forEach((n,i)=>{ if(n.children){ const cp=[...p,i]; const o=document.createElement('option'); o.value=JSON.stringify(cp); o.innerText='　'.repeat(d)+'📁 '+n.title; fdr.appendChild(o); walk(n.children,cp,d+1); }}); walk(getToolbarList(), [], 1);
        if(mode==='edit'){ const n=getNode(activePath); document.getElementById('inp-name').value=n.title; document.getElementById('inp-url').value=n.url||''; document.getElementById('url-field').style.display=n.children?'none':'block'; document.getElementById('inp-folder').value = JSON.stringify(activePath.slice(0, -1)); }
        else { document.getElementById('inp-name').value=''; document.getElementById('inp-url').value='https://'; document.getElementById('url-field').style.display=mode==='addLink'?'block':'none'; const curP = openPanels.find(p => p && p.style.display !== 'none'); if (curP && curP.dataset.path) document.getElementById('inp-folder').value = curP.dataset.path; }
    }
}
async function save() { await fetch('/api/save_bookmarks', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(tree)}); render(); }
function confirmDialog() {
        const name = document.getElementById('inp-name').value.trim(), url = document.getElementById('inp-url').value.trim(), folderPath = JSON.parse(document.getElementById('inp-folder').value);
        if (!name) return; let newNode = { title: name };
        if (modalMode === 'addLink' || (modalMode === 'edit' && !getNode(activePath).children)) newNode.url = url;
        else if (modalMode === 'addFolder' || (modalMode === 'edit' && getNode(activePath).children)) newNode.children = [];
        if (modalMode === 'edit') { const oldNode = getNode(activePath); newNode.icon_only = oldNode.icon_only; Object.assign(oldNode, newNode); const oldPath = activePath.slice(0, -1); if (JSON.stringify(oldPath) !== JSON.stringify(folderPath)) { const oldIdx = activePath[activePath.length-1], oldParent = oldPath.length ? getNode(oldPath).children : getToolbarList(); oldParent.splice(oldIdx, 1); const newParent = folderPath.length ? getNode(folderPath).children : getToolbarList(); newParent.push(oldNode); } }
        else { const targetFolder = folderPath.length ? getNode(folderPath) : tree.bookmarks[0]; if (!targetFolder.children) targetFolder.children = []; targetFolder.children.push(newNode); }
        closeDialog(); save();
}
function onDelete() { const i=activePath.pop(), pa=activePath.length?getNode(activePath).children:getToolbarList(); pa.splice(i,1); save(); closeAllMenusInternal(); }
function onCut() { const i=activePath.pop(), pa=activePath.length?getNode(activePath).children:getToolbarList(); clipboard=pa.splice(i,1)[0]; save(); closeAllMenusInternal(); }
function onPaste() { const n=activePath.length?getNode(activePath):null, ta=n?n.children:getToolbarList(); if(ta){ ta.push(clipboard); clipboard=null; save(); } closeAllMenusInternal(); }
function onToggleIconMode() { const n=getNode(activePath); n.icon_only=!n.icon_only; save(); closeAllMenusInternal(); }
function refreshFloatingPanels() { openPanels.forEach(p=>{ if(p?.dataset.path){ const path=JSON.parse(p.dataset.path), n=getNode(path); p.innerHTML=''; n.children.forEach((c,i)=>p.appendChild(createItem(c,[...path,i]))); }}); }
document.getElementById('inp-search-keyword').oninput = e => {
    const kw = e.target.value.toLowerCase(), res = document.getElementById('search-results'); res.innerHTML=''; if(!kw) return;
    const find = (ns, pathStack = []) => ns.forEach(n => { 
        if(n.url && (n.title.toLowerCase().includes(kw)||n.url.includes(kw))){ 
            const a = document.createElement('a'); a.className='ctx-item'; a.href=n.url; 
            const dom = n.url.split('/')[2].replace(/:/g,'-');
            const locationStr = pathStack.length > 0 ? pathStack.join(' > ') : '根目录';
            a.innerHTML = `<img src="/static/ico/${dom}.webp" onerror="this.src='${FALLBACK_ICON}'" style="width:18px;height:18px;margin-right:12px;border-radius:3px;"><div class="search-info"><div style="font-weight:500;">${n.title}</div><div class="search-url">${n.url}</div><div class="search-path">位置: ${locationStr}</div></div>`; 
            res.appendChild(a); 
        } if(n.children) find(n.children, [...pathStack, n.title]); 
    }); find(getToolbarList());
};

const NOTE_CONF = window.AppConfig.notesConfig;
const NOTE_ICON = document.getElementById('note-icon');
const NOTE_PANEL = document.getElementById('note-panel');
const NOTE_TABS = document.getElementById('note-tabs');
const NOTE_TEXTAREA = document.getElementById('note-textarea');

let notesData = [], activeNoteId = null, saveTimer = null, noteToDeleteId = null; 
if(NOTE_CONF.enabled && NOTE_ICON) NOTE_ICON.style.display = 'flex';
function generateUniqueId() { return Date.now() + Math.floor(Math.random() * 1000); }
async function loadNotes() {
    try { const res = await fetch('/api/get_notes'); if(res.ok) { const data = await res.json(); notesData = data.notes || []; if(notesData.length > 0) { if (!activeNoteId || !notesData.some(n => n.id === activeNoteId)) activeNoteId = notesData[0].id; } else addNewNote(false); renderNotes(); } } catch (e) {}
}
async function saveNotes() {
    if(!activeNoteId || !NOTE_CONF.enabled) return; const noteIdx = notesData.findIndex(n => n.id === activeNoteId); if(noteIdx !== -1 && NOTE_TEXTAREA) { notesData[noteIdx].content = NOTE_TEXTAREA.value; notesData[noteIdx].timestamp = Date.now(); }
    try { await fetch('/api/save_notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(notesData) }); } catch (e) {}
}
function autoSaveNote() { if(saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(saveNotes, 1000); }
if(NOTE_TEXTAREA) NOTE_TEXTAREA.addEventListener('input', autoSaveNote);
function renderNotes() {
    if(!NOTE_TABS) return; NOTE_TABS.innerHTML = ''; if (notesData.length === 0) { NOTE_TEXTAREA.value = ''; activeNoteId = null; return; }
    const activeNote = notesData.find(n => n.id === activeNoteId); if (activeNote) NOTE_TEXTAREA.value = activeNote.content; else { activeNoteId = notesData[0].id; NOTE_TEXTAREA.value = notesData[0].content; }
    notesData.forEach((note, idx) => { const tab = document.createElement('div'); tab.className = 'note-tab' + (note.id === activeNoteId ? ' active' : ''); tab.innerHTML = `<span>笔记 ${idx + 1}</span> <span class="note-tab-close" onclick="openDeleteNoteModal(${note.id}, event)">x</span>`; tab.onclick = (e) => { e.stopPropagation(); switchNote(note.id); }; NOTE_TABS.appendChild(tab); });
    NOTE_TEXTAREA.focus();
}
function switchNote(id) { const oldIdx = notesData.findIndex(n => n.id === activeNoteId); if(oldIdx !== -1) { notesData[oldIdx].content = NOTE_TEXTAREA.value; notesData[oldIdx].timestamp = Date.now(); } activeNoteId = id; renderNotes(); }
function addNewNote(shouldSave = true) { if (shouldSave) saveNotes(); const newNote = { id: generateUniqueId(), content: '', timestamp: Date.now() }; notesData.push(newNote); activeNoteId = newNote.id; renderNotes(); if (shouldSave) saveNotes(); }
function openDeleteNoteModal(id, e) { e.stopPropagation(); noteToDeleteId = id; closeAllMenusInternal(); document.getElementById('modal-overlay').style.display = 'flex'; document.getElementById('search-container').style.display = 'none'; document.getElementById('modal-title').innerText = "删除笔记"; const f = document.getElementById('form-fields'); f.style.display = 'block'; f.innerHTML = `<p style="color:var(--text-dim); padding:10px 0;">永久删除这条笔记吗？</p>`; const b = document.getElementById('btn-confirm'); b.innerText = "确认删除"; b.style.backgroundColor = '#ff6b6b'; b.style.color = '#fff'; b.onclick = deleteNoteConfirmed; }
function deleteNoteConfirmed() { if (!noteToDeleteId) return; const id = noteToDeleteId, idx = notesData.findIndex(n => n.id === id); if (idx !== -1) { notesData.splice(idx, 1); if (activeNoteId === id) { if (notesData.length > 0) activeNoteId = notesData[0].id; else addNewNote(false); } saveNotes(); renderNotes(); } closeDialog(); }
function toggleNotePanel(e) { e.stopPropagation(); closeAllMenusInternal(); if (NOTE_PANEL.style.display === 'flex') { NOTE_PANEL.style.display = 'none'; saveNotes(); } else { loadNotes(); NOTE_PANEL.style.display = 'flex'; } }
document.body.addEventListener('click', (e) => { if (NOTE_PANEL && NOTE_PANEL.style.display === 'flex' && e.target !== NOTE_ICON && !NOTE_ICON.contains(e.target) && !NOTE_PANEL.contains(e.target)) { NOTE_PANEL.style.display = 'none'; saveNotes(); } }, true);
document.addEventListener('DOMContentLoaded', () => { setInterval(updateClock, 1000); updateClock(); init(); });
