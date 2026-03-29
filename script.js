import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-analytics.js";
import { getAuth, signInWithPopup, signInWithRedirect, getRedirectResult, GithubAuthProvider, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";

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

// Cross-Session Long Term Memory
let longTermMemory = JSON.parse(localStorage.getItem('horizon_long_term_memory')) || [];

// Active Session Variables
let sessions = JSON.parse(localStorage.getItem('horizon_sessions')) || [];
let currentSessionId = localStorage.getItem('horizon_current_session') || null;
let chatHistory = [];       
let uiHistory = [];         
let attachedFilesData = []; 

// Settings States
let isGhostMode = false;
let sfxEnabled = true;
let hapticsEnabled = true;
let voiceResponseEnabled = false;
let currentTone = 'standard';
let statMessages = parseInt(localStorage.getItem('horizon_stat_msgs')) || 0;
let statTokens = parseInt(localStorage.getItem('horizon_stat_tokens')) || 0;

const TONE_DIRECTIVES = {
    'standard': '',
    'professional': 'Respond in a highly professional, objective, and concise manner.',
    'casual': 'Respond in a very casual, friendly, and approachable tone. Use conversational language.',
    'sarcastic': 'Respond with a witty, slightly sarcastic, and humorous tone.',
    'academic': 'Respond in a highly detailed, academic, and analytical tone with deep explanations.'
};

// --- AUTHENTICATION FLOW (ROBUST FIX) ---
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const authLoader = document.getElementById('auth-loading-overlay');

// 1. Process any pending redirects FIRST
authLoader.style.display = 'flex';
getRedirectResult(auth).then((result) => {
    // If successful, onAuthStateChanged will handle the UI
    if (!result) authLoader.style.display = 'none'; 
}).catch((error) => {
    console.error("Redirect Auth Error:", error);
    authLoader.style.display = 'none';
    
    // Clear corrupted state if we hit the partition/missing state error
    if (error.code === 'auth/missing-or-invalid-nonce' || error.message.includes('missing initial state')) {
        sessionStorage.clear();
        alert("Mobile browser security blocked the login redirect. Please try again; we will use a secure popup instead.");
        // Force popup on next attempt
        window.forcePopupFallback = true;
    } else if (error.code !== 'auth/redirect-cancelled-by-user') {
        alert("Authentication Error: " + error.message);
    }
});

// 2. Auth State Listener
onAuthStateChanged(auth, (user) => {
    authLoader.style.display = 'none';
    if (isGhostMode) return; 
    if (user) {
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        applyProfileOverrides(user);
        initSessions();
        checkAndShowTutorialLock();
    } else {
        document.getElementById('landing-page').style.display = 'flex';
        document.getElementById('app-container').style.display = 'none';
    }
});

// 3. Login Handlers
document.getElementById('btn-login-github').addEventListener('click', () => {
    const provider = new GithubAuthProvider();
    if (isMobile && !window.forcePopupFallback) {
        signInWithRedirect(auth, provider);
    } else {
        signInWithPopup(auth, provider).catch(err => alert("GitHub Login Error: " + err.message));
    }
});

document.getElementById('btn-login-google').addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    if (isMobile && !window.forcePopupFallback) {
        signInWithRedirect(auth, provider);
    } else {
        signInWithPopup(auth, provider).catch(err => alert("Google Login Error: " + err.message));
    }
});


document.getElementById('btn-login-ghost').addEventListener('click', () => {
    isGhostMode = true;
    document.getElementById('ghostToggle').checked = true;
    document.getElementById('ghostIndicator').classList.add('active');
    document.getElementById('landing-page').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('landing-page').style.display = 'none';
        document.getElementById('app-container').style.display = 'block';
        checkAndShowTutorialLock();
    }, 500);
    
    document.getElementById('userProfileName').innerText = 'Ghost User';
    document.getElementById('userProfileStatus').innerHTML = '<i class="ph-fill ph-eye-closed"></i> Incognito';
    document.getElementById('userProfileAvatar').src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="none"/><path d="M128,24A104,104,0,0,0,24,128c0,50.4,32.3,92.5,78,102.5V176a32,32,0,0,1,64,0v54.5c45.7-10,78-52.1,78-102.5A104,104,0,0,0,128,24Z" opacity="0.2"/><path d="M226.3,101.4a104,104,0,1,0-196.6,0C17,117.7,16,134.5,16,144c0,56,41.9,80,64,80a31.4,31.4,0,0,0,19.3-6.6A16,16,0,0,1,118.6,216a16,16,0,0,0,18.8,0,16,16,0,0,1,19.3,1.4A31.4,31.4,0,0,0,176,224c22.1,0,64-24,64-80C240,134.5,239,117.7,226.3,101.4ZM176,208a15.8,15.8,0,0,1-9.6-3.3,32.1,32.1,0,0,0-38.6-2.8,32.1,32.1,0,0,0-38.6,2.8A15.8,15.8,0,0,1,80,208c-12.7,0-48-15.5-48-64,0-9,1.1-24.5,12.2-44a88,88,0,1,1,167.6,0c11.1,19.5,12.2,35,12.2,44C224,192.5,188.7,208,176,208ZM88,104a12,12,0,1,1,12,12A12,12,0,0,1,88,104Zm56,0a12,12,0,1,1,12,12A12,12,0,0,1,144,104Z" fill="%23B5BAC1"/></svg>';
    document.getElementById('chatBox').innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.95rem; margin: auto;"><i class="ph-fill ph-ghost" style="font-size: 2.5rem; color: #ff4757;"></i><br>Ghost Mode Active. Memories disabled.</div>';
    document.getElementById('sidebarChatList').innerHTML = '<div style="padding: 10px; color: var(--text-muted); font-size: 0.8rem; text-align:center;">History is turned off.</div>';
});

document.getElementById('btn-logout').addEventListener('click', async () => {
    if (!isGhostMode) await signOut(auth); 
    location.reload();
});

// --- SESSION & CONTEXTUAL NAMING MANAGEMENT ---
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
    sessions.unshift({ id: currentSessionId, title: 'New Chat', uiHistory: [], apiHistory: [], timestamp: Date.now() });
    
    document.getElementById('chatBox').innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.95rem; margin: auto; display: flex; flex-direction: column; align-items: center; gap: 10px;" id="placeholderMsg"><i class="ph-fill ph-sparkle" style="font-size: 2.5rem; color: var(--accent);"></i><span>Welcome. Configure your API key to begin.</span></div>';
    
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

        document.getElementById('chatBox').innerHTML = '';
        if (uiHistory.length === 0) {
            document.getElementById('chatBox').innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.95rem; margin: auto; display: flex; flex-direction: column; align-items: center; gap: 10px;" id="placeholderMsg"><i class="ph-fill ph-sparkle" style="font-size: 2.5rem; color: var(--accent);"></i><span>Welcome. Configure your API key to begin.</span></div>';
        } else {
            uiHistory.forEach(msg => renderMessageToDOM(msg.role, msg.text, msg.files, true));
            scrollToBottom();
        }
        saveSessionData();
    }
}

async function generateChatTitle(userMessage, sessionIndex) {
    const provider = document.getElementById('provider').value;
    const apiKey = document.getElementById('apiKey').value;
    const model = document.getElementById('modelSelect').value;

    const fallbackTitle = userMessage.substring(0, 20) + (userMessage.length > 20 ? '...' : '');

    if (!apiKey || !model) {
        updateSessionTitle(sessionIndex, fallbackTitle);
        return;
    }

    const titlePrompt = `Generate a concise, 2-4 word title that summarizes the context of this prompt. Respond ONLY with the title text itself, NO quotes, NO conversational filler: "${userMessage}"`;

    try {
        let title = "";
        if (provider === 'openrouter' || provider === 'portkey') {
            const url = provider === 'openrouter' ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.portkey.ai/v1/chat/completions";
            const headers = provider === 'openrouter' ? { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": window.location.href, "X-Title": "Horizon.AI" } : { "x-portkey-api-key": apiKey, "Content-Type": "application/json" };
            
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
        updateSessionTitle(sessionIndex, title || fallbackTitle);
    } catch (e) {
        updateSessionTitle(sessionIndex, fallbackTitle);
    }
}

function updateSessionTitle(index, title) {
    if(sessions[index]) {
        sessions[index].title = title;
        localStorage.setItem('horizon_sessions', JSON.stringify(sessions));
        renderSidebarSessions();
        if (sessions[index].id === currentSessionId) {
            const titleDisplay = document.getElementById('chatTitleDisplay');
            if (titleDisplay) titleDisplay.innerText = title;
        }
    }
}

function saveSessionData() {
    if (isGhostMode) return;
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
        }
    }
}

function renderSidebarSessions() {
    const list = document.getElementById('sidebarChatList');
    list.innerHTML = '';
    sessions.forEach(session => {
        const btn = document.createElement('button');
        btn.className = `chat-history-item ${session.id === currentSessionId ? 'active' : ''}`;
        btn.innerHTML = `<i class="ph-fill ph-chat-circle-dots"></i> <span>${session.title}</span>`;
        btn.addEventListener('click', () => {
            if(session.id !== currentSessionId) {
                loadSession(session.id);
                if (window.innerWidth <= 768) toggleSidebar();
            }
        });
        list.appendChild(btn);
    });
}

document.getElementById('btn-new-chat').addEventListener('click', () => {
    createNewSession();
    if (window.innerWidth <= 768) toggleSidebar();
});

// --- TUTORIAL & SENSORY FEEDBACK ---
function checkAndShowTutorialLock() {
    if (!localStorage.getItem('horizon_tutorial_done')) {
        document.getElementById('tutorialLock').style.display = 'flex';
        document.getElementById('btn-close-tutorial').addEventListener('click', () => {
            document.getElementById('tutorialLock').style.display = 'none';
            localStorage.setItem('horizon_tutorial_done', 'true');
            if (window.innerWidth <= 768) {
                document.getElementById('mainSidebar').classList.remove('collapsed');
                document.getElementById('mobileOverlay').classList.add('active');
            }
        });
    }
}

function triggerHaptic() { if (hapticsEnabled && navigator.vibrate) navigator.vibrate(50); }
function playPopSound() {
    if (!sfxEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.1);
    } catch(e) {}
}

document.querySelectorAll('button').forEach(btn => btn.addEventListener('click', triggerHaptic));

function applyProfileOverrides(user) {
    if (isGhostMode) return;
    const savedName = localStorage.getItem('horizon_custom_name');
    const savedPfp = localStorage.getItem('horizon_custom_pfp');
    document.getElementById('userProfileName').innerText = savedName || (user ? user.displayName : 'Yash') || 'Yash';
    document.getElementById('userProfileAvatar').src = savedPfp || (user ? user.photoURL : 'https://via.placeholder.com/36') || 'https://via.placeholder.com/36';
    if (user) {
        const providerIcon = user.providerData[0]?.providerId === 'google.com' ? 'ph-google-logo' : 'ph-github-logo';
        document.getElementById('userProfileStatus').innerHTML = `<i class="ph-fill ${providerIcon}"></i> Authenticated`;
    }
}

function updateStatsUI(addedTokens = 0) {
    if (isGhostMode) return;
    statMessages += 1; statTokens += addedTokens;
    localStorage.setItem('horizon_stat_msgs', statMessages);
    localStorage.setItem('horizon_stat_tokens', statTokens);
}

// --- MARKDOWN RENDERING ---
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
    const encodedForDownload = btoa(unescape(encodeURIComponent(actualCode))); 
    return `
    <div class="code-wrapper">
        <div class="code-header">
            <span style="display:flex; align-items:center; gap:6px;"><i class="ph-bold ph-file-code"></i> ${lang.toUpperCase()}</span>
            <div class="code-header-actions">
                <button class="code-action-btn btn-code-download" data-code="${encodedForDownload}" data-ext="${lang}"><i class="ph-bold ph-download-simple"></i> Save</button>
            </div>
        </div>
        <pre><code class="language-${lang}">${escapedCode}</code></pre>
    </div>`;
};
marked.use({ renderer });
marked.setOptions({ breaks: true, gfm: true });

document.getElementById('chatBox').addEventListener('click', (e) => {
    const downloadBtn = e.target.closest('.btn-code-download');
    if (downloadBtn) {
        const base64Code = downloadBtn.getAttribute('data-code');
        const ext = downloadBtn.getAttribute('data-ext') || 'txt';
        const decodedCode = decodeURIComponent(escape(atob(base64Code)));
        const blob = new Blob([decodedCode], { type: "text/plain" });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `horizon_snippet.${ext}`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
    }
});

// --- SETTINGS UI & MODALS ---
const toggleSidebar = () => {
    const sidebar = document.getElementById('mainSidebar');
    const overlay = document.getElementById('mobileOverlay');
    sidebar.classList.toggle('collapsed');
    overlay.classList.toggle('active', !sidebar.classList.contains('collapsed'));
};

document.getElementById('btn-toggle-sidebar').addEventListener('click', toggleSidebar);
document.getElementById('mobileOverlay').addEventListener('click', toggleSidebar); 
if (window.innerWidth <= 768) document.getElementById('mainSidebar').classList.add('collapsed');

document.getElementById('btn-open-settings').addEventListener('click', () => {
    document.getElementById('settingsModal').classList.add('active');
    if (window.innerWidth <= 768) toggleSidebar(); 
});
document.getElementById('btn-close-settings').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('active'));

document.getElementById('btn-toggle-theme').addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    document.getElementById('themeIcon').className = document.body.classList.contains('light-mode') ? 'ph-fill ph-moon' : 'ph-fill ph-sun-dim';
});

// Profile Modal
document.getElementById('btn-user-profile').addEventListener('click', async () => {
    if (isGhostMode) return alert("Profile stats are disabled in Ephemeral/Ghost Mode.");
    document.getElementById('statMsgs').innerText = statMessages;
    document.getElementById('statTokens').innerText = statTokens.toLocaleString();
    document.getElementById('editProfileName').value = document.getElementById('userProfileName').innerText;
    document.getElementById('editProfilePfp').value = document.getElementById('userProfileAvatar').src;
    
    const provider = document.getElementById('provider').value;
    const apiKey = document.getElementById('apiKey').value;
    const creditInfoDiv = document.getElementById('apiCreditsInfo');
    creditInfoDiv.style.display = 'none';
    
    if (provider === 'openrouter' && apiKey) {
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

    document.getElementById('profileModalOverlay').classList.add('active');
    if (window.innerWidth <= 768) toggleSidebar();
});

document.getElementById('btn-close-profile').addEventListener('click', () => document.getElementById('profileModalOverlay').classList.remove('active'));
document.getElementById('btn-save-profile').addEventListener('click', () => {
    const newName = document.getElementById('editProfileName').value.trim();
    const newPfp = document.getElementById('editProfilePfp').value.trim();
    if (newName) localStorage.setItem('horizon_custom_name', newName);
    if (newPfp) localStorage.setItem('horizon_custom_pfp', newPfp);
    applyProfileOverrides(auth.currentUser);
    document.getElementById('profileModalOverlay').classList.remove('active');
});

// Pin Actions
document.getElementById('quickModelSelector').addEventListener('click', (e) => {
    if(e.target.closest('.custom-option')) return;
    document.getElementById('quickModelDropdown').classList.toggle('active');
});
document.getElementById('btn-pin-actions').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('expanded-actions').classList.toggle('active');
    document.getElementById('btn-pin-actions').classList.toggle('active');
});
document.addEventListener('click', (e) => {
    if(!e.target.closest('.input-actions-wrapper')) {
        document.getElementById('expanded-actions').classList.remove('active');
        document.getElementById('btn-pin-actions').classList.remove('active');
    }
    if(!e.target.closest('#quickModelSelector')) document.getElementById('quickModelDropdown').classList.remove('active');
});

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '88, 101, 242';
}
const updateAccentColor = (hex) => {
    document.documentElement.style.setProperty('--accent', hex);
    document.documentElement.style.setProperty('--accent-dark', hex + 'cc'); 
    document.documentElement.style.setProperty('--accent-alpha', `rgba(${hexToRgb(hex)}, 0.4)`);
};

const updateApiLinkUI = (providerName) => {
    const linkEl = document.getElementById('apiKeyLink');
    if (providerName === 'openrouter') { linkEl.href = "https://openrouter.ai/keys"; linkEl.innerHTML = '<i class="ph-bold ph-arrow-square-out"></i> Get OpenRouter Key'; }
    else if (providerName === 'aistudio') { linkEl.href = "https://aistudio.google.com/app/apikey"; linkEl.innerHTML = '<i class="ph-bold ph-arrow-square-out"></i> Get Google AI Key'; }
    else if (providerName === 'portkey') { linkEl.href = "https://app.portkey.ai/api-keys"; linkEl.innerHTML = '<i class="ph-bold ph-arrow-square-out"></i> Get Portkey Key'; }
};

const initSettings = () => {
    const savedProvider = localStorage.getItem('horizon_provider') || 'openrouter';
    document.getElementById('provider').value = savedProvider;
    updateApiLinkUI(savedProvider);
    
    document.getElementById('apiKey').value = localStorage.getItem('horizon_key') || '';
    document.getElementById('systemPrompt').value = localStorage.getItem('horizon_prompt') || '';
    
    const savedColor = localStorage.getItem('horizon_color') || '#5865F2';
    document.getElementById('accentColorPicker').value = savedColor;
    updateAccentColor(savedColor);

    sfxEnabled = localStorage.getItem('horizon_sfx') !== 'false';
    hapticsEnabled = localStorage.getItem('horizon_haptics') !== 'false';
    voiceResponseEnabled = localStorage.getItem('horizon_voice') === 'true';
    currentTone = localStorage.getItem('horizon_tone') || 'standard';

    document.getElementById('sfxToggle').checked = sfxEnabled;
    document.getElementById('hapticsToggle').checked = hapticsEnabled;
    document.getElementById('voiceToggle').checked = voiceResponseEnabled;
    document.getElementById('chatTone').value = currentTone;

    const savedModel = localStorage.getItem('horizon_model');
    if (savedModel) {
        document.getElementById('modelSelect').value = savedModel;
        const shortName = savedModel.split('/').pop();
        document.getElementById('modelSelectTrigger').innerHTML = `<span>${shortName}</span> <i class="ph-bold ph-caret-down"></i>`;
        document.getElementById('quickModelLabel').innerText = shortName;
    }
};
initSettings();

const syncSettings = () => {
    localStorage.setItem('horizon_provider', document.getElementById('provider').value);
    localStorage.setItem('horizon_key', document.getElementById('apiKey').value);
    localStorage.setItem('horizon_model', document.getElementById('modelSelect').value);
    localStorage.setItem('horizon_prompt', document.getElementById('systemPrompt').value);
    localStorage.setItem('horizon_color', document.getElementById('accentColorPicker').value);
    localStorage.setItem('horizon_sfx', document.getElementById('sfxToggle').checked);
    localStorage.setItem('horizon_haptics', document.getElementById('hapticsToggle').checked);
    localStorage.setItem('horizon_voice', document.getElementById('voiceToggle').checked);
    localStorage.setItem('horizon_tone', document.getElementById('chatTone').value);

    sfxEnabled = document.getElementById('sfxToggle').checked;
    hapticsEnabled = document.getElementById('hapticsToggle').checked;
    voiceResponseEnabled = document.getElementById('voiceToggle').checked;
    currentTone = document.getElementById('chatTone').value;
};

document.getElementById('accentColorPicker').addEventListener('input', (e) => { updateAccentColor(e.target.value); syncSettings(); });
document.getElementById('sfxToggle').addEventListener('change', syncSettings);
document.getElementById('hapticsToggle').addEventListener('change', syncSettings);
document.getElementById('voiceToggle').addEventListener('change', syncSettings);
document.getElementById('chatTone').addEventListener('change', syncSettings);
document.getElementById('systemPrompt').addEventListener('change', syncSettings);
document.getElementById('apiKey').addEventListener('change', syncSettings);
document.getElementById('provider').addEventListener('change', (e) => {
    document.getElementById('modelSelectTrigger').innerHTML = `<span>Fetch models first...</span> <i class="ph-bold ph-caret-down"></i>`;
    document.getElementById('modelSelect').value = '';
    updateApiLinkUI(e.target.value);
    if (e.target.value === 'portkey' && !document.getElementById('apiKey').value) {
        document.getElementById('apiKey').value = 'ubeOLvhr1xSsIl3KsVj6XMeEgKmi';
    }
    syncSettings();
});

document.getElementById('modelSelectTrigger').addEventListener('click', () => document.getElementById('modelSelectOptions').classList.toggle('open'));
document.getElementById('modelSearchBox').addEventListener('keyup', (e) => {
    const query = e.target.value.toLowerCase();
    document.querySelectorAll('.custom-option').forEach(opt => opt.style.display = opt.innerText.toLowerCase().includes(query) ? 'flex' : 'none');
});

// --- MODEL FETCHING & RENDER ---
window.promptModelSelection = (id, name) => {
    window.pendingModelSelection = { id, name };
    document.getElementById('capModelName').innerText = name;
    
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
    
    document.getElementById('capList').innerHTML = capsHTML;
    document.getElementById('capabilitiesModalOverlay').classList.add('active');
};

document.getElementById('btn-cancel-model').addEventListener('click', () => { document.getElementById('capabilitiesModalOverlay').classList.remove('active'); window.pendingModelSelection = null; });
document.getElementById('btn-confirm-model').addEventListener('click', () => {
    if (window.pendingModelSelection) {
        document.getElementById('modelSelect').value = window.pendingModelSelection.id;
        document.getElementById('modelSelectTrigger').innerHTML = `<span>${window.pendingModelSelection.name}</span> <i class="ph-bold ph-caret-down"></i>`;
        document.getElementById('quickModelLabel').innerText = window.pendingModelSelection.name;
        syncSettings();
    }
    document.getElementById('capabilitiesModalOverlay').classList.remove('active');
    document.getElementById('modelSelectOptions').classList.remove('open');
    document.getElementById('quickModelDropdown').classList.remove('active');
});

async function fetchAvailableModels() {
    const provider = document.getElementById('provider').value;
    const apiKey = document.getElementById('apiKey').value;
    const trigger = document.getElementById('modelSelectTrigger');
    const chatRefreshBtn = document.getElementById('btn-refresh-models-chat');

    if (!apiKey) return alert("Please enter an API key.");
    
    trigger.innerHTML = `<span><i class="ph-bold ph-spinner ph-spin"></i> Loading...</span>`;
    if (chatRefreshBtn) chatRefreshBtn.innerHTML = `<i class="ph-bold ph-spinner ph-spin"></i>`;

    try {
        let modelsArray = [];
        if (provider === 'openrouter') {
            const res = await fetch("https://openrouter.ai/api/v1/models", { headers: { "Authorization": `Bearer ${apiKey}`, "HTTP-Referer": window.location.href, "X-Title": "Horizon.AI" }});
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
        trigger.innerHTML = `<span>Error</span>`; 
        alert(error.message); 
    } finally {
        if (chatRefreshBtn) chatRefreshBtn.innerHTML = `<i class="ph-bold ph-arrows-clockwise"></i>`;
    }
}

document.getElementById('btn-fetch-models').addEventListener('click', fetchAvailableModels);
document.getElementById('btn-refresh-models-chat').addEventListener('click', fetchAvailableModels);

function renderModelsList(modelsArray, provider) {
    const containerSettings = document.getElementById('modelListContainer');
    const containerQuick = document.getElementById('quickModelDropdown');
    containerSettings.innerHTML = ''; containerQuick.innerHTML = '';

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

        // Add Capability Badges
        let capabilityBadges = `<div style="display:flex; gap: 4px; margin-left: auto;">`;
        if (lowerId.includes('vision') || lowerId.includes('gemini') || lowerId.includes('gpt-4o') || lowerId.includes('claude-3') || lowerId.includes('pixtral') || lowerId.includes('llava')) {
            capabilityBadges += `<span class="capability-badge" title="Image Processing" style="color: #4cd137;"><i class="ph-bold ph-image"></i></span>`;
        }
        if (lowerId.includes('audio') || lowerId.includes('gemini-1.5') || lowerId.includes('gpt-4o')) {
            capabilityBadges += `<span class="capability-badge" title="Audio Processing" style="color: #fbc531;"><i class="ph-bold ph-microphone"></i></span>`;
        }
        capabilityBadges += `</div>`;

        grouped[brand].push({ id: m, name: idName, tag: tagHtml, capabilities: capabilityBadges, weight: sortWeight });
    });

    for (const [brand, models] of Object.entries(grouped)) {
        const lbl1 = document.createElement('div'); lbl1.className = 'optgroup-label'; lbl1.innerHTML = `<i class="ph-fill ph-buildings"></i> ${brand}`;
        const lbl2 = document.createElement('div'); lbl2.className = 'optgroup-label'; lbl2.innerHTML = `<i class="ph-fill ph-buildings"></i> ${brand}`;
        containerSettings.appendChild(lbl1); containerQuick.appendChild(lbl2);
        models.sort((a, b) => a.weight - b.weight);

        models.forEach(model => {
            const buildOption = () => {
                const opt = document.createElement('div'); opt.className = 'custom-option';
                opt.innerHTML = `<span>${model.name}</span> ${model.capabilities} ${model.tag}`;
                opt.addEventListener('click', (e) => { e.stopPropagation(); window.promptModelSelection(model.id, model.name); });
                return opt;
            };
            containerSettings.appendChild(buildOption()); containerQuick.appendChild(buildOption());
        });
    }
    document.getElementById('modelSelectTrigger').innerHTML = `<span>Select a model...</span> <i class="ph-bold ph-caret-down"></i>`;
}

// --- ATTACHMENTS ---
document.getElementById('btn-trigger-file').addEventListener('click', () => { document.getElementById('fileAttach').click(); document.getElementById('expanded-actions').classList.remove('active');});
document.getElementById('btn-trigger-camera').addEventListener('click', () => { document.getElementById('cameraAttach').click(); document.getElementById('expanded-actions').classList.remove('active');});
const processFiles = (event) => {
    const files = event.target.files; if (!files) return;
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            attachedFilesData.push({ base64: e.target.result, isImage: file.type.startsWith('image/'), name: file.name, mime: file.type });
            updateStagingArea();
        }; reader.readAsDataURL(file);
    }); event.target.value = '';
};
document.getElementById('fileAttach').addEventListener('change', processFiles);
document.getElementById('cameraAttach').addEventListener('change', processFiles);

function updateStagingArea() {
    const container = document.getElementById('imagePreviewContainer'); container.innerHTML = '';
    attachedFilesData.forEach((fileObj, index) => {
        const div = document.createElement('div'); div.className = 'preview-item';
        if (fileObj.isImage) div.innerHTML = `<img src="${fileObj.base64}">`;
        else div.innerHTML = `<i class="ph-fill ph-file-text"></i><span>${fileObj.name.substring(0,5)}..</span>`;
        const btn = document.createElement('button'); btn.innerHTML = `<i class="ph-bold ph-x"></i>`;
        btn.addEventListener('click', () => { attachedFilesData.splice(index, 1); updateStagingArea(); });
        div.appendChild(btn); container.appendChild(div);
    });
}

// Voice Recognition
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    const micBtn = document.getElementById('btn-trigger-mic');
    let isRecording = false;
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onstart = () => { isRecording = true; micBtn.classList.add('active'); };
    recognition.onend = () => { isRecording = false; micBtn.classList.remove('active'); };
    recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        }
        const input = document.getElementById('userInput');
        if (finalTranscript) input.value += (input.value ? ' ' : '') + finalTranscript;
    };

    micBtn.addEventListener('click', () => { isRecording ? recognition.stop() : recognition.start(); });
} else {
    document.getElementById('btn-trigger-mic').style.display = 'none';
}

// --- CHAT LOGIC WITH LONG-TERM MEMORY & TTS ---
document.getElementById('userInput').addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); triggerSend(); }});
document.getElementById('btn-send').addEventListener('click', triggerSend);

const scrollToBottom = () => requestAnimationFrame(() => document.getElementById('chatBox').scrollTop = document.getElementById('chatBox').scrollHeight);

function showTypingIndicator() {
    document.getElementById('placeholderMsg')?.remove();
    const box = document.getElementById('chatBox');
    const msgDiv = document.createElement('div'); msgDiv.className = `message ai`; msgDiv.id = `typingIndicatorActive`;
    msgDiv.innerHTML = `<div class="message-sender"><i class="ph-fill ph-planet neon-planet"></i> Horizon is responding...</div><div class="message-content glass"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
    box.appendChild(msgDiv); scrollToBottom();
}
function removeTypingIndicator() { const ind = document.getElementById('typingIndicatorActive'); if (ind) ind.remove(); }

async function triggerSend() {
    const inputEl = document.getElementById('userInput');
    const text = inputEl.value.trim();
    const provider = document.getElementById('provider').value;
    const apiKey = document.getElementById('apiKey').value;
    const model = document.getElementById('modelSelect').value;
    let systemPrompt = document.getElementById('systemPrompt').value.trim();
    const sendBtn = document.getElementById('btn-send');

    if ((!text && attachedFilesData.length === 0) || !apiKey || !model) return alert("Missing input or config.");
    playPopSound();

    const filesToLog = [...attachedFilesData];
    renderMessageToDOM('user', text, filesToLog);
    uiHistory.push({ role: 'user', text: text, files: filesToLog });
    
    let payloadContent = text;
    if ((provider === 'openrouter' || provider === 'portkey') && filesToLog.length > 0) {
        payloadContent = text ? [{ type: "text", text: text }] : [];
        filesToLog.forEach(file => { if(file.isImage) payloadContent.push({ type: "image_url", image_url: { url: file.base64 } }); });
    }
    
    const currentReq = [...chatHistory, { role: 'user', content: payloadContent, files: filesToLog }];
    if(!isGhostMode) { chatHistory.push({ role: 'user', content: payloadContent, files: filesToLog }); saveSessionData(); }

    inputEl.value = ''; attachedFilesData = []; updateStagingArea(); sendBtn.disabled = true;
    
    // Stop any ongoing voice output when you send a new message
    if(window.speechSynthesis) window.speechSynthesis.cancel();
    
    showTypingIndicator();

    // Inject Tones into Prompt
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
            const headers = provider === 'openrouter' ? { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": window.location.href, "X-Title": "Horizon.AI" } : { "x-portkey-api-key": apiKey, "Content-Type": "application/json" };
            
            let finalMessages = currentReq.map(m => ({role: m.role, content: m.content}));
            if (systemPrompt) finalMessages.unshift({ role: "system", content: systemPrompt });

            const res = await fetch(url, { method: "POST", headers: headers, body: JSON.stringify({ model: model, messages: finalMessages }) });
            const data = await res.json(); if(data.error) throw new Error(data.error.message);
            aiResponse = data.choices[0].message.content;
            
        } else if (provider === 'aistudio') {
            const geminiHistory = currentReq.map(msg => {
                let parts = [];
                if (typeof msg.content === 'string' && msg.content) parts.push({ text: msg.content });
                if (msg.files) msg.files.forEach(f => parts.push({ inlineData: { data: f.base64.split(',')[1], mimeType: f.mime } }));
                return { role: msg.role === 'user' ? 'user' : 'model', parts: parts };
            });
            let payloadData = { contents: geminiHistory };
            if (systemPrompt) payloadData.system_instruction = { parts: [{ text: systemPrompt }] };

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payloadData)
            });
            const data = await res.json(); if(data.error) throw new Error(data.error.message);
            aiResponse = data.candidates[0].content.parts[0].text;
        }

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

        removeTypingIndicator(); playPopSound();
        renderMessageToDOM('ai', aiResponse);
        
        // Voice Chat TTS Execution
        if (voiceResponseEnabled && window.speechSynthesis) {
            // Strip markdown formatting for cleaner speech
            const cleanTextForSpeech = aiResponse.replace(/[*_`#><\[\]]/g, '');
            const utterance = new SpeechSynthesisUtterance(cleanTextForSpeech);
            window.speechSynthesis.speak(utterance);
        }
        
        const estimatedTokens = Math.ceil((text.length + aiResponse.length) / 4);
        updateStatsUI(estimatedTokens);

        if(!isGhostMode) { uiHistory.push({ role: 'ai', text: aiResponse, files: [] }); chatHistory.push({ role: 'assistant', content: aiResponse }); saveSessionData(); }

    } catch (err) {
        console.error(err); removeTypingIndicator();
        renderMessageToDOM('ai', `⚠️ Error: ${err.message}`);
        if(!isGhostMode) { chatHistory.pop(); uiHistory.pop(); saveSessionData(); }
    } finally { sendBtn.disabled = false; }
}

function renderMessageToDOM(role, text, files = [], skipScroll = false) {
    document.getElementById('placeholderMsg')?.remove();
    const box = document.getElementById('chatBox');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${role}`;
    
    const savedName = localStorage.getItem('horizon_custom_name');
    let name = savedName || (auth.currentUser ? (auth.currentUser.displayName || 'Yash') : 'Yash');
    if (isGhostMode) name = 'Ghost';
    
    msgDiv.innerHTML = `<div class="message-sender">${role === 'user' ? `${name} <i class="ph-fill ph-user-circle"></i>` : '<i class="ph-fill ph-planet"></i> Horizon'}</div><div class="message-content ${role === 'ai' ? 'glass' : ''}"></div>`;
    const content = msgDiv.querySelector('.message-content');
    
    if (role === 'ai') content.innerHTML = DOMPurify.sanitize(marked.parse(text));
    else {
        content.innerText = text; 
        files.forEach(f => {
            if(f.isImage) { const img = document.createElement('img'); img.src = f.base64; img.className = 'message-image'; content.appendChild(img); } 
            else { const fileDiv = document.createElement('div'); fileDiv.className = 'message-file'; fileDiv.innerHTML = `<i class="ph-fill ph-file-text" style="font-size:1.5rem"></i> <span>${f.name}</span>`; content.appendChild(fileDiv); }
        });
    }
    box.appendChild(msgDiv);
    if(!skipScroll) scrollToBottom();
}
