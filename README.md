# pimo-pro-industrial-api

API REST industrial centralizada (Fase 4).

## Arranque

```bash
cd pimo-pro-industrial-api
npm install
npm run dev
```

Porta local: **5180** (`PORT` env; fallback dev)  
Token: `Bearer pimo-industrial-dev-token`

## Deploy Render

- **Build:** `npm install && npm run build`
- **Start:** `npm start`
- **Health:** `GET /health`
- **Não definir `PORT` nas env vars** — o Render injecta `process.env.PORT` automaticamente; fixar `5180` impede o proxy público de alcançar o Express.

## Rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/piece/:qr` | piece.json central |
| POST | `/api/piece/:qr/update` | Atualizar peça |
| POST | `/api/piece/:qr/log` | Registar log |
| GET | `/api/project/:user/:project` | Agregar projeto |
| POST | `/api/session/start` | Iniciar sessão |
| POST | `/api/session/end` | Terminar sessão |
| GET | `/api/lookup/:qr` | QR → rota hierárquica |

## Industrial Core

```
industrial-core/
  pieces/{qr}/piece.json
  projects/{projectId}/project.json
  factories/F1/factory.json
```

## SPA

O `pimo-pro-industrial` faz proxy de `/api/piece`, `/api/project`, `/api/session`, `/api/lookup` para esta API.
