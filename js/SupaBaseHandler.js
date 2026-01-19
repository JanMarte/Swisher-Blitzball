// [CHANGED] Import the shared client
import { supabase } from "./supabaseClient.js";

export class SupabaseHandler {
    constructor(tableName) {
        this.tableName = tableName;
    }

    async getData() {
        const { data, error } = await supabase
            .from(this.tableName)
            .select('*');

        if (error) {
            console.error(`Error loading ${this.tableName}:`, error);
            return [];
        }
        return data || [];
    }

    async saveData(dataArray) {
        if (!Array.isArray(dataArray)) return;

        // 1. Upsert
        const { error: upsertError } = await supabase
            .from(this.tableName)
            .upsert(dataArray);

        if (upsertError) console.error(`Error saving ${this.tableName}:`, upsertError);

        // 2. Cleanup deleted items
        const currentIds = dataArray.map(item => item.id);
        if (currentIds.length > 0) {
            const { error: deleteError } = await supabase
                .from(this.tableName)
                .delete()
                .not('id', 'in', `(${currentIds.join(',')})`);

            if (deleteError) console.error(`Error cleaning ${this.tableName}:`, deleteError);
        }
    }
}