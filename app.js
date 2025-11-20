

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.33.0'

// ---------- Supabase ----------
const SUPABASE_URL = 'https://egusoznrqlddxpyqstqw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVndXNvem5ycWxkZHhweXFzdHF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA0MTQyOTIsImV4cCI6MjA3NTk5MDI5Mn0.N4TwIWVzTWMpmLJD95-wFd3NseWKrqNFb8gOWXIuf-c'
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ---------- Local fake user (NO LOGIN) ----------
let currentUser = JSON.parse(localStorage.getItem('convorio_user'))

if (!currentUser) {
  currentUser = {
    id: 'u-' + Math.random().toString(36).slice(2),
    name: 'User ' + Math.floor(Math.random() * 999),
    avatar_url: './default-avatar.png'
  }
  localStorage.setItem('convorio_user', JSON.stringify(currentUser))
}

// ---------- Globals ----------
let selectedUser = null
let chatChannel = null
const seenMessageIds = new Set()
let mobileView = 'messages'

// ---------- DOM ----------
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

// ---------- UI Setup ----------
profileName.value = currentUser.name
currentAvatar.src = currentUser.avatar_url

// ---------- Load Users (everyone except yourself) ----------
async function loadUsers() {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', currentUser.id)
      .order('name', { ascending: true })

    userList.innerHTML = ''

    if (error) return console.error(error)

    if (!data?.length) {
      userList.innerHTML = '<li>No other users yet</li>'
      return
    }

    data.forEach(u => {
      const li = document.createElement('li')
      li.textContent = u.name
      li.dataset.userId = u.id
      li.addEventListener('click', () => {
        li.classList.remove('new-message')
        selectUser(u)
      })
      userList.appendChild(li)
    })

    // Auto-select first user (desktop)
    if (window.innerWidth >= 768 && data.length) selectUser(data[0])
  } catch (e) {
    console.error(e)
  }
}

// ---------- Select chat recipient ----------
function selectUser(user) {
  selectedUser = user
  chatWith.textContent = `Chatting with ${user.name}`
  messageBox.classList.remove('hidden')
  messagesDiv.innerHTML = ''
  loadMessages()
  subscribeToChat()

  if (window.innerWidth < 768) {
    mobileView = 'messages'
    updateMobileView()
  }
}

// ---------- Send Message ----------
async function sendMessage() {
  const text = messageInput.value.trim()
  if (!text || !selectedUser) return

  messageInput.value = ''

  const tempMsg = {
    id: 'temp-' + Date.now(),
    sender_id: currentUser.id,
    sender_avatar: currentUser.avatar_url,
    receiver_id: selectedUser.id,
    content: text,
    created_at: new Date().toISOString()
  }

  appendMessage(tempMsg)

  try {
    const { error } = await supabase.from('messages').insert([
      {
        sender_id: currentUser.id,
        sender_avatar: currentUser.avatar_url,
        receiver_id: selectedUser.id,
        content: text,
      }
    ])

    if (error) console.error(error)
  } catch (e) {
    console.error(e)
  }
}

// ---------- Load messages ----------
async function loadMessages() {
  if (!selectedUser) return
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(
        `and(sender_id.eq.${currentUser.id},receiver_id.eq.${selectedUser.id}),and(sender_id.eq.${selectedUser.id},receiver_id.eq.${currentUser.id})`
      )
      .order('created_at', { ascending: true })

    messagesDiv.innerHTML = ''
    if (error) return console.error(error)

    data.forEach(appendMessage)

    messagesDiv.scrollTop = messagesDiv.scrollHeight
  } catch (e) {
    console.error(e)
  }
}

// ---------- Append message to UI ----------
function appendMessage(msg) {
  if (!msg) return
  if (seenMessageIds.has(msg.id)) return
  seenMessageIds.add(msg.id)

  const div = document.createElement('div')
  div.dataset.id = msg.id
  div.classList.add('message', msg.sender_id === currentUser.id ? 'mine' : 'theirs')

  const avatar = document.createElement('img')
  avatar.classList.add('avatar')
  avatar.src = msg.sender_avatar || './default-avatar.png'

  const text = document.createElement('div')
  text.classList.add('text')
  text.textContent = msg.content

  const time = document.createElement('div')
  time.classList.add('timestamp')
  time.textContent = new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  div.append(avatar, text, time)
  messagesDiv.appendChild(div)

  messagesDiv.scrollTop = messagesDiv.scrollHeight
}

// ---------- Realtime ----------
function subscribeToChat() {
  if (chatChannel) supabase.removeChannel(chatChannel)

  chatChannel = supabase.channel('realtime:messages')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
      const msg = payload.new
      const involved =
        msg.sender_id === currentUser.id ||
        msg.receiver_id === currentUser.id

      if (!involved) return

      appendMessage(msg)
    })
    .subscribe()
}

// ---------- Profile Update ----------
document.getElementById('save-profile-btn').addEventListener('click', async () => {
  currentUser.name = profileName.value
  localStorage.setItem('convorio_user', JSON.stringify(currentUser))
  await loadUsers()
})

// ---------- Tabs ----------
document.getElementById('tab-chat').addEventListener('click', () => {
  chatDiv.classList.remove('hidden')
  profileDiv.classList.add('hidden')
})
document.getElementById('tab-profile').addEventListener('click', () => {
  profileDiv.classList.remove('hidden')
  chatDiv.classList.add('hidden')
})

// ---------- Mobile view ----------
function updateMobileView() {
  const usersPanel = userList.parentElement
  const messagesPanel = messagesDiv.parentElement

  if (window.innerWidth < 768) {
    if (mobileView === 'users') {
      usersPanel.classList.remove('hidden')
      messagesPanel.classList.add('hidden')
    } else {
      usersPanel.classList.add('hidden')
      messagesPanel.classList.remove('hidden')
    }
  } else {
    usersPanel.classList.remove('hidden')
    messagesPanel.classList.remove('hidden')
  }
}

showUsersBtn.addEventListener('click', () => {
  mobileView = 'users'
  updateMobileView()
})
showMessagesBtn.addEventListener('click', () => {
  mobileView = 'messages'
  updateMobileView()
})
window.addEventListener('resize', updateMobileView)

// ---------- Start app immediately ----------
console.log('ConvoRio started with NO AUTH')
loadUsers()
subscribeToChat()
