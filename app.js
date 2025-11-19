// ============================
// ConvoRio App (Supabase v2.33) - CLEANED & CONSOLIDATED
// ============================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0'

// ---------- Supabase Setup (rotate anon key if this is real) ----------
const SUPABASE_URL = 'https://egusoznrqlddxpyqstqw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXNvem5ycWxkZHhweXFzdHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTQyOTIsImV4cCI6MjA3NTk5MDI5Mn0.N4TwIWVzTWMpmLJD95-wFd3NseWKrqNFb8gOWXIuf-c'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})

// ---------- Globals ----------
let currentUser = null
let selectedUser = null
let chatChannel = null
const seenMessageIds = new Set()
let mobileView = 'messages'

// ---------- DOM ----------
const authDiv = document.getElementById('auth')
const appDiv = document.getElementById('app')
const chatDiv = document.getElementById('chat')
const profileDiv = document.getElementById('profile')
const userList = document.getElementById('user-list')
const messagesDiv = document.getElementById('messages')
const messageBox = document.getElementById('message-box')
const messageInput = document.getElementById('message-input')
const chatWith = document.getElementById('chat-with')
const profileName = document.getElementById('profile-name')
const profileAvatarInput = document.getElementById('profile-avatar')
const currentAvatar = document.getElementById('current-avatar')
const showUsersBtn = document.getElementById('show-users-btn')
const showMessagesBtn = document.getElementById('show-messages-btn')

// Defensive DOM checks (in case HTML differs)
if (!authDiv || !appDiv) console.warn('Auth or App container missing from DOM')

// ---------- Mobile / Desktop Toggle ----------
function updateMobileView() {
  const usersPanel = userList?.parentElement
  const messagesPanel = messagesDiv?.parentElement
  if (!usersPanel || !messagesPanel) return

  if (window.innerWidth < 768) {
    if (mobileView === 'users') {
      usersPanel.classList.remove('hidden')
      usersPanel.classList.add('visible')
      messagesPanel.classList.add('hidden')
      messagesPanel.classList.remove('visible')
      messageBox.classList.add('hidden')
    } else {
      usersPanel.classList.add('hidden')
      usersPanel.classList.remove('visible')
      messagesPanel.classList.remove('hidden')
      messagesPanel.classList.add('visible')
      messageBox.classList.remove('hidden')
    }
  } else {
    usersPanel.classList.remove('hidden', 'visible')
    messagesPanel.classList.remove('hidden', 'visible')
    messageBox.classList.remove('hidden')
  }
}

showUsersBtn?.addEventListener('click', () => { mobileView = 'users'; updateMobileView() })
showMessagesBtn?.addEventListener('click', () => { mobileView = 'messages'; updateMobileView() })
window.addEventListener('resize', updateMobileView)
updateMobileView()

// ---------- Tabs ----------
document.getElementById('tab-chat')?.addEventListener('click', () => {
  chatDiv?.classList.remove('hidden')
  profileDiv?.classList.add('hidden')
})
document.getElementById('tab-profile')?.addEventListener('click', () => {
  profileDiv?.classList.remove('hidden')
  chatDiv?.classList.add('hidden')
})

// ---------- Buttons ----------
document.getElementById('sign-in-btn')?.addEventListener('click', signIn)
document.getElementById('sign-out-btn')?.addEventListener('click', signOut)
document.getElementById('send-btn')?.addEventListener('click', sendMessage)
document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile)

// ---------- Helpers ----------
function getAvatarUrl(user) {
  if (!user) return './default-avatar.png'
  return user.avatar_url || user.user_metadata?.avatar_url || './default-avatar.png'
}

function cleanupRealtime() {
  if (chatChannel) {
    try { supabase.removeChannel(chatChannel) } catch (e) { /* ignore */ }
    chatChannel = null
  }
}

// ---------- Profiles ----------
async function ensureUserProfile(user) {
  if (!user) return
  try {
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.name || user.email,
      avatar_url: user.user_metadata?.avatar_url || null,
    }, { onConflict: 'id' })
    if (error) console.error('Profile upsert error:', error.message)
  } catch (err) {
    console.error('ensureUserProfile error:', err)
  }
}

// ---------- Load Users ----------
async function loadUsers() {
  if (!currentUser?.id) return
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUser.id)
      .order('name', { ascending: true })

    userList.innerHTML = ''
    if (error) return console.error('Load users error:', error.message)
    if (!data?.length) return (userList.innerHTML = '<li>No other users</li>')

    data.forEach(u => {
      const li = document.createElement('li')
      li.textContent = u.name || u.email
      li.dataset.userId = u.id
      li.addEventListener('click', () => {
        selectUser(u)
        li.classList.remove('new-message')
      })
      userList.appendChild(li)
    })

    if (window.innerWidth >= 768 && data.length) selectUser(data[0])
  } catch (err) {
    console.error('loadUsers error:', err)
  }
}

// ---------- Chat ----------
function selectUser(user) {
  selectedUser = user
  chatWith.textContent = `Chatting with ${user.name || user.email}`
  messageBox.classList.remove('hidden')
  messagesDiv.innerHTML = ''
  loadMessages()
  subscribeToChat() // (re)subscribe for the selected conversation

  if (window.innerWidth < 768) {
    mobileView = 'messages'
    updateMobileView()
  }
}

async function sendMessage() {
  const text = messageInput.value.trim()
  if (!text || !currentUser?.id || !selectedUser?.id) return

  const tempMsg = {
    id: 'temp-' + Date.now(),
    sender_id: currentUser.id,
    sender_avatar: getAvatarUrl(currentUser),
    receiver_id: selectedUser.id,
    content: text,
    created_at: new Date().toISOString()
  }
  appendMessage(tempMsg)
  seenMessageIds.add(tempMsg.id)
  messageInput.value = ''

  try {
    const { data, error } = await supabase.from('messages').insert([{
      sender_id: currentUser.id,
      sender_avatar: getAvatarUrl(currentUser),
      receiver_id: selectedUser.id,
      content: text,
    }]).select()

    if (error) throw error

    const inserted = data?.[0]
    if (inserted) {
      seenMessageIds.add(inserted.id)
      const tempDiv = [...messagesDiv.querySelectorAll('.message')]
        .find(div => div.dataset.id === tempMsg.id)
      if (tempDiv) tempDiv.remove()
      appendMessage(inserted)
    }
  } catch (err) {
    console.error('Send message error:', err.message || err)
  }
}

async function loadMessages() {
  if (!currentUser?.id || !selectedUser?.id) return
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
      )
      .order('created_at', { ascending: true })

    messagesDiv.innerHTML = ''
    if (error) return console.error('Load messages error:', error.message)
    (data || []).forEach(appendMessage)
    // scroll (note: behavior may be ignored on some mobile browsers)
    messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: 'smooth' })
  } catch (err) {
    console.error('loadMessages error:', err)
  }
}

function appendMessage(msg) {
  if (!msg) return
  if (seenMessageIds.has(msg.id)) return
  seenMessageIds.add(msg.id)

  const msgDiv = document.createElement('div')
  msgDiv.dataset.id = msg.id
  msgDiv.classList.add('message', msg.sender_id === currentUser.id ? 'mine' : 'theirs')

  const avatar = document.createElement('img')
  avatar.classList.add('avatar')
  avatar.src = msg.sender_avatar || './default-avatar.png'
  avatar.alt = 'avatar'

  const textDiv = document.createElement('div')
  textDiv.classList.add('text')
  textDiv.textContent = msg.content

  const timeDiv = document.createElement('div')
  timeDiv.classList.add('timestamp')
  try {
    timeDiv.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch (e) {
    timeDiv.textContent = ''
  }

  msgDiv.append(avatar, textDiv, timeDiv)
  messagesDiv.appendChild(msgDiv)

  // Auto-scroll
  messagesDiv.scrollTop = messagesDiv.scrollHeight

  // Mobile: highlight unread messages if not the currently selected conversation
  if (window.innerWidth < 768 && msg.sender_id !== selectedUser?.id) {
    const li = [...userList.children].find(li => li.dataset.userId === msg.sender_id)
    if (li) li.classList.add('new-message')
  }
}

// ---------- Unified Real-time ----------
function subscribeToChat() {
  cleanupRealtime()
  if (!currentUser?.id) return

  // subscribe to INSERTs on messages and filter in the handler
  chatChannel = supabase.channel(`realtime:messages:${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new
      // only handle messages that involve the current user (sender or receiver)
      if (!(msg.sender_id === currentUser.id || msg.receiver_id === currentUser.id)) return

      const isDesktop = window.innerWidth >= 768
      const isSelectedConversation =
        selectedUser && (
          (msg.sender_id === selectedUser.id && msg.receiver_id === currentUser.id) ||
          (msg.receiver_id === selectedUser.id && msg.sender_id === currentUser.id)
        )

      if (!seenMessageIds.has(msg.id) && (isDesktop || isSelectedConversation)) {
        appendMessage(msg)
      }

      if (!isDesktop && msg.sender_id !== selectedUser?.id) {
        const li = [...userList.children].find(li => li.dataset.userId === msg.sender_id)
        if (li) li.classList.add('new-message')
      }
    })
    .subscribe(err => {
      if (err) console.error('Realtime subscribe error:', err)
    })
}

// ---------- Profile ----------
async function saveProfile() {
  if (!currentUser?.id) return

  let avatarUrl = getAvatarUrl(currentUser)
  if (profileAvatarInput?.files?.length) {
    const file = profileAvatarInput.files[0]
    const ext = file.name.split('.').pop()
    const path = `${currentUser.id}.${ext}`
    try {
      const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (uploadError) return console.error('Avatar upload error:', uploadError.message)
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      avatarUrl = data?.publicUrl || avatarUrl
    } catch (err) {
      console.error('Avatar upload exception:', err)
    }
  }

  try {
    const { error } = await supabase.from('profiles')
      .update({ name: profileName.value, avatar_url: avatarUrl })
      .eq('id', currentUser.id)
    if (error) console.error('Save profile error:', error.message)
    currentAvatar.src = avatarUrl
    await loadUsers()
  } catch (err) {
    console.error('saveProfile error:', err)
  }
}

// ---------- UI ----------
function showApp() {
  authDiv?.classList.add('hidden')
  appDiv?.classList.remove('hidden')
  profileName.value = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || currentUser?.email || ''
  currentAvatar.src = getAvatarUrl(currentUser)
  loadUsers()
  subscribeToChat()
}

function showAuth() {
  appDiv?.classList.add('hidden')
  authDiv?.classList.remove('hidden')
}

// ---------- Auth ----------
async function signIn() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) return console.log('Already logged in as', session.user.email)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    })
    if (error) console.error('Sign-in error:', error.message)
  } catch (err) {
    console.error('signIn exception:', err)
  }
}

async function signOut() {
  try {
    await supabase.auth.signOut()
  } catch (err) {
    console.error('Sign-out error:', err)
  } finally {
    currentUser = null
    selectedUser = null
    cleanupRealtime()
    showAuth()
  }
}

// ---------- Startup: single reliable boot sequence ----------
window.addEventListener('load', async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      currentUser = session.user
      await ensureUserProfile(currentUser)
      showApp()
    } else {
      showAuth()
    }
  } catch (err) {
    console.error('startup session error:', err)
    showAuth()
  }
})

// single onAuthStateChange listener (no duplicates)
supabase.auth.onAuthStateChange(async (_event, session) => {
  if (session?.user) {
    currentUser = session.user
    await ensureUserProfile(currentUser)
    showApp()
  } else {
    currentUser = null
    cleanupRealtime()
    showAuth()
  }
})
