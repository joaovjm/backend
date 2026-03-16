import pool from "./db.js";
export async function query (text, params) {
    const start = Date.now();

    try{

        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        
        if (duration > 1000) {
            console.log("Query lenta: ", {text, duration});
        }
        return res;
    } catch (err) {
        console.error("Erro na query", err);
        throw err;
    }
}

