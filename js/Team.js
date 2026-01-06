/**
 * @file Team.js
 */
"use strict";

export class Team {
    #id;
    #teamName;
    #captainName;
    #email;
    #phone;
    #logoUrl;
    #players; // Array of objects: { name, runs, photo, stats, wins }
    #wins;
    #losses;
    #runsScored;
    #runsAllowed;

    constructor(id, teamName, captainName, email, phone, logoUrl = "", players = [], wins = 0, losses = 0, runsScored = 0, runsAllowed = 0) {
        this.#id = id;
        this.teamName = teamName;
        this.captainName = captainName;
        this.email = email;
        this.phone = phone;
        this.logoUrl = logoUrl;

        // [FIXED] Ensure we preserve 'stats' and pitching 'wins'
        this.players = players.map(p => {
            if (typeof p === 'string') return { name: p.trim(), runs: 0, photo: null, stats: {}, wins: 0 };

            return {
                name: p.name,
                runs: parseInt(p.runs) || 0,
                photo: p.photo || null,
                wins: parseInt(p.wins) || 0, // Pitching wins (legacy or direct)
                stats: p.stats || {}         // The detailed stats object (H, HR, K, W, etc.)
            };
        });

        this.wins = wins;
        this.losses = losses;
        this.runsScored = runsScored;
        this.runsAllowed = runsAllowed;
    }

    get id() { return this.#id; }
    get teamName() { return this.#teamName; }
    get captainName() { return this.#captainName; }
    get email() { return this.#email; }
    get phone() { return this.#phone; }
    get logoUrl() { return this.#logoUrl; }
    get players() { return this.#players; }
    get wins() { return this.#wins; }
    get losses() { return this.#losses; }
    get runsScored() { return this.#runsScored; }
    get runsAllowed() { return this.#runsAllowed; }

    set teamName(value) { this.#teamName = value.trim(); }
    set captainName(value) { this.#captainName = value.trim(); }
    set email(value) { this.#email = value.trim(); }
    set phone(value) { this.#phone = value.trim(); }
    set logoUrl(value) { this.#logoUrl = value ? value.trim() : ""; }

    set players(value) {
        if (!Array.isArray(value)) throw new Error("Players must be array.");
        this.#players = value;
    }

    set wins(value) { this.#wins = parseInt(value) || 0; }
    set losses(value) { this.#losses = parseInt(value) || 0; }
    set runsScored(value) { this.#runsScored = parseInt(value) || 0; }
    set runsAllowed(value) { this.#runsAllowed = parseInt(value) || 0; }

    toJSON() {
        return {
            id: this.#id,
            teamName: this.#teamName,
            captainName: this.#captainName,
            email: this.#email,
            phone: this.#phone,
            logoUrl: this.#logoUrl,
            players: this.#players,
            wins: this.#wins,
            losses: this.#losses,
            runsScored: this.#runsScored,
            runsAllowed: this.#runsAllowed
        };
    }

    static fromData(data) {
        return new Team(
            data.id,
            data.teamName,
            data.captainName,
            data.email,
            data.phone,
            data.logoUrl || "",
            data.players,
            data.wins,
            data.losses,
            data.runsScored || data.goalsFor || 0,
            data.runsAllowed || data.goalsAgainst || 0
        );
    }
}