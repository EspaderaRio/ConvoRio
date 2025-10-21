// ============================
// ConvoRio App (Supabase v2.33)
// ============================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0'

// ---------- Supabase Setup ----------
const SUPABASE_URL = 'https://egusoznrqlddxpyqstqw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXNvem5ycWxkZHhweXFzdHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTQyOTIsImV4cCI6MjA3NTk5MDI5Mn0.N4TwIWVzTWMpmLJD95-wFd3NseWKrqNFb8gOWXIuf-c'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

let currentUser = null
let selectedUser = null
let messageChannel = null

// ---------- Elements ----------
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

// ---------- Tab Navigation ----------
document.getElementById('tab-chat').onclick = () => {
  chatDiv.classList.remove('hidden')
  profileDiv.classList.add('hidden')
}
document.getElementById('tab-profile').onclick = () => {
  profileDiv.classList.remove('hidden')
  chatDiv.classList.add('hidden')
}

// ---------- Buttons ----------
document.getElementById('sign-in-btn').onclick = signIn
document.getElementById('sign-out-btn').onclick = signOut
document.getElementById('send-btn').onclick = sendMessage
document.getElementById('save-profile-btn').onclick = saveProfile

// ---------- Auth ----------
async function signIn() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href },
  })
  if (error) console.error('Sign-in error:', error.message)
}

async function signOut() {
  await supabase.auth.signOut()
  currentUser = null
  selectedUser = null
  if (messageChannel) {
    supabase.removeChannel(messageChannel)
    messageChannel = null
  }
  showAuth()
}

// ---------- Avatar Helper ----------
function getAvatarUrl(user) {
  if (!user) return './default-avatar.png'
  return user.avatar_url || user.user_metadata?.avatar_url || './default-avatar.png'
}

// ---------- Ensure Profile ----------
async function ensureUserProfile(user) {
  if (!user) return
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        email: user.email,
        name: user.user_metadata.full_name || user.email,
        avatar_url: user.user_metadata.avatar_url || null,
      },
      { onConflict: 'id' }
    )
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

  data.forEach((u) => {
    const li = document.createElement('li')
    li.textContent = u.name || u.email
    li.onclick = () => selectUser(u)
    userList.appendChild(li)
  })
}

// ---------- Select User ----------
function selectUser(user) {
  selectedUser = user
  chatWith.textContent = `Chatting with ${user.name || user.email}`
  messageBox.classList.remove('hidden')
  messagesDiv.innerHTML = ''
  loadMessages()
  subscribeToMessages()
}

// ---------- Send Message ----------
async function sendMessage() {
  const text = messageInput.value.trim()
  if (!text || !currentUser?.id || !selectedUser?.id) return

  const { error } = await supabase.from('messages').insert([
    {
      sender_id: currentUser.id,
      sender_avatar: getAvatarUrl(currentUser),
      receiver_id: selectedUser.id,
      content: text,
    },
  ])

  if (error) console.error('Send message error:', error.message)
  else messageInput.value = ''
}

// ---------- Load Messages ----------
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
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

function appendMessage(msg) {
  const msgDiv = document.createElement('div')
  msgDiv.classList.add('message', msg.sender_id === currentUser.id ? 'mine' : 'theirs')

  const avatar = document.createElement('img')
  avatar.classList.add('avatar')
  avatar.src = msg.sender_avatar || './default-avatar.png'

  const textDiv = document.createElement('div')
  textDiv.classList.add('text')
  textDiv.textContent = msg.content

  const timeDiv = document.createElement('div')
  timeDiv.classList.add('timestamp')
  timeDiv.textContent = new Date(msg.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  msgDiv.append(avatar, textDiv, timeDiv)
  messagesDiv.appendChild(msgDiv)
  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// ---------- Real-Time Subscription ----------
function subscribeToMessages() {
  if (messageChannel) {
    supabase.removeChannel(messageChannel)
    messageChannel = null
  }

  if (!currentUser?.id || !selectedUser?.id) return

  messageChannel = supabase
    .channel(`chat-${currentUser.id}-${selectedUser.id}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => {
        const msg = payload.new
        if (
          (msg.sender_id === currentUser.id && msg.receiver_id === selectedUser.id) ||
          (msg.sender_id === selectedUser.id && msg.receiver_id === currentUser.id)
        ) {
          appendMessage(msg)
        }
      }
    )
    .subscribe()
}

// ---------- Save Profile ----------
async function saveProfile() {
  if (!currentUser?.id) return

  let avatarUrl = getAvatarUrl(currentUser)

  if (profileAvatarInput.files.length > 0) {
    const file = profileAvatarInput.files[0]
    const ext = file.name.split('.').pop()
    const path = `${currentUser.id}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true })
    if (uploadError) return console.error('Avatar upload error:', uploadError.message)

    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    avatarUrl = data?.publicUrl || './default-avatar.png'
  }

  const { error } = await supabase
    .from('profiles')
    .update({ name: profileName.value, avatar_url: avatarUrl })
    .eq('id', currentUser.id)

  if (error) return console.error('Save profile error:', error.message)

  currentAvatar.src = avatarUrl
  await loadUsers()
}

// ---------- Handle Redirect & Init ----------
;(async function handleRedirect() {
  const hash = window.location.hash
  if (hash.includes('access_token')) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(window.location.href)
    if (error) console.error('Exchange error:', error.message)
    else console.log('Session restored after redirect:', data.session)
    window.location.hash = '' // cleanup URL
  }
})()

;(async function initApp() {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (session?.user) {
    currentUser = session.user
    await ensureUserProfile(currentUser)
    showApp()
  } else {
    showAuth()
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      currentUser = session.user
      ensureUserProfile(currentUser).then(showApp)
    } else {
      showAuth()
    }
  })
})()

// ---------- UI Switch ----------
function showApp() {
  authDiv.classList.add('hidden')
  appDiv.classList.remove('hidden')
  profileName.value = currentUser.user_metadata.full_name || currentUser.email
  currentAvatar.src = getAvatarUrl(currentUser)
  loadUsers()
}

function showAuth() {
  appDiv.classList.add('hidden')
  authDiv.classList.remove('hidden')
}
