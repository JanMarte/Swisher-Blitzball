/**
 * @file ListManager.js
 */
"use strict";

export class ListManager {
    constructor(tbodyId) {
        this.tbody = document.getElementById(tbodyId);
    }

    render(teams, onView, onEdit, onDelete, role) {
        this.tbody.innerHTML = "";
        if (teams.length === 0) {
            this.tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">No teams found.</td></tr>';
            return;
        }

        teams.forEach(team => {
            const tr = document.createElement("tr");

            // 1. MAKE ROW CLICKABLE
            tr.className = "clickable-row";

            // Add click event to the whole row
            tr.onclick = (e) => {
                // Ignore click if the user clicked an interactive element (like a button)
                if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

                onView(team.id);
            };

            // --- CALCULATIONS (Same as before) ---
            let winPctStr = "0.000";
            if (typeof team.winPct !== 'undefined') {
                winPctStr = team.winPct;
            } else {
                const w = parseInt(team.wins) || 0;
                const l = parseInt(team.losses) || 0;
                const total = w + l;
                if (total > 0) winPctStr = (w / total).toFixed(3);
            }

            let diffVal = 0;
            if (typeof team.runDiff !== 'undefined') {
                diffVal = team.runDiff;
            } else {
                const rs = parseInt(team.runsScored) || 0;
                const ra = parseInt(team.runsAllowed) || 0;
                diffVal = rs - ra;
            }

            const diff = diffVal > 0 ? `+${diffVal}` : diffVal;
            const fmtPct = winPctStr.replace(/^0+/, '');

            // Logo Logic
            let logoHtml = "";
            if (team.logoUrl) {
                logoHtml = `<img src="${team.logoUrl}" class="team-logo-small" alt="${team.teamName}" onerror="this.style.display='none'">`;
            } else {
                logoHtml = `<div class="team-logo-placeholder">${team.teamName.charAt(0).toUpperCase()}</div>`;
            }

            tr.innerHTML = `
                <td>
                    <div class="team-name-flex">
                        ${logoHtml}
                        <strong>${team.teamName}</strong>
                    </div>
                </td>
                <td style="background-color: #eff6ff; font-weight:bold; color: #2563eb; text-align:center;">${team.wins}</td>
                <td style="text-align:center; color:#64748b;">${team.losses}</td>
                <td style="font-weight:bold; text-align:center;">${fmtPct === '.000' && team.wins > 0 ? '1.000' : fmtPct}</td>
                <td style="color: #64748b; font-size: 0.9em; text-align:center;">${team.runsScored}</td>
                <td style="color: #64748b; font-size: 0.9em; text-align:center;">${team.runsAllowed}</td>
                <td style="text-align:center; font-size: 0.9em;">${diff}</td>
                <td class="actions-cell"></td> 
            `;

            // 2. ONLY ADD ADMIN BUTTONS (Removed "View" button)
            const actionsTd = tr.lastElementChild;

            if (role === 'admin' || role === 'manager') {
                const btnEdit = document.createElement("button");
                btnEdit.textContent = "Edit";
                btnEdit.className = "btn-small btn-edit";
                btnEdit.style.marginRight = "5px"; // Add spacing since View button is gone
                btnEdit.onclick = (e) => {
                    e.stopPropagation(); // Stop row click
                    onEdit(team.id);
                };
                actionsTd.appendChild(btnEdit);
            }

            if (role === 'admin') {
                const btnDel = document.createElement("button");
                btnDel.textContent = "X";
                btnDel.className = "btn-small btn-delete";
                btnDel.onclick = (e) => {
                    e.stopPropagation(); // Stop row click
                    onDelete(team.id);
                };
                actionsTd.appendChild(btnDel);
            }

            this.tbody.appendChild(tr);
        });
    }
}