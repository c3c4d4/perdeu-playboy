# Deploy e dominio

O site publico roda como export estatico do Next.js. O backend continua no repositorio para ETL, modelagem e validacao, mas a producao publicada na Vercel consome `frontend/lib/static-data.generated.json`.

## Vercel

- Projeto: `perdeu-playboy`
- URL atual: `https://perdeu-playboy.vercel.app`
- Build command: `npm run build`
- Output directory: `out`
- Root directory: `frontend`

## Dominio proprio

1. Abrir o projeto na Vercel e entrar em `Settings > Domains`.
2. Adicionar o dominio desejado.
3. Configurar o DNS exatamente como a Vercel indicar para o dominio.
4. Aguardar propagacao e validar HTTPS.
5. Atualizar `metadataBase` em `frontend/app/layout.tsx` quando o dominio definitivo estiver ativo.

## Atualizacao automatica dos dados

O workflow `.github/workflows/update-data.yml` roda semanalmente e tambem manualmente. Ele recompila o snapshot estatico e, se houver mudanca, faz commit do arquivo gerado.

Para tambem publicar automaticamente na Vercel, configurar estes secrets no GitHub:

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Sem esses secrets, o workflow atualiza o snapshot e pula apenas a etapa de deploy.
