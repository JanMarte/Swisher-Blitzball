/**
 * @file app.js
 * @description Swisher BlitzBall League Manager - Supabase Auth Edition (Fixed Scope)
 */
"use strict";

import { Team } from "./Team.js";
import { supabase } from "./supabaseClient.js";
import { SupabaseHandler } from "./SupaBaseHandler.js";
import { ListManager } from "./ListManager.js";
import { FormHandler } from "./FormHandler.js";

// --- STATE ---
let liveGame = { inning: 1, outs: 0, stats: {} };
let currentModalPlayer = null;
let teams = [];
let pendingTeams = [];
let matches = [];
let archives = [];
let bracketState = { mainRounds: [], thirdPlaceMatch: null, champion: null };
let schedule = [];
let pendingScheduleId = null;
let editingRosterId = null;
let currentViewingId = null;
let pendingDeleteId = null;
let pendingMatchDeleteId = null;
let returnToLeaderboard = false;
let currentUser = null;
let isPlayoffs = false;

// --- STORAGE KEYS & HANDLERS ---
const STORAGE_KEY_BRACKET = "swisher_bracket_state_v2";
const STORAGE_KEY_PENDING = "swisher_blitzball_pending";

const teamStorage = new SupabaseHandler("teams");
const matchStorage = new SupabaseHandler("matches");
const scheduleStorage = new SupabaseHandler("schedule");
const archiveStorage = new SupabaseHandler("archives");

let listManager;
let formHandler;

// --- INITIALIZATION ---
window.addEventListener("load", initialize);

async function initialize() {
    listManager = new ListManager("teams-list");
    formHandler = new FormHandler("team-form");

    // 1. Auth Listener
    setupAuthListener();

    // 2. Load Data
    await loadData();

    // 3. UI Events
    setupEventListeners();

    startInactivityTimer();
}

function setupAuthListener() {
    supabase.auth.getSession().then(({ data: { session } }) => {
        updateUserSession(session);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
        updateUserSession(session);
    });
}

function updateUserSession(session) {
    if (session) {
        const role = session.user.user_metadata.role || 'manager';
        currentUser = {
            name: session.user.email.split('@')[0],
            email: session.user.email,
            role: role
        };
        showToast(`Welcome back, ${currentUser.name}!`);
    } else {
        currentUser = { name: "Guest", role: "guest" };
    }
    updateHeaderUI();
    applyPermissions();
    renderDashboard();

    const loginPanel = document.getElementById("login-panel");
    if (loginPanel && !loginPanel.classList.contains("hidden")) {
        showPanel("dashboard-panel");
    }
}

async function loadData() {
    console.log("Loading live data from Supabase...");

    const rawTeams = await teamStorage.getData();
    teams = rawTeams.map(d => Team.fromData(d));

    matches = await matchStorage.getData();
    schedule = await scheduleStorage.getData();
    archives = await archiveStorage.getData();

    const savedBracket = localStorage.getItem(STORAGE_KEY_BRACKET);
    if (savedBracket) bracketState = JSON.parse(savedBracket);
    isPlayoffs = localStorage.getItem("swisher_playoff_mode") === "true";

    const savedPending = localStorage.getItem(STORAGE_KEY_PENDING);
    if (savedPending) pendingTeams = JSON.parse(savedPending);
}

function setupEventListeners() {
    // AUTH
    document.getElementById("btn-header-login").addEventListener("click", () => {
        showPanel("login-panel");
        document.getElementById("guest-bar").classList.add("hidden");
    });
    document.getElementById("btn-cancel-login").addEventListener("click", () => {
        showPanel("dashboard-panel");
        updateHeaderUI();
    });

    document.getElementById("login-form").addEventListener("submit", handleLogin);

    document.getElementById("btn-logout").addEventListener("click", async () => {
        await supabase.auth.signOut();
        showToast("Logged out");
    });

    // Public Registration
    document.getElementById("btn-public-register").addEventListener("click", () => {
        document.getElementById("btn-public-register").classList.add("hidden");
        formHandler.reset();
        document.getElementById("stats-fieldset").classList.add("hidden");
        document.getElementById("form-title").textContent = "Apply to Join League";
        returnToLeaderboard = false;
        showPanel("team-form-panel");
    });

    // Review Apps
    const btnReview = document.getElementById("btn-review-applications");
    if (btnReview) btnReview.addEventListener("click", () => {
        renderPendingList();
        showPanel("review-panel");
    });
    const btnBackReview = document.getElementById("btn-back-review");
    if (btnBackReview) btnBackReview.addEventListener("click", () => showPanel("dashboard-panel"));

    // Nav
    document.getElementById("btn-show-add").addEventListener("click", () => {
        formHandler.reset();
        document.getElementById("stats-fieldset").classList.add("hidden");
        returnToLeaderboard = false;
        showPanel("team-form-panel");
    });

    document.getElementById("btn-show-view").addEventListener("click", () => renderAndShowLeaderboard());
    document.getElementById("btn-show-match").addEventListener("click", showMatchPanel);

    document.getElementById("btn-show-archive").addEventListener("click", () => {
        renderArchivePanel();
        showPanel("archive-panel");
    });
    document.getElementById("btn-back-from-archive").addEventListener("click", () => showPanel("dashboard-panel"));
    document.getElementById("btn-back-from-bracket").addEventListener("click", () => showPanel("dashboard-panel"));
    document.getElementById("btn-reset-playoffs").addEventListener("click", handleResetPlayoffs);
    document.getElementById("btn-archive-season").addEventListener("click", handleArchiveSeason);

    document.getElementById("btn-form-cancel").addEventListener("click", () => {
        const btnReg = document.getElementById("btn-public-register");
        if (btnReg) btnReg.classList.remove("hidden");
        showPanel(returnToLeaderboard ? "view-teams" : "dashboard-panel");
    });
    document.getElementById("btn-view-back").addEventListener("click", () => renderAndShowLeaderboard());
    document.getElementById("btn-leaderboard-back").addEventListener("click", () => showPanel("dashboard-panel"));
    document.getElementById("btn-match-cancel").addEventListener("click", () => showPanel("dashboard-panel"));
    document.getElementById("btn-edit-from-view").addEventListener("click", () => { if (currentViewingId) handleEditRequest(currentViewingId); });

    document.getElementById("search-teams").addEventListener("input", handleSearch);
    document.getElementById("btn-export").addEventListener("click", handleExport);
    document.getElementById("file-import").addEventListener("change", handleImport);
    document.getElementById("btn-reset").addEventListener("click", handleResetSeason);

    document.getElementById("team-form").addEventListener("submit", handleFormSubmit);
    document.getElementById("match-form").addEventListener("submit", handleMatchSubmit);

    document.getElementById("btn-confirm-delete").addEventListener("click", executeDelete);
    document.getElementById("btn-cancel-delete").addEventListener("click", () => { pendingDeleteId = null; showPanel("view-teams"); });
    document.getElementById("btn-confirm-match-delete").addEventListener("click", executeMatchDelete);
    document.getElementById("btn-cancel-match-delete").addEventListener("click", () => { pendingMatchDeleteId = null; showPanel("view-teams"); });

    document.getElementById("btn-confirm-start-playoffs").addEventListener("click", executeStartPlayoffs);
    document.getElementById("btn-cancel-start-playoffs").addEventListener("click", () => showPanel("dashboard-panel"));
    document.getElementById("btn-confirm-reset-playoffs").addEventListener("click", executeResetPlayoffs);
    document.getElementById("btn-cancel-reset-playoffs").addEventListener("click", () => showPanel("playoff-panel"));
    document.getElementById("btn-confirm-reset-season").addEventListener("click", executeResetSeason);
    document.getElementById("btn-cancel-reset-season").addEventListener("click", () => showPanel("dashboard-panel"));

    // [FIXED: Calling function that is now hoisted properly]
    document.getElementById("score1").addEventListener("input", saveLiveDraft);
    document.getElementById("score2").addEventListener("input", saveLiveDraft);

    document.getElementById("btn-manage-roster").addEventListener("click", () => {
        if (currentViewingId) openRosterPanel(currentViewingId);
    });
    document.getElementById("btn-cancel-roster").addEventListener("click", () => { showPanel("view-single-team"); });
    document.getElementById("btn-save-roster").addEventListener("click", saveRosterPhotos);

    document.getElementById("btn-show-schedule").addEventListener("click", () => {
        const s1 = document.getElementById("sched-home");
        const s2 = document.getElementById("sched-away");
        s1.innerHTML = '<option value="">Select Home...</option>';
        s2.innerHTML = '<option value="">Select Away...</option>';
        teams.forEach(t => { s1.add(new Option(t.teamName, t.teamName)); s2.add(new Option(t.teamName, t.teamName)); });
        showPanel("schedule-panel");
    });
    document.getElementById("schedule-form").addEventListener("submit", handleScheduleSubmit);
    document.getElementById("btn-cancel-schedule").addEventListener("click", () => showPanel("dashboard-panel"));

    // Generator Modals
    const btnGen = document.getElementById("btn-show-generator");
    if (btnGen) {
        btnGen.addEventListener("click", () => {
            const nextSat = new Date();
            nextSat.setDate(nextSat.getDate() + (6 - nextSat.getDay() + 7) % 7);
            document.getElementById("gen-start-date").valueAsDate = nextSat;
            document.getElementById("generator-modal").classList.remove("hidden");
            document.getElementById("generator-modal").style.display = "flex";
        });
    }
    document.getElementById("btn-cancel-gen").addEventListener("click", () => { document.getElementById("generator-modal").classList.add("hidden"); document.getElementById("generator-modal").style.display = ""; });
    document.getElementById("btn-confirm-gen").addEventListener("click", () => {
        const rounds = parseInt(document.getElementById("gen-rounds").value);
        const startDateVal = document.getElementById("gen-start-date").value;
        if (!startDateVal) { showToast("Please select a start date", "error"); return; }
        generateSchedule(rounds, new Date(startDateVal));
        document.getElementById("generator-modal").classList.add("hidden");
        document.getElementById("generator-modal").style.display = "";
    });

    // Stats Modal Close
    document.getElementById("close-stats-modal").addEventListener("click", () => {
        document.getElementById("stats-modal").classList.add("hidden");
        const t1 = document.getElementById("team1").value;
        const t2 = document.getElementById("team2").value;
        if (t1) updateMatchRosters(1);
        if (t2) updateMatchRosters(2);
    });

    // Video Modal Close
    document.getElementById("close-video-modal").addEventListener("click", closeVideoModal);

    // Inactivity Modal Buttons
    const btnStay = document.getElementById("btn-stay-logged-in");
    const btnClose = document.getElementById("btn-close-timeout");
    if (btnStay) btnStay.onclick = resetTimer;
    if (btnClose) btnClose.onclick = () => { document.getElementById("inactivity-modal").classList.add("hidden"); document.getElementById("inactivity-modal").style.display = ""; };
}

// --- GLOBAL EXPORTS (For HTML onclick attributes) ---
// We define functions normally, then map them to window.
window.adjustInning = adjustInning;
window.adjustOuts = adjustOuts;
window.stepStat = stepStat;
window.addStat = addStat;
window.playVideo = playVideo;
window.viewApplication = viewApplication;
window.approveTeam = approveTeam;
window.rejectTeam = rejectTeam;
window.confirmDecline = confirmDecline;
window.cancelDecline = cancelDecline;
window.finalizeDecline = finalizeDecline;
window.requestMatchDelete = requestMatchDelete;
window.enterScoreForSchedule = enterScoreForSchedule;
window.handleBracketSubmit = handleBracketSubmit;

// --- FUNCTIONS ---

async function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById("login-user").value;
    const password = document.getElementById("login-pass").value;

    const { data, error } = await supabase.auth.signInWithPassword({
        email: email,
        password: password
    });

    if (error) {
        showToast("Login Failed: " + error.message, "error");
    } else {
        document.getElementById("login-form").reset();
    }
}

function updateHeaderUI() {
    const guestBar = document.getElementById("guest-bar");
    const userBar = document.getElementById("user-bar");
    if (currentUser && currentUser.role !== 'guest') {
        guestBar.classList.add("hidden");
        userBar.classList.remove("hidden");
        document.getElementById("current-username").textContent = currentUser.name;
        document.getElementById("current-role").textContent = currentUser.role.toUpperCase();
    } else {
        guestBar.classList.remove("hidden");
        userBar.classList.add("hidden");
    }
}

function handleFormSubmit(e) {
    e.preventDefault();
    document.querySelectorAll(".error-msg").forEach(el => { el.textContent = ""; el.classList.remove("visible"); });
    document.querySelectorAll(".input-error").forEach(el => el.classList.remove("input-error"));

    const teamNameEl = document.getElementById("teamName");
    const captainNameEl = document.getElementById("captainName");
    const emailEl = document.getElementById("email");
    const phoneEl = document.getElementById("phone");

    let isValid = true;
    let firstInvalidInput = null;
    const markInvalid = (id) => { isValid = false; if (!firstInvalidInput) firstInvalidInput = document.getElementById(id); };

    const teamNameVal = teamNameEl.value.trim();
    const currentId = parseInt(document.getElementById("team-id").value) || null;

    if (!teamNameVal) { showError("teamName", "Team Name is required."); markInvalid("teamName"); }
    else if (/\d/.test(teamNameVal)) { showError("teamName", "Team Name cannot contain numbers."); markInvalid("teamName"); }
    else {
        const isActiveDup = teams.some(t => t.teamName.toLowerCase() === teamNameVal.toLowerCase() && t.id !== currentId);
        const isPendingDup = pendingTeams.some(t => t.teamName.toLowerCase() === teamNameVal.toLowerCase());
        if (isActiveDup || isPendingDup) { showError("teamName", "This Team Name is already taken."); markInvalid("teamName"); }
    }

    if (!captainNameEl.value.trim()) { showError("captainName", "Captain Name is required."); markInvalid("captainName"); }
    if (!emailEl.value.trim()) { showError("email", "Email is required."); markInvalid("email"); }
    else if (!emailEl.value.includes("@")) { showError("email", "Please enter a valid email address."); markInvalid("email"); }
    if (!phoneEl.value.trim()) { showError("phone", "Phone number is required."); markInvalid("phone"); }

    if (!isValid) {
        if (firstInvalidInput) { firstInvalidInput.scrollIntoView({ behavior: 'smooth', block: 'center' }); firstInvalidInput.focus(); }
        return;
    }

    const data = {
        id: currentId,
        teamName: teamNameVal,
        captainName: captainNameEl.value.trim(),
        email: emailEl.value.trim(),
        phone: phoneEl.value.trim(),
        players: document.getElementById("players").value.split(",").map(s => s.trim()).filter(s => s),
        wins: parseInt(document.getElementById("wins").value) || 0,
        losses: parseInt(document.getElementById("losses").value) || 0,
        runsScored: parseInt(document.getElementById("runsScored").value) || 0,
        runsAllowed: parseInt(document.getElementById("runsAllowed").value) || 0,
        logoFile: document.getElementById("logoFile").files[0]
    };

    if (!currentUser || currentUser.role === 'guest') {
        const processPending = (finalLogoUrl) => {
            const newApp = { id: Date.now(), ...data, logoUrl: finalLogoUrl || "", submittedAt: new Date().toLocaleDateString() };
            pendingTeams.push(newApp);
            localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pendingTeams));
            showToast("Application Submitted! Commissioner will review.");
            const btnReg = document.getElementById("btn-public-register");
            if (btnReg) btnReg.classList.remove("hidden");
            showPanel("dashboard-panel");
        };
        if (data.logoFile) { const r = new FileReader(); r.onload = (ev) => processPending(ev.target.result); r.readAsDataURL(data.logoFile); }
        else { processPending(null); }
        return;
    }
    saveTeamData(data);
}

function showError(fieldId, message) {
    const errorEl = document.getElementById(`error-${fieldId}`);
    const inputEl = document.getElementById(fieldId);
    if (errorEl) { errorEl.textContent = message; errorEl.classList.add("visible"); }
    if (inputEl) { inputEl.classList.add("input-error"); }
}

function saveTeamData(data) {
    const processSave = (finalLogoUrl) => {
        if (data.id) {
            const idx = teams.findIndex(t => t.id === data.id);
            if (idx !== -1) {
                const oldTeamName = teams[idx].teamName;
                const newTeamName = data.teamName;
                const existingPlayers = teams[idx].players;
                const mergedPlayers = data.players.map(pName => {
                    const existing = existingPlayers.find(ep => ep.name.toLowerCase() === pName.toLowerCase());
                    return existing ? existing : { name: pName, runs: 0, photo: null, stats: {}, wins: 0 };
                });
                const updated = { ...teams[idx], ...data, players: mergedPlayers };
                updated.logoUrl = finalLogoUrl !== null ? finalLogoUrl : teams[idx].logoUrl;
                teams[idx] = updated;

                if (oldTeamName !== newTeamName) {
                    matches.forEach(m => {
                        if (m.homeName === oldTeamName) m.homeName = newTeamName;
                        if (m.awayName === oldTeamName) m.awayName = newTeamName;
                        if (m.winner === oldTeamName) m.winner = newTeamName;
                    });
                    schedule.forEach(s => {
                        if (s.home === oldTeamName) s.home = newTeamName;
                        if (s.away === oldTeamName) s.away = newTeamName;
                    });
                    archives.forEach(a => {
                        if (a.champion === oldTeamName) a.champion = newTeamName;
                        if (a.goldenBoot && a.goldenBoot.team === oldTeamName) a.goldenBoot.team = newTeamName;
                    });
                    matchStorage.saveData(matches);
                    scheduleStorage.saveData(schedule);
                    archiveStorage.saveData(archives);
                }
                showToast("Team updated successfully!");
            }
        } else {
            const playerObjs = data.players.map(p => ({ name: p, runs: 0, photo: null, stats: {}, wins: 0 }));
            const newTeam = new Team(Date.now(), data.teamName, data.captainName, data.email, data.phone, finalLogoUrl || "", playerObjs, data.wins, data.losses, data.runsScored, data.runsAllowed);
            teams.push(newTeam);
            showToast("New team registered!");
        }
        teamStorage.saveData(teams);
        if (returnToLeaderboard) renderAndShowLeaderboard();
        else { renderDashboard(); showPanel("dashboard-panel"); }
    };
    if (data.logoFile) { const r = new FileReader(); r.onload = (ev) => processSave(ev.target.result); r.readAsDataURL(data.logoFile); }
    else { processSave(null); }
}

function renderPendingList() {
    const list = document.getElementById("pending-list");
    list.innerHTML = "";
    if (pendingTeams.length === 0) { list.innerHTML = "<p style='text-align:center; padding:20px; color:#64748b;'>No pending applications.</p>"; return; }
    pendingTeams.forEach((app, idx) => {
        const div = document.createElement("div");
        div.className = "schedule-card interactive-card";
        div.style.borderLeft = "5px solid var(--warning)";
        div.style.cursor = "pointer";
        div.onclick = (e) => { if (e.target.tagName === 'BUTTON') return; window.viewApplication(idx); };
        div.innerHTML = `
            <div class="sched-date" style="background:#fff7ed; color:#9a3412;">Applied: ${app.submittedAt}</div>
            <div style="font-weight:800; font-size:1.2em; color:var(--brand-navy); margin-bottom:5px;">${app.teamName}</div>
            <div style="font-size:0.9em; color:#64748b; margin-bottom:10px;">Captain: <strong>${app.captainName}</strong></div>
            <div style="font-size:0.85em; color:#64748b; margin-bottom:15px;">${app.players.length} Players listed<br><span style="font-size:0.9em; color:#94a3b8;">(Click to view full details)</span></div>
            <div style="display:flex; gap:10px; width:100%;">
                <button class="btn-small" style="flex:1; background:var(--success); color:white; border:none;" onclick="window.approveTeam(${idx})">Approve</button>
                <button class="btn-small" style="flex:1; background:var(--danger); color:white; border:none;" onclick="window.rejectTeam(${idx})">Reject</button>
            </div>`;
        list.appendChild(div);
    });
}

function viewApplication(idx) {
    const currentAppIndex = idx;
    const app = pendingTeams[idx];
    const content = document.getElementById("app-details-content");
    const modal = document.getElementById("app-details-modal");
    if (!app || !content || !modal) return;

    // Store index for actions
    window.currentAppIndex = idx;

    let logoHtml = app.logoUrl ? `<img src="${app.logoUrl}" style="width:100px; height:100px; border-radius:50%; border:4px solid white; object-fit:cover; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">` : `<div style="width:100px; height:100px; border-radius:50%; background:var(--brand-navy); color:white; display:flex; align-items:center; justify-content:center; font-size:2.5em; font-weight:bold; border:4px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">${app.teamName.charAt(0)}</div>`;
    let rosterHtml = app.players.map(p => `<li style="padding: 10px 15px; border-bottom: 1px solid #f1f5f9; color: #334155; font-size: 0.95em; display:flex; align-items:center;"><span style="width:8px; height:8px; background:#cbd5e1; border-radius:50%; margin-right:10px;"></span>${p.name || p}</li>`).join("");
    content.innerHTML = `
        <div style="background: linear-gradient(135deg, #e2e8f0 0%, #f8fafc 100%); padding: 30px 20px; text-align: center; border-bottom: 1px solid #e2e8f0;">
            <div style="display:flex; justify-content:center; margin-bottom: 15px;">${logoHtml}</div>
            <h2 style="margin:0; color:var(--brand-navy); font-size: 1.8rem; font-weight: 800; letter-spacing:-0.5px;">${app.teamName}</h2>
            <div style="margin-top:10px;"><span style="background:#fff7ed; color:#c2410c; padding:5px 15px; border-radius:20px; font-size:0.75em; font-weight:800; letter-spacing:0.5px; border:1px solid #ffedd5; text-transform:uppercase;">Pending Review</span></div>
        </div>
        <div style="padding: 25px;">
            <h4 style="color:#64748b; font-size:0.75em; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px;">Team Contact</h4>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                <div style="background:white; padding:15px; border-radius:8px; border:1px solid #e2e8f0;"><div style="font-size:0.75em; color:#94a3b8; margin-bottom:4px;">Captain</div><div style="font-weight:600; color:#0f172a;">${app.captainName}</div></div>
                <div style="background:white; padding:15px; border-radius:8px; border:1px solid #e2e8f0;"><div style="font-size:0.75em; color:#94a3b8; margin-bottom:4px;">Phone</div><div style="font-weight:600; color:#0f172a;">${app.phone}</div></div>
                <div style="grid-column: 1 / -1; background:white; padding:15px; border-radius:8px; border:1px solid #e2e8f0;"><div style="font-size:0.75em; color:#94a3b8; margin-bottom:4px;">Email Address</div><div style="font-weight:600; color:var(--brand-blue);">${app.email}</div></div>
            </div>
            <h4 style="color:#64748b; font-size:0.75em; font-weight:700; text-transform:uppercase; letter-spacing:1px; margin-bottom:15px;">Roster (${app.players.length} Players)</h4>
            <div style="background:white; border-radius:8px; border:1px solid #e2e8f0; overflow:hidden;"><ul style="list-style:none; padding:0; margin:0;">${rosterHtml}</ul></div>
            <div style="text-align:center; margin-top:20px; font-size:0.8em; color:#94a3b8;">Submitted on ${app.submittedAt}</div>
        </div>`;
    modal.classList.remove("hidden");
    modal.style.display = "flex";
}

function confirmDecline(idx) {
    const app = pendingTeams[idx];
    const content = document.getElementById("app-details-content");
    const footer = document.getElementById("btn-modal-reject").parentElement;
    footer.style.display = "none";
    content.innerHTML = `<div style="text-align:center; padding: 40px 20px; animation: fadeIn 0.2s ease-out;"><div style="font-size: 3rem; margin-bottom: 15px;">⚠️</div><h3 style="color:var(--brand-navy); margin:0 0 10px 0; font-size:1.4rem;">Decline Application?</h3><p style="color:#64748b; margin-bottom:30px; line-height:1.5;">You are about to decline <strong>${app.teamName}</strong>.<br>This action cannot be undone.</p><div style="display:flex; gap:15px; justify-content:center;"><button onclick="window.cancelDecline()" style="background:white; border:2px solid #e2e8f0; padding:12px 24px; border-radius:8px; font-weight:700; color:#64748b; cursor:pointer; transition:all 0.2s;">Go Back</button><button onclick="window.finalizeDecline(${idx})" style="background:var(--danger); border:none; padding:12px 24px; border-radius:8px; font-weight:700; color:white; cursor:pointer; box-shadow: 0 4px 6px rgba(239,68,68,0.3); transition:all 0.2s;">Yes, Decline</button></div></div>`;
}

function cancelDecline() {
    document.getElementById("btn-modal-reject").parentElement.style.display = "flex";
    window.viewApplication(window.currentAppIndex);
}

function finalizeDecline(idx) {
    pendingTeams.splice(idx, 1);
    localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pendingTeams));
    document.getElementById("btn-close-app-modal").click();
    renderPendingList();
    showToast("Application Declined", "error");
    document.getElementById("btn-modal-reject").parentElement.style.display = "flex";
}

document.getElementById("btn-close-app-modal").onclick = () => { document.getElementById("app-details-modal").classList.add("hidden"); document.getElementById("app-details-modal").style.display = ""; };
document.getElementById("btn-modal-approve").onclick = () => {
    if (window.currentAppIndex !== undefined) {
        window.approveTeam(window.currentAppIndex);
        document.getElementById("btn-close-app-modal").click();
    }
};
document.getElementById("btn-modal-reject").onclick = () => {
    if (window.currentAppIndex !== undefined) {
        window.confirmDecline(window.currentAppIndex);
    }
};
window.addEventListener("click", (e) => { const modal = document.getElementById("app-details-modal"); if (e.target === modal) { modal.classList.add("hidden"); modal.style.display = ""; } });

function approveTeam(idx) {
    const app = pendingTeams[idx];
    const playerObjs = app.players.map(p => ({ name: p, runs: 0, photo: null, stats: {}, wins: 0 }));
    const newTeam = new Team(Date.now(), app.teamName, app.captainName, app.email, app.phone, app.logoUrl || "", playerObjs, 0, 0, 0, 0);
    teams.push(newTeam);
    teamStorage.saveData(teams);
    pendingTeams.splice(idx, 1);
    localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pendingTeams));
    showToast(`${app.teamName} Approved!`);
    renderPendingList();
    renderDashboard();
}

function rejectTeam(idx) {
    if (!confirm("Reject this application? This cannot be undone.")) return;
    pendingTeams.splice(idx, 1);
    localStorage.setItem(STORAGE_KEY_PENDING, JSON.stringify(pendingTeams));
    showToast("Application Rejected.");
    renderPendingList();
    renderDashboard();
}

const showPanel = (panelId) => {
    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    const target = document.getElementById(panelId);
    if (target) target.classList.remove("hidden");
    if (panelId === "dashboard-panel") {
        const btnJoin = document.getElementById("btn-public-register");
        if (btnJoin && (!currentUser || currentUser.role === 'guest')) { btnJoin.classList.remove("hidden"); }
    }
    window.scrollTo(0, 0);
};

function showToast(msg, type = "success") {
    const c = document.getElementById("toast-container");
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.classList.add("hiding"); t.addEventListener("animationend", () => t.remove()) }, 3000);
}

function renderDashboard() {
    try {
        const totalRuns = teams.reduce((sum, t) => sum + (parseInt(t.runsScored) || 0), 0);
        const totalMatches = matches.length;
        const elTotalRuns = document.getElementById("dash-total-goals");
        const elTotalMatches = document.getElementById("dash-total-matches");
        if (elTotalRuns) elTotalRuns.textContent = totalRuns;
        if (elTotalMatches) elTotalMatches.textContent = totalMatches;

        let sorted = [...teams].sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            const pctA = parseFloat(a.winPct);
            const pctB = parseFloat(b.winPct);
            if (pctA !== pctB) return pctB - pctA;
            return b.runDiff - a.runDiff;
        });

        const setPodium = (rank, team, cardClass) => {
            const nameEl = document.getElementById(`dash-${rank}-name`);
            const recEl = document.getElementById(`dash-${rank}-record`);
            const logoContainer = document.getElementById(`dash-${rank}-logo-container`);
            const cardElement = document.querySelector(cardClass);
            if (!nameEl) return;
            if (team) {
                nameEl.textContent = team.teamName;
                recEl.textContent = `${team.wins}-${team.losses} Record`;
                if (logoContainer) {
                    if (team.logoUrl) logoContainer.innerHTML = `<img src="${team.logoUrl}" class="podium-logo" alt="${team.teamName}">`;
                    else logoContainer.innerHTML = `<div class="podium-placeholder">${team.teamName.charAt(0).toUpperCase()}</div>`;
                }
                if (cardElement) {
                    cardElement.classList.add("interactive-card");
                    cardElement.onclick = () => handleViewRequest(team.id);
                    cardElement.title = `View details for ${team.teamName}`;
                }
            } else {
                nameEl.textContent = "-";
                recEl.textContent = "No Team";
                if (logoContainer) logoContainer.innerHTML = `<div class="podium-placeholder" style="font-size:1.5em; opacity:0.5;">-</div>`;
                if (cardElement) { cardElement.classList.remove("interactive-card"); cardElement.onclick = null; cardElement.removeAttribute("title"); }
            }
        };

        setPodium("1st", sorted[0], ".gold-card");
        setPodium("2nd", sorted[1], ".silver-card");
        setPodium("3rd", sorted[2], ".bronze-card");
        renderSchedule();

        const alertBox = document.getElementById("pending-teams-alert");
        const countSpan = document.getElementById("pending-count");
        if (currentUser && currentUser.role !== 'guest' && pendingTeams.length > 0) {
            alertBox.classList.remove("hidden");
            countSpan.textContent = pendingTeams.length;
        } else {
            if (alertBox) alertBox.classList.add("hidden");
        }

        const btnStart = document.getElementById("btn-start-playoffs");
        const btnArchive = document.getElementById("btn-archive-season");
        const btnReset = document.getElementById("btn-reset");
        if (btnStart) btnStart.classList.add("hidden");
        if (btnArchive) btnArchive.classList.add("hidden");
        if (btnReset) btnReset.classList.add("hidden");

        if (currentUser && currentUser.role !== 'guest') {
            if (isPlayoffs) {
                if (btnStart) {
                    btnStart.textContent = "🏆 VIEW PLAYOFF BRACKET";
                    btnStart.onclick = () => { renderDynamicBracket(); showPanel("playoff-panel"); };
                    btnStart.classList.remove("hidden");
                }
                if (bracketState.champion && btnArchive) btnArchive.classList.remove("hidden");
            } else {
                if (btnStart) {
                    btnStart.textContent = "⚠️ END SEASON & START PLAYOFFS";
                    btnStart.onclick = handleStartPlayoffs;
                    btnStart.classList.remove("hidden");
                }
                if (btnReset) btnReset.classList.remove("hidden");
            }
        } else if (currentUser && currentUser.role === 'guest') {
            if (isPlayoffs && btnStart) {
                btnStart.textContent = "🏆 VIEW PLAYOFF BRACKET";
                btnStart.onclick = () => { renderDynamicBracket(); showPanel("playoff-panel"); };
                btnStart.classList.remove("hidden");
            }
        }
        if (typeof renderTopScorers === "function") renderTopScorers();
        const dataToolsSection = document.querySelector(".data-controls");
        if (dataToolsSection) {
            const buttons = dataToolsSection.querySelectorAll(".action-btn, .label-btn");
            const hasVisibleButtons = Array.from(buttons).some(btn => !btn.classList.contains("hidden"));
            if (hasVisibleButtons) dataToolsSection.classList.remove("hidden");
            else dataToolsSection.classList.add("hidden");
        }
    } catch (err) { console.error("Dashboard Render Error:", err); }
    renderTopPitchers();
    renderGoldenBoot();
}

function renderTopPitchers() {
    const tbody = document.getElementById("top-pitchers-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    let allPlayers = [];
    teams.forEach(t => {
        if (t.players && Array.isArray(t.players)) {
            t.players.forEach(p => {
                const stats = parseInt(p.wins) || 0;
                if (stats > 0) { allPlayers.push({ name: p.name, team: t.teamName, stats: stats, photo: p.photo }); }
            });
        }
    });
    allPlayers.sort((a, b) => b.stats - a.stats);
    const top5 = allPlayers.slice(0, 5);
    if (top5.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">No pitching stats yet.</td></tr>'; return; }
    top5.forEach((p, index) => {
        const tr = document.createElement("tr");
        let rankClass = index === 0 ? "rank-1" : "";
        let rankIcon = index === 0 ? "👑 " : "";
        let avatarHtml = p.photo ? `<img src="${p.photo}" style="width:24px; height:24px; border-radius:50%; vertical-align:middle; margin-right:8px; border:1px solid #ccc;">` : `<span style="display:inline-block; width:24px; height:24px; background:#eee; border-radius:50%; vertical-align:middle; margin-right:8px; text-align:center; font-size:0.7em; line-height:24px;">${p.name.charAt(0)}</span>`;
        tr.innerHTML = `<td style="text-align:center; font-weight:bold; color:#64748b;">${index + 1}</td><td style="font-weight:600;">${avatarHtml}${rankIcon}${p.name}</td><td style="color:#64748b;">${p.team}</td><td style="text-align:center;"><span class="score-badge ${rankClass}">${p.stats}</span></td>`;
        tbody.appendChild(tr);
    });
}

function renderGoldenBoot() {
    const tbody = document.getElementById("golden-boot-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    let allPlayers = [];
    teams.forEach(t => { t.players.forEach(p => { if (p.runs > 0) allPlayers.push({ name: p.name, team: t.teamName, runs: p.runs }); }); });
    allPlayers.sort((a, b) => b.runs - a.runs);
    const top5 = allPlayers.slice(0, 5);
    if (top5.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#999;">No runs recorded.</td></tr>'; return; }
    top5.forEach((p, index) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td style="text-align:center;">${index + 1}</td><td style="font-weight:bold;">${p.name}</td><td style="color:#666;">${p.team}</td><td style="text-align:center;"><span class="score-cell" style="background:var(--brand-orange);">${p.runs}</span></td>`;
        tbody.appendChild(tr);
    });
}

function showMatchPanel() {
    if (teams.length < 2) { showToast("Need 2 teams!", "error"); return; }
    liveGame = { inning: 1, outs: 0, stats: {} };
    updateLiveHeader();
    const STORAGE_KEY_MATCH_DRAFT = "swisher_match_draft";
    const draft = localStorage.getItem(STORAGE_KEY_MATCH_DRAFT);
    const s1 = document.getElementById("team1");
    const s2 = document.getElementById("team2");
    s1.innerHTML = '<option value="">Select Home...</option>';
    s2.innerHTML = '<option value="">Select Away...</option>';
    teams.forEach(t => { s1.add(new Option(t.teamName, t.id)); s2.add(new Option(t.teamName, t.id)); });
    if (draft) {
        const d = JSON.parse(draft);
        if (confirm("Resume live game in progress?")) {
            s1.value = d.homeId;
            s2.value = d.awayId;
            document.getElementById("score1").value = d.homeScore;
            document.getElementById("score2").value = d.awayScore;
            if (d.liveGame) { liveGame = d.liveGame; updateLiveHeader(); }
            updateMatchRosters(1);
            updateMatchRosters(2);
            showPanel("match-panel");
            return;
        } else { localStorage.removeItem(STORAGE_KEY_MATCH_DRAFT); }
    }
    document.getElementById("match-form").reset();
    document.getElementById("roster-list-1").innerHTML = "";
    document.getElementById("roster-list-2").innerHTML = "";
    document.getElementById("roster-box-1").classList.add("hidden");
    document.getElementById("roster-box-2").classList.add("hidden");
    if (pendingScheduleId) {
        const game = schedule.find(g => g.id === pendingScheduleId);
        if (game) {
            const t1 = teams.find(t => t.teamName === game.home);
            const t2 = teams.find(t => t.teamName === game.away);
            if (t1) { s1.value = t1.id; updateMatchRosters(1); }
            if (t2) { s2.value = t2.id; updateMatchRosters(2); }
        }
    }
    showPanel("match-panel");
}

function updateMatchRosters(side) {
    const select = document.getElementById(`team${side}`);
    const list = document.getElementById(`roster-list-${side}`);
    const box = document.getElementById(`roster-box-${side}`);
    const teamId = parseInt(select.value);
    if (!teamId) { box.classList.add("hidden"); list.innerHTML = ""; return; }
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    box.classList.remove("hidden");
    if (team.players.length === 0) { list.innerHTML = "<p style='color:#999; font-size:0.8em; padding:10px;'>No players on roster.</p>"; return; }
    list.innerHTML = team.players.map(p => {
        const key = `${teamId}-${p.name}`;
        const s = liveGame.stats[key] || {};
        let summaryParts = [];
        if (s.H > 0) summaryParts.push(`${s.H}H`);
        if (s.HR > 0) summaryParts.push(`${s.HR}HR`);
        if (s.RBI > 0) summaryParts.push(`${s.RBI}RBI`);
        if (s.R > 0) summaryParts.push(`${s.R}R`);
        if (s.SB > 0) summaryParts.push(`${s.SB}SB`);
        if (s.K_PITCH > 0) summaryParts.push(`💎${s.K_PITCH}K`);
        if (s.K_BAT > 0) summaryParts.push(`❌${s.K_BAT}K`);
        const summaryText = summaryParts.length > 0 ? summaryParts.join(", ") : "Tap to add stats";
        return `<div class="stat-row" onclick="window.openStatsModal(${teamId}, '${p.name}')"><span class="stat-name">${p.name}</span><span class="live-stat-badge" style="${summaryParts.length > 0 ? 'background:#dbeafe; color:#1e40af;' : ''}">${summaryText}</span></div>`;
    }).join("");
}

function stepStat(btn, delta) {
    const input = btn.parentElement.querySelector("input");
    let val = parseInt(input.value) || 0;
    val += delta;
    if (val < 0) val = 0;
    input.value = val;
    const rosterList = btn.closest('[id^="roster-list-"]');
    if (rosterList) {
        const side = rosterList.id.split('-')[2];
        let totalScore = 0;
        const allInputs = rosterList.querySelectorAll('.input-runs');
        allInputs.forEach(inp => { totalScore += parseInt(inp.value) || 0; });
        const scoreInput = document.getElementById(`score${side}`);
        if (scoreInput) { scoreInput.value = totalScore; }
    }
    saveLiveDraft();
}

// Attach to window so HTML can see it
window.openStatsModal = (teamId, playerName) => {
    currentModalPlayer = { teamId, name: playerName };
    document.getElementById("modal-player-name").textContent = playerName;
    document.getElementById("stats-modal").classList.remove("hidden");
    updateModalSummary();
};

function addStat(type) {
    if (!currentModalPlayer) return;
    const key = `${currentModalPlayer.teamId}-${currentModalPlayer.name}`;
    if (!liveGame.stats[key]) liveGame.stats[key] = { H: 0, '1B': 0, '2B': 0, '3B': 0, HR: 0, R: 0, RBI: 0, SB: 0, BB: 0, K_BAT: 0, K_PITCH: 0, BB_PITCH: 0, ER: 0, W: 0 };
    liveGame.stats[key][type]++;
    if (type === 'HR') { liveGame.stats[key].R++; liveGame.stats[key].RBI++; liveGame.stats[key].H++; updateTeamScore(currentModalPlayer.teamId, 1); }
    if (['1B', '2B', '3B'].includes(type)) { liveGame.stats[key].H++; }
    if (type === 'R') { updateTeamScore(currentModalPlayer.teamId, 1); }
    if (type === 'W') { if (liveGame.stats[key].W > 1) liveGame.stats[key].W = 0; }
    updateModalSummary();
    saveLiveDraft();
}

function updateModalSummary() {
    if (!currentModalPlayer) return;
    const key = `${currentModalPlayer.teamId}-${currentModalPlayer.name}`;
    const s = liveGame.stats[key];
    if (!s) { document.getElementById("modal-player-summary").textContent = "No stats yet."; return; }
    let winText = s.W > 0 ? `<span style="color:var(--brand-blue); font-weight:bold;">(WINNING PITCHER)</span> | ` : "";
    document.getElementById("modal-player-summary").innerHTML = `${winText}<b>Game Stats:</b> ${s.H} Hits (${s['1B']}S, ${s['2B']}D, ${s.HR}HR) | ${s.RBI} RBI | ${s.R} Runs | ${s.K_PITCH} K's`;
}

function updateTeamScore(teamId, delta) {
    const id1 = parseInt(document.getElementById("team1").value);
    const id2 = parseInt(document.getElementById("team2").value);
    if (teamId === id1) { const el = document.getElementById("score1"); el.value = (parseInt(el.value) || 0) + delta; }
    else if (teamId === id2) { const el = document.getElementById("score2"); el.value = (parseInt(el.value) || 0) + delta; }
}

function adjustInning(d) { liveGame.inning += d; if (liveGame.inning < 1) liveGame.inning = 1; updateLiveHeader(); saveLiveDraft(); }
function adjustOuts(d) { liveGame.outs += d; if (liveGame.outs < 0) liveGame.outs = 0; if (liveGame.outs >= 3) { liveGame.outs = 0; showToast("Switch Sides!"); } updateLiveHeader(); saveLiveDraft(); }
function updateLiveHeader() { document.getElementById("live-inning-display").textContent = liveGame.inning; document.getElementById("live-outs-display").textContent = liveGame.outs; }

function saveLiveDraft() {
    const s1 = document.getElementById("team1").value;
    const s2 = document.getElementById("team2").value;
    if (!s1 || !s2) return;
    const STORAGE_KEY_MATCH_DRAFT = "swisher_match_draft";
    const draft = { homeId: s1, awayId: s2, homeScore: document.getElementById("score1").value, awayScore: document.getElementById("score2").value, liveGame: liveGame };
    localStorage.setItem(STORAGE_KEY_MATCH_DRAFT, JSON.stringify(draft));
}

function handleMatchSubmit(e) {
    e.preventDefault();
    if (isPlayoffs) { showToast("Season is Locked!", "error"); return; }
    const id1 = parseInt(document.getElementById("team1").value);
    const id2 = parseInt(document.getElementById("team2").value);
    const score1 = parseInt(document.getElementById("score1").value);
    const score2 = parseInt(document.getElementById("score2").value);
    const type = document.getElementById("match-type").value;
    const videoUrl = document.getElementById("match-video-url").value;

    if (!id1 || !id2) { showToast("Select teams.", "error"); return; }
    if (id1 === id2) { showToast("Teams cannot play themselves.", "error"); return; }
    const t1 = teams.find(t => t.id === id1);
    const t2 = teams.find(t => t.id === id2);

    if (type === "regular") {
        t1.runsScored += score1; t1.runsAllowed += score2;
        t2.runsScored += score2; t2.runsAllowed += score1;
        if (score1 > score2) { t1.wins++; t2.losses++; }
        else if (score2 > score1) { t2.wins++; t1.losses++; }
        else { showToast("No Ties!", "error"); return; }

        Object.keys(liveGame.stats).forEach(key => {
            const [tid, pName] = key.split("-");
            const teamId = parseInt(tid);
            const stats = liveGame.stats[key];
            const team = teamId === t1.id ? t1 : t2;
            const player = team.players.find(p => p.name === pName);

            if (player) {
                if (!player.stats) player.stats = { H: 0, HR: 0, RBI: 0, K: 0, W: 0, ERA: 0, BB: 0 };
                player.runs = (player.runs || 0) + (stats.R || 0);
                player.stats.H = (player.stats.H || 0) + (stats.H || 0);
                player.stats.HR = (player.stats.HR || 0) + (stats.HR || 0);
                player.stats.RBI = (player.stats.RBI || 0) + (stats.RBI || 0);
                player.stats.K = (player.stats.K || 0) + (stats.K_PITCH || 0);
                player.stats.BB = (player.stats.BB || 0) + (stats.BB_PITCH || 0);
                if (stats.W) { player.stats.W = (player.stats.W || 0) + 1; player.wins = (player.wins || 0) + 1; }
            }
        });
    }

    const matchRecord = { id: Date.now(), date: new Date().toLocaleDateString(), type: type, homeName: t1.teamName, awayName: t2.teamName, homeScore: score1, awayScore: score2, videoUrl: videoUrl || null, details: liveGame };
    matches.unshift(matchRecord);

    if (pendingScheduleId) {
        schedule = schedule.filter(g => g.id !== pendingScheduleId);
        scheduleStorage.saveData(schedule);
        pendingScheduleId = null;
    }

    const STORAGE_KEY_MATCH_DRAFT = "swisher_match_draft";
    localStorage.removeItem(STORAGE_KEY_MATCH_DRAFT);
    liveGame = { inning: 1, outs: 0, stats: {} };
    teamStorage.saveData(teams);
    matchStorage.saveData(matches);
    showToast(`Match Saved!`);
    renderDashboard();
    showPanel("dashboard-panel");
}

function handleExport() {
    if (!teams.length) { showToast("No data", "info"); return; }
    const exportObj = { teams, matches, schedule, archives, bracketState, isPlayoffs };
    const b = new Blob([JSON.stringify(exportObj, null, 2)], { type: "application/json" });
    const u = URL.createObjectURL(b);
    const a = document.createElement("a");
    a.href = u;
    a.download = "league-data.json";
    a.click();
}

function handleImport(e) {
    if (!currentUser || currentUser.role !== 'admin') { showToast("Denied", "error"); return; }
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
        try {
            const j = JSON.parse(ev.target.result);
            if (j.teams) {
                teams = j.teams.map(d => Team.fromData(d)); matches = j.matches || []; schedule = j.schedule || []; archives = j.archives || [];
                teamStorage.saveData(teams); matchStorage.saveData(matches); scheduleStorage.saveData(schedule); archiveStorage.saveData(archives);
                showToast("Imported & Synced to Database!"); renderDashboard(); showPanel("dashboard-panel");
            }
        } catch (err) { console.error(err); showToast("Invalid File", "error"); }
    };
    r.readAsText(f);
}

function handleResetSeason() {
    if (!currentUser || currentUser.role !== 'admin') { showToast("Denied", "error"); return; }
    showPanel("reset-season-confirm-panel");
}

function executeResetSeason(silent = false) {
    teams = []; matches = []; schedule = [];
    bracketState = { mainRounds: [], thirdPlaceMatch: null, champion: null };
    isPlayoffs = false;
    teamStorage.saveData([]); matchStorage.saveData([]); scheduleStorage.saveData([]);
    localStorage.removeItem("swisher_playoff_mode");
    localStorage.removeItem(STORAGE_KEY_BRACKET);
    if (!silent) showToast("Season Reset Complete.");
    renderDashboard();
    showPanel("dashboard-panel");
}

function renderAndShowLeaderboard(teamsToRender = null) {
    try {
        let list = teamsToRender || [...teams];
        list.sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            const pctA = parseFloat(a.winPct);
            const pctB = parseFloat(b.winPct);
            if (pctA !== pctB) return pctB - pctA;
            return b.runDiff - a.runDiff;
        });
        listManager.render(list, handleViewRequest, handleEditRequest, handleDeleteRequest, currentUser ? currentUser.role : 'guest');
        renderMatchHistory();
        if (!teamsToRender) {
            const searchInput = document.getElementById("search-teams");
            if (searchInput) searchInput.value = "";
            showPanel("view-teams");
        }
    } catch (err) { console.error("Leaderboard Error:", err); showToast("Error loading leaderboard.", "error"); }
}

function renderMatchHistory() {
    const tbody = document.getElementById("match-history-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (matches.length === 0) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#777;">No matches recorded yet.</td></tr>'; return; }
    matches.forEach(m => {
        const showDelete = currentUser && currentUser.role === 'admin';
        const typeBadge = m.type === 'exhibition' ? '<span style="font-size:0.7em; background:#64748b; color:white; padding:2px 4px; border-radius:3px;">EXH</span> ' : '';
        const tr = document.createElement("tr");
        let watchBtn = m.videoUrl ? `<button class="btn-watch" onclick="window.playVideo('${m.videoUrl}')">▶ Watch</button>` : "";
        tr.innerHTML = `<td style="color:#666; font-size:0.9em;">${typeBadge}${m.date}</td><td style="text-align:right;">${m.homeName}</td><td style="text-align:center;"><span class="score-cell">${m.homeScore} - ${m.awayScore}</span></td><td style="text-align:left;">${m.awayName}</td><td style="text-align:right; display:flex; justify-content:flex-end; gap:5px;">${watchBtn}${showDelete ? `<button class="btn-small btn-delete" onclick="window.requestMatchDelete(${m.id})">X</button>` : ''}</td>`;
        tbody.appendChild(tr);
    });
}

function handleViewRequest(id) {
    const t = teams.find(t => t.id === id);
    if (!t) return;
    currentViewingId = id;
    document.getElementById("view-team-name").textContent = t.teamName;
    const d = document.getElementById("single-team-details");
    const se = (currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager'));
    const btnEdit = document.getElementById("btn-edit-from-view");
    const btnRoster = document.getElementById("btn-manage-roster");
    if (se) { btnEdit.classList.remove("hidden"); btnRoster.classList.remove("hidden"); } else { btnEdit.classList.add("hidden"); btnRoster.classList.add("hidden"); }
    const sr = [...t.players].sort((a, b) => b.runs - a.runs);
    let rosterHtml = `<div class="roster-grid">`;
    if (sr.length > 0) { rosterHtml += sr.map(p => { let imgHtml = p.photo ? `<img src="${p.photo}" class="player-photo" alt="${p.name}">` : `<div class="player-initials">${p.name.charAt(0)}</div>`; return `<div class="player-card interactive-card" data-pname="${p.name}">${imgHtml}<div class="player-name">${p.name}</div><div class="player-stats">${p.runs} Runs</div></div>`; }).join(""); } else { rosterHtml += `<p style="grid-column:1/-1; text-align:center; color:#999;">No players listed.</p>`; }
    rosterHtml += `</div>`;
    const teamMatches = matches.filter(m => m.homeName === t.teamName || m.awayName === t.teamName);
    let historyHtml = "";
    if (teamMatches.length === 0) { historyHtml = `<p style="text-align:center; color:#ccc; padding:20px;">No matches played yet.</p>`; } else {
        historyHtml = `<div class="table-responsive"><table class="team-history-table"><thead><tr><th>Result</th><th>Date</th><th>Opponent</th><th>Score</th><th></th></tr></thead><tbody>`;
        teamMatches.forEach(m => {
            const isHome = m.homeName === t.teamName;
            const opponent = isHome ? m.awayName : m.homeName;
            const myScore = isHome ? m.homeScore : m.awayScore;
            const oppScore = isHome ? m.awayScore : m.homeScore;
            let result = "T"; let badgeClass = "res-tie";
            if (myScore > oppScore) { result = "W"; badgeClass = "res-win"; } else if (myScore < oppScore) { result = "L"; badgeClass = "res-loss"; }
            let watchBtn = m.videoUrl ? `<button class="btn-watch" onclick="window.playVideo('${m.videoUrl}')">▶ Watch</button>` : "";
            historyHtml += `<tr><td><span class="result-badge ${badgeClass}">${result}</span></td><td style="color:var(--text-muted);">${m.date}</td><td class="history-opponent">vs ${opponent}</td><td class="history-score">${myScore} - ${oppScore}</td><td style="text-align:right;">${watchBtn}</td></tr>`;
        });
        historyHtml += `</tbody></table></div>`;
    }
    let logoHtml = t.logoUrl ? `<img src="${t.logoUrl}" class="view-logo-large" alt="Team Logo">` : `<div class="team-logo-placeholder" style="width:120px; height:120px; font-size:3em; margin-bottom:15px;">${t.teamName.charAt(0)}</div>`;
    d.innerHTML = `<div style="text-align:center; margin-bottom:30px;"><div style="display:flex; justify-content:center; margin-bottom:15px;">${logoHtml}</div><div style="font-size:1.1em;"><span style="display:inline-block; margin-right:20px;"><strong>Captain:</strong> ${t.captainName}</span><span style="display:inline-block; padding: 4px 12px; background:#f1f5f9; border-radius:20px;"><strong>Record:</strong> ${t.wins}-${t.losses}</span></div></div><div style="margin-bottom: 40px;"><h3 style="margin-bottom:15px; border-bottom:2px solid #e2e8f0; padding-bottom:8px; color:var(--brand-navy);">Active Roster</h3>${rosterHtml}</div><div><h3 style="margin-bottom:15px; border-bottom:2px solid #e2e8f0; padding-bottom:8px; color:var(--brand-navy);">Season Match Log</h3>${historyHtml}</div>`;
    const cards = d.querySelectorAll(".player-card");
    cards.forEach(card => { card.addEventListener("click", () => { const pName = card.getAttribute("data-pname"); showPlayerDetails(t.id, pName); }); });
    showPanel("view-single-team");
}

function handleEditRequest(id) { const t = teams.find(x => x.id === id); if (t) { formHandler.fillForm(t); returnToLeaderboard = true; document.getElementById("stats-fieldset").classList.remove("hidden"); showPanel("team-form-panel"); } }

function handleDeleteRequest(id) {
    if (!currentUser || currentUser.role !== 'admin') { showToast("Denied", "error"); return; }
    const t = teams.find(x => x.id === id);
    if (!t) return;
    if (matches.some(m => m.homeName === t.teamName || m.awayName === t.teamName)) { showToast("Has matches!", "error"); return; }
    pendingDeleteId = id;
    document.getElementById("delete-summary").innerHTML = `Team: ${t.teamName}`;
    showPanel("delete-confirm-panel");
}

function executeDelete() {
    if (!pendingDeleteId) return;
    const i = teams.findIndex(t => t.id === pendingDeleteId);
    if (i !== -1) { teams.splice(i, 1); teamStorage.saveData(teams); pendingDeleteId = null; showToast("Deleted"); renderAndShowLeaderboard(); }
}

function requestMatchDelete(id) {
    if (!currentUser || currentUser.role !== 'admin') { showToast("Denied", "error"); return; }
    const m = matches.find(x => x.id === id);
    if (!m) return;
    pendingMatchDeleteId = id;
    document.getElementById("delete-match-summary").innerHTML = `${m.homeName} vs ${m.awayName}`;
    showPanel("delete-match-confirm-panel");
}

function executeMatchDelete() {
    if (!pendingMatchDeleteId) return;
    const m = matches.find(x => x.id === pendingMatchDeleteId);
    if (!m) return;
    if (m.type === 'regular') {
        const t1 = teams.find(t => t.teamName === m.homeName);
        const t2 = teams.find(t => t.teamName === m.awayName);
        if (t1 && t2) {
            t1.runsScored -= m.homeScore; t1.runsAllowed -= m.awayScore;
            t2.runsScored -= m.awayScore; t2.runsAllowed -= m.homeScore;
            if (m.homeScore > m.awayScore) { t1.wins--; t2.losses--; } else { t2.wins--; t1.losses--; }
        }
    }
    matches = matches.filter(x => x.id !== pendingMatchDeleteId);
    matchStorage.saveData(matches); teamStorage.saveData(teams);
    showToast("Deleted & Stats Reverted"); renderAndShowLeaderboard();
}

function handleSearch(e) {
    const term = e.target.value.toLowerCase();
    renderAndShowLeaderboard(teams.filter(t => t.teamName.toLowerCase().includes(term) || t.captainName.toLowerCase().includes(term)));
}

function applyPermissions() {
    if (!currentUser) return;
    const role = currentUser.role;
    const btnAdd = document.getElementById("btn-show-add");
    const btnMatch = document.getElementById("btn-show-match");
    const btnExport = document.getElementById("btn-export");
    const btnImport = document.querySelector("label[for='file-import']");
    const btnReset = document.getElementById("btn-reset");
    const btnPlayoffs = document.getElementById("btn-start-playoffs");
    const btnResetPlayoffs = document.getElementById("btn-reset-playoffs");
    const btnArchiveSeason = document.getElementById("btn-archive-season");
    const btnSchedule = document.getElementById("btn-show-schedule");
    const btnGen = document.getElementById("btn-show-generator");
    const alertBox = document.getElementById("pending-teams-alert");

    const allBtns = [btnAdd, btnMatch, btnExport, btnImport, btnReset, btnPlayoffs, btnResetPlayoffs, btnArchiveSeason, btnSchedule, btnGen];
    allBtns.forEach(btn => { if (btn) btn.classList.remove("hidden"); });

    if (role === "guest") {
        if (btnAdd) btnAdd.classList.add("hidden");
        if (btnMatch) btnMatch.classList.add("hidden");
        if (btnImport) btnImport.classList.add("hidden");
        if (btnReset) btnReset.classList.add("hidden");
        if (btnResetPlayoffs) btnResetPlayoffs.classList.add("hidden");
        if (btnExport) btnExport.classList.add("hidden");
        if (btnArchiveSeason) btnArchiveSeason.classList.add("hidden");
        if (btnSchedule) btnSchedule.classList.add("hidden");
        if (btnGen) btnGen.classList.add("hidden");
        if (alertBox) alertBox.classList.add("hidden");
    } else if (role === "manager") {
        if (btnImport) btnImport.classList.add("hidden");
        if (btnReset) btnReset.classList.add("hidden");
        if (btnResetPlayoffs) btnResetPlayoffs.classList.add("hidden");
        if (btnArchiveSeason) btnArchiveSeason.classList.add("hidden");
        if (btnGen) btnGen.classList.add("hidden");
    }
}

function handleStartPlayoffs() {
    if (teams.length < 3) { showToast("Need at least 3 teams for playoffs!", "error"); return; }
    showPanel("playoff-confirm-panel");
}

function executeStartPlayoffs() {
    isPlayoffs = true;
    localStorage.setItem("swisher_playoff_mode", "true");
    let sortedTeams = [...teams].sort((a, b) => {
        if (b.wins !== a.wins) return b.wins - a.wins;
        return b.runDiff - a.runDiff;
    });
    const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(sortedTeams.length)));
    let fullRoster = [];
    for (let i = 0; i < nextPowerOf2; i++) {
        if (i < sortedTeams.length) fullRoster.push(sortedTeams[i]);
        else fullRoster.push({ teamName: "BYE", isBye: true });
    }
    const seedOrder = getBracketOrder(nextPowerOf2);
    let round1 = [];
    for (let i = 0; i < seedOrder.length; i += 2) {
        let homeIdx = seedOrder[i];
        let awayIdx = seedOrder[i + 1];
        let home = fullRoster[homeIdx];
        let away = fullRoster[awayIdx];
        let winner = null;
        if (away.isBye) winner = home;
        if (home.isBye) winner = away;
        round1.push({ id: `R1-M${(i / 2) + 1}`, home: home, away: away, homeScore: null, awayScore: null, winner: winner });
    }
    bracketState = { mainRounds: [round1], thirdPlaceMatch: null, champion: null };
    round1.forEach((match) => { if (match.winner) { advanceMainBracket(match.winner, 0); } });
    saveBracket();
    showToast("Playoffs Started! Bracket Generated.");
    renderDynamicBracket();
    showPanel("playoff-panel");
    renderDashboard();
}

function saveBracket() { localStorage.setItem(STORAGE_KEY_BRACKET, JSON.stringify(bracketState)); }

function renderDynamicBracket() {
    const mainContainer = document.getElementById("main-bracket-container");
    mainContainer.innerHTML = "";
    bracketState.mainRounds.forEach((round, rIndex) => {
        const roundDiv = document.createElement("div");
        roundDiv.className = "round-column";
        const title = document.createElement("div");
        title.className = "round-header";
        let rName = `Round ${rIndex + 1}`;
        if (round.length === 1) rName = "🏆 Finals";
        else if (round.length === 2) rName = "Semi-Finals";
        else if (round.length === 4) rName = "Quarter-Finals";
        title.textContent = rName;
        roundDiv.appendChild(title);
        round.forEach(match => { const card = createMatchCard(match, rIndex, 'main'); roundDiv.appendChild(card); });
        mainContainer.appendChild(roundDiv);
    });
    if (bracketState.thirdPlaceMatch && (bracketState.thirdPlaceMatch.home || bracketState.thirdPlaceMatch.away)) {
        const tDiv = document.createElement("div");
        tDiv.className = "round-column";
        tDiv.style.borderLeft = "4px solid #fca5a5";
        tDiv.style.paddingLeft = "20px";
        const tTitle = document.createElement("div");
        tTitle.className = "round-header";
        tTitle.textContent = "🥉 3rd Place";
        tTitle.style.color = "#ef4444";
        tDiv.appendChild(tTitle);
        const card = createMatchCard(bracketState.thirdPlaceMatch, 0, 'thirdPlace');
        tDiv.appendChild(card);
        mainContainer.appendChild(tDiv);
    }
}

function createMatchCard(match, roundIndex, type) {
    const div = document.createElement("div");
    div.className = "matchup-card";
    if (match.winner) div.classList.add("winner-highlight");
    const canUpdate = currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager');
    const createRow = (team, score, isHome) => {
        if (!team) return `<div class="team-row" style="color:#ccc;">Waiting...</div>`;
        let nameHTML = team.isBye ? `<span class="bye-badge">BYE</span>` : `<span>${team.teamName}</span>`;
        if (match.winner && match.winner.teamName !== team.teamName) { nameHTML = `<span class="loser-text">${team.teamName}</span>`; } else if (match.winner && match.winner.teamName === team.teamName) { nameHTML = `<strong>${team.teamName}</strong>`; }
        let inputHTML = "";
        if (!team.isBye && !match.winner && canUpdate && match.home && match.away) { inputHTML = `<input type="number" class="bracket-input" id="score-${match.id}-${isHome ? 'h' : 'a'}" placeholder="0">`; } else if (score !== null) { inputHTML = `<span style="font-weight:bold; font-size:1.1em;">${score}</span>`; }
        return `<div class="team-row">${nameHTML}${inputHTML}</div>`;
    };
    div.innerHTML = `<div style="font-size:0.7em; color:#ccc;">Match ${match.id}</div>${createRow(match.home, match.homeScore, true)}${createRow(match.away, match.awayScore, false)}`;
    if (!match.winner && match.home && match.away && !match.home.isBye && !match.away.isBye && canUpdate) {
        const btn = document.createElement("button");
        btn.className = "action-btn";
        btn.style.padding = "5px";
        btn.style.fontSize = "0.8em";
        btn.style.marginTop = "5px";
        btn.textContent = "Submit Result";
        btn.onclick = () => window.handleBracketSubmit(match.id, roundIndex, type);
        div.appendChild(btn);
    }
    return div;
}

function handleBracketSubmit(matchId, roundIndex, type) {
    const scoreHInput = document.getElementById(`score-${matchId}-h`);
    const scoreAInput = document.getElementById(`score-${matchId}-a`);
    if (!scoreHInput || !scoreAInput) return;
    const scoreH = parseInt(scoreHInput.value);
    const scoreA = parseInt(scoreAInput.value);
    if (isNaN(scoreH) || isNaN(scoreA)) { showToast("Enter scores for both teams.", "error"); return; }
    if (scoreH === scoreA) { showToast("No ties allowed in playoffs!", "error"); return; }
    let match;
    if (type === 'thirdPlace') match = bracketState.thirdPlaceMatch;
    else match = bracketState.mainRounds[roundIndex].find(m => m.id === matchId);
    if (!match) return;
    match.homeScore = scoreH;
    match.awayScore = scoreA;
    match.winner = scoreH > scoreA ? match.home : match.away;
    const loser = scoreH > scoreA ? match.away : match.home;
    if (type === 'thirdPlace') { showToast(`🥉 ${match.winner.teamName} takes 3rd Place!`); } else {
        showToast(`${match.winner.teamName} wins!`);
        advanceMainBracket(match.winner, roundIndex);
        if (bracketState.mainRounds.length > 1 && roundIndex === bracketState.mainRounds.length - 2) { addToThirdPlace(loser); }
    }
    saveBracket();
    renderDynamicBracket();
}

function advanceMainBracket(winner, roundIndex) {
    if (!bracketState.mainRounds[roundIndex + 1]) {
        if (bracketState.mainRounds[roundIndex].length === 1) { bracketState.champion = winner.teamName; showToast(`🏆 ${winner.teamName} are the Champions!`); saveBracket(); renderDashboard(); return; }
        bracketState.mainRounds[roundIndex + 1] = [];
    }
    const nextRound = bracketState.mainRounds[roundIndex + 1];
    let nextMatch = nextRound.find(m => !m.away);
    if (nextMatch && nextMatch.home) nextMatch.away = winner;
    else { nextRound.push({ id: `R${roundIndex + 2}-M${nextRound.length + 1}`, home: winner, away: null, homeScore: null, awayScore: null, winner: null }); }
}

function addToThirdPlace(loser) {
    if (!bracketState.thirdPlaceMatch) { bracketState.thirdPlaceMatch = { id: "M-3rd", home: loser, away: null, homeScore: null, awayScore: null, winner: null }; }
    else { if (!bracketState.thirdPlaceMatch.home) bracketState.thirdPlaceMatch.home = loser; else bracketState.thirdPlaceMatch.away = loser; }
}

function handleResetPlayoffs() { if (!currentUser || currentUser.role !== 'admin') { showToast("Denied", "error"); return; } showPanel("reset-playoff-confirm-panel"); }

function executeResetPlayoffs() {
    isPlayoffs = false;
    localStorage.removeItem("swisher_playoff_mode");
    bracketState = { mainRounds: [], thirdPlaceMatch: null, champion: null };
    localStorage.removeItem(STORAGE_KEY_BRACKET);
    showToast("Season Unlocked.");
    renderDashboard();
    showPanel("dashboard-panel");
}

function handleArchiveSeason() {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (!bracketState.champion) { showToast("No Champion yet!", "error"); return; }
    if (confirm(`Archive Season? Champion: ${bracketState.champion}`)) {
        const season = { id: Date.now(), date: new Date().toLocaleDateString(), champion: bracketState.champion, totalTeams: teams.length, totalMatches: matches.length, goldenBoot: calculateGoldenBootForArchive() };
        archives.unshift(season);
        archiveStorage.saveData(archives);
        executeResetSeason(true);
    }
}

function calculateGoldenBootForArchive() {
    let top = { name: "N/A", runs: 0, team: "" };
    teams.forEach(t => { t.players.forEach(p => { if (p.runs > top.runs) top = { name: p.name, runs: p.runs, team: t.teamName }; }); });
    return top;
}

function renderArchivePanel() {
    const list = document.getElementById("archive-list");
    list.innerHTML = archives.map(a => `<div class="season-card"><div class="season-header"><div class="season-year">SEASON ARCHIVE • ${a.date}</div><div class="season-champ">👑 ${a.champion}</div></div><div class="season-stats"><div class="stat-row"><span class="stat-label">Teams</span><span class="stat-val">${a.totalTeams}</span></div><div class="stat-row"><span class="stat-label">Matches</span><span class="stat-val">${a.totalMatches}</span></div><div class="gold-boot-row"><span class="boot-icon">👟</span><div><strong>${a.goldenBoot.name}</strong> (${a.goldenBoot.runs} runs)</div></div></div></div>`).join("");
    if (archives.length === 0) list.innerHTML = "<p style='text-align:center;'>No history found.</p>";
}

function getBracketOrder(size) {
    if (size === 4) return [0, 3, 1, 2];
    if (size === 8) return [0, 7, 3, 4, 1, 6, 2, 5];
    if (size === 16) return [0, 15, 7, 8, 3, 12, 4, 11, 1, 14, 6, 9, 2, 13, 5, 10];
    let order = [];
    for (let i = 0; i < size; i++) order.push(i);
    return order;
}

function renderTopScorers() {
    const tbody = document.getElementById("top-scorers-list");
    if (!tbody) return;
    tbody.innerHTML = "";
    let allPlayers = [];
    teams.forEach(t => { if (t.players && Array.isArray(t.players)) { t.players.forEach(p => { if (p.runs > 0) { allPlayers.push({ name: p.name, team: t.teamName, runs: parseInt(p.runs) || 0, photo: p.photo }); } }); } });
    allPlayers.sort((a, b) => b.runs - a.runs);
    const top5 = allPlayers.slice(0, 5);
    if (top5.length === 0) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#94a3b8;">No runs recorded yet.</td></tr>'; return; }
    top5.forEach((p, index) => {
        const tr = document.createElement("tr");
        let rankClass = index === 0 ? "rank-1" : "";
        let rankIcon = index === 0 ? "👑 " : "";
        let avatarHtml = p.photo ? `<img src="${p.photo}" style="width:24px; height:24px; border-radius:50%; vertical-align:middle; margin-right:8px; border:1px solid #ccc;">` : `<span style="display:inline-block; width:24px; height:24px; background:#eee; border-radius:50%; vertical-align:middle; margin-right:8px; text-align:center; font-size:0.7em; line-height:24px;">${p.name.charAt(0)}</span>`;
        tr.innerHTML = `<td style="text-align:center; font-weight:bold; color:#64748b;">${index + 1}</td><td style="font-weight:600;">${avatarHtml}${rankIcon}${p.name}</td><td style="color:#64748b;">${p.team}</td><td style="text-align:center;"><span class="score-badge ${rankClass}">${p.runs}</span></td>`;
        tbody.appendChild(tr);
    });
}

function openRosterPanel(teamId) {
    editingRosterId = teamId;
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    const list = document.getElementById("roster-upload-list");
    list.innerHTML = "";
    if (team.players.length === 0) { list.innerHTML = "<p>No players found. Add players via 'Edit Team' first.</p>"; } else {
        team.players.forEach((p, idx) => {
            const div = document.createElement("div");
            div.className = "upload-row";
            let preview = p.photo ? `<img src="${p.photo}" class="mini-preview">` : `<div class="mini-preview" style="background:#eee;"></div>`;
            div.innerHTML = `<div style="display:flex; align-items:center; gap:10px;">${preview}<span style="font-weight:bold;">${p.name}</span></div><input type="file" class="roster-file-input" data-idx="${idx}" accept="image/*" style="width:auto; font-size:0.8em;">`;
            list.appendChild(div);
        });
    }
    showPanel("roster-panel");
}

async function saveRosterPhotos() {
    if (!editingRosterId) return;
    const team = teams.find(t => t.id === editingRosterId);
    if (!team) return;
    const inputs = document.querySelectorAll(".roster-file-input");
    const promises = Array.from(inputs).map(input => {
        return new Promise((resolve) => {
            const idx = parseInt(input.dataset.idx);
            if (input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => { team.players[idx].photo = e.target.result; resolve(); };
                reader.readAsDataURL(input.files[0]);
            } else { resolve(); }
        });
    });
    await Promise.all(promises);
    teamStorage.saveData(teams);
    showToast("Roster Photos Saved!");
    handleViewRequest(editingRosterId);
}

function showPlayerDetails(teamId, playerName) {
    const team = teams.find(t => t.id === teamId);
    if (!team) return;
    const player = team.players.find(p => p.name === playerName);
    if (!player) return;
    const content = document.getElementById("player-detail-content");
    let imgHtml = player.photo ? `<img src="${player.photo}" class="player-detail-photo">` : `<div class="player-detail-initials">${player.name.charAt(0)}</div>`;
    const teamRuns = team.players.reduce((sum, p) => sum + (parseInt(p.runs) || 0), 0);
    const runShare = teamRuns > 0 ? ((player.runs / teamRuns) * 100).toFixed(0) : 0;
    const sorted = [...team.players].sort((a, b) => b.runs - a.runs);
    const rank = sorted.findIndex(p => p.name === playerName) + 1;
    let rankSuffix = "th";
    if (rank === 1) rankSuffix = "st"; else if (rank === 2) rankSuffix = "nd"; else if (rank === 3) rankSuffix = "rd";
    content.innerHTML = `<div class="player-detail-header">${imgHtml}<div class="player-detail-name">${player.name}</div><div class="player-detail-team">${team.teamName}</div></div><div class="player-stats-grid"><div class="stat-box"><h4>Total Runs</h4><div class="value">${player.runs}</div><div class="sub-text">Season Total</div></div><div class="stat-box"><h4>Team Rank</h4><div class="value">${rank}<span style="font-size:0.5em; vertical-align:super;">${rankSuffix}</span></div><div class="sub-text">in Scoring</div></div><div class="stat-box"><h4>Contribution</h4><div class="value">${runShare}<span style="font-size:0.5em;">%</span></div><div class="sub-text">of Team Runs</div></div></div>`;
    const btnBack = document.getElementById("btn-player-back");
    btnBack.onclick = () => handleViewRequest(teamId);
    showPanel("view-player-details");
}

function playVideo(url) {
    if (!url) return;
    let videoId = "";
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) { videoId = match[2]; } else { showToast("Invalid YouTube Link", "error"); return; }
    const modal = document.getElementById("video-modal");
    const iframe = document.getElementById("youtube-player");
    iframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    modal.classList.remove("hidden");
}

function closeVideoModal() {
    const modal = document.getElementById("video-modal");
    const iframe = document.getElementById("youtube-player");
    iframe.src = "";
    modal.classList.add("hidden");
}

function handleScheduleSubmit(e) {
    e.preventDefault();
    const date = document.getElementById("sched-date").value;
    const home = document.getElementById("sched-home").value;
    const away = document.getElementById("sched-away").value;
    if (home === away) { showToast("Teams must be different", "error"); return; }
    schedule.push({ id: Date.now(), date: new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), home: home, away: away });
    scheduleStorage.saveData(schedule);
    showToast("Match Scheduled!");
    renderDashboard();
    showPanel("dashboard-panel");
}

function renderSchedule() {
    const container = document.getElementById("schedule-section");
    const list = document.getElementById("upcoming-list");
    if (!container || !list) return;
    if (schedule.length === 0) { container.classList.add("hidden"); return; }
    container.classList.remove("hidden");
    list.innerHTML = "";
    schedule.forEach(game => {
        const div = document.createElement("div");
        div.className = "schedule-card";
        let actionBtn = "";
        if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')) { actionBtn = `<button class="btn-enter-score" onclick="window.enterScoreForSchedule(${game.id})">✅ Enter Result</button>`; }
        div.innerHTML = `<div class="sched-date">${game.date}</div><div class="sched-matchup"><span>${game.home}</span><span class="sched-vs">vs</span><span>${game.away}</span></div>${actionBtn}`;
        list.appendChild(div);
    });
}

function enterScoreForSchedule(id) {
    const game = schedule.find(g => g.id === id);
    if (!game) return;
    pendingScheduleId = id;
    showMatchPanel();
    const t1 = teams.find(t => t.teamName === game.home);
    const t2 = teams.find(t => t.teamName === game.away);
    if (t1) document.getElementById("team1").value = t1.id;
    if (t2) document.getElementById("team2").value = t2.id;
    showToast("Enter results for this scheduled game.");
}

function generateSchedule(rounds, startDate) {
    const activeTeams = teams.filter(t => !t.isPending);
    if (activeTeams.length < 2) { showToast("Need at least 2 teams to generate a schedule!", "error"); return; }
    let schedulerTeams = [...activeTeams];
    if (schedulerTeams.length % 2 !== 0) { schedulerTeams.push({ id: "BYE", teamName: "BYE" }); }
    const numTeams = schedulerTeams.length;
    const matchesPerRound = numTeams / 2;
    const totalRounds = (numTeams - 1) * rounds;
    schedule = [];
    let currentDate = new Date(startDate);
    for (let r = 0; r < totalRounds; r++) {
        for (let i = 0; i < matchesPerRound; i++) {
            const home = schedulerTeams[i];
            const away = schedulerTeams[numTeams - 1 - i];
            if (home.id !== "BYE" && away.id !== "BYE") { schedule.push({ id: Date.now() + Math.random(), date: currentDate.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }), home: home.teamName, away: away.teamName }); }
        }
        const last = schedulerTeams.pop();
        schedulerTeams.splice(1, 0, last);
        currentDate.setDate(currentDate.getDate() + 7);
    }
    scheduleStorage.saveData(schedule);
    renderSchedule();
    showToast(`Successfully generated ${schedule.length} matches!`, "success");
}

let inactivityTimer; let warningTimer; let countdownInterval;
const TIMEOUT_DURATION = 1 * 60 * 1000;
const WARNING_TIME = 30 * 1000;

function startInactivityTimer() {
    if (!currentUser || currentUser.role === 'guest') return;
    window.onload = resetTimer; window.onmousemove = resetTimer; window.onmousedown = resetTimer; window.ontouchstart = resetTimer; window.onclick = resetTimer; window.onkeydown = resetTimer; window.addEventListener('scroll', resetTimer, true);
    resetTimer();
}

function resetTimer() {
    if (!currentUser || currentUser.role === 'guest') return;
    const modal = document.getElementById("inactivity-modal");
    if (modal && !modal.classList.contains("hidden")) { if (document.getElementById("btn-stay-logged-in").classList.contains("hidden") === false) { modal.classList.add("hidden"); modal.style.display = ""; } }
    clearTimeout(inactivityTimer); clearTimeout(warningTimer); clearInterval(countdownInterval);
    warningTimer = setTimeout(showInactivityWarning, TIMEOUT_DURATION - WARNING_TIME);
}

function showInactivityWarning() {
    const modal = document.getElementById("inactivity-modal");
    const btnStay = document.getElementById("btn-stay-logged-in");
    const btnClose = document.getElementById("btn-close-timeout");
    document.getElementById("inactivity-title").textContent = "Session Expiring";
    document.getElementById("inactivity-msg").innerHTML = 'You will be logged out in <span id="inactivity-countdown" style="font-weight:900; color:var(--brand-orange); font-size:1.2em;">30</span> seconds.';
    const countSpan = document.getElementById("inactivity-countdown");
    btnStay.classList.remove("hidden");
    btnClose.classList.add("hidden");
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    let secondsLeft = 30;
    countSpan.textContent = secondsLeft;
    countdownInterval = setInterval(() => {
        secondsLeft--; countSpan.textContent = secondsLeft;
        if (secondsLeft <= 0) { clearInterval(countdownInterval); doAutoLogout(); }
    }, 1000);
}

function doAutoLogout() {
    supabase.auth.signOut();
    const btnStay = document.getElementById("btn-stay-logged-in");
    const btnClose = document.getElementById("btn-close-timeout");
    document.getElementById("inactivity-title").textContent = "Session Expired";
    document.getElementById("inactivity-msg").textContent = "You have been logged out due to inactivity.";
    btnStay.classList.add("hidden");
    btnClose.classList.remove("hidden");
}