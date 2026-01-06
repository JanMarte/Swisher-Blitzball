"use strict";
export class StorageHandler {
    constructor(key = "swisher_blitzball_data") { this.KEY = key; }
    getData() { const j = localStorage.getItem(this.KEY); return j ? JSON.parse(j) : []; }
    saveData(d) { localStorage.setItem(this.KEY, JSON.stringify(d)); }
}