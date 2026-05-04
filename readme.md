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
```

2. Configure o banco de dados PostgreSQL
Crie um banco chamado airinsight e execute o seguinte SQL (o backend criará a tabela automaticamente):

```sql
CREATE DATABASE airinsight;
```

3. Configure as variáveis de ambiente
Na pasta backend/, crie um arquivo .env (use o modelo abaixo). Preencha com suas chaves:

```env
# Banco de dados
DB_USER=postgres
DB_PASSWORD=SUA_SENHA
DB_HOST=localhost
DB_PORT=5432
DB_NAME=airinsight

# OpenSky OAuth2 (criar cliente em https://opensky-network.org)
OPENSKY_CLIENT_ID=seu_client_id
OPENSKY_CLIENT_SECRET=seu_client_secret

# IA – Gemini
GEMINI_KEY=sua_chave_gemini

# IA – Groq (fallback)
GROQ_API_KEY=sua_chave_groq

# Aviationstack (nomes de companhias)
AVIATIONSTACK_API_KEY=sua_chave_aviationstack
```

4. Instale as dependências
Backend:

```bash
cd backend
npm install
```

Frontend (em outro terminal):

```bash
cd frontend
npm install
```

5. Execute o projeto
Backend:

```bash
cd backend
node server.js
```
Deve aparecer: 🚀 Servidor rodando na porta 3000 e ✅ Token OpenSky OAuth2 obtido.

Frontend:

```bash
cd frontend
npm run dev
```

Acesse http://localhost:5173.

🧪 Como testar o assistente IA
No chat, faça perguntas como:

"Quantos voos estão acima de 8000 metros?"

"Qual a velocidade média dos voos?"

"Liste os 3 voos mais rápidos"

*"Quantos voos acima de 400 km/h?"*

Nota sobre limitação da API OpenSky: a API gratuita não fornece dados de estado, cidade, aeroporto de origem/destino. Portanto, perguntas como “Quantos voos no estado do Rio de Janeiro?” não podem ser respondidas. O sistema devolve uma mensagem explicativa.

📁 Estrutura do Projeto
```text
AirInsight/
├── backend/
│   ├── server.js          # Servidor Node.js (Express)
│   ├── .env               # Variáveis de ambiente (não comitar)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx        # Componente principal (mapa + dashboard)
│   │   ├── App.css        # Estilos modernos
│   │   ├── assets/
│   │   │   └── sprites.png # Ícone de avião (sprite sheet)
│   │   └── main.jsx
│   └── package.json
├── .gitignore
└── README.md
```
🎥 Demonstração
Um vídeo de demonstração de 3 minutos está disponível [![Vídeo de demonstração do AirInsight](https://img.youtube.com/vi/hVmsIjuFIe8/hqdefault.jpg)](https://youtu.be/hVmsIjuFIe8) 

Ele mostra:

Inicialização do backend e primeira coleta de >10.000 voos.

Mapa com aviões rotacionados e popups com detalhes.

Dashboard atualizando métricas em tempo real.

Testes do assistente IA respondendo perguntas sobre altitude, velocidade e tratando perguntas impossíveis (ex.: por estado).

🤝 Contribuição
Este projeto foi desenvolvido para fins acadêmicos (disciplina de Engenharia de Software). Não estamos aceitando contribuições externas no momento.

📜 Licença
Este projeto está sob a licença MIT – consulte o arquivo LICENSE (opcional).

📧 Contato
Autores:

Wallace Miranda Senna da Silva

Beatriz Alves Gava

Henrique de Nadai Salvador

