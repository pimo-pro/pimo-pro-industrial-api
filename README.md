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

## Rotas MES (sem auth — SGPI + listagem)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/industrial/projects` | Lista projectos industriais |
| GET | `/api/industrial/projects/:user/:project` | Dashboard do projecto |
| POST | `/api/industrial/sgpi/prepare` | Preparar registo SGPI |
| POST | `/api/industrial/sgpi/register` | Registar projecto + piece.json |
| GET | `/api/industrial/qr/:qr` | Lookup QR |

## Rotas central (auth Bearer)

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/piece/:qr` | piece.json central |
| POST | `/api/piece/:qr/update` | Atualizar peça |
| POST | `/api/piece/:qr/log` | Registar log |
| GET | `/api/project/:user/:project` | Agregar projeto |
| POST | `/api/session/start` | Iniciar sessão |
| POST | `/api/session/end` | Terminar sessão |
| GET | `/api/lookup/:qr` | QR → rota hierárquica |

## Storage persistente

Variáveis de ambiente (Render disk recomendado):

| Variável | Default (Render) |
|----------|------------------|
| `DATA_ROOT` | `/var/data/pimo-industrial` |
| `PROJETOS_ROOT` | `$DATA_ROOT/PROJETOS` |
| `PIMO_PROJECTS_ROOT` | `$DATA_ROOT/pimo-projects` |
| `INDUSTRIAL_CORE_ROOT` | `$DATA_ROOT/industrial-core` |
| `PIMO_PROJECTS_API_URL` | `https://pimo.pro/api/projects/index.php` |
| `CORS_ORIGIN` | `https://industrial.pimo.pro,https://pimo.pro,https://www.pimo.pro` |

## Industrial Core

```
industrial-core/
  pieces/{qr}/piece.json
  projects/{projectId}/project.json
  factories/F1/factory.json
```

## SPA

O `pimo-pro-industrial` faz proxy de `/api/piece`, `/api/project`, `/api/session`, `/api/lookup` para esta API.
