/**
 * @file FormHandler.js
 */
"use strict";

export class FormHandler {
    constructor(formId) {
        this.form = document.getElementById(formId);

        // Inputs
        this.els = {
            id: document.getElementById("team-id"),
            teamName: document.getElementById("teamName"),
            captainName: document.getElementById("captainName"),
            email: document.getElementById("email"),
            phone: document.getElementById("phone"),
            logoFile: document.getElementById("logoFile"),
            players: document.getElementById("players"),
            wins: document.getElementById("wins"),
            losses: document.getElementById("losses"),
            runsScored: document.getElementById("runsScored"),
            runsAllowed: document.getElementById("runsAllowed")
        };

        this.errs = {
            teamName: document.getElementById("error-teamName"),
            captainName: document.getElementById("error-captainName"),
            email: document.getElementById("error-email"),
            phone: document.getElementById("error-phone")
        };
    }

    reset() {
        this.form.reset();
        this.els.id.value = "";
        this.clearErrors();
        document.getElementById("form-title").textContent = "Register New Team";
    }

    fillForm(team) {
        this.clearErrors();
        this.els.id.value = team.id;
        this.els.teamName.value = team.teamName;
        this.els.captainName.value = team.captainName;
        this.els.email.value = team.email;
        this.els.phone.value = team.phone;

        // Clear file input (security restriction)
        this.els.logoFile.value = "";

        if (Array.isArray(team.players)) {
            const names = team.players.map(p => (typeof p === 'object' ? p.name : p));
            this.els.players.value = names.join(", ");
        } else {
            this.els.players.value = "";
        }

        this.els.wins.value = team.wins;
        this.els.losses.value = team.losses;
        this.els.runsScored.value = team.runsScored;
        this.els.runsAllowed.value = team.runsAllowed;

        document.getElementById("form-title").textContent = `Edit Team: ${team.teamName}`;
    }

    getDataIfValid() {
        this.clearErrors();
        let isValid = true;

        // Safety check for file input
        const fileInput = this.els.logoFile;
        const hasFile = fileInput && fileInput.files && fileInput.files.length > 0;

        const val = {
            id: this.els.id.value ? parseInt(this.els.id.value) : null,
            teamName: this.els.teamName.value.trim(),
            captainName: this.els.captainName.value.trim(),
            email: this.els.email.value.trim(),
            phone: this.els.phone.value.trim(),
            logoFile: hasFile ? fileInput.files[0] : null,
            playersRaw: this.els.players.value,
            wins: this.els.wins.value,
            losses: this.els.losses.value,
            runsScored: this.els.runsScored.value,
            runsAllowed: this.els.runsAllowed.value
        };

        if (!val.teamName) { this.showError("teamName", "Team Name is required"); isValid = false; }
        if (!val.captainName) { this.showError("captainName", "Captain Name is required"); isValid = false; }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!val.email) { this.showError("email", "Email is required"); isValid = false; }
        else if (!emailRegex.test(val.email)) { this.showError("email", "Invalid email"); isValid = false; }

        const phoneRegex = /^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/;
        if (!val.phone) { this.showError("phone", "Phone is required"); isValid = false; }
        else if (!phoneRegex.test(val.phone)) { this.showError("phone", "Invalid format (e.g. 555-123-4567)"); isValid = false; }

        if (!isValid) return null;

        const playersArray = val.playersRaw.split(",").map(p => p.trim()).filter(p => p.length > 0);

        return {
            id: val.id,
            teamName: val.teamName,
            captainName: val.captainName,
            email: val.email,
            phone: val.phone,
            logoFile: val.logoFile,
            players: playersArray,
            wins: parseInt(val.wins) || 0,
            losses: parseInt(val.losses) || 0,
            runsScored: parseInt(val.runsScored) || 0,
            runsAllowed: parseInt(val.runsAllowed) || 0
        };
    }

    showError(field, message) {
        if (this.errs[field]) {
            this.errs[field].textContent = message;
            this.errs[field].classList.add("visible"); // Ensure it shows
        }
    }

    // [FIXED] Now removes the 'visible' class so the red box disappears
    clearErrors() {
        // 1. Reset Error Text & Hide the Box
        Object.values(this.errs).forEach(el => {
            if (el) {
                el.textContent = "";
                el.classList.remove("visible"); // <--- THIS WAS MISSING
            }
        });

        // 2. Clear Red Borders from Inputs
        Object.values(this.els).forEach(el => {
            if (el && el.classList) el.classList.remove("input-error");
        });
    }
}