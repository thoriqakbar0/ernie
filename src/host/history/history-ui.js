const api = window.ernieHistory
const status = document.getElementById('status')
const list = document.getElementById('list')
const detail = document.getElementById('detail')
const more = document.getElementById('more')
let cursor = null
let currentId = null
const origins = {baseline:'Initial app',customization:'Ernie customization',external:'External changes',manual:'Manual checkpoint',before_restore:'Before restore',official_update:'Official update',launch:'Changes found on launch'}
function element(tag, text) { const node = document.createElement(tag); node.textContent = text; return node }
async function request(input) { const result = await api.request(input); if (!result.ok) throw new Error(`${result.error.message} ${result.error.nextAction || ''}`); return result.value }
async function load(append = false) {
  try {
    document.getElementById('startup').textContent = await api.hostStatus()
    const health = await request({method:'history.status'})
    currentId = health.currentCheckpointId
    const result = await request({method:'history.list', ...(append && cursor ? {cursor} : {})})
    if (!append) list.replaceChildren()
    for (const item of result.items) {
      const row = element('li',''); const button = element('button',item.title)
      button.append(element('small',`${new Date(item.createdAt).toLocaleString()} · ${origins[item.origin]} · ${item.changedFileCount} changed files${item.id === currentId ? ' · Current' : ''}${item.knownWorking ? ' · Startup checked' : ''}`))
      button.onclick = () => inspect(item)
      row.append(button); list.append(row)
    }
    cursor = result.cursor; more.hidden = !cursor
    status.textContent = health.captureError ? health.captureError.message : health.unsavedChanges ? 'Changes since last checkpoint' : 'App source matches its saved checkpoint.'
    const previous = document.getElementById('previous')
    previous.hidden = !health.lastRecoveryId
    previous.onclick = async () => { try { await inspect(await request({method:'history.inspect',checkpointId:health.lastRecoveryId})) } catch(error) {status.textContent=error.message} }
    const pending = document.getElementById('pending'); pending.replaceChildren()
    for (const operation of health.operations ?? []) {
      const row=element('p','Customization still active: '+operation.id)
      const finish=element('button','Resolve editing interval')
      finish.onclick=async()=>{try{const result=await api.finish(operation.id);if(!result.ok)throw new Error(result.error.message);await load()}catch(error){status.textContent=error.message}}
      row.append(finish);pending.append(row)
    }
    for (const generation of health.inactiveGenerations ?? []) {
      if(generation.changed) pending.append(element('p','Edits were observed in an inactive generation: '+generation.path+'. They have not been merged into the current app.'))
    }
    for (const proposal of health.pendingProposals) {
      const button = element('button','Review requested restore')
      button.onclick = async () => { try { await inspect(await request({method:'history.inspect',checkpointId:proposal.checkpointId}),proposal) } catch(error){status.textContent=error.message} }
      pending.append(button)
    }
  } catch (error) { status.textContent = error.message }
}
async function inspect(item, proposed) {
  detail.hidden = false; detail.replaceChildren(element('h2',item.title)); detail.focus()
  detail.append(element('p',`Complete source checkpoint · ${item.fileCount} captured files. ${item.knownWorking ? 'Startup readiness completed; individual features were not verified.' : 'Startup has not been checked for this checkpoint.'}`))
  if (item.proposedTitle) detail.append(element('p','The title is an editing-client suggestion. The changed-file inventory comes from the controller; registration does not prove authorship.'))
  const technical = element('details',''); technical.append(element('summary','Technical details'))
  const changes = element('div',''); technical.append(changes)
  const preview = element('div',''); technical.append(preview)
  let next
  const read = async () => {
    const diff = await request({method:'history.diff',checkpointId:item.id,...(next ? {cursor:next} : {})})
    for (const file of diff.items) {
      const button = element('button',`${file.change}: ${file.path}`)
      const show = async (offset=0, expectedTree) => {
        try {
          const content = await request({method:'history.diff',checkpointId:item.id,path:file.path,offset,expectedTree})
          preview.replaceChildren(element('pre',JSON.stringify(content,null,2)))
          const nextOffset = content.before?.nextOffset ?? content.current?.nextOffset
          if (nextOffset != null) { const nextPage=element('button','Next source page');nextPage.onclick=()=>void show(nextOffset,content.currentTree);preview.append(nextPage) }
        } catch(error) { status.textContent = error.message }
      }
      button.onclick=()=>void show();changes.append(button)
    }
    next = diff.cursor
    if (next) { const button = element('button','More changed files'); button.onclick = () => { button.remove(); void read().catch(error => status.textContent = error.message) }; changes.append(button) }
  }
  void read().catch(error => status.textContent = error.message)
  detail.append(technical)
  const actions = element('div',''); actions.className = 'actions'
  const keep = element('button',item.kept ? 'Stop keeping' : 'Keep checkpoint')
  keep.onclick = async () => { try { await request({method:'history.keep',checkpointId:item.id,kept:!item.kept}); item.kept=!item.kept;keep.textContent=item.kept?'Stop keeping':'Keep checkpoint';await load() } catch(error) {status.textContent=error.message} }
  const restore = element('button','Review restore'); restore.disabled = !item.restorable
  restore.onclick = async () => {
    restore.disabled=true
    let timer
    try {
      status.textContent='Preparing restore…'
      const proposal=proposed ?? await request({method:'history.prepare_restore',checkpointId:item.id,requestId:crypto.randomUUID()})
      let polling=false
      timer=setInterval(async()=>{if(polling)return;polling=true;try{const progress=await request({method:'history.operation_status',operationId:proposal.id});status.textContent=`Restore: ${progress.state.replaceAll('_',' ')}`}catch(error){status.textContent=error.message}finally{polling=false}},750)
      const result=await api.approve(proposal.id)
      if (!result.ok) throw new Error(result.error?.message || 'Restore cancelled.')
      clearInterval(timer)
      await load()
      status.textContent='Restored checkpoint. Return to previous state is available.'
    } catch(error) { status.textContent=error.message } finally {clearInterval(timer);restore.disabled=false}
  }
  actions.append(keep,restore); detail.append(actions)
  if (!item.restorable) detail.append(element('p','Restoration is unavailable: '+item.reason))
}
more.onclick=()=>void load(true)
document.getElementById('refresh').onclick=()=>void load()
document.getElementById('retry').onclick=async()=>{const result=await api.reopen();status.textContent=result.ok?'Ernie reopened.':result.error.message}
document.getElementById('save').onclick=async()=>{try{await request({method:'history.checkpoint',requestId:crypto.randomUUID(),title:'Manual checkpoint'});await load()}catch(error){status.textContent=error.message}}
void load()
