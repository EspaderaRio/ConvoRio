// ============================
// ConvoRio App (Supabase v2.33) – Unified Version
// ============================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0'

// ---------- Supabase Setup ----------
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
const usersPanel = userList.parentElement
const messagesPanel = messagesDiv.parentElement

// ---------- Mobile / Desktop Toggle ----------
function updateMobileView() {
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
    // Desktop: show both
    usersPanel.classList.remove('hidden', 'visible')
    messagesPanel.classList.remove('hidden', 'visible')
    messageBox.classList.remove('hidden')
  }
}

showUsersBtn.onclick = () => { mobileView = 'users'; updateMobileView() }
showMessagesBtn.onclick = () => { mobileView = 'messages'; updateMobileView() }
window.addEventListener('resize', updateMobileView)
updateMobileView()

// ---------- Tabs ----------
document.getElementById('tab-chat').onclick = () => { chatDiv.classList.remove('hidden'); profileDiv.classList.add('hidden') }
document.getElementById('tab-profile').onclick = () => { profileDiv.classList.remove('hidden'); chatDiv.classList.add('hidden') }

// ---------- Buttons ----------
document.getElementById('sign-in-btn').onclick = signIn
document.getElementById('sign-out-btn').onclick = signOut
document.getElementById('send-btn').onclick = sendMessage
document.getElementById('save-profile-btn').onclick = saveProfile

// ---------- Helpers ----------
function getAvatarUrl(user) {
  if (!user) return './default-avatar.png'
  return user.avatar_url || user.user_metadata?.avatar_url || './default-avatar.png'
}

function cleanupRealtime() {
  if (chatChannel) { supabase.removeChannel(chatChannel); chatChannel = null }
}

// ---------- Profiles ----------
async function ensureUserProfile(user) {
  if (!user) return
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email,
    name: user.user_metadata.full_name || user.email,
    avatar_url: user.user_metadata.avatar_url || null,
  }, { onConflict: 'id' })
  if (error) console.error('Profile upsert error:', error.message)
}

// ---------- Load Users ----------
async function loadUsers() {
  if (!currentUser?.id) return
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .neq('id', currentUser.id)
    .order('name', { ascending: true })

  userList.innerHTML = ''
  if (error) return console.error('Load users error:', error.message)
  if (!data.length) return (userList.innerHTML = '<li>No other users</li>')

  data.forEach(u => {
    const li = document.createElement('li')
    li.textContent = u.name || u.email
    li.dataset.userId = u.id
    li.onclick = () => {
      selectUser(u)
      li.classList.remove('new-message')
    }
    userList.appendChild(li)
  })

  // Auto-select first user on desktop
  if (window.innerWidth >= 768 && data.length) selectUser(data[0])
}

// ---------- Chat ----------
function selectUser(user) {
  selectedUser = user
  chatWith.textContent = `Chatting with ${user.name || user.email}`
  messageBox.classList.remove('hidden')
  messagesDiv.innerHTML = ''
  loadMessages()
  subscribeToChat()

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
    console.error('Send message error:', err.message)
  }
}

async function loadMessages() {
  if (!currentUser?.id || !selectedUser?.id) return
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
    )
    .order('created_at', { ascending: true })

  messagesDiv.innerHTML = ''
  if (error) return console.error('Load messages error:', error.message)
  data.forEach(appendMessage)
  messagesDiv.scrollTo({
  top: messagesDiv.scrollHeight,
  behavior: 'smooth'
})
}

function appendMessage(msg) {
  if (seenMessageIds.has(msg.id)) return
  seenMessageIds.add(msg.id)

  const msgDiv = document.createElement('div')
  msgDiv.dataset.id = msg.id
  msgDiv.classList.add('message', msg.sender_id === currentUser.id ? 'mine' : 'theirs')

  const avatar = document.createElement('img')
  avatar.classList.add('avatar')
  avatar.src = msg.sender_avatar || './default-avatar.png'

  const textDiv = document.createElement('div')
  textDiv.classList.add('text')
  textDiv.textContent = msg.content

  const timeDiv = document.createElement('div')
  timeDiv.classList.add('timestamp')
  timeDiv.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  msgDiv.append(avatar, textDiv, timeDiv)
  messagesDiv.appendChild(msgDiv)

  // Auto-scroll vertically
  messagesDiv.scrollTop = messagesDiv.scrollHeight

  // Mobile: highlight unread messages
  if (window.innerWidth < 768 && msg.sender_id !== selectedUser?.id) {
    const li = [...userList.children].find(li => li.dataset.userId === msg.sender_id)
    if (li) li.classList.add('new-message')
  }
}

// ---------- Unified Real-time ----------
function subscribeToChat() {
  cleanupRealtime()
  if (!currentUser?.id) return

  chatChannel = supabase.channel(`chat-${currentUser.id}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new
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
    .subscribe()
}

// ---------- Profile ----------
async function saveProfile() {
  if (!currentUser?.id) return

  let avatarUrl = getAvatarUrl(currentUser)
  if (profileAvatarInput.files.length) {
    const file = profileAvatarInput.files[0]
    const ext = file.name.split('.').pop()
    const path = `${currentUser.id}.${ext}`
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) return console.error('Avatar upload error:', uploadError.message)
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    avatarUrl = data?.publicUrl || './default-avatar.png'
  }

  const { error } = await supabase.from('profiles')
    .update({ name: profileName.value, avatar_url: avatarUrl })
    .eq('id', currentUser.id)
  if (error) console.error('Save profile error:', error.message)
  currentAvatar.src = avatarUrl
  await loadUsers()
}

// ---------- UI ----------
function showApp() {
  authDiv.classList.add('hidden')
  appDiv.classList.remove('hidden')
  profileName.value = currentUser.user_metadata.full_name || currentUser.email
  currentAvatar.src = getAvatarUrl(currentUser)
  loadUsers()
  subscribeToChat()
}

function showAuth() {
  appDiv.classList.add('hidden')
  authDiv.classList.remove('hidden')
}

// ---------- Auth ----------
async function signIn() {
  const { data: session } = await supabase.auth.getSession()
  if (session?.user) return console.log('Already logged in as', session.user.email)

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  })
  if (error) console.error('Sign-in error:', error.message)
}

async function signOut() {
  await supabase.auth.signOut()
  currentUser = null
  selectedUser = null
  cleanupRealtime()
  showAuth()
}

// ---------- Init ----------
async function initApp() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) console.error('Session error:', error)

  if (session?.user) {
    currentUser = session.user
    await ensureUserProfile(currentUser)
    showApp()
  } else showAuth()

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      currentUser = session.user
      await ensureUserProfile(currentUser)
      showApp()
    } else {
      currentUser = null
      showAuth()
      cleanupRealtime()
    }
  })

  if (window.location.hash.includes('access_token')) history.replaceState(null, '', window.location.pathname)
}

initApp()
