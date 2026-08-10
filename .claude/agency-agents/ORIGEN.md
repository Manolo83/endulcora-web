# Agency Agents — origen y actualización

Los 270 agentes de `.claude/agents/` y el material de referencia de esta carpeta
provienen de [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents).

- **Commit de origen:** `ebe9c99` (2026-08-06)
- **Licencia:** MIT (ver `LICENSE` en esta carpeta)
- **Divisiones:** 17 (ver `divisions.json`)

## Qué hay aquí

| Ruta | Contenido |
| --- | --- |
| `../agents/*.md` | Los 270 agentes, planos, listos para Claude Code |
| `strategy/` | Playbooks por fase, runbooks de escenario y plantillas de handoff |
| `examples/` | Flujos de ejemplo (landing page, MVP, campaña, capítulo de libro) |
| `divisions.json` | Catálogo de divisiones con etiqueta, icono y color |
| `tools.json` | Herramientas declaradas por los agentes |

`strategy/` y `examples/` son documentación, no agentes: no llevan frontmatter y
Claude Code no los carga. Están fuera de `agents/` a propósito.

## Cómo actualizarlos

```bash
git clone --depth 1 https://github.com/msitarzewski/agency-agents.git /tmp/agency-agents
bash /tmp/agency-agents/scripts/install.sh \
  --tool claude-code \
  --path "$PWD/.claude/agents" \
  --no-interactive
```

Añade `--dry-run` para ver el plan sin escribir nada, o `--division marketing,design`
para traer solo algunas divisiones.
