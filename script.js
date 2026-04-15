import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";
import { getAuth, signInWithPopup, GithubAuthProvider, GoogleAuthProvider, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-firestore.js";

// NOTE: Using raw keys client-side is vulnerable to abuse. 
const firebaseConfig = {
    apiKey: "AIzaSyAvg0MRndHXMLjhrJIukBRjzZ4ztRcEhfQ",
    authDomain: "ace-horizon.firebaseapp.com",
    projectId: "ace-horizon",
    storageBucket: "ace-horizon.firebasestorage.app",
    messagingSenderId: "1017523773217",
    appId: "1:1017523773217:web:dbd7f5aa31f234d32aa860",
    measurementId: "G-8TF3HYRPK6"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// Global Error Boundaries
window.addEventListener('error', (event) => {
    console.error('Global Error:', event.error);
});
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled Promise Rejection:', event.reason);
});

// Cross-Session Long Term Memory
let longTermMemory = JSON.parse(localStorage.getItem('horizon_long_term_memory')) || [];

// Active Session Variables
let sessions = JSON.parse(localStorage.getItem('horizon_sessions')) || [];
let currentSessionId = localStorage.getItem('horizon_current_session') || null;
let chatHistory = [];       
let uiHistory = [];         
let attachedFilesData = []; 

// Global singleton for AudioContext to prevent severe memory leakage
let audioCtx = null;

// Settings States
let isGhostMode = false;
let sfxEnabled = true;
let hapticsEnabled = true;
let voiceResponseEnabled = false;
let currentTone = 'standard';
let statMessages = parseInt(localStorage.getItem('horizon_stat_msgs')) || 0;
let statTokens = parseInt(localStorage.getItem('horizon_stat_tokens')) || 0;
window.allParsedModels = []; 

// --- SPEECH SYNTHESIS VOICE CUSTOMIZATION ---
let availableVoices = [];

function loadAvailableVoices() {
    if (!window.speechSynthesis) return; 
    
    availableVoices = window.speechSynthesis.getVoices();
    const voiceSelect = document.getElementById('voiceSelect');
    if (!voiceSelect) return;

    voiceSelect.innerHTML = '';
    
    if (availableVoices.length === 0) {
        voiceSelect.innerHTML = '<option value="">System Default Voice (Loading...)</option>';
    } else {
        availableVoices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

        const savedVoiceIndex = localStorage.getItem('horizon_selected_voice');
        if (savedVoiceIndex !== null && availableVoices[savedVoiceIndex]) {
            voiceSelect.value = savedVoiceIndex;
        }
    }
}

// SAFE INITIALIZATION: Polling required for Android WebViews which delay TTS loading
if (window.speechSynthesis) {
    loadAvailableVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadAvailableVoices;
    }
    
    // Aggressive fallback polling for mobile environments
    let voicePolls = 0;
    const voiceInterval = setInterval(() => {
        if (availableVoices.length > 0 || voicePolls > 5) {
            clearInterval(voiceInterval);
            if (availableVoices.length === 0 && document.getElementById('voiceSelect')) {
                document.getElementById('voiceSelect').innerHTML = '<option value="">No Custom Voices Found (Using Default)</option>';
            }
        } else {
            loadAvailableVoices();
            voicePolls++;
        }
    }, 1000);
}

const TONE_DIRECTIVES = {
    'standard': '',
    'professional': 'Respond in a highly professional, objective, and concise manner.',
    'casual': 'Respond in a very casual, friendly, and approachable tone. Use conversational language.',
    'sarcastic': 'Respond with a witty, slightly sarcastic, and humorous tone.',
    'academic': 'Respond in a highly detailed, academic, and analytical tone with deep explanations.'
};

// --- SYSTEM INFO (Privacy Friendly) ---
function parseSystemInfo() {
    const sysTokensEl = document.getElementById('sysStatTokens');
    document.getElementById('sysBrowserInfo')?.remove();
    document.getElementById('sysDeviceInfo')?.remove();
    if (sysTokensEl) sysTokensEl.innerText = statTokens.toLocaleString() || '0';
}
document.addEventListener("DOMContentLoaded", parseSystemInfo);

// --- THEME TOGGLE (Only Pitch Tar & Light) ---
const themes = ['pitch-tar-mode', 'light-mode'];
const themeIcons = ['ph-moon-stars', 'ph-sun-dim'];
let currentThemeIndex = parseInt(localStorage.getItem('horizon_theme_index')) || 0;

// Prevent accessing undefined index if previously saved as 2 (from old 3-theme setup)
if (currentThemeIndex > 1) currentThemeIndex = 0; 

function applyTheme() {
    document.body.classList.remove('dark-mode', 'pitch-black-mode', 'pitch-tar-mode', 'light-mode');
    document.body.classList.add(themes[currentThemeIndex]);
    
    const themeIcon = document.getElementById('themeIcon');
    if(themeIcon) themeIcon.className = `ph-fill ${themeIcons[currentThemeIndex]}`;
    
    localStorage.setItem('horizon_theme_index', currentThemeIndex.toString());
}
applyTheme();

document.getElementById('btn-toggle-theme')?.addEventListener('click', () => {
    currentThemeIndex = (currentThemeIndex + 1) % themes.length;
    applyTheme();
});


// --- AUTHENTICATION FLOW ---
const authLoader = document.getElementById('auth-loading-overlay');
let authMode = 'login'; 

document.getElementById('btn-get-started')?.addEventListener('click', () => {
    const intro = document.getElementById('landing-intro');
    const authCard = document.getElementById('landing-auth');
    if(intro && authCard) {
        intro.style.opacity = '0';
        intro.style.transform = 'scale(0.95)';
        setTimeout(() => {
            intro.style.display = 'none';
            authCard.style.display = 'block';
            void authCard.offsetWidth;
            authCard.style.opacity = '1';
            authCard.style.transform = 'scale(1)';
        }, 400);
    }
});

document.getElementById('btn-back-intro')?.addEventListener('click', () => {
    const intro = document.getElementById('landing-intro');
    const authCard = document.getElementById('landing-auth');
    if(intro && authCard) {
        authCard.style.opacity = '0';
        authCard.style.transform = 'scale(0.95)';
        setTimeout(() => {
            authCard.style.display = 'none';
            intro.style.display = 'flex';
            void intro.offsetWidth; 
            intro.style.opacity = '1';
            intro.style.transform = 'scale(1)';
        }, 400);
    }
});

document.getElementById('tab-login')?.addEventListener('click', () => {
    authMode = 'login';
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('tab-signup')?.classList.remove('active');
    const tcCont = document.getElementById('tc-container');
    if(tcCont) tcCont.style.display = 'none';
});

document.getElementById('tab-signup')?.addEventListener('click', () => {
    authMode = 'signup';
    document.getElementById('tab-signup').classList.add('active');
    document.getElementById('tab-login')?.classList.remove('active');
    const tcCont = document.getElementById('tc-container');
    if(tcCont) tcCont.style.display = 'block';
});

function activateGhostMode() {
    isGhostMode = true;
    chatHistory = []; 
    uiHistory = [];
    
    document.getElementById('ghostIndicator')?.classList.add('active');
    
    const lp = document.getElementById('landing-page');
    if(lp) lp.style.display = 'none';
    
    const appCont = document.getElementById('app-container');
    if(appCont) appCont.style.display = 'block';
    
    checkAndShowTutorialLock();
    
    const authStatus = document.getElementById('sysAuthStatus');
    if(authStatus) authStatus.innerHTML = `<i class="ph-bold ph-ghost" style="color:#ff4757;"></i> Secured: Ghost`;
    
    const cb = document.getElementById('chatBox');
    if(cb) {
        cb.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 1.05rem; margin: auto;"><i class="ph-fill ph-ghost" style="font-size: 3rem; color: #ff4757;"></i><br>Ghost Mode Active. Memories disabled.</div>';
    }
    
    const sbc = document.getElementById('sidebarChatList');
    if(sbc) {
        sbc.innerHTML = '<div style="padding: 10px; color: var(--text-muted); font-size: 0.85rem; text-align:center;">History is turned off.</div>';
    }
}

const savedAuthMethod = localStorage.getItem('horizon_auth_method');

if (savedAuthMethod === 'ghost') {
    const ghostTimestamp = localStorage.getItem('horizon_ghost_timestamp');
    const twentyEightDaysInMs = 28 * 24 * 60 * 60 * 1000;
    
    if (ghostTimestamp && (Date.now() - parseInt(ghostTimestamp, 10)) > twentyEightDaysInMs) {
        localStorage.removeItem('horizon_auth_method');
        localStorage.removeItem('horizon_ghost_timestamp');
        localStorage.removeItem('horizon_sessions');
        localStorage.removeItem('horizon_long_term_memory');
        alert("Your 28-Day ephemeral Ghost Session has expired and data has been purged.");
        window.location.reload();
    } else {
        activateGhostMode();
    }
} else {
    if(authLoader) authLoader.style.display = 'flex';
}

onAuthStateChanged(auth, (user) => {
    if(authLoader) authLoader.style.display = 'none';
    if (isGhostMode) return; 
    
    if (user) {
        localStorage.setItem('horizon_auth_method', 'firebase');
        const lp = document.getElementById('landing-page');
        if(lp) lp.style.display = 'none';
        const ac = document.getElementById('app-container');
        if(ac) ac.style.display = 'block';
        applyProfileOverrides(user);
        initSessions();
        checkAndShowTutorialLock();
    } else {
        const lp = document.getElementById('landing-page');
        if(lp) lp.style.display = 'flex';
        const ac = document.getElementById('app-container');
        if(ac) ac.style.display = 'none';
    }
});

document.getElementById('btn-auth-go')?.addEventListener('click', async () => {
    const email = document.getElementById('auth-email')?.value;
    const pwd = document.getElementById('auth-password')?.value;
    const tcChecked = document.getElementById('auth-tc')?.checked;
    
    if (!email || !pwd) return alert("Please enter both email and password.");
    
    if (authMode === 'signup' && !tcChecked) {
        return alert("You must agree to the Terms & Conditions to sign up.");
    }

    if(authLoader) authLoader.style.display = 'flex';
    try {
        if (authMode === 'login') {
            await signInWithEmailAndPassword(auth, email, pwd);
        } else {
            await createUserWithEmailAndPassword(auth, email, pwd);
        }
        localStorage.setItem('horizon_auth_method', 'firebase');
    } catch (err) {
        if(authLoader) authLoader.style.display = 'none';
        alert("Authentication Error: " + err.message);
    }
});

document.getElementById('btn-login-github')?.addEventListener('click', async () => {
    const provider = new GithubAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        localStorage.setItem('horizon_auth_method', 'firebase');
    } catch (err) {
        alert("GitHub Login Error: " + err.message);
    }
});

document.getElementById('btn-login-google')?.addEventListener('click', async () => {
    const provider = new GoogleAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        localStorage.setItem('horizon_auth_method', 'firebase');
    } catch (err) {
        alert("Google Login Error: " + err.message);
    }
});

document.getElementById('btn-login-ghost')?.addEventListener('click', () => {
    localStorage.setItem('horizon_auth_method', 'ghost');
    localStorage.setItem('horizon_ghost_timestamp', Date.now().toString());
    const lp = document.getElementById('landing-page');
    if(lp) lp.style.opacity = '0';
    setTimeout(activateGhostMode, 500);
});

document.getElementById('btn-logout')?.addEventListener('click', async () => {
    localStorage.removeItem('horizon_auth_method');
    localStorage.removeItem('horizon_ghost_timestamp');
    if (!isGhostMode) await signOut(auth); 
    location.reload();
});


// --- SESSION MANAGEMENT & WELCOME MSG ---
function updateGreeting() {
    const hr = new Date().getHours();
    let greeting = hr < 12 ? "Good Morning" : hr < 18 ? "Good Afternoon" : "Good Evening";
    const savedName = localStorage.getItem('horizon_custom_name');
    let name = savedName || (auth.currentUser ? (auth.currentUser.displayName || (auth.currentUser.email ? auth.currentUser.email.split('@')[0] : 'User')) : 'User');
    if (isGhostMode) name = 'Ghost';
    return `${greeting}, ${name}!`;
}

function updateIcebreakers(modelId) {
    if(!modelId) return '';
    const idLower = modelId.toLowerCase();
    let options = [];
    
    if (idLower.includes('vision') || idLower.includes('gpt-4o') || idLower.includes('gemini') || idLower.includes('claude-3') || idLower.includes('pixtral')) {
        options.push('<i class="ph-bold ph-image"></i> Analyze the details in an image');
    }
    if (idLower.includes('pro') || idLower.includes('opus') || idLower.includes('large') || idLower.includes('gpt-4')) {
        options.push('<i class="ph-bold ph-code"></i> Write a Python script for a web scraper');
        options.push('<i class="ph-bold ph-math-operations"></i> Solve a complex logic puzzle');
    }
    if (idLower.includes('free') || idLower.includes('flash') || idLower.includes('mini') || idLower.includes('haiku')) {
        options.push('<i class="ph-bold ph-text-align-left"></i> Summarize a long article');
        options.push('<i class="ph-bold ph-envelope-simple"></i> Draft a professional email');
    }
    
    if(options.length < 2) {
        options.push('<i class="ph-bold ph-lightbulb"></i> Give me 5 creative ideas for a blog');
        options.push('<i class="ph-bold ph-translate"></i> Translate a sentence to Spanish');
    }

    let html = `<div class="icebreaker-container">`;
    options.forEach(opt => {
        html += `<button class="icebreaker-btn">${DOMPurify.sanitize(opt)}</button>`;
    });
    html += `</div>`;
    return html;
}

function renderPlaceholder() {
    const modelEl = document.getElementById('modelSelect');
    const model = modelEl ? modelEl.value : '';
    const greeting = DOMPurify.sanitize(updateGreeting());
    const icebreakers = updateIcebreakers(model); 
    
    return `<div style="text-align: center; color: var(--text-muted); font-size: 1.05rem; margin: auto; display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%;" id="placeholderMsg">
        <i class="ph-fill ph-sparkle" style="font-size: 3.5rem; color: var(--accent); filter: drop-shadow(0 0 15px var(--accent-glow));"></i>
        <span style="text-shadow: 0 1px 2px rgba(0,0,0,0.6); line-height: 1.5; font-size: 1.2rem; font-weight: 600; color: var(--text-light);">${greeting}</span>
        <span style="font-size: 0.9rem;">What's on your mind today?</span>
        ${icebreakers}
    </div>`;
}

// Bind Icebreakers safely
document.getElementById('chatBox')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.icebreaker-btn');
    if(btn) {
        const text = btn.innerText.trim();
        const userInput = document.getElementById('userInput');
        if(userInput) {
            userInput.value = text;
            userInput.focus();
        }
    }
});

function initSessions() {
    if (isGhostMode) return;
    if (sessions.length === 0 || !currentSessionId) {
        createNewSession();
    } else {
        loadSession(currentSessionId);
    }
    renderSidebarSessions();
}

function createNewSession() {
    chatHistory = [];
    uiHistory = [];
    currentSessionId = Date.now().toString();
    sessions.unshift({ id: currentSessionId, title: 'New Chat', pinned: false, uiHistory: [], apiHistory: [], timestamp: Date.now() });
    
    const cb = document.getElementById('chatBox');
    if(cb) cb.innerHTML = renderPlaceholder();
    
    const titleDisplay = document.getElementById('chatTitleDisplay');
    if (titleDisplay) titleDisplay.innerText = 'New Chat';
    
    saveSessionData();
}

function loadSession(id) {
    currentSessionId = id;
    const session = sessions.find(s => s.id === id);
    if (session) {
        uiHistory = session.uiHistory || [];
        chatHistory = session.apiHistory || [];
        
        const titleDisplay = document.getElementById('chatTitleDisplay');
        if (titleDisplay) titleDisplay.innerText = session.title || 'New Chat';

        const cb = document.getElementById('chatBox');
        if(cb) {
            cb.innerHTML = '';
            if (uiHistory.length === 0) {
                cb.innerHTML = renderPlaceholder();
            } else {
                uiHistory.forEach(msg => renderMessageToDOM(msg.role, msg.text, msg.files, true));
                scrollToBottom();
            }
        }
        saveSessionData();
    }
}

async function generateChatTitle(userMessage, sessionIndex) {
    const provider = document.getElementById('provider')?.value;
    const apiKey = document.getElementById('apiKey')?.value;
    const model = document.getElementById('modelSelect')?.value;

    const fallbackTitle = userMessage.substring(0, 20) + (userMessage.length > 20 ? '...' : '');

    if (!apiKey || !model) {
        if (sessions[sessionIndex] && sessions[sessionIndex].id === currentSessionId) {
            updateSessionTitle(sessionIndex, fallbackTitle);
        }
        return;
    }

    const titlePrompt = `Generate a concise, 2-4 word title that summarizes the context of this prompt. Respond ONLY with the title text itself, NO quotes, NO conversational filler: "${userMessage}"`;

    try {
        let title = "";
        if (provider === 'openrouter' || provider === 'portkey') {
            const url = provider === 'openrouter' ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.portkey.ai/v1/chat/completions";
            const headers = provider === 'openrouter' ? { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://horizon-ai.app", "X-Title": "Horizon.AI" } : { "x-portkey-api-key": apiKey, "Content-Type": "application/json" };
            
            const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ model: model, messages: [{role: "user", content: titlePrompt}] }) });
            const data = await res.json();
            if(data.choices && data.choices.length > 0) title = data.choices[0].message.content.replace(/["']/g, '').trim();
        } else if (provider === 'aistudio') {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{role: "user", parts: [{text: titlePrompt}]}] })
            });
            const data = await res.json();
            if(data.candidates && data.candidates.length > 0) title = data.candidates[0].content.parts[0].text.replace(/["']/g, '').trim();
        }

        if (title.toLowerCase().startsWith('title:')) title = title.substring(6).trim();
        
        if (sessions[sessionIndex] && sessions[sessionIndex].id === currentSessionId) {
            updateSessionTitle(sessionIndex, title || fallbackTitle);
        }
    } catch (e) {
        if (sessions[sessionIndex] && sessions[sessionIndex].id === currentSessionId) {
            updateSessionTitle(sessionIndex, fallbackTitle);
        }
    }
}

function updateSessionTitle(index, title) {
    if(sessions[index]) {
        sessions[index].title = DOMPurify.sanitize(title);
        localStorage.setItem('horizon_sessions', JSON.stringify(sessions));
        renderSidebarSessions();
        if (sessions[index].id === currentSessionId) {
            const titleDisplay = document.getElementById('chatTitleDisplay');
            if (titleDisplay) titleDisplay.innerText = title;
        }
    }
}

async function saveSessionsToCloud(userId) {
    try {
        await setDoc(doc(db, "users", userId), {
            sessions: sessions,
            longTermMemory: longTermMemory
        });
    } catch(e) {
        console.error("Cloud save error:", e);
    }
}

function saveSessionData() {
    if (isGhostMode) return;
    
    if (sessions.length > 50) {
        sessions.length = 50; 
    }

    const sessionIndex = sessions.findIndex(s => s.id === currentSessionId);
    if (sessionIndex > -1) {
        sessions[sessionIndex].uiHistory = uiHistory;
        sessions[sessionIndex].apiHistory = chatHistory;
        
        if (sessions[sessionIndex].title === 'New Chat' && uiHistory.length > 0) {
            const firstUserMsg = uiHistory.find(m => m.role === 'user')?.text || '';
            if(firstUserMsg) {
                sessions[sessionIndex].title = "Generating Context..."; 
                renderSidebarSessions();
                
                const titleDisplay = document.getElementById('chatTitleDisplay');
                if (titleDisplay) titleDisplay.innerText = "Generating Context...";
                
                generateChatTitle(firstUserMsg, sessionIndex);
            }
        } else {
            localStorage.setItem('horizon_sessions', JSON.stringify(sessions));
            localStorage.setItem('horizon_current_session', currentSessionId);
            
            if (auth.currentUser) {
                saveSessionsToCloud(auth.currentUser.uid);
            }
        }
    }
}

// --- UI INTERACTIONS (SIDEBAR, SEARCH, EXPORT & ACTIONS) ---
let activeContextMenu = null;
document.addEventListener('click', (e) => { 
    if(activeContextMenu && !e.target.closest('.context-menu')) { 
        activeContextMenu.remove(); 
        activeContextMenu = null; 
    }
    const modelSelector = e.target.closest('#quickModelSelector');
    const modelDropdown = document.getElementById('quickModelDropdown');
    if (modelSelector && !e.target.closest('.custom-option') && !e.target.closest('#quickModelSearchBox')) {
        if(modelDropdown) modelDropdown.classList.toggle('active');
    } else if (!modelSelector && modelDropdown) {
        modelDropdown.classList.remove('active');
    }

    const pinBtn = e.target.closest('#btn-pin-actions');
    const pinWrapper = e.target.closest('.input-actions-wrapper');
    const expandedActions = document.getElementById('expanded-actions');
    const actualPinBtn = document.getElementById('btn-pin-actions');
    
    if (pinBtn) {
        expandedActions?.classList.toggle('active');
        actualPinBtn?.classList.toggle('active');
    } else if (!pinWrapper && expandedActions) {
        expandedActions?.classList.remove('active');
        actualPinBtn?.classList.remove('active');
    }
});

document.getElementById('chatSearchInput')?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('.chat-history-item').forEach(item => {
        const titleText = item.querySelector('.chat-title-text')?.innerText.toLowerCase() || '';
        if(titleText.includes(term)) item.style.display = 'flex';
        else item.style.display = 'none';
    });
});

document.getElementById('quickModelSearchBox')?.addEventListener('keyup', (e) => {
    const term = e.target.value.toLowerCase();
    document.querySelectorAll('#quickModelListContainer .custom-option').forEach(item => {
        if(item.innerText.toLowerCase().includes(term)) item.style.display = 'flex';
        else item.style.display = 'none';
    });
});


document.getElementById('btn-toggle-footer')?.addEventListener('click', function() {
    this.classList.toggle('open');
    document.getElementById('sidebarFooterContent')?.classList.toggle('open');
});

function renderSidebarSessions() {
    const list = document.getElementById('sidebarChatList');
    if(!list) return;
    list.innerHTML = '';

    sessions.sort((a, b) => {
        if (a.pinned === b.pinned) return b.timestamp - a.timestamp;
        return a.pinned ? -1 : 1;
    });

    sessions.forEach((session, index) => {
        const btn = document.createElement('div');
        btn.className = `chat-history-item ${session.id === currentSessionId ? 'active' : ''}`;
        
        const wrapper = document.createElement('div');
        wrapper.className = 'chat-title-wrapper';
        const cleanTitle = DOMPurify.sanitize(session.title);
        wrapper.innerHTML = `${session.pinned ? '<i class="ph-fill ph-push-pin" style="color:var(--accent)"></i>' : '<i class="ph-fill ph-chat-circle-dots"></i>'} <span class="chat-title-text">${cleanTitle}</span>`;
        
        wrapper.addEventListener('click', () => {
            if(session.id !== currentSessionId) {
                loadSession(session.id);
                if (window.innerWidth <= 768) toggleSidebar();
            }
        });
        btn.appendChild(wrapper);

        const optionsBtn = document.createElement('button');
        optionsBtn.className = 'btn-icon chat-options-btn';
        optionsBtn.innerHTML = '<i class="ph-bold ph-dots-three"></i>';
        optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if(activeContextMenu) activeContextMenu.remove();
            
            const menu = document.createElement('div');
            menu.className = 'context-menu glass';
            menu.style.top = `${e.clientY + 10}px`;
            menu.style.left = `${e.clientX}px`;

            const renameBtn = document.createElement('button');
            renameBtn.innerHTML = '<i class="ph-bold ph-pencil-simple"></i> Rename';
            renameBtn.onclick = () => {
                const newTitle = prompt("Enter new chat name:", session.title);
                if (newTitle) updateSessionTitle(index, newTitle);
            };

            const pinBtn = document.createElement('button');
            pinBtn.innerHTML = `<i class="ph-bold ph-push-pin"></i> ${session.pinned ? 'Unpin' : 'Pin'}`;
            pinBtn.onclick = () => {
                session.pinned = !session.pinned;
                localStorage.setItem('horizon_sessions', JSON.stringify(sessions));
                renderSidebarSessions();
            };

            const exportBtn = document.createElement('button');
            exportBtn.innerHTML = `<i class="ph-bold ph-download-simple"></i> Export`;
            exportBtn.onclick = () => {
                const chatData = sessions[index].uiHistory.map(m => `${m.role.toUpperCase()}:\n${m.text}`).join('\n\n---\n\n');
                const blob = new Blob([chatData], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); 
                a.href = url; 
                a.download = `${sessions[index].title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`;
                a.click(); 
                URL.revokeObjectURL(url);
            };

            const delBtn = document.createElement('button');
            delBtn.innerHTML = `<i class="ph-bold ph-trash" style="color:#ff4757;"></i> Delete`;
            delBtn.onclick = () => {
                if(confirm("Are you sure you want to delete this chat?")) {
                    sessions.splice(index, 1);
                    localStorage.setItem('horizon_sessions', JSON.stringify(sessions));
                    if (session.id === currentSessionId) {
                        createNewSession(); 
                    } else {
                        renderSidebarSessions();
                    }
                }
            };

            menu.appendChild(renameBtn); menu.appendChild(pinBtn); menu.appendChild(exportBtn); menu.appendChild(delBtn);
            document.body.appendChild(menu);
            activeContextMenu = menu;
        });
        btn.appendChild(optionsBtn);
        
        list.appendChild(btn);
    });
}

document.getElementById('btn-new-chat')?.addEventListener('click', () => {
    createNewSession();
    if (window.innerWidth <= 768) toggleSidebar();
});


// --- SENSORY FEEDBACK & STATS ---
function checkAndShowTutorialLock() {
    if (!localStorage.getItem('horizon_tutorial_done')) {
        const tl = document.getElementById('tutorialLock');
        if(tl) tl.style.display = 'flex';
        document.getElementById('btn-close-tutorial')?.addEventListener('click', () => {
            if(tl) tl.style.display = 'none';
            localStorage.setItem('horizon_tutorial_done', 'true');
            if (window.innerWidth <= 768) {
                document.getElementById('mainSidebar')?.classList.remove('collapsed');
                document.getElementById('mobileOverlay')?.classList.add('active');
            }
        });
    }
}

function triggerHaptic() { if (hapticsEnabled && navigator.vibrate) navigator.vibrate(50); }
function playPopSound() {
    if (!sfxEnabled) return;
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(audioCtx.currentTime); osc.stop(audioCtx.currentTime + 0.1);
    } catch(e) {}
}

document.querySelectorAll('button').forEach(btn => btn.addEventListener('click', triggerHaptic));

function applyProfileOverrides(user) {
    if (isGhostMode) return;
    const savedName = localStorage.getItem('horizon_custom_name');
    const savedPfp = localStorage.getItem('horizon_custom_pfp');
    const displayStr = savedName || (user ? user.displayName || (user.email ? user.email.split('@')[0] : 'User') : 'User');
    
    const nameEl = document.getElementById('editProfileName');
    if(nameEl) nameEl.value = displayStr;
    
    const avatarEl = document.getElementById('userProfileAvatar');
    if(avatarEl) avatarEl.src = savedPfp || (user && user.photoURL ? user.photoURL : 'https://via.placeholder.com/40');
    
    if (user) {
        let providerName = 'Email';
        if(user.providerData[0]?.providerId === 'google.com') providerName = 'Google';
        if(user.providerData[0]?.providerId === 'github.com') providerName = 'GitHub';
        const statEl = document.getElementById('sysAuthStatus');
        if(statEl) statEl.innerHTML = `<i class="ph-bold ph-check-circle" style="color:#2ecc71;"></i> Secured: ${providerName}`;
    }
}

function updateStatsUI(addedTokens = 0) {
    if (isGhostMode) return;
    statMessages += 1; statTokens += addedTokens;
    localStorage.setItem('horizon_stat_msgs', statMessages.toString());
    localStorage.setItem('horizon_stat_tokens', statTokens.toString());
    const statEl = document.getElementById('sysStatTokens');
    if(statEl) statEl.innerText = statTokens.toLocaleString();
}

// --- MARKDOWN RENDERING & EVENT DELEGATION ---
const renderer = new marked.Renderer();
renderer.code = function(token, legacyLang) {
    let actualCode = "";
    let lang = legacyLang || "txt";
    if (typeof token === 'object' && token !== null) {
        actualCode = token.text || "";
        lang = token.lang || "txt";
    } else {
        actualCode = String(token || "");
    }
    const escapedCode = actualCode.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const bytes = new TextEncoder().encode(actualCode);
    const binStr = Array.from(bytes, b => String.fromCharCode(b)).join("");
    const encodedForDownload = btoa(binStr); 
    
    return `
    <div class="code-wrapper">
        <div class="code-header">
            <span style="display:flex; align-items:center; gap:8px;"><i class="ph-bold ph-file-code"></i> ${DOMPurify.sanitize(lang).toUpperCase()}</span>
            <div class="code-header-actions">
                <button class="code-action-btn btn-code-copy" data-code="${encodedForDownload}"><i class="ph-bold ph-copy"></i> Copy Code</button>
            </div>
        </div>
        <pre><code class="language-${DOMPurify.sanitize(lang)}">${escapedCode}</code></pre>
    </div>`;
};
marked.use({ renderer });
marked.setOptions({ breaks: true, gfm: true });

document.getElementById('chatBox')?.addEventListener('click', (e) => {
    // Code Block Copy
    const copyBtn = e.target.closest('.btn-code-copy');
    if (copyBtn) {
        const base64Code = copyBtn.getAttribute('data-code');
        const binaryStr = atob(base64Code);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
            bytes[i] = binaryStr.charCodeAt(i);
        }
        const decodedCode = new TextDecoder().decode(bytes);
        
        navigator.clipboard.writeText(decodedCode).then(() => {
            const originalHTML = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="ph-bold ph-check" style="color:#2ecc71;"></i> Copied';
            setTimeout(() => copyBtn.innerHTML = originalHTML, 2000);
        });
    }
    
    // Message Actions (Copy)
    const copyMsgBtn = e.target.closest('.btn-copy-msg');
    if (copyMsgBtn) {
        const msgBlock = copyMsgBtn.closest('.message');
        const textToCopy = msgBlock?.querySelector('.message-content')?.innerText || '';
        navigator.clipboard.writeText(textToCopy).then(() => {
            const icon = copyMsgBtn.querySelector('i');
            icon.className = 'ph-bold ph-check';
            icon.style.color = '#2ecc71';
            setTimeout(() => {
                icon.className = 'ph-bold ph-copy';
                icon.style.color = '';
            }, 1500);
        });
    }

    // Message Actions (Edit User Message)
    const editBtn = e.target.closest('.btn-edit-msg');
    if (editBtn) {
        const msgBlock = editBtn.closest('.message');
        const textToEdit = msgBlock?.querySelector('.message-content')?.innerText || '';
        const inputArea = document.getElementById('userInput');
        if(inputArea) {
            inputArea.value = textToEdit;
            inputArea.focus();
        }
    }

    // Message Actions (Delete Message)
    const deleteBtn = e.target.closest('.btn-delete-msg');
    if (deleteBtn) {
        if(confirm("Are you sure you want to delete this message?")) {
            const msgBlock = deleteBtn.closest('.message');
            const allMessages = Array.from(document.getElementById('chatBox').querySelectorAll('.message:not(#typingIndicatorActive)'));
            const index = allMessages.indexOf(msgBlock);
            if(index > -1) {
                uiHistory.splice(index, 1);
                chatHistory.splice(index, 1);
                msgBlock.remove();
                saveSessionData();
                if(uiHistory.length === 0) {
                    const cb = document.getElementById('chatBox');
                    if(cb) cb.innerHTML = renderPlaceholder();
                }
            }
        }
    }
});


// --- MODALS & CONFIGURATIONS ---
const toggleSidebar = () => {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('mobileOverlay');
    if(sidebar) sidebar.classList.toggle('collapsed');
    if(overlay && sidebar) overlay.classList.toggle('active', !sidebar.classList.contains('collapsed'));
};

document.getElementById('btn-toggle-sidebar')?.addEventListener('click', toggleSidebar);
document.getElementById('mobileOverlay')?.addEventListener('click', toggleSidebar); 
if (window.innerWidth <= 768) document.getElementById('mainSidebar')?.classList.add('collapsed');

document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    document.getElementById('settingsModal')?.classList.add('active');
});
document.getElementById('btn-close-settings')?.addEventListener('click', () => document.getElementById('settingsModal')?.classList.remove('active'));


// Profile Modal
document.getElementById('btn-user-profile')?.addEventListener('click', async () => {
    if (isGhostMode) return alert("Profile stats are disabled in Ephemeral/Ghost Mode.");
    const msgsEl = document.getElementById('statMsgs');
    if(msgsEl) msgsEl.innerText = statMessages;
    
    const provider = document.getElementById('provider')?.value;
    const apiKey = document.getElementById('apiKey')?.value;
    const creditInfoDiv = document.getElementById('apiCreditsInfo');
    if(creditInfoDiv) creditInfoDiv.style.display = 'none';
    
    if (provider === 'openrouter' && apiKey && creditInfoDiv) {
        creditInfoDiv.style.display = 'block';
        creditInfoDiv.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> Fetching limits...';
        try {
            const res = await fetch("https://openrouter.ai/api/v1/auth/key", { headers: { "Authorization": `Bearer ${apiKey}` }});
            const data = await res.json();
            if(data && data.data) {
                const { limit, usage, is_free_tier } = data.data;
                if(limit !== null) {
                    creditInfoDiv.innerHTML = `<i class="ph-fill ph-check-circle"></i> OpenRouter Limit: $${(limit - usage).toFixed(4)} remaining`;
                } else {
                    creditInfoDiv.innerHTML = `<i class="ph-fill ph-infinity"></i> OpenRouter Limit: ${is_free_tier ? 'Free Tier' : 'Unlimited/Pay-as-you-go'}`;
                }
            } else creditInfoDiv.style.display = 'none';
        } catch(e) { creditInfoDiv.innerHTML = 'Could not retrieve credits'; }
    }

    document.getElementById('profileModalOverlay')?.classList.add('active');
});

// PFP Upload Logic
document.getElementById('btn-upload-pfp')?.addEventListener('click', () => {
    document.getElementById('pfpFileInput')?.click();
});
document.getElementById('pfpFileInput')?.addEventListener('change', function() {
    const file = this.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = e => {
            const pfpInput = document.getElementById('editProfilePfp');
            if(pfpInput) pfpInput.value = e.target.result;
            const avatar = document.getElementById('userProfileAvatar');
            if(avatar) avatar.src = e.target.result; 
        };
        reader.readAsDataURL(file);
    }
});


document.getElementById('btn-close-profile')?.addEventListener('click', () => document.getElementById('profileModalOverlay')?.classList.remove('active'));
document.getElementById('btn-save-profile')?.addEventListener('click', () => {
    const nameEl = document.getElementById('editProfileName');
    const pfpEl = document.getElementById('editProfilePfp');
    const newName = nameEl ? nameEl.value.trim() : '';
    const newPfp = pfpEl ? pfpEl.value.trim() : '';
    
    if (newName) localStorage.setItem('horizon_custom_name', newName);
    if (newPfp) localStorage.setItem('horizon_custom_pfp', newPfp);
    applyProfileOverrides(auth.currentUser);
    document.getElementById('profileModalOverlay')?.classList.remove('active');
    
    const cb = document.getElementById('chatBox');
    if(uiHistory.length === 0 && cb) cb.innerHTML = renderPlaceholder();
});

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '88, 101, 242';
}
const updateAccentColor = (hex) => {
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-dark', hex + 'cc'); 
    document.documentElement.style.setProperty('--accent-alpha', `rgba(${hexToRgb(hex)}, 0.4)`);
    document.documentElement.style.setProperty('--accent-glow', `rgba(${hexToRgb(hex)}, 0.6)`);
};

const updateApiLinkUI = (providerName) => {
    const linkEl = document.getElementById('apiKeyLink');
    if(!linkEl) return;
    if (providerName === 'openrouter') { linkEl.href = "https://openrouter.ai/keys"; linkEl.innerHTML = '<i class="ph-bold ph-arrow-square-out"></i> Get OpenRouter Key'; }
    else if (providerName === 'aistudio') { linkEl.href = "https://aistudio.google.com/app/apikey"; linkEl.innerHTML = '<i class="ph-bold ph-arrow-square-out"></i> Get Google AI Key'; }
    else if (providerName === 'portkey') { linkEl.href = "https://app.portkey.ai/api-keys"; linkEl.innerHTML = '<i class="ph-bold ph-arrow-square-out"></i> Get Portkey Key'; }
};

const initSettings = () => {
    const savedProvider = localStorage.getItem('horizon_provider') || 'openrouter';
    const providerEl = document.getElementById('provider');
    if(providerEl) providerEl.value = savedProvider;
    updateApiLinkUI(savedProvider);
    
    const apiEl = document.getElementById('apiKey');
    const promptEl = document.getElementById('systemPrompt');
    if(apiEl) apiEl.value = localStorage.getItem('horizon_key') || '';
    if(promptEl) promptEl.value = localStorage.getItem('horizon_prompt') || '';
    
    const savedColor = localStorage.getItem('horizon_color') || '#5865F2';
    const colorEl = document.getElementById('accentColorPicker');
    if(colorEl) colorEl.value = savedColor;
    updateAccentColor(savedColor);

    sfxEnabled = localStorage.getItem('horizon_sfx') !== 'false';
    hapticsEnabled = localStorage.getItem('horizon_haptics') !== 'false';
    voiceResponseEnabled = localStorage.getItem('horizon_voice') === 'true';
    currentTone = localStorage.getItem('horizon_tone') || 'standard';

    const sfxT = document.getElementById('sfxToggle');
    const hapticsT = document.getElementById('hapticsToggle');
    const voiceT = document.getElementById('voiceToggle');
    const toneT = document.getElementById('chatTone');
    
    if(sfxT) sfxT.checked = sfxEnabled;
    if(hapticsT) hapticsT.checked = hapticsEnabled;
    if(voiceT) voiceT.checked = voiceResponseEnabled;
    if(toneT) toneT.value = currentTone;

    const savedModel = localStorage.getItem('horizon_model');
    if (savedModel) {
        const sel = document.getElementById('modelSelect');
        if(sel) sel.value = savedModel;
        const shortName = savedModel.split('/').pop();
        const trig = document.getElementById('modelSelectTrigger');
        if(trig) trig.innerHTML = `<span>${DOMPurify.sanitize(shortName)}</span> <i class="ph-bold ph-caret-down"></i>`;
        const qlbl = document.getElementById('quickModelLabel');
        if(qlbl) qlbl.innerText = shortName;
    }

    if (apiEl && apiEl.value) {
        fetchAvailableModels(true);
    }
};
initSettings();

// --- SYNC SETTINGS: Persist all user configuration to localStorage ---
const syncSettings = () => {
    // --- Core Configuration Values ---
    const providerVal = document.getElementById('provider')?.value || 'openrouter';
    const apiVal = document.getElementById('apiKey')?.value || '';
    const modelVal = document.getElementById('modelSelect')?.value || '';
    const promptVal = document.getElementById('systemPrompt')?.value || '';
    const colorVal = document.getElementById('accentColorPicker')?.value || '#5865F2';
    const toneVal = document.getElementById('chatTone')?.value || 'standard';

    // --- Feature Toggles ---
    sfxEnabled = document.getElementById('sfxToggle')?.checked ?? true;
    hapticsEnabled = document.getElementById('hapticsToggle')?.checked ?? true;
    voiceResponseEnabled = document.getElementById('voiceToggle')?.checked ?? false;

    // --- Speech Synthesis Voice Selection ---
    const voiceSelect = document.getElementById('voiceSelect');
    const selectedVoiceIndex = voiceSelect?.value ?? null;

    // --- Persist Settings to localStorage ---
    try {
        localStorage.setItem('horizon_provider', providerVal);
        localStorage.setItem('horizon_key', apiVal);
        localStorage.setItem('horizon_model', modelVal);
        localStorage.setItem('horizon_prompt', promptVal);
        localStorage.setItem('horizon_color', colorVal);
        localStorage.setItem('horizon_sfx', sfxEnabled);
        localStorage.setItem('horizon_haptics', hapticsEnabled);
        localStorage.setItem('horizon_voice', voiceResponseEnabled);
        localStorage.setItem('horizon_tone', toneVal);

        // Save selected TTS voice
        if (selectedVoiceIndex !== null) {
            localStorage.setItem('horizon_selected_voice', selectedVoiceIndex);
        }
    } catch (error) {
        console.error('Error saving settings to localStorage:', error);
    }

    // --- Update Global Runtime Variables ---
    currentTone = toneVal;

    // --- Apply Accent Color Immediately ---
    if (typeof updateAccentColor === 'function') {
        updateAccentColor(colorVal);
    }

    // --- Update API Key Link Based on Provider ---
    if (typeof updateApiLinkUI === 'function') {
        updateApiLinkUI(providerVal);
    }

    // --- Optional: Provide Default API Key for Portkey (if empty) ---
    if (providerVal === 'portkey') {
        const apiKeyInput = document.getElementById('apiKey');
        if (apiKeyInput && !apiKeyInput.value) {
            apiKeyInput.value = 'ubeOLvhr1xSsIl3KsVj6XMeEgKmi';
            localStorage.setItem('horizon_key', apiKeyInput.value);
        }
    }

    // --- Update Ghost Mode Indicator ---
    const ghostIndicator = document.getElementById('ghostIndicator');
    if (ghostIndicator) {
        ghostIndicator.classList.toggle('active', isGhostMode);
    }

    // --- Refresh Placeholder if No Chat History ---
    const chatBox = document.getElementById('chatBox');
    if (typeof uiHistory !== 'undefined' && uiHistory.length === 0 && chatBox) {
        if (typeof renderPlaceholder === 'function') {
            chatBox.innerHTML = renderPlaceholder();
        }
    }
};

// Add Event Listeners for seamless settings sync
document.getElementById('accentColorPicker')?.addEventListener('input', syncSettings);
document.getElementById('sfxToggle')?.addEventListener('change', syncSettings);
document.getElementById('hapticsToggle')?.addEventListener('change', syncSettings);
document.getElementById('voiceToggle')?.addEventListener('change', syncSettings);
document.getElementById('chatTone')?.addEventListener('change', syncSettings);
document.getElementById('systemPrompt')?.addEventListener('change', syncSettings);
document.getElementById('apiKey')?.addEventListener('change', syncSettings);
document.getElementById('provider')?.addEventListener('change', syncSettings);
document.getElementById('modelSelect')?.addEventListener('change', syncSettings);
document.getElementById('voiceSelect')?.addEventListener('change', syncSettings);

// --- MODEL COMPARE LOGIC ---
document.getElementById('btn-compare-models')?.addEventListener('click', () => {
    if(window.allParsedModels.length === 0) return alert('Please fetch models first in Configurations.');
    const selA = document.getElementById('compareSelectA');
    const selB = document.getElementById('compareSelectB');
    if(!selA || !selB) return;
    
    selA.innerHTML = '<option value="">Select Model A</option>';
    selB.innerHTML = '<option value="">Select Model B</option>';
    
    window.allParsedModels.forEach(m => {
        const safeId = DOMPurify.sanitize(m.id);
        const safeName = DOMPurify.sanitize(m.name);
        selA.innerHTML += `<option value="${safeId}">${safeName}</option>`;
        selB.innerHTML += `<option value="${safeId}">${safeName}</option>`;
    });

    const resArea = document.getElementById('compareResultsArea');
    if(resArea) resArea.style.display = 'none';
    
    document.getElementById('compareModalOverlay')?.classList.add('active');
    if (window.innerWidth <= 768) toggleSidebar(); 
});

document.getElementById('btn-close-compare')?.addEventListener('click', () => {
    document.getElementById('compareModalOverlay')?.classList.remove('active');
});

document.getElementById('btn-run-compare')?.addEventListener('click', () => {
    const valA = document.getElementById('compareSelectA')?.value;
    const valB = document.getElementById('compareSelectB')?.value;
    
    if(!valA || !valB) return alert("Select two models to compare.");
    
    const modelA = window.allParsedModels.find(m => m.id === valA);
    const modelB = window.allParsedModels.find(m => m.id === valB);
    
    if(!modelA || !modelB) return;
    
    const checkVision = m => /(vision|gemini|gpt-4o|claude-3|pixtral|llava)/i.test(m.id);
    const checkAudio = m => /(audio|gemini-1\.5|gpt-4o)/i.test(m.id);
    const checkPro = m => /(pro|opus|gpt-4|sonnet|70b|large|max)/i.test(m.id);
    const checkFree = m => /(free|flash|haiku|8b|mini)/i.test(m.id);
    
    const getCutoff = id => {
        if(/(gpt-4o|claude-3-5)/i.test(id)) return "April 2024+";
        if(/(llama-3)/i.test(id)) return "March 2024";
        if(/(gemini-1\.5)/i.test(id)) return "Early 2024";
        if(/(gpt-4|claude-3)/i.test(id)) return "Late 2023";
        return "Standard / Unknown";
    };

    const renderCol = (m) => `
        <div style="font-weight:700; color:var(--accent); font-size: 1rem; border-bottom:1px solid var(--border); padding-bottom:8px;">${DOMPurify.sanitize(m.name)}</div>
        <div class="compare-detail"><b>Cost Tier:</b> ${checkFree(m) ? '<span style="color:#2ecc71;">Free/Low</span>' : (checkPro(m) ? '<span style="color:#e74c3c;">Premium</span>' : 'Standard')}</div>
        <div class="compare-detail"><b>Knowledge:</b> ${getCutoff(m.id)}</div>
        <div class="compare-detail"><b>Reasoning:</b> ${checkPro(m) ? 'Advanced (Slow)' : 'Standard (Fast)'}</div>
        <div class="compare-detail"><b>Vision support:</b> ${checkVision(m) ? '✅ Yes' : '❌ No'}</div>
        <div class="compare-detail"><b>Audio support:</b> ${checkAudio(m) ? '✅ Yes' : '❌ No'}</div>
    `;

    const colA = document.getElementById('compareColA');
    const colB = document.getElementById('compareColB');
    if(colA) colA.innerHTML = renderCol(modelA);
    if(colB) colB.innerHTML = renderCol(modelB);
    
    let verdict = "";
    if (valA === valB) {
        verdict = "These are the exact same models! 🤦‍♂️";
    } else {
        const scoreA = (checkPro(modelA)?2:0) + (checkVision(modelA)?1:0) + (checkAudio(modelA)?1:0);
        const scoreB = (checkPro(modelB)?2:0) + (checkVision(modelB)?1:0) + (checkAudio(modelB)?1:0);
        
        if(scoreA > scoreB) verdict = `🏆 <b>${DOMPurify.sanitize(modelA.name)}</b> is more capable generally. Use it for complex tasks.`;
        else if(scoreB > scoreA) verdict = `🏆 <b>${DOMPurify.sanitize(modelB.name)}</b> is more capable generally. Use it for complex tasks.`;
        else verdict = "⚖️ It's a tie! Both have similar capability levels. Choose based on cost or context window.";

        if(checkFree(modelA) && !checkFree(modelB)) verdict += `<br>💡 <b>Tip:</b> ${DOMPurify.sanitize(modelA.name)} is cheaper/faster for simple tasks.`;
        else if(!checkFree(modelA) && checkFree(modelB)) verdict += `<br>💡 <b>Tip:</b> ${DOMPurify.sanitize(modelB.name)} is cheaper/faster for simple tasks.`;
    }

    const cVerdict = document.getElementById('compareVerdict');
    if(cVerdict) cVerdict.innerHTML = DOMPurify.sanitize(verdict);
    const resArea = document.getElementById('compareResultsArea');
    if(resArea) resArea.style.display = 'block';
});


// --- MODEL FETCHING ---
window.promptModelSelection = (id, name) => {
    window.pendingModelSelection = { id, name };
    const capEl = document.getElementById('capModelName');
    if(capEl) capEl.innerText = name;
    
    const idLower = id.toLowerCase();
    let capsHTML = `<div><i class="ph-bold ph-text-t"></i> General Text & Code Generation</div>`;
    if (idLower.includes('vision') || idLower.includes('gemini') || idLower.includes('gpt-4o') || idLower.includes('claude-3') || idLower.includes('pixtral') || idLower.includes('llava')) capsHTML += `<div><i class="ph-bold ph-image"></i> Vision & Image Analysis</div>`;
    if (idLower.includes('audio') || idLower.includes('gemini-1.5')) capsHTML += `<div><i class="ph-bold ph-microphone"></i> Audio & Speech Processing</div>`;
    if (idLower.includes('pro') || idLower.includes('opus') || idLower.includes('gpt-4') || idLower.includes('sonnet') || idLower.includes('large') || idLower.includes('70b') || idLower.includes('405b')) capsHTML += `<div><i class="ph-bold ph-brain"></i> Advanced Reasoning & Logic</div>`;
    if (idLower.includes('free') || idLower.includes('flash') || idLower.includes('haiku') || idLower.includes('8b') || idLower.includes('mini')) capsHTML += `<div><i class="ph-bold ph-lightning"></i> High-Speed Inference</div>`;

    let cutoff = "Up to current";
    if(idLower.includes('gpt-4o') || idLower.includes('claude-3-5')) cutoff = "Apr 2024+";
    else if(idLower.includes('gpt-4') || idLower.includes('claude-3')) cutoff = "Dec 2023";
    else if(idLower.includes('gemini-1.5')) cutoff = "Early 2024";
    else if(idLower.includes('llama-3')) cutoff = "Mar 2024";
    capsHTML += `<div><i class="ph-bold ph-calendar"></i> Knowledge cut-off: <b>${cutoff}</b></div>`;

    let cost = "Standard / Developer";
    if(idLower.includes('free')) cost = "Free";
    else if(idLower.includes('pro') || idLower.includes('opus') || idLower.includes('large') || idLower.includes('gpt-4')) cost = "Premium";
    capsHTML += `<div><i class="ph-bold ph-coins"></i> Cost Tier: <b>${cost}</b></div>`;
    
    const capList = document.getElementById('capList');
    if(capList) capList.innerHTML = capsHTML;
    document.getElementById('capabilitiesModalOverlay')?.classList.add('active');
};

document.getElementById('btn-cancel-model')?.addEventListener('click', () => { document.getElementById('capabilitiesModalOverlay')?.classList.remove('active'); window.pendingModelSelection = null; });
document.getElementById('btn-confirm-model')?.addEventListener('click', () => {
    if (window.pendingModelSelection) {
        const ms = document.getElementById('modelSelect');
        if(ms) ms.value = window.pendingModelSelection.id;
        const trig = document.getElementById('modelSelectTrigger');
        if(trig) trig.innerHTML = `<span>${DOMPurify.sanitize(window.pendingModelSelection.name)}</span> <i class="ph-bold ph-caret-down"></i>`;
        const ql = document.getElementById('quickModelLabel');
        if(ql) ql.innerText = window.pendingModelSelection.name;
        syncSettings();
    }
    document.getElementById('capabilitiesModalOverlay')?.classList.remove('active');
    document.getElementById('modelSelectOptions')?.classList.remove('open');
    document.getElementById('quickModelDropdown')?.classList.remove('active');
});

async function fetchAvailableModels(isSilent = false) {
    const provider = document.getElementById('provider')?.value;
    const apiKey = document.getElementById('apiKey')?.value;
    const trigger = document.getElementById('modelSelectTrigger');
    const chatRefreshBtn = document.getElementById('btn-refresh-models-chat');

    if (!apiKey) {
        if (!isSilent) alert("Please enter an API key.");
        return;
    }
    
    if (!isSilent && trigger) trigger.innerHTML = `<span><i class="ph-bold ph-spinner ph-spin"></i> Loading...</span>`;
    if (chatRefreshBtn) chatRefreshBtn.innerHTML = `<i class="ph-bold ph-spinner ph-spin"></i>`;

    try {
        let modelsArray = [];
        if (provider === 'openrouter') {
            const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { "Authorization": `Bearer ${apiKey}`, "HTTP-Referer": "https://horizon-ai.app", "X-Title": "Horizon.AI" }});
            const data = await res.json(); modelsArray = data.data.map(m => m.id);
        } else if (provider === 'portkey') {
            const res = await fetch("https://api.portkey.ai/v1/models", { headers: { "x-portkey-api-key": apiKey }});
            const data = await res.json(); modelsArray = data.data.map(m => m.id);
        } else {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            const data = await res.json(); modelsArray = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent")).map(m => m.name.replace('models/', '')); 
        }
        renderModelsList(modelsArray, provider);
    } catch (error) { 
        if (!isSilent && trigger) { trigger.innerHTML = `<span>Error</span>`; alert(error.message); }
    } finally {
        if (chatRefreshBtn) chatRefreshBtn.innerHTML = `<i class="ph-bold ph-arrows-clockwise"></i>`;
    }
}

document.getElementById('btn-fetch-models')?.addEventListener('click', () => fetchAvailableModels(false));
document.getElementById('btn-refresh-models-chat')?.addEventListener('click', () => fetchAvailableModels(false));

function renderModelsList(modelsArray, provider) {
    const containerSettings = document.getElementById('modelListContainer');
    const containerQuick = document.getElementById('quickModelListContainer');
    if(containerSettings) containerSettings.innerHTML = ''; 
    if(containerQuick) containerQuick.innerHTML = '';
    window.allParsedModels = [];

    let grouped = {};
    modelsArray.forEach(m => {
        let brand = 'Google'; let idName = m;
        if (provider === 'openrouter' || provider === 'portkey') { brand = (m.split('/')[0] || 'Other'); idName = m.split('/').slice(1).join('/') || m; }
        brand = brand.charAt(0).toUpperCase() + brand.slice(1);
        
        const lowerId = m.toLowerCase();
        if (lowerId.includes('openai') || brand.toLowerCase() === 'openai') return;

        if (!grouped[brand]) grouped[brand] = [];
        
        let tagHtml = ""; let sortWeight = 1;
        if (lowerId.includes('free') || lowerId.includes('flash') || lowerId.includes('haiku') || lowerId.includes('8b') || lowerId.includes('mini')) {
            tagHtml = `<span class="badge-lite"><i class="ph-bold ph-star"></i> FOR YOU</span>`; sortWeight = 0; 
        } else if (lowerId.includes('pro') || lowerId.includes('opus') || lowerId.includes('gpt-4') || lowerId.includes('sonnet') || lowerId.includes('70b') || lowerId.includes('large') || lowerId.includes('max')) {
            tagHtml = `<span class="badge-pro"><i class="ph-bold ph-brain"></i> PRO</span>`; sortWeight = 2; 
        }

        let capabilityBadges = `<div style="display:flex; gap: 4px; margin-left: auto;">`;
        if (lowerId.includes('vision') || lowerId.includes('gemini') || lowerId.includes('gpt-4o') || lowerId.includes('claude-3') || lowerId.includes('pixtral') || lowerId.includes('llava')) {
            capabilityBadges += `<span class="capability-badge" title="Image Processing" style="color: #4cd137;"><i class="ph-bold ph-image"></i></span>`;
        }
        if (lowerId.includes('audio') || lowerId.includes('gemini-1.5') || lowerId.includes('gpt-4o')) {
            capabilityBadges += `<span class="capability-badge" title="Audio Processing" style="color: #fbc531;"><i class="ph-bold ph-microphone"></i></span>`;
        }
        capabilityBadges += `</div>`;

        grouped[brand].push({ id: m, name: idName, tag: tagHtml, capabilities: capabilityBadges, weight: sortWeight });
        window.allParsedModels.push({ id: m, name: idName }); 
    });

    for (const [brand, models] of Object.entries(grouped)) {
        const lbl1 = document.createElement('div'); lbl1.className = 'optgroup-label'; lbl1.innerHTML = `<i class="ph-fill ph-buildings"></i> ${DOMPurify.sanitize(brand)}`;
        const lbl2 = document.createElement('div'); lbl2.className = 'optgroup-label'; lbl2.innerHTML = `<i class="ph-fill ph-buildings"></i> ${DOMPurify.sanitize(brand)}`;
        if(containerSettings) containerSettings.appendChild(lbl1); 
        if(containerQuick) containerQuick.appendChild(lbl2);
        models.sort((a, b) => a.weight - b.weight);

        models.forEach(model => {
            const buildOption = () => {
                const opt = document.createElement('div'); opt.className = 'custom-option';
                opt.innerHTML = `<span>${DOMPurify.sanitize(model.name)}</span> ${model.capabilities} ${model.tag}`;
                opt.addEventListener('click', (e) => { e.stopPropagation(); window.promptModelSelection(model.id, model.name); });
                return opt;
            };
            if(containerSettings) containerSettings.appendChild(buildOption()); 
            if(containerQuick) containerQuick.appendChild(buildOption());
        });
    }
    
    const savedModel = document.getElementById('modelSelect')?.value;
    const trig = document.getElementById('modelSelectTrigger');
    if (savedModel && trig) {
        const shortName = savedModel.split('/').pop();
        trig.innerHTML = `<span>${DOMPurify.sanitize(shortName)}</span> <i class="ph-bold ph-caret-down"></i>`;
    } else if (trig) {
        trig.innerHTML = `<span>Select a model...</span> <i class="ph-bold ph-caret-down"></i>`;
    }
}

// --- ATTACHMENTS & VOICE ---
document.getElementById('btn-trigger-file')?.addEventListener('click', () => { document.getElementById('fileAttach')?.click(); document.getElementById('expanded-actions')?.classList.remove('active');});
document.getElementById('btn-trigger-camera')?.addEventListener('click', () => { document.getElementById('cameraAttach')?.click(); document.getElementById('expanded-actions')?.classList.remove('active');});

const processFiles = (event) => {
    const files = event.target.files; if (!files || files.length === 0) return;
    
    const container = document.getElementById('imagePreviewContainer');
    if (container) {
        container.innerHTML = `<div style="padding: 10px 20px; font-size:0.9rem; color:var(--accent); display:flex; align-items:center; gap:8px;"><i class="ph-bold ph-spinner ph-spin"></i> Processing ${files.length} file(s)...</div>`;
    }

    // Set timeout to allow UI to render spinner before heavy synchronous FileReader locking
    setTimeout(() => {
        let processed = 0;
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                attachedFilesData.push({ base64: e.target.result, isImage: file.type.startsWith('image/'), name: file.name, mime: file.type });
                processed++;
                if (processed === files.length) {
                    updateStagingArea();
                }
            }; 
            reader.readAsDataURL(file);
        }); 
        event.target.value = '';
    }, 50);
};

document.getElementById('fileAttach')?.addEventListener('change', processFiles);
document.getElementById('cameraAttach')?.addEventListener('change', processFiles);

function updateStagingArea() {
    const container = document.getElementById('imagePreviewContainer'); 
    if(!container) return;
    container.innerHTML = '';
    attachedFilesData.forEach((fileObj, index) => {
        const div = document.createElement('div'); div.className = 'preview-item';
        if (fileObj.isImage) {
            const img = document.createElement('img'); img.src = fileObj.base64; div.appendChild(img);
        } else {
            div.innerHTML = `<i class="ph-fill ph-file-text"></i><span>${DOMPurify.sanitize(fileObj.name.substring(0,5))}..</span>`;
        }
        const btn = document.createElement('button'); btn.innerHTML = `<i class="ph-bold ph-x"></i>`;
        btn.addEventListener('click', () => { attachedFilesData.splice(index, 1); updateStagingArea(); });
        div.appendChild(btn); container.appendChild(div);
    });
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    const micBtn = document.getElementById('btn-trigger-mic');
    const voiceModal = document.getElementById('voiceModalOverlay');
    const voiceInterim = document.getElementById('voiceInterimText');
    const btnStopVoice = document.getElementById('btn-stop-voice');

    let isRecording = false;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => { 
        isRecording = true; 
        if(micBtn) micBtn.classList.add('active'); 
        if(voiceModal) voiceModal.classList.add('active');
        if(voiceInterim) voiceInterim.innerText = "Speak now...";
    };
    recognition.onend = () => { 
        isRecording = false; 
        if(micBtn) micBtn.classList.remove('active'); 
        if(voiceModal) voiceModal.classList.remove('active');
    };
    
    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            else interimTranscript += event.results[i][0].transcript;
        }
        
        if(interimTranscript && voiceInterim) {
            voiceInterim.innerText = interimTranscript;
        }
        if (finalTranscript) {
            const input = document.getElementById('userInput');
            if(input) input.value += (input.value ? ' ' : '') + finalTranscript;
        }
    };

    micBtn?.addEventListener('click', () => { isRecording ? recognition.stop() : recognition.start(); });
    btnStopVoice?.addEventListener('click', () => { recognition.stop(); });
} else {
    const micBtn = document.getElementById('btn-trigger-mic');
    if(micBtn) micBtn.style.display = 'none';
}

// --- CHAT LOGIC WITH STREAMING API ---
document.getElementById('userInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); triggerSend(); }});
document.getElementById('btn-send')?.addEventListener('click', () => {
    try {
        triggerSend();
    } catch(e) {
        console.error("Send button failed:", e);
        alert("Action failed. Please refresh the page. " + e.message);
    }
});

const scrollToBottom = () => requestAnimationFrame(() => {
    const box = document.getElementById('chatBox');
    if(box) box.scrollTop = box.scrollHeight;
});

function showTypingIndicator(showSkeleton = false) {
    document.getElementById('placeholderMsg')?.remove();
    const box = document.getElementById('chatBox');
    if(!box) return;
    const msgDiv = document.createElement('div'); msgDiv.className = `message ai`; msgDiv.id = `typingIndicatorActive`;
    
    if (showSkeleton) {
        msgDiv.innerHTML = `<div class="message-sender"><i class="ph-fill ph-planet neon-planet"></i> Horizon is working on it...</div>
        <div class="message-content glass" style="width: 100%;">
            <div class="skeleton-wrapper">
                <div class="skeleton-header"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-line"></div>
                <div class="skeleton-box"></div>
            </div>
        </div>`;
    } else {
        msgDiv.innerHTML = `<div class="message-sender"><i class="ph-fill ph-planet neon-planet"></i> Horizon is responding...</div><div class="message-content glass"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    }
    
    box.appendChild(msgDiv); scrollToBottom();
}
function removeTypingIndicator() { const ind = document.getElementById('typingIndicatorActive'); if (ind) ind.remove(); }

function createMessageShell(role) {
    const box = document.getElementById('chatBox');
    if(!box) return null;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    const savedName = localStorage.getItem('horizon_custom_name');
    let name = savedName || (auth.currentUser ? (auth.currentUser.displayName || (auth.currentUser.email ? auth.currentUser.email.split('@')[0] : 'User')) : 'User');
    if (isGhostMode) name = 'Ghost';
    
    const safeName = DOMPurify.sanitize(name);
    
    let actionsHTML = `
        <div class="message-actions">
            <button class="msg-action-btn btn-copy-msg" title="Copy"><i class="ph-bold ph-copy"></i></button>
            ${role === 'user' ? `<button class="msg-action-btn btn-edit-msg" title="Edit"><i class="ph-bold ph-pencil-simple"></i></button>` : ''}
            <button class="msg-action-btn btn-delete-msg" title="Delete"><i class="ph-bold ph-trash"></i></button>
        </div>
    `;

    let sourcesHTML = '';
    if (role === 'ai') {
        sourcesHTML = `
        <div class="message-sources">
            <div class="source-pill" title="Verified AI Model Knowledge"><i class="ph-fill ph-brain" style="color:var(--accent);"></i> <span>Knowledge Base</span></div>
            <div class="source-pill" title="Web/Search Data"><i class="ph-fill ph-globe" style="color:#2ecc71;"></i> <span>Web Sources</span></div>
        </div>`;
    }
    
    msgDiv.innerHTML = `<div class="message-sender">${role === 'user' ? `${safeName} <i class="ph-fill ph-user-circle"></i>` : '<i class="ph-fill ph-planet"></i> Horizon'}</div>${sourcesHTML}<div class="message-content ${role === 'ai' ? 'glass' : ''}"></div>${actionsHTML}`;
    box.appendChild(msgDiv);
    return msgDiv;
}

let lastRequestTime = 0;
const REQUEST_COOLDOWN = 1500;

async function triggerSend() {
    const now = Date.now();
    if (now - lastRequestTime < REQUEST_COOLDOWN) {
        return alert("You're sending messages too quickly. Please wait a moment.");
    }
    lastRequestTime = now;

    const inputEl = document.getElementById('userInput');
    if(!inputEl) return;
    const text = inputEl.value.trim();
    const provider = document.getElementById('provider')?.value;
    const apiKey = document.getElementById('apiKey')?.value;
    const model = document.getElementById('modelSelect')?.value;
    let systemPrompt = document.getElementById('systemPrompt')?.value.trim() || '';
    const sendBtn = document.getElementById('btn-send');

    if ((!text && attachedFilesData.length === 0) || !apiKey || !model) return alert("Missing input or config.");
    playPopSound();
    
    // Log Analytics Event Safely
    if (typeof logEvent === 'function') {
        logEvent(analytics, 'message_sent', {
            provider: provider,
            model: model
        });
    }

    const filesToLog = [...attachedFilesData];
    
    const userMsgDiv = createMessageShell('user');
    if(userMsgDiv) {
        const userContent = userMsgDiv.querySelector('.message-content');
        userContent.innerText = text; 
        filesToLog.forEach(f => {
            if(f.isImage) { const img = document.createElement('img'); img.src = f.base64; img.className = 'message-image'; userContent.appendChild(img); } 
            else { const fileDiv = document.createElement('div'); fileDiv.className = 'message-file'; fileDiv.innerHTML = `<i class="ph-fill ph-file-text" style="font-size:1.5rem"></i> <span>${DOMPurify.sanitize(f.name)}</span>`; userContent.appendChild(fileDiv); }
        });
        scrollToBottom();
    }
    uiHistory.push({ role: 'user', text: text, files: filesToLog });
    
    let payloadContent = text;
    if ((provider === 'openrouter' || provider === 'portkey') && filesToLog.length > 0) {
        payloadContent = text ? [{ type: "text", text: text }] : [];
        filesToLog.forEach(file => { if(file.isImage) payloadContent.push({ type: "image_url", image_url: { url: file.base64 } }); });
    }
    
    const currentReq = [...chatHistory, { role: 'user', content: payloadContent, files: filesToLog }];
    if(!isGhostMode) { chatHistory.push({ role: 'user', content: payloadContent, files: filesToLog }); saveSessionData(); }

    inputEl.value = ''; attachedFilesData = []; updateStagingArea(); 
    if(sendBtn) sendBtn.disabled = true;
    
    if(window.speechSynthesis) window.speechSynthesis.cancel();
    
    const isResourceGenIntent = /(generate|create|make|draw|paint).*image|(generate|create|make).*video|(write|build|code|script).*code/i.test(text);
    showTypingIndicator(isResourceGenIntent);

    if (TONE_DIRECTIVES[currentTone]) {
        systemPrompt += `\n\n[ASSISTANT TONE DIRECTIVE]: ${TONE_DIRECTIVES[currentTone]}`;
    }

    if (!isGhostMode) {
        const memoryContext = longTermMemory.length > 0 ? "\n\n### User's Long-Term Memories:\n- " + longTermMemory.join("\n- ") : "";
        const memoryInstructions = "\n\nIMPORTANT: If the user provides a personal fact about themselves, a preference, or explicitly asks you to remember something, you MUST output it exactly within <remember>...</remember> tags so it can be saved to the database. For example: <remember>User lives in New York</remember>.";
        systemPrompt = systemPrompt + memoryContext + memoryInstructions;
    }

    try {
        let aiResponse = "";
        
        if (provider === 'openrouter' || provider === 'portkey') {
            const url = provider === 'openrouter' ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.portkey.ai/v1/chat/completions";
            const headers = provider === 'openrouter' ? { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "https://horizon-ai.app", "X-Title": "Horizon.AI" } : { "x-portkey-api-key": apiKey, "Content-Type": "application/json" };
            
            let finalMessages = currentReq.map(m => ({role: m.role, content: m.content}));
            if (systemPrompt) finalMessages.unshift({ role: "system", content: systemPrompt });

            const res = await fetch(url, { 
                method: "POST", 
                headers: headers, 
                body: JSON.stringify({ model: model, messages: finalMessages, stream: true }) 
            });
            if(!res.ok) throw new Error(`API Error: ${res.status}`);
            
            removeTypingIndicator(); playPopSound();
            const aiMsgShell = createMessageShell('ai');
            if(!aiMsgShell) return;
            const contentNode = aiMsgShell.querySelector('.message-content');
            
            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ') && line.trim() !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                aiResponse += data.choices[0].delta.content;
                                contentNode.innerHTML = DOMPurify.sanitize(marked.parse(aiResponse));
                                scrollToBottom();
                            }
                        } catch(e) {}
                    }
                }
            }
            
        } else if (provider === 'aistudio') {
            const geminiHistory = currentReq.map(msg => {
                let parts = [];
                if (typeof msg.content === 'string' && msg.content) parts.push({ text: msg.content });
                if (msg.files) msg.files.forEach(f => parts.push({ inlineData: { data: f.base64.split(',')[1], mimeType: f.mime } }));
                return { role: msg.role === 'user' ? 'user' : 'model', parts: parts };
            });
            let payloadData = { contents: geminiHistory };
            if (systemPrompt) payloadData.system_instruction = { parts: [{ text: systemPrompt }] };

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadData)
            });
            if(!res.ok) throw new Error(`API Error: ${res.status}`);

            removeTypingIndicator(); playPopSound();
            const aiMsgShell = createMessageShell('ai');
            if(!aiMsgShell) return;
            const contentNode = aiMsgShell.querySelector('.message-content');

            const reader = res.body.getReader();
            const decoder = new TextDecoder("utf-8");
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0].text) {
                                aiResponse += data.candidates[0].content.parts[0].text;
                                contentNode.innerHTML = DOMPurify.sanitize(marked.parse(aiResponse));
                                scrollToBottom();
                            }
                        } catch(e) {}
                    }
                }
            }
        }

        // Post-Stream Processing
        if (!isGhostMode) {
            const memoryRegex = /<remember>([\s\S]*?)<\/remember>/gi;
            let match;
            while ((match = memoryRegex.exec(aiResponse)) !== null) {
                if (match[1].trim()) {
                    longTermMemory.push(match[1].trim());
                    localStorage.setItem('horizon_long_term_memory', JSON.stringify(longTermMemory));
                }
            }
            aiResponse = aiResponse.replace(memoryRegex, '').trim(); 
        }

        const activeMsg = document.getElementById('chatBox').lastElementChild;
        if (activeMsg) activeMsg.querySelector('.message-content').innerHTML = DOMPurify.sanitize(marked.parse(aiResponse));

        if (voiceResponseEnabled && window.speechSynthesis) {
            const cleanTextForSpeech = aiResponse.replace(/[*_`#><\[\]]/g, '');
            const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech);
            
            const savedVoiceIndex = localStorage.getItem('horizon_selected_voice');
            if (savedVoiceIndex !== null && availableVoices[savedVoiceIndex]) {
                utterance.voice = availableVoices[savedVoiceIndex];
            }
            
            window.speechSynthesis.speak(utterance);
        }
        
        const estimatedTokens = Math.ceil((text.length + aiResponse.length) / 4);
        updateStatsUI(estimatedTokens);

        if(!isGhostMode) { 
            uiHistory.push({ role: 'ai', text: aiResponse, files: [] }); 
            chatHistory.push({ role: 'assistant', content: aiResponse }); 
            saveSessionData(); 
        }
        if(sendBtn) sendBtn.disabled = false;

    } catch (err) {
        console.error(err); removeTypingIndicator();
        
        const errorShell = createMessageShell('ai');
        if(errorShell) {
            const errContent = errorShell.querySelector('.message-content');
            errContent.innerText = `⚠️ Error: ${err.message}`; 
        }
        
        if(!isGhostMode) { chatHistory.pop(); uiHistory.pop(); saveSessionData(); }
        if(sendBtn) sendBtn.disabled = false;
    }
}

function renderMessageToDOM(role, text, files = [], skipScroll = false) {
    document.getElementById('placeholderMsg')?.remove();
    const box = document.getElementById('chatBox');
    if(!box) return;
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    const savedName = localStorage.getItem('horizon_custom_name');
    let name = savedName || (auth.currentUser ? (auth.currentUser.displayName || (auth.currentUser.email ? auth.currentUser.email.split('@')[0] : 'User')) : 'User');
    if (isGhostMode) name = 'Ghost';
    const safeName = DOMPurify.sanitize(name);
    
    let actionsHTML = `
        <div class="message-actions">
            <button class="msg-action-btn btn-copy-msg" title="Copy"><i class="ph-bold ph-copy"></i></button>
            ${role === 'user' ? `<button class="msg-action-btn btn-edit-msg" title="Edit"><i class="ph-bold ph-pencil-simple"></i></button>` : ''}
            <button class="msg-action-btn btn-delete-msg" title="Delete"><i class="ph-bold ph-trash"></i></button>
        </div>
    `;

    let sourcesHTML = '';
    if (role === 'ai') {
        sourcesHTML = `
        <div class="message-sources">
            <div class="source-pill" title="Verified AI Model Knowledge"><i class="ph-fill ph-brain" style="color:var(--accent);"></i> <span>Knowledge Base</span></div>
            <div class="source-pill" title="Web/Search Data"><i class="ph-fill ph-globe" style="color:#2ecc71;"></i> <span>Web Sources</span></div>
        </div>`;
    }

    msgDiv.innerHTML = `<div class="message-sender">${role === 'user' ? `${safeName} <i class="ph-fill ph-user-circle"></i>` : '<i class="ph-fill ph-planet"></i> Horizon'}</div>${sourcesHTML}<div class="message-content ${role === 'ai' ? 'glass' : ''}"></div>${actionsHTML}`;
    const content = msgDiv.querySelector('.message-content');
    
    if (role === 'ai') content.innerHTML = DOMPurify.sanitize(marked.parse(text));
    else {
        content.innerText = text; 
        files.forEach(f => {
            if(f.isImage) { const img = document.createElement('img'); img.src = f.base64; img.className = 'message-image'; content.appendChild(img); } 
            else { const fileDiv = document.createElement('div'); fileDiv.className = 'message-file'; fileDiv.innerHTML = `<i class="ph-fill ph-file-text" style="font-size:1.5rem"></i> <span>${DOMPurify.sanitize(f.name)}</span>`; content.appendChild(fileDiv); }
        });
    }
    box.appendChild(msgDiv);
    if(!skipScroll) scrollToBottom();
}

// Landing Page Topbar Scroll Shadow
document.getElementById('landing-page')?.addEventListener('scroll', function() {
    const topbar = document.getElementById('landing-topbar');
    if (!topbar) return;
    if (this.scrollTop > 10) {
        topbar.style.boxShadow = '0 4px 20px rgba(0,0,0,0.6)';
    } else {
        topbar.style.boxShadow = 'none';
    }
});
