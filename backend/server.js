// server.js - AirInsight com OpenSky + Gemini (primário) + Groq (fallback)
require('dotenv').config();
const express = require('express');
const axios = require('axios');
const { Pool } = require('pg');
const cron = require('node-cron');
const cors = require('cors');
const OpenAI = require('openai');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
});

// ========== 1. Configuração da tabela ==========
(async () => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS voos (
            id SERIAL PRIMARY KEY,
            callsign TEXT,
            latitude REAL,
            longitude REAL,
            altitude REAL,
            velocidade REAL,
            track REAL,
            timestamp TIMESTAMP DEFAULT NOW()
        )
    `);
    await pool.query(`ALTER TABLE voos ADD COLUMN IF NOT EXISTS track REAL;`);
    console.log('✅ Tabela "voos" verificada');
})();

// ========== 2. Funções auxiliares ==========
function parseCoord(value) {
    if (value === null || value === undefined) return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

function isValidCoord(lat, lon) {
    const l = parseCoord(lat);
    const ln = parseCoord(lon);
    if (l === null || ln === null) return false;
    return l >= -90 && l <= 90 && ln >= -180 && ln <= 180;
}

function calculateTrack(lat1, lon1, lat2, lon2) {
    if (lat1 === lat2 && lon1 === lon2) return 0;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1rad = lat1 * Math.PI / 180;
    const lat2rad = lat2 * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2rad);
    const x = Math.cos(lat1rad) * Math.sin(lat2rad) - Math.sin(lat1rad) * Math.cos(lat2rad) * Math.cos(dLon);
    let brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
}

let lastPositions = new Map();

// ========== 3. Cache para dados de voo (fallback técnico, não IA) ==========
let lastSuccessfulFlights = [];
let lastCacheTime = 0;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos

// ========== 4. OpenSky OAuth2 ==========
let cachedToken = null;
let tokenExpiry = 0;

async function getOpenSkyToken() {
    if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
    try {
        const auth = Buffer.from(`${process.env.OPENSKY_CLIENT_ID}:${process.env.OPENSKY_CLIENT_SECRET}`).toString('base64');
        const response = await axios.post(
            'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
            'grant_type=client_credentials',
            {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            }
        );
        if (response.data && response.data.access_token) {
            cachedToken = response.data.access_token;
            tokenExpiry = Date.now() + (response.data.expires_in - 60) * 1000;
            console.log('✅ Token OpenSky OAuth2 obtido');
            return cachedToken;
        }
        return null;
    } catch (err) {
        console.error('❌ Erro token OpenSky:', err.response?.status, err.response?.data?.error_description || err.message);
        return null;
    }
}

async function fetchFromOpenSky() {
    const token = await getOpenSkyToken();
    if (!token) return [];
    try {
        const response = await axios.get('https://opensky-network.org/api/states/all', {
            timeout: 10000,
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const states = response.data.states;
        if (!states || !states.length) return [];
        console.log(`✅ OpenSky retornou ${states.length} aeronaves`);
        return states.map(state => ({
            callsign: state[1]?.trim() || 'N/A',
            latitude: state[6],
            longitude: state[5],
            altitude: state[7],
            velocidade: state[9],
            track: null
        }));
    } catch (err) {
        console.error('❌ OpenSky API falhou:', err.response?.status, err.message);
        return [];
    }
}

// ========== 5. Mapeamento de nomes de companhias (Aviationstack) ==========
let airlineNamesCache = {};
let lastCacheUpdate = 0;

async function refreshAirlineCache() {
    const now = Date.now();
    if (now - lastCacheUpdate < 7200000) return;
    lastCacheUpdate = now;
    const key = process.env.AVIATIONSTACK_API_KEY;
    if (!key) return;
    try {
        const url = `http://api.aviationstack.com/v1/airlines?access_key=${key}&limit=300`;
        const response = await axios.get(url, { timeout: 10000 });
        const airlines = response.data?.data;
        if (airlines && airlines.length) {
            airlineNamesCache = {};
            airlines.forEach(airline => {
                if (airline.icao_code) airlineNamesCache[airline.icao_code] = airline.airline_name;
                if (airline.iata_code) airlineNamesCache[airline.iata_code] = airline.airline_name;
            });
            console.log(`✅ Cache de companhias atualizado: ${Object.keys(airlineNamesCache).length} entradas`);
        }
    } catch (err) {
        console.error('❌ Erro Aviationstack (airlines):', err.message);
    }
}

const FALLBACK_MAP = {
    'AAL': 'American Airlines', 'DAL': 'Delta Air Lines', 'UAL': 'United Airlines',
    'GLO': 'Gol Linhas Aéreas', 'TAM': 'LATAM Airlines Brasil', 'AZU': 'Azul Linhas Aéreas',
    'EZY': 'easyJet', 'SWA': 'Southwest Airlines Co.', 'BAW': 'British Airways',
    'SHT': 'British Airways', 'AFR': 'Air France', 'KLM': 'KLM Royal Dutch Airlines',
    'DLH': 'Lufthansa', 'RYR': 'Ryanair', 'JBU': 'JetBlue'
};

function getAirlineName(callsign) {
    if (!callsign || callsign === 'N/A') return 'Desconhecida';
    if (/^\d+$/.test(callsign) || callsign === '00000000') return 'Desconhecida';
    const code = callsign.match(/^[A-Z]{3}/)?.[0];
    if (!code) return callsign;
    return airlineNamesCache[code] || FALLBACK_MAP[code] || code;
}

// ========== 6. Atualização periódica (coleta de voos) ==========
cron.schedule('*/60 * * * * *', async () => {
    console.log('\n🔄 Coletando dados de voo...');
    let flights = await fetchFromOpenSky();
    let source = 'OpenSky';

    if (!flights.length && lastSuccessfulFlights.length > 0 && (Date.now() - lastCacheTime) < CACHE_TTL) {
        flights = lastSuccessfulFlights;
        source = `Cache (${new Date(lastCacheTime).toLocaleTimeString()})`;
        console.log(`📦 Usando cache (${flights.length} voos)`);
    }

    if (!flights.length) {
        console.log('⚠️ Nenhum dado disponível. O mapa ficará vazio temporariamente.');
        return;
    }

    lastSuccessfulFlights = flights;
    lastCacheTime = Date.now();

    await pool.query(`DELETE FROM voos`);
    let inserted = 0;
    for (const flight of flights) {
        const lat = parseCoord(flight.latitude);
        const lon = parseCoord(flight.longitude);
        if (!isValidCoord(lat, lon)) continue;

        let track = flight.track;
        if (track === null || track === undefined) {
            const key = flight.callsign;
            const prev = lastPositions.get(key);
            if (prev && prev.lat && prev.lon && (prev.lat !== lat || prev.lon !== lon)) {
                track = calculateTrack(prev.lat, prev.lon, lat, lon);
            } else {
                track = 0;
            }
            lastPositions.set(key, { lat, lon });
        }

        const alt = flight.altitude ? parseFloat(flight.altitude) : 0;
        const vel = flight.velocidade ? parseFloat(flight.velocidade) : 0;
        await pool.query(
            `INSERT INTO voos (callsign, latitude, longitude, altitude, velocidade, track)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [flight.callsign, lat, lon, alt, vel, track]
        );
        inserted++;
    }
    console.log(`✅ Fonte: ${source} | Inseridos ${inserted} voos às ${new Date().toLocaleTimeString()}`);
});

refreshAirlineCache();
setInterval(refreshAirlineCache, 7200000);

// ========== 7. Rotas da API ==========
app.get('/voos', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, callsign, latitude, longitude, altitude, velocidade, track
            FROM voos
            ORDER BY timestamp DESC
            LIMIT 5000
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.get('/voos/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total,
                ROUND(AVG(altitude)::numeric, 0) as altitude_media,
                ROUND(AVG(velocidade)::numeric, 1) as velocidade_media,
                MAX(velocidade) as velocidade_max,
                (SELECT callsign FROM voos WHERE velocidade = (SELECT MAX(velocidade) FROM voos) LIMIT 1) as voo_mais_rapido,
                MAX(altitude) as altitude_max,
                (SELECT callsign FROM voos WHERE altitude = (SELECT MAX(altitude) FROM voos) LIMIT 1) as voo_mais_alto
            FROM voos
            WHERE latitude != 0 AND longitude != 0
        `);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

app.get('/voos/topcias', async (req, res) => {
    try {
        const raw = await pool.query(`
            SELECT callsign, COUNT(*) as total
            FROM voos
            WHERE callsign IS NOT NULL AND callsign != 'N/A'
            GROUP BY callsign
            ORDER BY total DESC
            LIMIT 100
        `);
        const airlineTotals = {};
        for (const row of raw.rows) {
            const name = getAirlineName(row.callsign);
            if (name === 'Desconhecida') continue;
            airlineTotals[name] = (airlineTotals[name] || 0) + parseInt(row.total);
        }
        const top3 = Object.entries(airlineTotals)
            .map(([name, total]) => ({ airline_name: name, total }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 3);
        res.json(top3);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
});

// ========== 8. Função para gerar SQL via IA (Gemini ou Groq) ==========
async function gerarSQLGemini(pergunta) {
    const prompt = `
Você é um assistente de dados de voos. A tabela "voos" tem colunas:
- callsign (texto)
- altitude (metros, número real)
- velocidade (km/h, número real)
- track (graus, número real)
- latitude (real)
- longitude (real)
- timestamp (timestamp)

Responda APENAS com a consulta SQL que resolve a pergunta do usuário.
Não inclua explicações, apenas o SQL cru.
Se a pergunta pedir uma contagem, use COUNT(*). Se pedir média, use AVG. Se pedir lista, use SELECT com LIMIT apropriado.

Exemplos:
Pergunta: "Quantos voos estão ativos?"
SQL: SELECT COUNT(*) FROM voos WHERE latitude != 0 AND longitude != 0;

Pergunta: "Qual a altitude média?"
SQL: SELECT AVG(altitude) FROM voos WHERE altitude > 0;

Pergunta: "Quantos voos acima de 8000 metros?"
SQL: SELECT COUNT(*) FROM voos WHERE altitude > 8000;

Pergunta: "Liste os 3 voos mais rápidos"
SQL: SELECT callsign, velocidade FROM voos ORDER BY velocidade DESC LIMIT 3;

Agora responda para a pergunta: "${pergunta}"
SQL:`;

    const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_KEY}`,
        { contents: [{ parts: [{ text: prompt }] }] },
        { timeout: 10000 }
    );
    let sql = response.data.candidates[0].content.parts[0].text;
    sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();
    return sql;
}

// Configuração do cliente Groq (OpenAI-compatível)
const groq = new OpenAI({
    baseURL: 'https://api.groq.com/openai/v1',
    apiKey: process.env.GROQ_API_KEY,
});

async function gerarSQLGroq(pergunta) {
    const completion = await groq.chat.completions.create({
        messages: [
            { role: 'system', content: 'Você é um assistente que converte perguntas sobre voos em SQL. Responda apenas com o SQL, sem explicações.' },
            { role: 'user', content: `Pergunta: "${pergunta}". SQL:` }
        ],
        model: 'llama-3.3-70b-versatile', // ou 'mixtral-8x7b-32768'
        temperature: 0.2,
    });
    let sql = completion.choices[0].message.content;
    sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();
    return sql;
}

// ========== 9. Rota do Chat com failover Gemini → Groq (sem fallback local) ==========
app.post('/chat', async (req, res) => {
    const { pergunta } = req.body;
    if (!pergunta) return res.json({ resposta: 'Digite uma pergunta.' });
    console.log(`📨 [CHAT] Pergunta: "${pergunta}"`);

    let sql = null;
    let usedProvider = null;

    // 1. Tenta Gemini
    try {
        console.log('🤖 Tentando Gemini...');
        sql = await gerarSQLGemini(pergunta);
        usedProvider = 'Gemini';
        console.log(`✅ SQL gerado pelo Gemini: ${sql}`);
    } catch (err) {
        console.error('❌ Gemini falhou:', err.response?.status, err.message);
        // 2. Fallback para Groq
        try {
            console.log('🔄 Tentando Groq...');
            sql = await gerarSQLGroq(pergunta);
            usedProvider = 'Groq';
            console.log(`✅ SQL gerado pelo Groq: ${sql}`);
        } catch (err2) {
            console.error('❌ Groq também falhou:', err2.message);
            return res.status(500).json({ resposta: 'Nenhum serviço de IA disponível no momento. Tente novamente mais tarde.', source: 'error' });
        }
    }

    // Executa a SQL no banco
    try {
        const dbResult = await pool.query(sql);
        let respostaTexto = '';

        if (dbResult.rows.length === 1 && dbResult.rows[0].count !== undefined) {
            respostaTexto = `${dbResult.rows[0].count} resultado(s).`;
        } else if (dbResult.rows.length === 1 && dbResult.rows[0].avg !== undefined) {
            respostaTexto = `Valor médio: ${Math.round(dbResult.rows[0].avg)}.`;
        } else if (dbResult.rows.length === 0) {
            respostaTexto = 'Nenhum resultado encontrado.';
        } else {
            respostaTexto = JSON.stringify(dbResult.rows);
            if (respostaTexto.length > 300) respostaTexto = respostaTexto.substring(0, 300) + '…';
        }

        console.log(`✅ Resposta gerada por ${usedProvider}`);
        res.json({ resposta: respostaTexto, source: usedProvider });
    } catch (err) {
        console.error('❌ Erro ao executar SQL:', err.message);
        res.status(500).json({ resposta: 'Erro ao consultar o banco de dados.', source: 'error' });
    }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 Servidor rodando na porta ${PORT}`));