import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0'

const SUPABASE_URL = 'https://egusoznrqlddxpyqstqw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXNvem5ycWxkZHhweXFzdHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTQyOTIsImV4cCI6MjA3NTk5MDI5Mn0.N4TwIWVzTWMpmLJD95-wFd3NseWKrqNFb8gOWXIuf-c'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})

let currentUser = null
let selectedUser = null

// Elements
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

// Tabs
document.getElementById('tab-chat').onclick = () => { chatDiv.classList.remove('hidden'); profileDiv.classList.add('hidden') }
document.getElementById('tab-profile').onclick = () => { profileDiv.classList.remove('hidden'); chatDiv.classList.add('hidden') }

// Buttons
document.getElementById('sign-in-btn').onclick = signIn
document.getElementById('sign-out-btn').onclick = signOut
document.getElementById('send-btn').onclick = sendMessage
document.getElementById('save-profile-btn').onclick = saveProfile

// Google Sign-in
async function signIn() {
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'https://espaderario.github.io/ConvoRio/' }
  })
}

// Sign out
async function signOut() {
  await supabase.auth.signOut()
  currentUser = null
  selectedUser = null
  appDiv.classList.add('hidden')
  authDiv.classList.remove('hidden')
}

// Ensure user profile exists (upsert)
async function ensureUserProfile(user) {
  if (!user) return
  const { error } = await supabase.from('profiles').upsert({
    id: user.id,
    email: user.email,
    name: user.user_metadata.full_name || user.email,
    avatar_url: user.user_metadata.avatar_url || null
  }, { onConflict: 'id' })

  if (error) console.error("Profile upsert error:", error.message)
}

// Load users
async function loadUsers() {
  if (!currentUser?.id) return
  const { data, error } = await supabase.from('profiles').select('*').neq('id', currentUser.id).order('name', { ascending: true })
  userList.innerHTML = ''
  if (error) return console.error("Load users error:", error.message)
  if (!data.length) userList.innerHTML = '<li>No other users</li>'
  data.forEach(u => {
    const li = document.createElement('li')
    li.textContent = u.name || u.email
    li.onclick = () => selectUser(u)
    userList.appendChild(li)
  })
}

// Select user to chat
function selectUser(user) {
  selectedUser = user
  chatWith.textContent = `Chatting with ${user.name || user.email}`
  messageBox.classList.remove('hidden')
  loadMessages()
}

// Send message
async function sendMessage() {
  const text = messageInput.value.trim()
  if (!text || !currentUser?.id || !selectedUser?.id) return

  const { error } = await supabase.from('messages').insert([{
    sender_id: currentUser.id,
    receiver_id: selectedUser.id,
    content: text
  }])

  if (error) {
    console.error("Send message error:", error.message)
  } else {
    messageInput.value = ''
    await loadMessages() // <- reload messages immediately
  }
}


// Load messages between current user and selected user
async function loadMessages() {
  if (!currentUser?.id || !selectedUser?.id) return
const { data, error } = await supabase
  .from('messages')
  .select(`
    *,
    sender:sender_id (id, name, avatar_url),
    receiver:receiver_id (id, name, avatar_url)
  `)
  .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`)
  .order('created_at', { ascending: true })


  messagesDiv.innerHTML = ''
  if (error) return console.error("Load messages error:", error.message)
  if (!data) return

  data.forEach(msg => {
    const msgDiv = document.createElement('div')
    msgDiv.classList.add('message', msg.sender_id === currentUser.id ? 'mine' : 'theirs')

    const avatar = document.createElement('img')
    avatar.classList.add('avatar')
    avatar.src = msg.sender.avatar_url || './default-avatar.png'

    const textDiv = document.createElement('div')
    textDiv.classList.add('text')
    textDiv.textContent = msg.content

    const timeDiv = document.createElement('div')
    timeDiv.classList.add('timestamp')
    timeDiv.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    msgDiv.append(avatar, textDiv, timeDiv)
    messagesDiv.appendChild(msgDiv)
  })

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// Real-time messages
supabase.channel('messages-channel').on(
  'postgres_changes',
  { event: 'INSERT', schema: 'public', table: 'messages' },
  payload => {
    const msg = payload.new
    if ((msg.sender_id === currentUser?.id && msg.receiver_id === selectedUser?.id) ||
        (msg.sender_id === selectedUser?.id && msg.receiver_id === currentUser?.id)) {
      loadMessages()
    }
  }
).subscribe()

// Save profile (name + avatar)
async function saveProfile() {
  if (!currentUser?.id) return

  let avatarUrl = currentUser.user_metadata.avatar_url || './default-avatar.png'

  if (profileAvatarInput.files.length > 0) {
    const file = profileAvatarInput.files[0]
    const ext = file.name.split('.').pop()
    const path = `${currentUser.id}.${ext}`

    // Upload to storage
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (uploadError) return console.error("Avatar upload error:", uploadError.message)

    avatarUrl = supabase.storage.from('avatars').getPublicUrl(path).publicUrl
  }

  const { error } = await supabase.from('profiles').update({
    name: profileName.value,
    avatar_url: avatarUrl
  }).eq('id', currentUser.id)

  if (error) return console.error("Save profile error:", error.message)

  currentAvatar.src = avatarUrl
  await loadUsers()
}

// ------------------------
// Auth state handling
// ------------------------
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session?.user) {
    currentUser = session.user
    ensureUserProfile(currentUser).then(() => {
      authDiv.classList.add('hidden')
      appDiv.classList.remove('hidden')
      profileName.value = currentUser.user_metadata.full_name || currentUser.email
      currentAvatar.src = currentUser.user_metadata.avatar_url || './default-avatar.png'
      loadUsers()
    })
  }

  if (event === 'SIGNED_OUT') signOut()
})

// ------------------------
// Init
// ------------------------
;(async function init() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) return console.error(error.message)

  if (session?.user) {
    currentUser = session.user
    await ensureUserProfile(currentUser)
    authDiv.classList.add('hidden')
    appDiv.classList.remove('hidden')
    profileName.value = currentUser.user_metadata.full_name || currentUser.email
    currentAvatar.src = currentUser.user_metadata.avatar_url || './default-avatar.png'
    await loadUsers()
  } else {
    authDiv.classList.remove('hidden')
  }
})()

