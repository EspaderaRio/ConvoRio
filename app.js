// app.js - main app logic (ES module)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0'

/*
  REPLACE these with values from your Supabase project settings:
*/
const SUPABASE_URL = 'https://egusoznrqlddxpyqstqw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXNvem5ycWxkZHhweXFzdHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTQyOTIsImV4cCI6MjA3NTk5MDI5Mn0.N4TwIWVzTWMpmLJD95-wFd3NseWKrqNFb8gOWXIuf-c'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// DOM
const authArea = document.getElementById('auth-area')
const myInfo = document.getElementById('my-info')
const usersList = document.getElementById('users-list')
const refreshUsersBtn = document.getElementById('refresh-users')
const chatWith = document.getElementById('chat-with')
const messagesEl = document.getElementById('messages')
const composer = document.getElementById('composer')
const messageInput = document.getElementById('message-input')
const fileInput = document.getElementById('file-input')

let currentUser = null        // {id, email, ...}
let activeChatUser = null     // {id, username}
let realtimeSub = null

// ---------- UI helpers ----------
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag)
  Object.entries(attrs).forEach(([k,v]) => {
    if (k === 'class') e.className = v
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v)
    else e.setAttribute(k, v)
  })
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c))
    else if (c instanceof Node) e.appendChild(c)
  }
  return e
}
function formatTime(ts){
  if(!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString()
}
function scrollMessagesToBottom(){
  messagesEl.scrollTop = messagesEl.scrollHeight
}

// ---------- Auth UI ----------
function renderAuthUI(user){
  authArea.innerHTML = ''
  if(user){
    const signOutBtn = el('button', { onClick: signOut }, 'Sign out')
    authArea.appendChild(signOutBtn)
    myInfo.textContent = `${user.email}`
  } else {
    const emailInput = el('input', { id:'email-auth', placeholder:'you@email.com', type:'email' })
    const passInput = el('input', { id:'pass-auth', placeholder:'password (min 6)', type:'password' })
    const signInBtn = el('button', { onClick: () => signIn(emailInput.value, passInput.value) }, 'Sign in')
    const signUpBtn = el('button', { onClick: () => signUp(emailInput.value, passInput.value) }, 'Sign up')
    const magicBtn = el('button', { onClick: () => signInMagic(emailInput.value) }, 'Send Magic Link')

// 🆕 Add Google sign-in button
const googleBtn = el(
  'button',
  { onClick: signInWithGoogle },
  'Sign in with Google'
)

authArea.append(emailInput, passInput, signInBtn, signUpBtn, magicBtn, googleBtn)

    myInfo.textContent = 'Not signed in'
  }
}

// ---------- Auth functions ----------
async function signUp(email, password){
  if(!email || !password) return alert('email & password required')
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) return alert('Sign up error: ' + error.message)
  alert('Registration started — check your email if using confirmable signups.')
}

async function signIn(email, password){
  if(!email || !password) return alert('email & password required')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return alert('Sign in error: ' + error.message)
  // onAuthStateChange will handle the rest
}

async function signInMagic(email){
  if(!email) return alert('email required')
  const { data, error } = await supabase.auth.signInWithOtp({ email })
  if (error) return alert('Magic link error: ' + error.message)
  alert('Magic link sent to ' + email)
}

async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
  redirectTo: 'https://espaderario.github.io/ConvoRio/'
}

  })
  if (error) alert('Google sign-in error: ' + error.message)
}

async function signOut(){
  await supabase.auth.signOut()
  // state will update via listener
}

// ---------- Profiles & users ----------
async function ensureProfile(user) {
  const { data: p } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!p) {
    const username = user.user_metadata?.full_name || user.email.split('@')[0]
    await supabase.from('profiles').insert([{ id: user.id, username }])
  }
}

async function loadUsers(){
  usersList.innerHTML = 'Loading...'
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, created_at')
    .order('username', { ascending: true })

  if (error) {
    usersList.innerHTML = 'Failed to load users'
    console.error(error)
    return
  }

  usersList.innerHTML = ''
  data
    .filter(u => u.id !== currentUser?.id)
    .forEach(u => {
      const item = el('div', { class:'user', onClick: () => selectChatUser(u) },
        el('div', { class:'avatar' }, u.username?.slice(0,1).toUpperCase() || '?'),
        el('div', { class:'meta' },
          el('div', { class:'name' }, u.username || 'Unnamed'),
          el('div', { class:'sub' }, `Joined ${new Date(u.created_at).toLocaleDateString()}`)
        )
      )
      item.dataset.userid = u.id
      usersList.appendChild(item)
    })

  if (usersList.children.length === 0) usersList.innerHTML = 'No other users'
}

// ---------- Selecting & loading chat ----------
async function selectChatUser(user){
  // mark active
  Array.from(usersList.children).forEach(x => x.classList.remove('active'))
  const node = Array.from(usersList.children).find(n => n.dataset.userid === user.id)
  if (node) node.classList.add('active')

  activeChatUser = user
  chatWith.textContent = `Chat with ${user.username || user.id}`
  composer.classList.remove('hidden')
  messagesEl.innerHTML = 'Loading messages...'
  await loadMessages()
}

async function loadMessages(){
  if (!currentUser || !activeChatUser) return

  // Query messages where (sender=current & receiver=active) OR (sender=active & receiver=current)
  const cond = `and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeChatUser.id}),and(sender_id.eq.${activeChatUser.id},receiver_id.eq.${currentUser.id})`
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, content, media_url, created_at')
    .or(cond)
    .order('created_at', { ascending: true })

  if (error) {
    messagesEl.innerHTML = 'Failed to load messages'
    console.error(error)
    return
  }

  messagesEl.innerHTML = ''
  data.forEach(renderMessage)
  scrollMessagesToBottom()
}

// ---------- Render message ----------
function renderMessage(msg){
  const mine = msg.sender_id === currentUser.id
  const wrapper = el('div', { class: `msg ${mine ? 'sent' : 'recv'}` })
  if (msg.media_url) {
    const img = el('img', { src: msg.media_url, style:'max-width:100%;border-radius:8px;margin-bottom:6px;' })
    wrapper.appendChild(img)
  }
  if (msg.content) {
    wrapper.appendChild(el('div', {}, msg.content))
  }
  wrapper.appendChild(el('div', { class:'meta' }, formatTime(msg.created_at)))
  messagesEl.appendChild(wrapper)
}

// ---------- Send message ----------
async function sendMessage(content = '', file = null){
  if (!currentUser || !activeChatUser) return alert('Select a user and sign in first')
  let media_url = null

  if (file){
    // upload to storage bucket 'chat-media' with a timestamped path
    try {
      const ext = file.name.split('.').pop()
      const filename = `chat-media/${currentUser.id}/${Date.now()}.${ext}`
      const up = await supabase.storage.from('chat-media').upload(filename, file, { cacheControl: '3600', upsert: false })
      if (up.error) throw up.error

      // public URL
      const { data: urlData } = supabase.storage.from('chat-media').getPublicUrl(up.data.path)
      media_url = urlData.publicUrl
    } catch (err) {
      console.error('Upload error', err)
      alert('Failed to upload image: ' + err.message)
      return
    }
  }

  const payload = {
    sender_id: currentUser.id,
    receiver_id: activeChatUser.id,
    content: content || null,
    media_url
  }

  const { data, error } = await supabase.from('messages').insert([payload])
  if (error) {
    console.error(error)
    alert('Failed to send message: ' + error.message)
    return
  }
  // message will arrive via realtime and render; but as fallback you can immediately append:
  // renderMessage({ ...payload, created_at: new Date().toISOString() })
}

// ---------- Realtime subscribe ----------
function subscribeToMessages(){
  // Cleanup previous
  if (realtimeSub) {
    try { realtimeSub.unsubscribe() } catch(e){}
    realtimeSub = null
  }

  // Subscribe to INSERT events on messages table
  realtimeSub = supabase
    .channel('public:messages') // arbitrary channel name
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new
      // if the message is relevant to current user
      const involvesMe = msg.sender_id === currentUser?.id || msg.receiver_id === currentUser?.id
      if (!involvesMe) return

      // If it belongs to the open conversation, render it
      if (activeChatUser && ((msg.sender_id === activeChatUser.id && msg.receiver_id === currentUser.id) || (msg.sender_id === currentUser.id && msg.receiver_id === activeChatUser.id))) {
        renderMessage(msg)
        scrollMessagesToBottom()
      } else {
        // otherwise, you might show an unread badge; for now just console.log
        console.log('New message for you (not active chat):', msg)
      }
    })
    .subscribe(status => {
      // status can be 'SUBSCRIBED' or 'CHANNEL_ERROR' etc.
      console.log('realtime status', status)
    })
}

// ---------- Setup event listeners ----------
document.getElementById('refresh-users').addEventListener('click', loadUsers)

composer.addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = messageInput.value.trim()
  const file = fileInput.files[0] ?? null
  if (!text && !file) return
  await sendMessage(text, file)
  messageInput.value = ''
  fileInput.value = ''
})

// ---------- Auth state handling ----------
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('Auth event', event)
  const user = session?.user ?? null
  if (user) {
    currentUser = { id: user.id, email: user.email }
    renderAuthUI(currentUser)
    await ensureProfile(currentUser)
    await loadUsers()
    subscribeToMessages()
  } else {
    currentUser = null
    renderAuthUI(null)
    usersList.innerHTML = ''
    composer.classList.add('hidden')
    messagesEl.innerHTML = ''
    if (realtimeSub) {
      try { realtimeSub.unsubscribe() } catch(e){}
      realtimeSub = null
    }
  }
})

// ---------- Initial boot ----------
async function init(){
  // show initial auth UI
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    currentUser = { id: user.id, email: user.email }
    await ensureProfile(currentUser)
    renderAuthUI(currentUser)
    await loadUsers()
    subscribeToMessages()
  } else {
    renderAuthUI(null)
  }
}
init()
