# ✈️ AirInsight – Monitoramento de Voos em Tempo Real

> Sistema web que exibe voos em um mapa interativo, estatísticas em dashboard e um assistente conversacional com IA (Gemini/Groq) para responder perguntas sobre os dados.

![Badge](https://img.shields.io/badge/status-finalizado-brightgreen)
![Badge Node](https://img.shields.io/badge/node-%3E%3D18.0-blue)
![Badge React](https://img.shields.io/badge/react-18.2-61dafb)
![Badge PostgreSQL](https://img.shields.io/badge/postgresql-16-4169e1)

---

## 📋 Sobre o Projeto

O **AirInsight** consome dados da API **OpenSky Network** (gratuita, autenticação OAuth2), armazena em PostgreSQL e apresenta:

- Mapa mundial com ícones de avião **rotacionados** conforme a direção real do voo.
- Dashboard com **total de voos ativos**, altitude média, velocidade média, voo mais rápido e mais alto.
- **Top 3 companhias** (nomes reais via Aviationstack).
- **Chat inteligente** que converte perguntas em linguagem natural para SQL usando **Gemini** (primário) e **Groq** (fallback).

> As perguntas são respondidas exclusivamente pela IA – **não há fallback local**. O sistema interpreta perguntas como:
> - *"Quantos voos estão acima de 8000 metros?"*
> - *"Liste os 5 voos mais rápidos"*
> - *"Qual a velocidade média?"*

---

## 🧱 Tecnologias Utilizadas

| Camada       | Tecnologias                                                                 |
|--------------|-----------------------------------------------------------------------------|
| Backend      | Node.js, Express, PostgreSQL (pg), cron, dotenv, Axios, OpenAI (para Groq) |
| Frontend     | React, Vite, Leaflet (mapa), leaflet-rotatedmarker, Axios                  |
| APIs         | OpenSky (OAuth2), Aviationstack (nomes de companhias), Gemini, Groq        |
| Infra        | PostgreSQL (local), Git/GitHub                                             |

---

## 📦 Pré‑requisitos para Execução

- Node.js **v18+** (recomendado v20 ou superior)
- PostgreSQL **16+** (local)
- Contas e chaves de API:
  - [OpenSky Network](https://opensky-network.org) – criar API client (OAuth2)
  - [Aviationstack](https://aviationstack.com) – chave gratuita (para nomes de companhias)
  - [Google Gemini](https://aistudio.google.com/apikey) – chave gratuita
  - [Groq Console](https://console.groq.com) – chave gratuita (fallback)

---

## ⚙️ Instalação e Configuração

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/AirInsight.git
cd AirInsight