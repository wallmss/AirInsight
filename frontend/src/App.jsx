// frontend/src/App.jsx
import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-rotatedmarker';
import axios from 'axios';
import spritesUrl from './assets/sprites.png';
import './App.css';

const SPRITE_SIZE = 86;
const FIRST_ICON_X = 0;
const FIRST_ICON_Y = 0;

async function getPlaneIcon() {
    const img = new Image();
    img.src = spritesUrl;
    await new Promise(resolve => { img.onload = resolve; });
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, FIRST_ICON_X, FIRST_ICON_Y, SPRITE_SIZE, SPRITE_SIZE, 0, 0, SPRITE_SIZE, SPRITE_SIZE);
    const dataUrl = canvas.toDataURL('image/png');
    return L.icon({
        iconUrl: dataUrl,
        iconSize: [SPRITE_SIZE, SPRITE_SIZE],
        iconAnchor: [SPRITE_SIZE/2, SPRITE_SIZE/2],
        popupAnchor: [0, -SPRITE_SIZE/2]
    });
}

function RotatedMarkers({ voos, icon }) {
    const map = useMap();
    const markersRef = useRef({});

    useEffect(() => {
        if (!icon) return;
        Object.values(markersRef.current).forEach(marker => map.removeLayer(marker));
        markersRef.current = {};
        voos.forEach(voo => {
            if (!voo.latitude || !voo.longitude) return;
            const angle = voo.track || 0;
            const marker = L.marker([voo.latitude, voo.longitude], {
                icon: icon,
                rotationAngle: angle,
                rotationOrigin: 'center'
            }).bindPopup(`
                <strong>${voo.callsign}</strong><br/>
                Altitude: ${Math.round(voo.altitude)} m<br/>
                Velocidade: ${Math.round(voo.velocidade)} km/h
            `);
            marker.addTo(map);
            markersRef.current[voo.id] = marker;
        });
    }, [map, voos, icon]);

    return null;
}

function Card({ title, value, icon, color }) {
    return (
        <div className="dashboard-card" style={{ borderTop: `4px solid ${color}` }}>
            <div className="card-icon">{icon}</div>
            <div className="card-content">
                <h3>{title}</h3>
                <p>{value}</p>
            </div>
        </div>
    );
}

function App() {
    const [voos, setVoos] = useState([]);
    const [stats, setStats] = useState({ total: 0, altitude_media: 0, velocidade_media: 0, voo_mais_rapido: 'N/A', velocidade_max: 0, voo_mais_alto: 'N/A', altitude_max: 0 });
    const [topCias, setTopCias] = useState([]);
    const [pergunta, setPergunta] = useState('');
    const [resposta, setResposta] = useState('');
    const [loading, setLoading] = useState(false);
    const [planeIcon, setPlaneIcon] = useState(null);

    useEffect(() => {
        getPlaneIcon().then(icon => setPlaneIcon(icon));
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        try {
            const [voosRes, statsRes, topRes] = await Promise.all([
                axios.get('http://localhost:3000/voos'),
                axios.get('http://localhost:3000/voos/stats'),
                axios.get('http://localhost:3000/voos/topcias')
            ]);
            setVoos(voosRes.data);
            setStats(statsRes.data);
            setTopCias(topRes.data);
        } catch (err) {
            console.error(err);
        }
    };

    const askAI = async () => {
        if (!pergunta.trim()) return;
        setLoading(true);
        try {
            const res = await axios.post('http://localhost:3000/chat', { pergunta });
            setResposta(res.data.resposta);
        } catch (err) {
            setResposta('Erro ao processar sua pergunta.');
        }
        setLoading(false);
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            askAI();
        }
    };

    return (
        <div className="app">
            <div className="sidebar">
                <h1>✈️ AirInsight</h1>
                <div className="cards-grid">
                    <Card title="Voos ativos" value={stats.total} icon="✈️" color="#007bff" />
                    <Card title="Altitude média" value={`${Math.round(stats.altitude_media)} m`} icon="📈" color="#28a745" />
                    <Card title="Velocidade média" value={`${stats.velocidade_media} km/h`} icon="⚡" color="#ffc107" />
                    <Card title="Voo mais rápido" value={`${stats.voo_mais_rapido} (${Math.round(stats.velocidade_max)} km/h)`} icon="🚀" color="#fd7e14" />
                    <Card title="Voo mais alto" value={`${stats.voo_mais_alto} (${Math.round(stats.altitude_max)} m)`} icon="🏔️" color="#6f42c1" />
                </div>
                <div className="top-airlines">
                    <h2>🏆 Top 3 companhias</h2>
                    {topCias.length === 0 ? (
                        <p>Carregando...</p>
                    ) : (
                        <ul>
                            {topCias.slice(0,3).map((c, i) => (
                                <li key={i}>
                                    <span className="rank">{i+1}</span>
                                    <span className="name">{c.airline_name || c.callsign}</span>
                                    <span className="count">{c.total} voos</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                <div className="chat-box">
                    <h2>🤖 Assistente IA</h2>
                    <textarea
                        rows="3"
                        value={pergunta}
                        onChange={e => setPergunta(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Digite sua pergunta e pressione Enter para enviar."
                    />
                    <button onClick={askAI} disabled={loading}>
                        {loading ? 'Pensando...' : 'Perguntar'}
                    </button>
                    {resposta && (
                        <div className="answer">
                            <strong>Resposta:</strong> {resposta}
                        </div>
                    )}
                </div>
            </div>
            <div className="map-container">
                <MapContainer center={[-15.8, -47.9]} zoom={4} style={{ height: '100%', width: '100%' }}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    {planeIcon && <RotatedMarkers voos={voos} icon={planeIcon} />}
                </MapContainer>
            </div>
        </div>
    );
}

export default App;